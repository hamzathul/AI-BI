import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ACME_SEMANTIC_MODEL } from '../src/semantic/acme-model.js';
import type { ChartExecutionResponseDto } from '../src/charts/chart-execution.dto.js';

const BAR_ID = '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11';
const OTHER_ID = '1c8b8b8f-5a6b-4b2b-ae1f-3a1d0c8e2b22';

const revenueByCategory = {
  v: 1,
  type: 'bar',
  title: 'Revenue by category',
  query: {
    metrics: ['revenue'],
    dimensions: ['product_category'],
    orderBy: [{ field: 'product_category', direction: 'asc' }],
  },
  x: 'product_category',
  y: 'revenue',
};

const headcountByDepartment = {
  v: 1,
  type: 'bar',
  title: 'Headcount by department',
  query: {
    metrics: ['headcount'],
    dimensions: ['department'],
    filters: [{ dimension: 'department', operator: 'is_not_null' }],
    orderBy: [{ field: 'department', direction: 'asc' }],
  },
  x: 'department',
  y: 'headcount',
};

describe('Chart execution (e2e)', () => {
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

  async function execute(
    body: unknown,
    status = 200,
  ): Promise<ChartExecutionResponseDto> {
    const response = await request(app.getHttpServer())
      .post('/api/charts/execute')
      .send(body)
      .expect(status);
    return response.body as ChartExecutionResponseDto;
  }

  it('executes a bar chart and returns the underlying result', async () => {
    const response = await execute({
      charts: [{ id: BAR_ID, chart: revenueByCategory }],
    });

    expect(response.warnings).toEqual([]);
    expect(response.results).toHaveLength(1);

    const [item] = response.results;
    expect(item).toMatchObject({ id: BAR_ID, ok: true, filterApplied: false });
    expect(item!.warnings).toEqual([]);
    expect(item!.query).toMatchObject({ filters: [], orderBy: expect.any(Array) });
    expect(item!.result!.rows.map((row) => [row.product_category, Number(row.revenue)])).toEqual([
      ['Accessories', 17_584],
      ['Audio', 24_815],
      ['Hardware', 136_663],
      ['Office', 46_624],
      ['Storage', 3_336],
      ['Supplies', 1_986],
      ['Video', 4_628],
    ]);
  });

  it('executes a KPI and a line chart in one batch', async () => {
    const response = await execute({
      charts: [
        {
          id: BAR_ID,
          chart: {
            v: 1,
            type: 'kpi',
            title: 'Active employees',
            query: { metrics: ['headcount'] },
            value: 'headcount',
          },
        },
        {
          id: OTHER_ID,
          chart: {
            v: 1,
            type: 'line',
            title: 'Monthly revenue',
            query: {
              metrics: ['revenue'],
              timeGrain: { dimension: 'order_date', grain: 'month' },
              orderBy: [{ field: 'order_date', direction: 'asc' }],
              limit: 100,
            },
            x: 'order_date',
            y: 'revenue',
            smooth: true,
          },
        },
      ],
    });

    expect(response.results.map((item) => item.id)).toEqual([BAR_ID, OTHER_ID]);
    expect(response.results.every((item) => item.ok)).toBe(true);

    expect(Number(response.results[0]!.result!.rows[0]!.headcount)).toBe(38);

    const line = response.results[1]!.result!;
    expect(line.columns).toEqual([
      { name: 'order_date', dataType: 'text' },
      { name: 'revenue', dataType: 'numeric' },
    ]);
    expect(line.rows).toHaveLength(28);
    expect(line.rows[0]!.order_date).toBe('2024-01-01');
  });

  it('applies a dashboard categorical filter the chart can reach', async () => {
    const response = await execute({
      filters: { categorical: { dimension: 'department', value: 'Engineering' } },
      charts: [{ id: BAR_ID, chart: headcountByDepartment }],
    });

    const [item] = response.results;
    expect(item!.ok).toBe(true);
    expect(item!.filterApplied).toBe(true);
    expect(item!.warnings).toEqual([]);
    // The dashboard filter replaces the widget filter on the same dimension.
    expect(item!.query!.filters).toEqual([
      { dimension: 'department', operator: 'eq', value: 'Engineering' },
    ]);
    expect(
      item!.result!.rows.map((row) => [row.department, Number(row.headcount)]),
    ).toEqual([['Engineering', 11]]);
  });

  it('applies a dashboard date range to a monthly line chart', async () => {
    const response = await execute({
      filters: {
        dateRange: {
          dimension: 'order_date',
          from: '2025-01-01',
          to: '2025-12-31',
        },
      },
      charts: [
        {
          id: OTHER_ID,
          chart: {
            v: 1,
            type: 'line',
            title: 'Monthly revenue',
            query: {
              metrics: ['revenue'],
              timeGrain: { dimension: 'order_date', grain: 'month' },
              orderBy: [{ field: 'order_date', direction: 'asc' }],
              limit: 100,
            },
            x: 'order_date',
            y: 'revenue',
          },
        },
      ],
    });

    const [item] = response.results;
    expect(item!.filterApplied).toBe(true);

    const dates = item!.result!.rows.map((row) => row.order_date as string);
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2025-01-01');
    expect(dates.at(-1)).toBe('2025-12-01');
  });

  it('skips a filter the chart cannot reach and warns instead of guessing', async () => {
    const response = await execute({
      filters: { categorical: { dimension: 'department', value: 'Engineering' } },
      charts: [{ id: BAR_ID, chart: revenueByCategory }],
    });

    const [item] = response.results;
    expect(item!.ok).toBe(true);
    expect(item!.filterApplied).toBe(false);
    expect(item!.result!.rows).toHaveLength(7);
    expect(item!.warnings.join(' ')).toContain(
      'the dashboard filter on "department" does not reach this chart',
    );
    expect(response.warnings).toEqual(item!.warnings);
  });

  it('isolates a failing chart from the rest of the batch', async () => {
    const response = await execute({
      charts: [
        { id: BAR_ID, chart: revenueByCategory },
        {
          id: OTHER_ID,
          chart: {
            v: 1,
            type: 'kpi',
            title: 'Missing metric',
            query: { metrics: ['profit'] },
            value: 'profit',
          },
        },
      ],
    });

    expect(response.results[0]).toMatchObject({ id: BAR_ID, ok: true });
    expect(response.results[1]).toMatchObject({
      id: OTHER_ID,
      ok: false,
      error: { message: expect.stringContaining('Unknown metric') },
    });
    expect(response.results[1]!.result).toBeUndefined();
  });

  it('returns 400 for an unknown dashboard filter dimension', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/charts/execute')
      .send({
        filters: { categorical: { dimension: 'ghost', value: 'x' } },
        charts: [{ id: BAR_ID, chart: revenueByCategory }],
      })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain('Unknown filter dimension');
  });

  it('validates the batch envelope before executing anything', async () => {
    await execute({ charts: [] }, 400);

    await execute(
      {
        charts: [
          { id: BAR_ID, chart: revenueByCategory },
          { id: BAR_ID, chart: revenueByCategory },
        ],
      },
      400,
    );

    await execute(
      { charts: [{ id: 'not-a-uuid', chart: revenueByCategory }] },
      400,
    );
  });

  it('rejects a chart whose encoding is not in the query result', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/charts/execute')
      .send({
        charts: [
          {
            id: BAR_ID,
            chart: {
              ...revenueByCategory,
              y: 'profit',
            },
          },
        ],
      })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain(
      'is not in the query result',
    );
  });
});
