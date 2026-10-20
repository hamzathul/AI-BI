import { Test, TestingModule } from '@nestjs/testing';
import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('core-api (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('/api/health (GET) logs one line after the response finishes', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    try {
      await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^GET \/api\/health 200 \d+ms$/),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it('/api/docs (GET) serves the Swagger UI', () => {
    return request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('/api/docs-json (GET) exposes the OpenAPI document', () => {
    return request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200)
      .expect((res) => {
        expect(res.body.info.title).toBe('AI BI API');
        expect(res.body.paths['/api/health']).toBeDefined();
        expect(res.body.paths['/api/source/test'].post).toBeDefined();
        expect(res.body.paths['/api/source/sync'].post).toBeDefined();
        expect(res.body.paths['/api/metadata'].get).toBeDefined();
        expect(res.body.paths['/api/query/execute'].post).toBeDefined();
        expect(res.body.components.schemas.HealthDto).toBeDefined();
        expect(res.body.components.schemas.SyncResultDto).toBeDefined();
        expect(res.body.components.schemas.MetadataSnapshotDto).toBeDefined();
        expect(res.body.components.schemas.QueryResultDto).toBeDefined();
      });
  });

  it('/api/unknown (GET) returns the standard error body', () => {
    return request(app.getHttpServer())
      .get('/api/unknown')
      .expect(404)
      .expect((res) => {
        expect(res.body).toMatchObject({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cannot GET /api/unknown',
          path: '/api/unknown',
        });
        expect(typeof res.body.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
