import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SyncStatus, type SyncRun } from '../src/generated/prisma/client.js';

/**
 * Integration tests for the app database — the first tests that need the
 * Docker Postgres to be running (`docker compose up -d`).
 */
describe('app database (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    // Best-effort cleanup, so a failing test never leaves rows behind.
    if (createdIds.length > 0) {
      await prisma.syncRun
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => undefined);
      createdIds.length = 0;
    }

    await app.close();
  });

  it('creates, reads, and deletes a SyncRun', async () => {
    const created = await prisma.syncRun.create({
      data: { status: SyncStatus.RUNNING },
    });
    createdIds.push(created.id);

    // App-side uuid(7) default (D34): time-ordered, still a real UUID.
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.status).toBe('RUNNING');
    expect(created.startedAt).toBeInstanceOf(Date);
    expect(created.finishedAt).toBeNull();
    expect(created.error).toBeNull();

    const found = await prisma.syncRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(found).toMatchObject({ id: created.id, status: 'RUNNING' });

    await prisma.syncRun.delete({ where: { id: created.id } });
    createdIds.length = 0;

    await expect(
      prisma.syncRun.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();
  });

  it('records a finished run with FAILED status and an error message', async () => {
    const created = await prisma.syncRun.create({
      data: { status: SyncStatus.RUNNING },
    });
    createdIds.push(created.id);

    const failed: SyncRun = await prisma.syncRun.update({
      where: { id: created.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        error: 'permission denied for schema hr',
      },
    });

    expect(failed.status).toBe('FAILED');
    expect(failed.finishedAt).toBeInstanceOf(Date);
    expect(failed.error).toBe('permission denied for schema hr');
  });
});
