import { ConfigService } from '@nestjs/config';
import { PostgresConnector } from '../src/connectors/postgres/postgres.connector.js';
import type {
  DiscoveredDatabase,
  DiscoveredObject,
} from '../src/connectors/connector.types.js';

process.loadEnvFile();

function makeConnector(): PostgresConnector {
  return new PostgresConnector({
    getOrThrow: () => process.env.SOURCE_DATABASE_URL!,
  } as unknown as ConfigService);
}

function findObject(
  database: DiscoveredDatabase,
  schema: string,
  name: string,
): DiscoveredObject {
  const object = database.schemas
    .find((candidate) => candidate.name === schema)
    ?.objects.find((candidate) => candidate.name === name);

  if (!object) throw new Error(`Object ${schema}.${name} was not discovered.`);

  return object;
}

describe('Postgres introspection (e2e)', () => {
  let connector: PostgresConnector;
  let database: DiscoveredDatabase;

  beforeAll(async () => {
    connector = makeConnector();
    database = await connector.discoverSchema();
  });

  afterAll(async () => {
    await connector.onModuleDestroy();
  });

  it('discovers the Acme schemas and excludes system schemas', () => {
    const names = database.schemas.map((schema) => schema.name);

    expect(names).toEqual(expect.arrayContaining(['hr', 'sales']));
    expect(names).not.toContain('pg_catalog');
    expect(names).not.toContain('information_schema');
  });

  it('discovers 6 tables and 2 views', () => {
    const objects = database.schemas.flatMap((schema) => schema.objects);
    const tables = objects.filter((object) => object.kind === 'table');
    const views = objects.filter((object) => object.kind === 'view');

    expect(tables.map((table) => `${table.name}`)).toHaveLength(6);
    expect(views.map((view) => `${view.name}`).sort()).toEqual([
      'department_headcount',
      'order_totals',
    ]);
    expect(objects).toHaveLength(8);
  });

  it('captures employee columns in catalog order with canonical types', () => {
    const employees = findObject(database, 'hr', 'employees');

    expect(employees.kind).toBe('table');
    expect(employees.primaryKey).toEqual(['id']);
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

    const salary = employees.columns.find((column) => column.name === 'salary');
    expect(salary).toMatchObject({
      dataType: 'numeric(10,2)',
      nullable: false,
      defaultValue: null,
      comment: 'Annual gross salary (sample amount; currency not modeled).',
      ordinalPosition: 8,
    });

    const isActive = employees.columns.find(
      (column) => column.name === 'is_active',
    );
    expect(isActive).toMatchObject({
      dataType: 'boolean',
      nullable: false,
      defaultValue: 'true',
    });

    const managerId = employees.columns.find(
      (column) => column.name === 'manager_id',
    );
    expect(managerId?.comment).toBe(
      "Self-reference: the employee's direct manager.",
    );
  });

  it('captures view columns and types', () => {
    const headcount = findObject(database, 'hr', 'department_headcount');

    expect(headcount.kind).toBe('view');
    expect(headcount.primaryKey).toEqual([]);
    expect(headcount.columns.map((column) => column.name)).toEqual([
      'department_id',
      'department',
      'headcount',
    ]);
    expect(headcount.columns.map((column) => column.dataType)).toEqual([
      'integer',
      'text',
      'bigint',
    ]);

    const orderTotals = findObject(database, 'sales', 'order_totals');
    expect(orderTotals.columns.map((column) => column.dataType)).toEqual([
      'integer',
      'date',
      'text',
      'numeric',
    ]);
  });

  it('captures timestamptz defaults and canonical aliases', () => {
    const customers = findObject(database, 'sales', 'customers');
    const createdAt = customers.columns.find(
      (column) => column.name === 'created_at',
    );

    expect(createdAt).toMatchObject({
      dataType: 'timestamptz',
      nullable: false,
      defaultValue: 'now()',
    });
  });

  it('builds the five foreign-key relations, including the self-reference', () => {
    expect(database.relations).toHaveLength(5);
    expect(database.relations).toEqual(
      expect.arrayContaining([
        {
          name: 'employees_department_id_fkey',
          from: {
            schema: 'hr',
            object: 'employees',
            column: 'department_id',
          },
          to: { schema: 'hr', object: 'departments', column: 'id' },
        },
        {
          name: 'employees_manager_id_fkey',
          from: { schema: 'hr', object: 'employees', column: 'manager_id' },
          to: { schema: 'hr', object: 'employees', column: 'id' },
        },
        {
          name: 'orders_customer_id_fkey',
          from: { schema: 'sales', object: 'orders', column: 'customer_id' },
          to: { schema: 'sales', object: 'customers', column: 'id' },
        },
        {
          name: 'order_items_order_id_fkey',
          from: {
            schema: 'sales',
            object: 'order_items',
            column: 'order_id',
          },
          to: { schema: 'sales', object: 'orders', column: 'id' },
        },
        {
          name: 'order_items_product_id_fkey',
          from: {
            schema: 'sales',
            object: 'order_items',
            column: 'product_id',
          },
          to: { schema: 'sales', object: 'products', column: 'id' },
        },
      ]),
    );
  });

  it('discovers every column (38) across Acme', () => {
    const columns = database.schemas.flatMap((schema) =>
      schema.objects.flatMap((object) => object.columns),
    );

    expect(columns).toHaveLength(38);
  });
});
