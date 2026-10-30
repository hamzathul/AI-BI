import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { InternalContextDto } from '../src/internal/internal.dto.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { QueryExecutionResultDto } from '../src/query/query.dto.js';
import { ACME_SEMANTIC_MODEL } from '../src/semantic/acme-model.js';

describe('internal API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    token = app.get(ConfigService).getOrThrow<string>('INTERNAL_API_TOKEN');
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

  function getContext(): request.Test {
    return request(app.getHttpServer())
      .get('/api/internal/context')
      .set('Authorization', `Bearer ${token}`);
  }

  function executeSpec(spec: unknown): request.Test {
    return request(app.getHttpServer())
      .post('/api/internal/specs/execute')
      .set('Authorization', `Bearer ${token}`)
      .send(spec as object);
  }

  describe('service token', () => {
    it('rejects a request without a token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/context')
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid or missing service token.',
        path: '/api/internal/context',
      });
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it('rejects a wrong token on both routes', async () => {
      await request(app.getHttpServer())
        .get('/api/internal/context')
        .set('Authorization', 'Bearer not-the-token')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/internal/specs/execute')
        .set('Authorization', 'Bearer not-the-token')
        .send({ metrics: ['headcount'] })
        .expect(401);
    });

    it('checks the token before validating the body', async () => {
      await request(app.getHttpServer())
        .post('/api/internal/specs/execute')
        .send({ metrics: [] })
        .expect(401);
    });
  });

  describe('GET /api/internal/context', () => {
    it('returns the validated model, datasets, joins, and capabilities', async () => {
      const response = await getContext().expect(200);
      const context = response.body as InternalContextDto;

      expect(context.model).toMatchObject({ name: 'Acme Inc.' });
      expect(context.model.id).toBeTruthy();
      expect(context.datasets).toHaveLength(6);
      expect(context.joins).toHaveLength(4);
      expect(context.capabilities.timeGrains).toContain('month');

      const employees = context.datasets.find(
        (dataset) => dataset.name === 'employees',
      );
      expect(employees?.source).toEqual({ schema: 'hr', object: 'employees' });
      expect(
        employees?.metrics.find((metric) => metric.name === 'headcount'),
      ).toMatchObject({
        agg: 'count',
        expression: 'id',
        filters: [{ dimension: 'is_active', operator: 'eq', value: true }],
      });
      expect(employees).not.toHaveProperty('columns');
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it('is hidden from the public OpenAPI document', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);

      const paths = Object.keys(
        (response.body as { paths: Record<string, unknown> }).paths,
      );
      expect(paths.some((path) => path.startsWith('/api/internal'))).toBe(
        false,
      );
    });

    it('returns 404 when no semantic model is saved', async () => {
      await prisma.semanticModel.deleteMany();

      try {
        const response = await getContext().expect(404);
        expect(response.body.message).toMatch(/No semantic model/);
      } finally {
        await request(app.getHttpServer())
          .put('/api/semantic/model')
          .send(ACME_SEMANTIC_MODEL)
          .expect(200);
      }
    });
  });

  describe('POST /api/internal/specs/execute', () => {
    it('executes a spec through the same compiler as the public endpoint', async () => {
      const response = await executeSpec({
        metrics: ['headcount'],
        dimensions: ['department'],
        filters: [{ dimension: 'department', operator: 'is_not_null' }],
        orderBy: [{ field: 'department', direction: 'asc' }],
      }).expect(200);

      const result = response.body as QueryExecutionResultDto;
      const rows = result.rows.map((row) => [
        row.department,
        Number(row.headcount),
      ]);

      expect(rows).toEqual([
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
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it('rejects an unknown metric with the standard envelope', async () => {
      const response = await executeSpec({ metrics: ['not_a_metric'] }).expect(
        400,
      );

      // Compiler issues arrive as a list (D52).
      expect(JSON.stringify(response.body.message)).toMatch(/not_a_metric/);
    });

    it('rejects a spec that breaks the QuerySpec limits', async () => {
      await executeSpec({ metrics: [] }).expect(400);
      await executeSpec({ metrics: ['headcount'], limit: 0 }).expect(400);
    });

    it('returns 400 when no semantic model is saved', async () => {
      await prisma.semanticModel.deleteMany();

      try {
        const response = await executeSpec({ metrics: ['headcount'] }).expect(
          400,
        );
        expect(response.body.message).toMatch(/No semantic model/);
      } finally {
        await request(app.getHttpServer())
          .put('/api/semantic/model')
          .send(ACME_SEMANTIC_MODEL)
          .expect(200);
      }
    });
  });
});
