import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ACME_SEMANTIC_MODEL } from '../src/semantic/acme-model.js';
import type {
  SemanticModelResponseDto,
  SemanticValidationResponseDto,
} from '../src/semantic/semantic.dto.js';
import type { SemanticModelDocument } from '../src/semantic/semantic-model.schema.js';

describe('semantic model (e2e)', () => {
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
  });

  beforeEach(async () => {
    await prisma.semanticModel.deleteMany();
  });

  afterAll(async () => {
    await prisma.semanticModel.deleteMany();
    await app.close();
  });

  function example(): SemanticModelDocument {
    return structuredClone(ACME_SEMANTIC_MODEL);
  }

  async function getModel(): Promise<SemanticModelResponseDto> {
    const response = await request(app.getHttpServer())
      .get('/api/semantic/model')
      .expect(200);
    return response.body as SemanticModelResponseDto;
  }

  async function putModel(
    document: SemanticModelDocument,
  ): Promise<SemanticModelResponseDto> {
    const response = await request(app.getHttpServer())
      .put('/api/semantic/model')
      .send(document)
      .expect(200);
    return response.body as SemanticModelResponseDto;
  }

  it('returns null before the first save', async () => {
    await expect(getModel()).resolves.toEqual({
      model: null,
      updatedAt: null,
    });
  });

  it('serves the Acme example', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/semantic/example')
      .expect(200);

    expect(response.body.model).toMatchObject({
      name: 'Acme Inc.',
    });
    expect(response.body.model.datasets).toHaveLength(6);
    expect(response.body.model.joins).toHaveLength(4);
  });

  it('validates without saving', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/semantic/model/validate')
      .send(example())
      .expect(200);

    expect(response.body as SemanticValidationResponseDto).toEqual({
      valid: true,
      summary: { datasets: 6, dimensions: 11, metrics: 11, joins: 4 },
    });
    await expect(getModel()).resolves.toMatchObject({ model: null });
  });

  it('rejects a model that references missing metadata', async () => {
    const document = example();
    document.datasets[0]!.source.object = 'missing';

    const response = await request(app.getHttpServer())
      .post('/api/semantic/model/validate')
      .send(document)
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain(
      'not in the current metadata',
    );
    await expect(getModel()).resolves.toMatchObject({ model: null });
  });

  it('rejects a structurally invalid document through the Zod pipe', async () => {
    await request(app.getHttpServer())
      .put('/api/semantic/model')
      .send({ name: 'Empty', datasets: [] })
      .expect(400);
  });

  it('saves and reloads metric filters and joins', async () => {
    const saved = await putModel(example());

    expect(saved.updatedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(saved.updatedAt!))).toBe(false);
    expect(saved.model?.datasets.map((dataset) => dataset.name)).toEqual([
      'customers',
      'departments',
      'employees',
      'order_items',
      'orders',
      'products',
    ]);

    const employees = saved.model!.datasets.find(
      (dataset) => dataset.name === 'employees',
    )!;
    expect(
      employees.metrics.find((metric) => metric.name === 'headcount')?.filters,
    ).toEqual([{ dimension: 'is_active', operator: 'eq', value: true }]);

    const orderItems = saved.model!.datasets.find(
      (dataset) => dataset.name === 'order_items',
    )!;
    expect(
      orderItems.metrics.find((metric) => metric.name === 'revenue')?.filters,
    ).toEqual([
      {
        dimension: 'order_status',
        operator: 'neq',
        value: 'cancelled',
      },
    ]);

    expect(
      saved.model!.joins.find((join) => join.name === 'order_items_order'),
    ).toMatchObject({
      from: { dataset: 'order_items', column: 'order_id' },
      to: { dataset: 'orders', column: 'id' },
      type: 'left',
    });

    const loaded = await getModel();
    expect(loaded.model).toEqual(saved.model);
    await expect(prisma.semanticModel.count()).resolves.toBe(1);
  });

  it('replaces the single model on a second PUT and deletes it', async () => {
    await putModel(example());

    const renamed = example();
    renamed.name = 'Acme Inc. (v2)';
    const second = await putModel(renamed);

    expect(second.model?.name).toBe('Acme Inc. (v2)');
    await expect(prisma.semanticModel.count()).resolves.toBe(1);
    await expect(prisma.dataset.count()).resolves.toBe(6);

    await request(app.getHttpServer())
      .delete('/api/semantic/model')
      .expect(204);

    await expect(getModel()).resolves.toEqual({
      model: null,
      updatedAt: null,
    });
    await expect(prisma.semanticModel.count()).resolves.toBe(0);
  });

  it('rejects a query before a model is saved', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/query/execute')
      .send({ metrics: ['headcount'] })
      .expect(400);

    expect(response.body.message).toContain('No semantic model is saved');
  });
});
