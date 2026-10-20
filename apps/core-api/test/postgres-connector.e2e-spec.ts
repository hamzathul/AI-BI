import { ConfigService } from '@nestjs/config';
import { PostgresConnector } from '../src/connectors/postgres/postgres.connector.js';

process.loadEnvFile();

const SOURCE_URL = process.env.SOURCE_DATABASE_URL!;
const APP_URL = process.env.DATABASE_URL!;

function makeConnector(url: string): PostgresConnector {
  return new PostgresConnector({
    getOrThrow: () => url,
  } as unknown as ConfigService);
}

/**
 * Direct integration tests for the Postgres connector (2.4). They do not boot
 * the Nest app, so they can use arbitrary URLs (wrong password, missing DB).
 */
describe('PostgresConnector (e2e)', () => {
  let source: PostgresConnector;

  beforeAll(() => {
    source = makeConnector(SOURCE_URL);
  });

  afterAll(async () => {
    await source.onModuleDestroy();
  });

  it('connects to Acme and reports a read-only role', async () => {
    const result = await source.testConnection();

    expect(result.database).toBe('acme');
    expect(result.serverVersion).toMatch(/^\d+\.\d+/);
    expect(result.readOnly).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('detects a writable role when pointed at the app database', async () => {
    const writable = makeConnector(APP_URL);

    try {
      const result = await writable.testConnection();

      expect(result.database).toBe('aibi');
      expect(result.readOnly).toBe(false);
    } finally {
      await writable.onModuleDestroy();
    }
  });

  it('maps a wrong password to AUTH', async () => {
    const url = new URL(SOURCE_URL);
    url.password = 'definitely-wrong-password';
    const bad = makeConnector(url.toString());

    try {
      await expect(bad.testConnection()).rejects.toMatchObject({
        name: 'ConnectorError',
        code: 'AUTH',
        message: 'Source database credentials were rejected.',
      });
    } finally {
      await bad.onModuleDestroy();
    }
  });

  it('maps a missing database to NOT_FOUND', async () => {
    const url = new URL(SOURCE_URL);
    url.pathname = '/definitely_missing_db';
    const bad = makeConnector(url.toString());

    try {
      await expect(bad.testConnection()).rejects.toMatchObject({
        name: 'ConnectorError',
        code: 'NOT_FOUND',
      });
    } finally {
      await bad.onModuleDestroy();
    }
  });

  it('times out a slow statement through the server-side timeout', async () => {
    await expect(
      source.executeQuery({
        sql: 'SELECT pg_sleep(2)',
        maxRows: 10,
        timeoutMs: 200,
      }),
    ).rejects.toMatchObject({
      name: 'ConnectorError',
      code: 'TIMEOUT',
    });
  });

  it('cancels a running statement when the signal aborts', async () => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 200);
    const startedAt = Date.now();

    try {
      await expect(
        source.executeQuery({
          sql: 'SELECT pg_sleep(5)',
          maxRows: 10,
          timeoutMs: 10_000,
          signal: abort.signal,
        }),
      ).rejects.toMatchObject({
        name: 'ConnectorError',
        code: 'TIMEOUT',
      });
    } finally {
      clearTimeout(timer);
    }

    // Without cancellation this would take the full five seconds.
    expect(Date.now() - startedAt).toBeLessThan(4_000);
  });
});
