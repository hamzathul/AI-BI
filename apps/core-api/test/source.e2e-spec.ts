import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('source status (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.syncRun
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => undefined);
      createdIds.length = 0;
    }

    await app.close();
  });

  it('GET /api/source returns the configured database and latest sync', async () => {
    // Slightly in the future so this row deterministically sorts first without
    // touching other rows in the dev database.
    const startedAt = new Date(Date.now() + 60_000);
    const finishedAt = new Date(startedAt.getTime() + 1_250);
    const run = await prisma.syncRun.create({
      data: {
        status: 'FAILED',
        startedAt,
        finishedAt,
        error: 'e2e marker: source unreachable',
      },
    });
    createdIds.push(run.id);

    const expectedDatabase = new URL(
      process.env.SOURCE_DATABASE_URL!,
    ).pathname.replace(/^\//, '');

    const response = await request(app.getHttpServer())
      .get('/api/source')
      .expect(200);

    expect(response.body).toEqual({
      configured: true,
      database: expectedDatabase,
      lastSync: {
        status: 'FAILED',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        error: 'e2e marker: source unreachable',
      },
    });
  });

  it('never exposes source credentials or the host', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/source')
      .expect(200);

    const body = JSON.stringify(response.body);
    const sourceUrl = new URL(process.env.SOURCE_DATABASE_URL!);

    expect(sourceUrl.password).not.toBe('');
    expect(body).not.toContain(sourceUrl.username);
    expect(body).not.toContain(sourceUrl.password);
    expect(body).not.toContain(sourceUrl.host);
    expect(body).not.toContain(process.env.SOURCE_DATABASE_URL);
  });

  it('POST /api/source/test reports the live source and read-only audit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/source/test')
      .expect(200);

    expect(response.body).toEqual({
      serverVersion: expect.stringMatching(/^\d+\.\d+/),
      database: 'acme',
      readOnly: true,
      latencyMs: expect.any(Number),
    });

    const body = JSON.stringify(response.body);
    const sourceUrl = new URL(process.env.SOURCE_DATABASE_URL!);
    expect(body).not.toContain(sourceUrl.username);
    expect(body).not.toContain(sourceUrl.password);
    expect(body).not.toContain(sourceUrl.host);
  });
});
