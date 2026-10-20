import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient } from 'pg';
import { ConnectorError, ConnectorErrorCode } from '../connector.errors.js';
import type {
  ConnectionTestResult,
  ConnectorManifest,
  DiscoveredDatabase,
  QueryRequest,
  QueryResult,
  QueryResultColumn,
  SourceConnector,
} from '../connector.types.js';
import { connectorErrorMessage, mapPostgresError } from './postgres.errors.js';
import {
  assembleDiscoveredDatabase,
  readCatalog,
} from './postgres.introspection.js';
import { canonicalType } from './postgres.types.js';

const POOL_MAX = 4;
const CONNECT_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;
const INTROSPECTION_TIMEOUT_MS = 30_000;

interface ReadOnlyAuditRow {
  database: string;
  server_version: string;
  can_write: boolean;
}

interface ResultField {
  name: string;
  dataTypeID: number;
}

interface PgTypeRow {
  oid: number;
  name: string;
}

/**
 * One catalog query that answers "who am I, and can I write?".
 *
 * We audit privileges instead of attempting a write: the source credentials
 * are read-only (D11), so probing must never mutate anything. `has_*_privilege`
 * includes privileges inherited through role membership.
 *
 * Limitation: a SECURITY DEFINER function owned by a writer could still write
 * when called. The app never exposes arbitrary functions, and the API guard
 * only allows SELECT (D42) — noted in D38.
 */
const READ_ONLY_AUDIT_SQL = `
  SELECT current_database() AS database,
         current_setting('server_version') AS server_version,
         (
           r.rolsuper
           OR has_database_privilege(current_database(), 'CREATE')
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_namespace n
             WHERE n.nspname !~ '^pg_'
               AND n.nspname <> 'information_schema'
               AND has_schema_privilege(n.oid, 'CREATE')
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_class c
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
               AND n.nspname !~ '^pg_'
               AND n.nspname <> 'information_schema'
               AND has_table_privilege(
                 c.oid,
                 'INSERT,UPDATE,DELETE,TRUNCATE'
               )
           )
         ) AS can_write
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user
`;

/**
 * PostgreSQL source connector (D38).
 *
 * Owns a small `pg` pool for the process lifetime. The connection string is
 * injected from validated env and never leaves this boundary; callers receive
 * only normalized results or `ConnectorError`s.
 */
@Injectable()
export class PostgresConnector implements SourceConnector, OnModuleDestroy {
  readonly manifest: ConnectorManifest = {
    kind: 'postgres',
    displayName: 'PostgreSQL',
    capabilities: { schemas: true, views: true },
  };

