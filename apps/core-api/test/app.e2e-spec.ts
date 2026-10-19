import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
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
        expect(res.body.components.schemas.HealthDto).toBeDefined();
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
