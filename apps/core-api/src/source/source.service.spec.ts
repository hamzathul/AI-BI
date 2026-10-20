import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { SourceService } from './source.service.js';

const SOURCE_URL =
  'postgresql://acme_reader:super-secret@db.internal:5433/acme';

describe('SourceService', () => {
  let service: SourceService;
  const config = { getOrThrow: vi.fn() };
  const prisma = { syncRun: { findFirst: vi.fn() } };

  beforeEach(async () => {
    vi.clearAllMocks();
    config.getOrThrow.mockReturnValue(SOURCE_URL);
    prisma.syncRun.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SourceService);
  });

  it('reports the configured database when no sync has run yet', async () => {
    await expect(service.getStatus()).resolves.toEqual({
      configured: true,
      database: 'acme',
      lastSync: null,
    });

    expect(config.getOrThrow).toHaveBeenCalledWith('SOURCE_DATABASE_URL');
    expect(prisma.syncRun.findFirst).toHaveBeenCalledOnce();
  });

  it('maps the most recent run to ISO strings', async () => {
    prisma.syncRun.findFirst.mockResolvedValue({
      status: 'FAILED',
      startedAt: new Date('2026-10-20T08:15:00.000Z'),
      finishedAt: new Date('2026-10-20T08:15:01.250Z'),
      error: 'Source credentials were rejected.',
    });

    await expect(service.getStatus()).resolves.toEqual({
      configured: true,
      database: 'acme',
      lastSync: {
        status: 'FAILED',
        startedAt: '2026-10-20T08:15:00.000Z',
        finishedAt: '2026-10-20T08:15:01.250Z',
        error: 'Source credentials were rejected.',
      },
    });
  });

  it('never exposes credentials or the host from the source URL', async () => {
    const status = await service.getStatus();
    const body = JSON.stringify(status);
    const url = new URL(SOURCE_URL);

    expect(body).not.toContain(url.username);
    expect(body).not.toContain(url.password);
    expect(body).not.toContain(url.host);
    expect(body).not.toContain(SOURCE_URL);
    expect(body).toContain('"database":"acme"');
  });

  it('returns a null database when the URL has no database name', async () => {
    config.getOrThrow.mockReturnValue(
      'postgresql://acme_reader:super-secret@db.internal:5433',
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      database: null,
    });
  });
});
