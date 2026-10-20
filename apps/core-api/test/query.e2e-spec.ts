import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

interface QueryResponse {
  columns: Array<{ name: string; dataType: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

describe('guarded query (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function execute(sql: string): Promise<QueryResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({ sql })
      .expect(200);

    return response.body as QueryResponse;
  }

  it('executes an aggregate query against Acme', async () => {
    const result = await execute(
      'SELECT count(*)::int AS count FROM hr.employees',
    );

    expect(result.columns).toEqual([{ name: 'count', dataType: 'integer' }]);
    expect(result.rows).toEqual([{ count: 39 }]);
    expect(result.rowCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns grouped rows with their real types', async () => {
    const result = await execute(
      `SELECT department_id, count(*)::int AS headcount
       FROM hr.employees
       WHERE department_id IN (1, 2)
       GROUP BY department_id
       ORDER BY department_id`,
    );

    expect(result.columns).toEqual([
      { name: 'department_id', dataType: 'integer' },
      { name: 'headcount', dataType: 'integer' },
    ]);
    expect(result.rows).toEqual([
      { department_id: 1, headcount: 11 },
      { department_id: 2, headcount: 7 },
    ]);
    expect(result.rowCount).toBe(2);
  });

  it('resolves canonical result types for timestamptz and numeric', async () => {
    const timestamps = await execute(
      'SELECT created_at FROM sales.customers ORDER BY id LIMIT 1',
    );
    expect(timestamps.columns).toEqual([
      { name: 'created_at', dataType: 'timestamptz' },
    ]);
    expect(typeof timestamps.rows[0].created_at).toBe('string');

    const salaries = await execute(
      'SELECT salary FROM hr.employees ORDER BY id LIMIT 1',
    );
    expect(salaries.columns).toEqual([{ name: 'salary', dataType: 'numeric' }]);
    // pg returns numeric as a string to preserve precision.
    expect(salaries.rows[0].salary).toBe('195000.00');
  });

  it('caps results at 10,000 rows and reports truncation', async () => {
    const result = await execute(
      'SELECT g FROM generate_series(1, 20000) AS g',
    );

    expect(result.columns).toEqual([{ name: 'g', dataType: 'integer' }]);
    expect(result.rows).toHaveLength(10_000);
    expect(result.rowCount).toBe(10_000);
    expect(result.truncated).toBe(true);
    expect(result.rows[0]).toEqual({ g: 1 });
    expect(result.rows[9_999]).toEqual({ g: 10_000 });
  });

  it.each([
    ['UPDATE hr.employees SET salary = 0', 'Only SELECT statements'],
    ['DELETE FROM hr.employees', 'Only SELECT statements'],
    ['SELECT 1; SELECT 2', 'Only one statement'],
    ['SELECT 1 -- comment', 'comments are not allowed'],
    ['SELECT pg_sleep(10)', 'forbidden function'],
    [
      'WITH x AS (DELETE FROM hr.employees RETURNING *) SELECT * FROM x',
      'forbidden keyword',
    ],
  ])('rejects unsafe SQL: %s', async (sql, expected) => {
    const response = await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({ sql })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(expected),
    });
  });

  it('validates the request body with the Zod pipe', async () => {
    await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({ sql: 42 })
      .expect(400);
  });
});
