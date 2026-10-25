import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ACME_SEMANTIC_MODEL } from '../src/semantic/acme-model.js';
import type { QueryExecutionResultDto } from '../src/query/query.dto.js';

describe('QuerySpec execution (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.semanticModel.deleteMany();
    await request(app.getHttpServer()).post('/api/source/sync').expect(200);
    await request(app.getHttpServer())
      .put('/api/semantic/model')
      .send(ACME_SEMANTIC_MODEL)
      .expect(200);
  });

  afterAll(async () => {
    await prisma.semanticModel.deleteMany();
    await app.close();
  });

  async function execute(spec: unknown): Promise<QueryExecutionResultDto> {
    const response = await request(app.getHttpServer())
      .post('/api/query/execute')
      .send(spec)
      .expect(200);
    return response.body as QueryExecutionResultDto;
  }

  function values(
    result: QueryExecutionResultDto,
    dimension: string,
    metric: string,
  ): Array<[unknown, number]> {
    return result.rows.map((row) => [row[dimension], Number(row[metric])]);
  }

  it('returns the active headcount from a filtered metric', async () => {
    const result = await execute({ metrics: ['headcount'] });

    expect(result.columns.map((column) => column.name)).toEqual(['headcount']);
    expect(Number(result.rows[0]!.headcount)).toBe(38);
    expect(result.rowCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.meta).toMatchObject({
      modelId: expect.any(String),
      modelName: 'Acme Inc.',
      dataset: 'employees',
      limit: 1000,
    });
    expect(result.meta.compiledSql).toContain(
      'FILTER (WHERE t0."is_active" = $1::boolean)',
    );
  });

  it('groups employees by department through the FK join', async () => {
    const result = await execute({
      metrics: ['headcount'],
      dimensions: ['department'],
      filters: [{ dimension: 'department', operator: 'is_not_null' }],
      orderBy: [{ field: 'department', direction: 'asc' }],
    });

    expect(values(result, 'department', 'headcount')).toEqual([
      ['Customer Support', 5],
      ['Engineering', 11],
      ['Finance', 5],
      ['Human Resources', 4],
      ['Marketing', 5],
      ['Sales', 7],
    ]);
    expect(result.meta.compiledSql).toContain(
      'LEFT JOIN "hr"."departments" AS t1',
    );
  });

  it('groups revenue by product category across two hops', async () => {
    const result = await execute({
      metrics: ['revenue'],
      dimensions: ['product_category'],
      orderBy: [{ field: 'product_category', direction: 'asc' }],
    });

    expect(values(result, 'product_category', 'revenue')).toEqual([
      ['Accessories', 17_584],
      ['Audio', 24_815],
      ['Hardware', 136_663],
      ['Office', 46_624],
      ['Storage', 3_336],
      ['Supplies', 1_986],
      ['Video', 4_628],
    ]);
  });

  it('applies metric filters to revenue, order counts, and units', async () => {
    const result = await execute({
      metrics: ['revenue', 'gross_revenue', 'net_orders', 'units_sold'],
    });

    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0]!.revenue)).toBe(235_636);
    expect(Number(result.rows[0]!.gross_revenue)).toBe(259_248);
    expect(Number(result.rows[0]!.net_orders)).toBe(110);
    expect(Number(result.rows[0]!.units_sold)).toBe(654);
  });

  it('returns all orders and cancelled orders from the same dataset', async () => {
    const result = await execute({
      dataset: 'orders',
      metrics: ['orders', 'cancelled_orders'],
    });

    expect(Number(result.rows[0]!.orders)).toBe(120);
    expect(Number(result.rows[0]!.cancelled_orders)).toBe(10);
  });

  it('returns monthly revenue with a text date grain', async () => {
    const result = await execute({
      metrics: ['revenue'],
      timeGrain: { dimension: 'order_date', grain: 'month' },
      orderBy: [{ field: 'order_date', direction: 'asc' }],
      limit: 100,
    });

    expect(result.columns).toEqual([
      { name: 'order_date', dataType: 'text' },
      { name: 'revenue', dataType: 'numeric' },
    ]);
    expect(result.rows).toHaveLength(28);
    expect(result.rows[0]!.order_date).toBe('2024-01-01');
    expect(Number(result.rows[0]!.revenue)).toBe(13_282);
    expect(result.meta.limit).toBe(100);
  });

  it('returns active average salary by department', async () => {
    const result = await execute({
      metrics: ['avg_salary'],
      dimensions: ['department'],
      filters: [{ dimension: 'department', operator: 'is_not_null' }],
      orderBy: [{ field: 'department', direction: 'asc' }],
    });

    const rounded = values(result, 'department', 'avg_salary').map(
      ([department, value]) => [
        department,
        Math.round((value as number) * 100) / 100,
      ],
    );

    expect(rounded).toEqual([
      ['Customer Support', 86_800],
      ['Engineering', 111_181.82],
      ['Finance', 111_200],
      ['Human Resources', 99_500],
      ['Marketing', 104_200],
      ['Sales', 106_571.43],
    ]);
  });

  it('binds filter values instead of putting them in SQL', async () => {
    const injection = "'; DROP TABLE hr.employees; --";
    const result = await execute({
      dataset: 'orders',
      metrics: ['orders'],
      filters: [
        { dimension: 'order_status', operator: 'eq', value: injection },
      ],
    });

    expect(Number(result.rows[0]!.orders)).toBe(0);
    expect(result.meta.compiledSql).not.toContain('DROP TABLE');

    const stillThere = await execute({
      metrics: ['headcount'],
    });
    expect(Number(stillThere.rows[0]!.headcount)).toBe(38);
  });

  it.each([
    [{ metrics: ['missing'] }, 'Unknown metric'],
    [{ metrics: ['headcount', 'revenue'] }, 'span datasets'],
    [
      {
        metrics: ['headcount'],
        orderBy: [{ field: 'avg_salary', direction: 'desc' }],
      },
      'not in the result columns',
    ],
    [
      {
        metrics: ['headcount'],
        timeGrain: { dimension: 'department', grain: 'month' },
      },
      'requires a date or timestamp dimension',
    ],
  ])('returns a 400 for an invalid spec (%#)', async (spec, message) => {
    const response = await request(app.getHttpServer())
      .post('/api/query/execute')
      .send(spec)
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain(message);
  });

  it('validates the body with the QuerySpec schema', async () => {
    await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({ sql: 'SELECT 1' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({ metrics: [] })
      .expect(400);
  });
});