  private readonly logger = new Logger(PostgresConnector.name);
  private readonly pool: Pool;
  /** OID → canonical type name, filled lazily by query results (D42). */
  private readonly typeCache = new Map<number, string>();

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('SOURCE_DATABASE_URL'),
      max: POOL_MAX,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      // Visible in pg_stat_activity, which makes local debugging much easier.
      application_name: 'aibi-core-api',
    });

    // An idle client can fail when Postgres restarts. Without a listener the
    // EventEmitter would crash the whole process.
    this.pool.on('error', (error) => {
      this.logger.warn(`Idle source connection failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = performance.now();

    try {
      const result =
        await this.pool.query<ReadOnlyAuditRow>(READ_ONLY_AUDIT_SQL);
      const row = result.rows[0];

      if (!row) {
        throw new ConnectorError(
          ConnectorErrorCode.INTERNAL,
          'The source database returned no connection details.',
        );
      }

      return {
        // server_version carries the full build string ("18.6 (Debian ...)").
        serverVersion: row.server_version.split(' ')[0] ?? row.server_version,
        database: row.database,
        readOnly: !row.can_write,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      throw mapPostgresError(error);
    }
  }

  async discoverSchema(): Promise<DiscoveredDatabase> {
    const client = await this.connect();

    try {
      await client.query('BEGIN');
      // One consistent snapshot: if a table changes halfway through the five
      // catalog reads, we must not persist a mix of old and new shapes.
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
      await this.setLocalTimeout(client, INTROSPECTION_TIMEOUT_MS);

      const rows = await readCatalog(client);
      await client.query('COMMIT');

      return assembleDiscoveredDatabase(rows);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async executeQuery(request: QueryRequest): Promise<QueryResult> {
    if (request.signal?.aborted) throw this.abortedError();

    const startedAt = performance.now();
    const client = await this.connect();
    let inTransaction = false;

    // `processID` is a runtime property of pg's Client; the bundled types omit it.
    const backendId =
      (client as PoolClient & { processID?: number | null }).processID ?? null;

    const onAbort = () => {
      void this.cancelBackend(backendId);
    };

    if (request.signal) {
      if (request.signal.aborted) {
        onAbort();
      } else {
        request.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      await client.query('BEGIN');
      inTransaction = true;
      // Defense in depth: the guard has already approved this statement, and
      // the role is read-only, but the transaction itself refuses writes too.
      await client.query('SET TRANSACTION READ ONLY');
      await this.setLocalTimeout(client, request.timeoutMs);

      // Close the race where the abort fired while we were setting up: an
      // idle backend cannot be canceled, so check again before sending SQL.
      if (request.signal?.aborted) throw this.abortedError();

      const values = [...(request.parameters ?? []), request.maxRows + 1];
      // Wrapping (instead of appending LIMIT) works whether or not the inner
      // query already has its own LIMIT/ORDER BY, and lets us detect overflow.
      const text = `SELECT * FROM (${request.sql}) AS aibi_query LIMIT $${values.length}`;
      const result = await client.query<Record<string, unknown>>({
        text,
        values,
      });

      const truncated = result.rows.length > request.maxRows;
      const rows = truncated
        ? result.rows.slice(0, request.maxRows)
        : result.rows;

      return {
        columns: await this.resolveColumns(client, result.fields),
        rows,
        rowCount: rows.length,
        truncated,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      throw mapPostgresError(error);
    } finally {
      request.signal?.removeEventListener('abort', onAbort);
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      client.release();
    }
  }

  private async connect(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw mapPostgresError(error);
    }
  }

  private abortedError(): ConnectorError {
    return new ConnectorError(
      ConnectorErrorCode.TIMEOUT,
      connectorErrorMessage(ConnectorErrorCode.TIMEOUT),
    );
  }

  /**
   * Parameters are not allowed in SET, so `set_config(..., true)` is the
   * parameterized, transaction-local way to apply the timeout.
   */
  private async setLocalTimeout(
    client: PoolClient,
    timeoutMs: number,
  ): Promise<void> {
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      String(Math.max(1, Math.trunc(timeoutMs))),
    ]);
  }

  /**
   * Cancels our own backend from another pooled connection. The read-only role
   * is allowed to cancel its own queries; failure is best-effort.
   */
  private async cancelBackend(processId: number | null): Promise<void> {
    if (processId === null) return;

    try {
      await this.pool.query('SELECT pg_cancel_backend($1)', [processId]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not cancel source query: ${message}`);
    }
  }

  /**
   * Query results identify column types by OID. Resolve unknown OIDs through
   * `pg_type` once and cache them — this also handles enums and domains.
   */
  private async resolveColumns(
    client: PoolClient,
    fields: ResultField[],
  ): Promise<QueryResultColumn[]> {
    const unknownOids = [
      ...new Set(
        fields
          .map((field) => field.dataTypeID)
          .filter((oid) => !this.typeCache.has(oid)),
      ),
    ];

    if (unknownOids.length > 0) {
      const result = await client.query<PgTypeRow>(
        `SELECT oid, pg_catalog.format_type(oid, NULL) AS name
         FROM pg_catalog.pg_type
         WHERE oid = ANY($1::oid[])`,
        [unknownOids],
      );

      for (const row of result.rows) {
        this.typeCache.set(row.oid, row.name);
      }
    }

    return fields.map((field) => {
      const type = this.typeCache.get(field.dataTypeID);

      return {
        name: field.name,
        dataType: type ? canonicalType(type) : 'unknown',
      };
    });
  }
}
