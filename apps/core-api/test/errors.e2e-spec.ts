import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

/** Test-only route that fails in a way no filter can predict. */
@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw new Error('secret detail');
  }
}

describe('error handling (e2e)', () => {
  let app: INestApplication<App>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/boom (GET) maps unknown errors to a generic 500 and logs them', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/boom')
      .expect(500);

    expect(response.body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      path: '/api/boom',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret detail');

    // The filter logs the failure and the stack before sending the response.
    expect(errorSpy).toHaveBeenCalledWith(
      'GET /api/boom 500',
      expect.any(String),
    );

    // The middleware logs one line once the response has finished.
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^GET \/api\/boom 500 \d+ms$/),
      );
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });
});
