import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ACME_SEMANTIC_MODEL } from '../src/semantic/acme-model.js';
import type {
  DashboardDto,
  DashboardListDto,
} from '../src/dashboards/dashboards.dto.js';

const WIDGET_ID = '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11';
const MISSING_ID = '2d9c9c90-6b7c-4c3c-bf2a-4b2e1d9f3c33';

const revenueChart = {
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

function documentBody(overrides: Record<string, unknown> = {}) {
  return {
    expectedVersion: 1,
    name: 'Phase 5 board',
    filters: {},
    widgets: [
      { id: WIDGET_ID, chart: revenueChart, layout: { x: 0, y: 0, w: 6, h: 5 } },
    ],
    ...overrides,
  };
}

describe('Dashboards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dashboardId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.dashboard.deleteMany();
    await prisma.semanticModel.deleteMany();
    await request(app.getHttpServer()).post('/api/source/sync').expect(200);
    await request(app.getHttpServer())
      .put('/api/semantic/model')
      .send(ACME_SEMANTIC_MODEL)
      .expect(200);
  });

  afterAll(async () => {
    await prisma.dashboard.deleteMany();
    await prisma.semanticModel.deleteMany();
    await app.close();
  });

  it('creates an empty dashboard at version 1', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/dashboards')
      .send({ name: 'Phase 5 board' })
      .expect(201);

    const created = response.body as DashboardDto;
    dashboardId = created.id;

    expect(created).toMatchObject({
      name: 'Phase 5 board',
      version: 1,
      filters: {},
      widgets: [],
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lists the dashboard with a widget count', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboards')
      .expect(200);

    const list = response.body as DashboardListDto;
    expect(list.dashboards).toHaveLength(1);
    expect(list.dashboards[0]).toMatchObject({
      id: dashboardId,
      name: 'Phase 5 board',
      version: 1,
      widgetCount: 0,
    });
  });

  it('rejects a duplicate name', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/dashboards')
      .send({ name: 'Phase 5 board' })
      .expect(409);

    expect(response.body.message).toContain('already exists');
  });

  it('saves the whole document and bumps the version', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/dashboards/${dashboardId}`)
      .send(documentBody())
      .expect(200);

    const saved = response.body as DashboardDto;
    expect(saved.version).toBe(2);
    expect(saved.widgets).toHaveLength(1);
    expect(saved.widgets[0]).toMatchObject({
      id: WIDGET_ID,
      layout: { x: 0, y: 0, w: 6, h: 5 },
      chart: { type: 'bar', title: 'Revenue by category' },
    });
  });

  it('returns the saved document by id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/dashboards/${dashboardId}`)
      .expect(200);

    const dashboard = response.body as DashboardDto;
    expect(dashboard.version).toBe(2);
    expect(dashboard.widgets[0]!.chart.query.metrics).toEqual(['revenue']);
  });

  it('refuses a stale write with 409 and writes nothing', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/dashboards/${dashboardId}`)
      .send(documentBody({ name: 'Stale name' }))
      .expect(409);

    expect(response.body.message).toContain('changed since version 1');

    const current = await request(app.getHttpServer())
      .get(`/api/dashboards/${dashboardId}`)
      .expect(200);

    expect(current.body.name).toBe('Phase 5 board');
    expect(current.body.version).toBe(2);
  });

  it('validates dashboard filters against the semantic model', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/dashboards/${dashboardId}`)
      .send(
        documentBody({
          expectedVersion: 2,
          filters: { categorical: { dimension: 'ghost', value: 'x' } },
        }),
      )
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain(
      'Unknown filter dimension',
    );
  });

  it('stores a valid dashboard filter', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/dashboards/${dashboardId}`)
      .send(
        documentBody({
          expectedVersion: 2,
          filters: {
            dateRange: { dimension: 'order_date', from: '2025-01-01' },
            categorical: { dimension: 'product_category', value: ['Audio', 'Video'] },
          },
        }),
      )
      .expect(200);

    expect(response.body.filters).toEqual({
      dateRange: { dimension: 'order_date', from: '2025-01-01' },
      categorical: { dimension: 'product_category', value: ['Audio', 'Video'] },
    });
    expect(response.body.version).toBe(3);
  });

  it('rejects an invalid widget chart or layout', async () => {
    await request(app.getHttpServer())
      .put(`/api/dashboards/${dashboardId}`)
      .send(
        documentBody({
          expectedVersion: 3,
          widgets: [
            {
              id: WIDGET_ID,
              chart: { ...revenueChart, y: 'profit' },
              layout: { x: 0, y: 0, w: 6, h: 5 },
            },
          ],
        }),
      )
      .expect(400);

    const response = await request(app.getHttpServer())
      .put(`/api/dashboards/${dashboardId}`)
      .send(
        documentBody({
          expectedVersion: 3,
          widgets: [
            {
              id: WIDGET_ID,
              chart: revenueChart,
              layout: { x: 8, y: 0, w: 6, h: 5 },
            },
          ],
        }),
      )
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain(
      'wider than the 12-column grid',
    );
  });

  it('returns 404 for an unknown dashboard and 400 for a bad id', async () => {
    await request(app.getHttpServer())
      .get(`/api/dashboards/${MISSING_ID}`)
      .expect(404);

    await request(app.getHttpServer()).get('/api/dashboards/not-a-uuid').expect(400);

    await request(app.getHttpServer())
      .put(`/api/dashboards/${MISSING_ID}`)
      .send(documentBody({ expectedVersion: 1 }))
      .expect(404);
  });

  it('deletes the dashboard and its widgets', async () => {
    await request(app.getHttpServer())
      .delete(`/api/dashboards/${dashboardId}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/dashboards/${dashboardId}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/api/dashboards')
      .expect(200);

    expect((list.body as DashboardListDto).dashboards).toEqual([]);
    expect(await prisma.widget.count()).toBe(0);
  });
});
