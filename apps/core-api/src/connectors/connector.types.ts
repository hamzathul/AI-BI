/**
 * The connector contract (D36).
 *
 * The rest of the app — metadata storage, sync, query execution, the AI layer —
 * talks only to `SourceConnector`. Everything driver-specific (`pg`, connection
 * strings, Postgres error codes) stays behind this boundary, so adding a second
 * connector never changes callers.
 */

/** Runtime id of a connector; extend this union when a second connector lands. */
export type ConnectorKind = 'postgres';

/** What every source connector must implement (the adapter pattern). */
export interface SourceConnector {
  readonly manifest: ConnectorManifest;
  /** Verifies reachability, auth, and read-only privileges (2.4). */
  testConnection(): Promise<ConnectionTestResult>;
  /** Reads schemas, objects, columns, keys, and relations in one pass (2.5–2.7). */
  discoverSchema(): Promise<DiscoveredDatabase>;
  /** Executes one already-validated, read-only statement (2.9). */
  executeQuery(request: QueryRequest): Promise<QueryResult>;
}

export interface ConnectorCapabilities {
  /** Multiple namespaces (Postgres schemas) beyond a single default schema. */
  schemas: boolean;
  /** Views are discovered alongside tables. */
  views: boolean;
}

export interface ConnectorManifest {
  kind: ConnectorKind;
  displayName: string;
  capabilities: ConnectorCapabilities;
}

/** Result of a successful connection test; failures throw `ConnectorError`. */
export interface ConnectionTestResult {
  /** Server version, e.g. "18.2". */
  serverVersion: string;
  /** Database name, e.g. "acme" — safe to return to clients (2.3). */
  database: string;
  /** True when the configured role cannot write or run DDL. */
  readOnly: boolean;
  /** Round-trip time of the test query. */
  latencyMs: number;
}

/** A source database's full discovered structure. */
export interface DiscoveredDatabase {
  schemas: DiscoveredSchema[];
  /** Foreign keys across the database (the join graph, 2.7). */
  relations: DiscoveredRelation[];
}

/** A schema/namespace, e.g. "hr". */
export interface DiscoveredSchema {
  name: string;
  objects: DiscoveredObject[];
}

export interface DiscoveredObject {
  name: string;
  kind: 'table' | 'view';
  columns: DiscoveredColumn[];
  /** Column names in key order; empty when the object has no primary key. */
  primaryKey: string[];
}

export interface DiscoveredColumn {
  name: string;
  /** Canonical type, e.g. "numeric(10,2)" (2.6). */
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  /** 1-based position from pg_attribute; keeps catalog order in the UI. */
  ordinalPosition: number;
}

/** A foreign-key edge in the join graph. */
export interface DiscoveredRelation {
  /** Constraint name. */
  name: string;
  /** The referencing (child) column. */
  from: ColumnRef;
  /** The referenced (parent) column. */
  to: ColumnRef;
}

export interface ColumnRef {
  schema: string;
  object: string;
  column: string;
}

/** A query the SQL guard (2.9) has already approved. */
export interface QueryRequest {
  sql: string;
  parameters?: readonly unknown[];
  /** Hard cap on returned rows (2.9: 10k). */
  maxRows: number;
  /** Statement timeout in milliseconds. */
  timeoutMs: number;
  /** Cancels the running query (2.9). */
  signal?: AbortSignal;
}

export interface QueryResult {
  columns: QueryResultColumn[];
  rows: Record<string, unknown>[];
  /** Rows returned, never more than `maxRows`. */
  rowCount: number;
  /** True when more rows existed than `maxRows`. */
  truncated: boolean;
  durationMs: number;
}

export interface QueryResultColumn {
  name: string;
  /** Canonical type (2.6). */
  dataType: string;
}
