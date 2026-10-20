import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { STALE_SYNC_MS } from '../src/metadata/sync.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface SyncCounts {
  schemas: number;
  objects: number;
  columns: number;
  relations: number;
}

interface SyncResponse {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  error: string | null;
  counts: SyncCounts;
}

interface MetadataColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  comment: string | null;
  isPrimaryKey: boolean;
}

interface MetadataObject {
  id: string;
  name: string;
  kind: 'TABLE' | 'VIEW';
  primaryKey: string[];
  columns: MetadataColumn[];
}

interface MetadataResponse {
  syncedAt: string | null;
  schemas: Array<{ name: string; objects: MetadataObject[] }>;
  relations: Array<{
    name: string;
    from: { schema: string; object: string; column: string };
    to: { schema: string; object: string; column: string };
  }>;
}

async function clearMetadata(prisma: PrismaService): Promise<void> {
  await prisma.dbRelation.deleteMany();
  await prisma.dbColumn.deleteMany();
  await prisma.dbObject.deleteMany();
}

function findObject(
  metadata: MetadataResponse,
  schemaName: string,
  objectName: string,
): MetadataObject {
  const object = metadata.schemas
    .find((schema) => schema.name === schemaName)
    ?.objects.find((candidate) => candidate.name === objectName);

  if (!object) throw new Error(`${schemaName}.${objectName} is missing.`);

  return object;
}

describe('metadata sync (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdRunIds: string[] = [];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await clearMetadata(prisma);
  });

  afterEach(async () => {
    await clearMetadata(prisma).catch(() => undefined);

    if (createdRunIds.length > 0) {
      await prisma.syncRun
        .deleteMany({ where: { id: { in: createdRunIds } } })
        .catch(() => undefined);
      createdRunIds.length = 0;
    }

    await app.close();
  });

  async function sync(): Promise<SyncResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/source/sync')
      .expect(200);
    const body = response.body as SyncResponse;
    createdRunIds.push(body.id);
    return body;
  }

  async function getMetadata(): Promise<MetadataResponse> {
    const response = await request(app.getHttpServer())
      .get('/api/metadata')
      .expect(200);
    return response.body as MetadataResponse;
  }

  it('GET /api/metadata is empty before the first sync', async () => {
    await expect(getMetadata()).resolves.toEqual({
      syncedAt: null,
      schemas: [],
      relations: [],
    });
  });

  it('POST /api/source/sync stores the Acme snapshot and reports counts', async () => {
    const result = await sync();

    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      error: null,
      counts: { schemas: 2, objects: 8, columns: 38, relations: 5 },
    });
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(Number.isNaN(Date.parse(result.startedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(result.finishedAt))).toBe(false);
  });

  it('GET /api/metadata returns a browsable tree with keys and relations', async () => {
    const syncResult = await sync();
    const metadata = await getMetadata();

    expect(metadata.syncedAt).toBe(syncResult.finishedAt);
    expect(metadata.schemas.map((schema) => schema.name)).toEqual([
      'hr',
      'sales',
    ]);
    expect(metadata.relations).toHaveLength(5);

    const objects = metadata.schemas.flatMap((schema) => schema.objects);
    expect(objects).toHaveLength(8);
    expect(
      objects
        .filter((object) => object.kind === 'VIEW')
        .map((object) => object.name)
        .sort(),
    ).toEqual(['department_headcount', 'order_totals']);

    const employees = findObject(metadata, 'hr', 'employees');
    expect(employees.kind).toBe('TABLE');
    expect(employees.primaryKey).toEqual(['id']);
    expect(employees.columns).toHaveLength(9);
    expect(employees.columns.map((column) => column.name)).toEqual([
      'id',
      'department_id',
      'manager_id',
      'first_name',
      'last_name',
      'email',
      'hire_date',
      'salary',
      'is_active',
    ]);
    expect(
      employees.columns.find((column) => column.name === 'id'),
    ).toMatchObject({ dataType: 'integer', isPrimaryKey: true });
    expect(
      employees.columns.find((column) => column.name === 'salary'),
    ).toMatchObject({
      dataType: 'numeric(10,2)',
      nullable: false,
      comment: 'Annual gross salary (sample amount; currency not modeled).',
      isPrimaryKey: false,
    });

    expect(metadata.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'employees_department_id_fkey',
          from: {
            schema: 'hr',
            object: 'employees',
            column: 'department_id',
          },
          to: { schema: 'hr', object: 'departments', column: 'id' },
        }),
        expect.objectContaining({
          name: 'employees_manager_id_fkey',
          from: { schema: 'hr', object: 'employees', column: 'manager_id' },
          to: { schema: 'hr', object: 'employees', column: 'id' },
        }),
      ]),
    );
  });

  it('a second sync replaces the snapshot without duplicating rows', async () => {
    const first = await sync();
    const firstMetadata = await getMetadata();

    const second = await sync();
    const secondMetadata = await getMetadata();

    expect(second.counts).toEqual(first.counts);
    expect(
      secondMetadata.schemas.flatMap((schema) => schema.objects),
    ).toHaveLength(8);
    expect(
      secondMetadata.schemas.flatMap((schema) =>
        schema.objects.flatMap((object) => object.columns),
      ),
    ).toHaveLength(38);
    expect(secondMetadata.relations).toHaveLength(5);

    // Full replacement means snapshot-scoped IDs change (D41).
    expect(
      secondMetadata.schemas
        .flatMap((schema) => schema.objects)
        .map((object) => object.id),
    ).not.toEqual(
      firstMetadata.schemas
        .flatMap((schema) => schema.objects)
        .map((object) => object.id),
    );
  });

  it('refuses a concurrent sync with 409 while a run is RUNNING', async () => {
    const running = await prisma.syncRun.create({
      data: { status: 'RUNNING' },
    });
    createdRunIds.push(running.id);

    const response = await request(app.getHttpServer())
      .post('/api/source/sync')
      .expect(409);

    expect(response.body).toMatchObject({
      statusCode: 409,
      message: 'A metadata sync is already running.',
    });
    await expect(prisma.dbObject.count()).resolves.toBe(0);
  });

  it('marks a stale RUNNING row FAILED and proceeds', async () => {
    const stale = await prisma.syncRun.create({
      data: {
        status: 'RUNNING',
        startedAt: new Date(Date.now() - STALE_SYNC_MS - 60_000),
      },
    });
    createdRunIds.push(stale.id);

    const result = await sync();

    expect(result.status).toBe('SUCCEEDED');

    const updated = await prisma.syncRun.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(updated).toMatchObject({
      status: 'FAILED',
      error: 'Sync was interrupted and marked stale.',
    });
    expect(updated.finishedAt).toBeInstanceOf(Date);
  });
});
