import { Test, type TestingModule } from '@nestjs/testing';
import { SyncService } from '../metadata/sync.service.js';
import { SourceController } from './source.controller.js';
import { SourceService } from './source.service.js';

describe('SourceController', () => {
  let sourceController: SourceController;
  const sourceService = {
    getStatus: vi.fn(),
    testConnection: vi.fn(),
  };
  const syncService = {
    runSync: vi.fn(),
  };

  beforeEach(async () => {
    sourceService.getStatus.mockReset();
    sourceService.testConnection.mockReset();
    syncService.runSync.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SourceController],
      providers: [
        { provide: SourceService, useValue: sourceService },
        { provide: SyncService, useValue: syncService },
      ],
    }).compile();

    sourceController = module.get<SourceController>(SourceController);
  });

  it('returns the service result unchanged', async () => {
    const status = {
      configured: true,
      database: 'acme',
      lastSync: null,
    };
    sourceService.getStatus.mockResolvedValue(status);

    await expect(sourceController.getStatus()).resolves.toBe(status);
    expect(sourceService.getStatus).toHaveBeenCalledOnce();
  });

  it('delegates the connection test', async () => {
    const result = {
      serverVersion: '18.6',
      database: 'acme',
      readOnly: true,
      latencyMs: 4,
    };
    sourceService.testConnection.mockResolvedValue(result);

    await expect(sourceController.testConnection()).resolves.toBe(result);
    expect(sourceService.testConnection).toHaveBeenCalledOnce();
  });

  it('delegates the sync', async () => {
    const result = {
      id: 'run-1',
      status: 'SUCCEEDED',
      startedAt: '2026-10-20T08:15:00.000Z',
      finishedAt: '2026-10-20T08:15:01.000Z',
      error: null,
      counts: { schemas: 3, objects: 8, columns: 38, relations: 5 },
    };
    syncService.runSync.mockResolvedValue(result);

    await expect(sourceController.runSync()).resolves.toBe(result);
    expect(syncService.runSync).toHaveBeenCalledOnce();
  });
});
