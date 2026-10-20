import { PrismaService } from '../prisma/prisma.service.js';
import { MetadataService } from './metadata.service.js';

describe('MetadataService', () => {
  const prisma = {
    dbObject: { findMany: vi.fn() },
    dbRelation: { findMany: vi.fn() },
    syncRun: { findFirst: vi.fn() },
  };
  let service: MetadataService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.dbObject.findMany.mockResolvedValue([]);
    prisma.dbRelation.findMany.mockResolvedValue([]);
    prisma.syncRun.findFirst.mockResolvedValue(null);
    service = new MetadataService(prisma as unknown as PrismaService);
  });

  it('returns an empty snapshot before the first successful sync', async () => {
    await expect(service.getMetadata()).resolves.toEqual({
      syncedAt: null,
      schemas: [],
      relations: [],
    });
  });

  it('groups objects into schemas and preserves composite primary-key order', async () => {
    prisma.dbObject.findMany.mockResolvedValue([
      {
        id: 'object-employees',
        schemaName: 'hr',
        name: 'employees',
        kind: 'TABLE',
        columns: [
          {
            id: 'column-a',
            name: 'a',
            dataType: 'integer',
            nullable: false,
            defaultValue: null,
            comment: null,
            primaryKeyPosition: 2,
            ordinalPosition: 1,
          },
          {
            id: 'column-b',
            name: 'b',
            dataType: 'text',
            nullable: true,
            defaultValue: "'x'",
            comment: 'B column',
            primaryKeyPosition: 1,
            ordinalPosition: 2,
          },
        ],
      },
      {
        id: 'object-orders',
        schemaName: 'sales',
        name: 'orders',
        kind: 'VIEW',
        columns: [],
      },
    ]);
    prisma.dbRelation.findMany.mockResolvedValue([
      {
        id: 'relation-1',
        name: 'employees_fk',
        fromColumn: {
          name: 'a',
          object: { schemaName: 'hr', name: 'employees' },
        },
        toColumn: {
          name: 'b',
          object: { schemaName: 'hr', name: 'employees' },
        },
      },
    ]);
    prisma.syncRun.findFirst.mockResolvedValue({
      finishedAt: new Date('2026-10-20T08:15:01.250Z'),
    });

    const result = await service.getMetadata();

    expect(result.syncedAt).toBe('2026-10-20T08:15:01.250Z');
    expect(result.schemas).toEqual([
      {
        name: 'hr',
        objects: [
          {
            id: 'object-employees',
            name: 'employees',
            kind: 'TABLE',
            primaryKey: ['b', 'a'],
            columns: [
              {
                id: 'column-a',
                name: 'a',
                dataType: 'integer',
                nullable: false,
                defaultValue: null,
                comment: null,
                isPrimaryKey: true,
                ordinalPosition: 1,
              },
              {
                id: 'column-b',
                name: 'b',
                dataType: 'text',
                nullable: true,
                defaultValue: "'x'",
                comment: 'B column',
                isPrimaryKey: true,
                ordinalPosition: 2,
              },
            ],
          },
        ],
      },
      {
        name: 'sales',
        objects: [
          {
            id: 'object-orders',
            name: 'orders',
            kind: 'VIEW',
            primaryKey: [],
            columns: [],
          },
        ],
      },
    ]);
    expect(result.relations).toEqual([
      {
        id: 'relation-1',
        name: 'employees_fk',
        from: { schema: 'hr', object: 'employees', column: 'a' },
        to: { schema: 'hr', object: 'employees', column: 'b' },
      },
    ]);
    expect(prisma.dbObject.findMany).toHaveBeenCalledWith({
      include: { columns: { orderBy: { ordinalPosition: 'asc' } } },
      orderBy: [{ schemaName: 'asc' }, { name: 'asc' }],
    });
    expect(prisma.syncRun.findFirst).toHaveBeenCalledWith({
      where: { status: 'SUCCEEDED' },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      select: { finishedAt: true },
    });
  });
});
