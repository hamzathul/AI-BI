import { ConflictException } from '@nestjs/common';
import type { DiscoveredDatabase } from '../connectors/connector.types.js';
import {
  ConnectorError,
  ConnectorErrorCode,
} from '../connectors/connector.errors.js';
import { SourceConnectorService } from '../connectors/source-connector.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STALE_SYNC_MS, SyncService } from './sync.service.js';

const STARTED_AT = new Date('2026-10-20T08:15:00.000Z');
const FINISHED_AT = new Date('2026-10-20T08:15:01.000Z');

function makeDiscovered(): DiscoveredDatabase {
  return {
    schemas: [
      {
        name: 'hr',
        objects: [
          {
            name: 'departments',
            kind: 'table',
            primaryKey: ['id'],
            columns: [
              {
                name: 'id',
                dataType: 'integer',
                nullable: false,
                defaultValue: null,
                comment: null,
                ordinalPosition: 1,
              },
              {
                name: 'name',
                dataType: 'text',
                nullable: false,
                defaultValue: null,
                comment: null,
                ordinalPosition: 2,
              },
            ],
          },
        ],
      },
      { name: 'sales', objects: [] },
    ],
    relations: [
      {
        name: 'departments_self_fk',
        from: { schema: 'hr', object: 'departments', column: 'id' },
        to: { schema: 'hr', object: 'departments', column: 'id' },
      },
    ],
  };
}

describe('SyncService', () => {
  let service: SyncService;
  let columnSequence: number;

  const tx = {
    dbRelation: { deleteMany: vi.fn(), createMany: vi.fn() },
    dbColumn: {
      deleteMany: vi.fn(),
      createManyAndReturn: vi.fn(),
    },
    dbObject: { deleteMany: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    syncRun: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const connector = { discoverSchema: vi.fn() };
  const sourceConnector = { getConnector: vi.fn(() => connector) };

  beforeEach(() => {
    vi.clearAllMocks();
    columnSequence = 0;

    prisma.syncRun.updateMany.mockResolvedValue({ count: 0 });
    prisma.syncRun.findFirst.mockResolvedValue(null);
    prisma.syncRun.create.mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      startedAt: STARTED_AT,
      finishedAt: null,
      error: null,
    });
    prisma.syncRun.update.mockResolvedValue({
      id: 'run-1',
      status: 'SUCCEEDED',
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      error: null,
    });
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    );

    tx.dbRelation.deleteMany.mockResolvedValue({ count: 0 });
    tx.dbRelation.createMany.mockResolvedValue({ count: 1 });
    tx.dbColumn.deleteMany.mockResolvedValue({ count: 0 });
    tx.dbColumn.createManyAndReturn.mockImplementation(
      ({ data }: { data: Array<{ name: string }> }) =>
        Promise.resolve(
          data.map((column) => ({
            id: `column-${++columnSequence}`,
            name: column.name,
          })),
        ),
    );
    tx.dbObject.deleteMany.mockResolvedValue({ count: 0 });
    tx.dbObject.create.mockImplementation(
      ({
        data,
      }: {
        data: { schemaName: string; name: string; kind: string };
      }) =>
        Promise.resolve({
          id: `object-${data.schemaName}.${data.name}`,
          ...data,
        }),
    );

    service = new SyncService(
      prisma as unknown as PrismaService,
      sourceConnector as unknown as SourceConnectorService,
    );
  });

  it('stores the discovered snapshot, counts, and SUCCEEDED outcome', async () => {
    connector.discoverSchema.mockResolvedValue(makeDiscovered());

    const result = await service.runSync();

    expect(result).toEqual({
      id: 'run-1',
      status: 'SUCCEEDED',
      startedAt: STARTED_AT.toISOString(),
      finishedAt: FINISHED_AT.toISOString(),
      error: null,
      counts: { schemas: 1, objects: 1, columns: 2, relations: 1 },
    });

    expect(tx.dbRelation.deleteMany).toHaveBeenCalledOnce();
    expect(tx.dbColumn.deleteMany).toHaveBeenCalledOnce();
    expect(tx.dbObject.deleteMany).toHaveBeenCalledOnce();
    expect(tx.dbObject.create).toHaveBeenCalledWith({
      data: { schemaName: 'hr', name: 'departments', kind: 'TABLE' },
    });
    expect(tx.dbRelation.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: 'departments_self_fk',
          fromColumnId: 'column-1',
          toColumnId: 'column-1',
        },
      ],
    });
    expect(prisma.syncRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'SUCCEEDED', finishedAt: expect.any(Date) },
    });
  });

  it('marks stale RUNNING rows FAILED before checking for a running sync', async () => {
    connector.discoverSchema.mockResolvedValue(makeDiscovered());

    await service.runSync();

    const { where, data } = prisma.syncRun.updateMany.mock.calls[0][0] as {
      where: { status: string; startedAt: { lt: Date } };
      data: { status: string; error: string };
    };

    expect(where.status).toBe('RUNNING');
    expect(Date.now() - where.startedAt.lt.getTime()).toBeGreaterThanOrEqual(
      STALE_SYNC_MS,
    );
    expect(data).toMatchObject({
      status: 'FAILED',
      error: 'Sync was interrupted and marked stale.',
    });
  });

  it('refuses to start while another sync is RUNNING', async () => {
    prisma.syncRun.findFirst.mockResolvedValue({ id: 'running' });

    await expect(service.runSync()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.syncRun.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a FAILED run with the safe connector message and rethrows', async () => {
    const sourceError = new ConnectorError(
      ConnectorErrorCode.AUTH,
      'Source database credentials were rejected.',
    );
    connector.discoverSchema.mockRejectedValue(sourceError);

    await expect(service.runSync()).rejects.toBe(sourceError);

    expect(prisma.syncRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'FAILED',
        finishedAt: expect.any(Date),
        error: 'Source database credentials were rejected.',
      },
    });
  });

  it('normalizes unexpected sync failures to INTERNAL', async () => {
    connector.discoverSchema.mockRejectedValue(new Error('secret detail'));

    await expect(service.runSync()).rejects.toMatchObject({
      name: 'ConnectorError',
      code: ConnectorErrorCode.INTERNAL,
      message: 'The metadata sync failed.',
    });

    const { data } = prisma.syncRun.update.mock.calls[0][0] as {
      data: { status: string; error: string };
    };
    expect(data).toMatchObject({
      status: 'FAILED',
      error: 'The metadata sync failed.',
    });
    expect(data.error).not.toContain('secret detail');
  });
});
