import type {
  MetadataColumnDto,
  MetadataObjectDto,
  MetadataSnapshotDto,
} from '../../src/metadata/metadata.dto.js';

function column(
  name: string,
  dataType: string,
  overrides: Partial<MetadataColumnDto> = {},
): MetadataColumnDto {
  return {
    id: `column-${name}`,
    name,
    dataType,
    nullable: false,
    defaultValue: null,
    comment: null,
    isPrimaryKey: false,
    ordinalPosition: 1,
    ...overrides,
  };
}

function object(
  name: string,
  columns: MetadataColumnDto[],
  overrides: Partial<MetadataObjectDto> = {},
): MetadataObjectDto {
  return {
    id: `object-${name}`,
    name,
    kind: 'TABLE',
    primaryKey: ['id'],
    columns,
    ...overrides,
  };
}

const departments = object('departments', [
  column('id', 'integer', { isPrimaryKey: true, ordinalPosition: 1 }),
  column('name', 'text', { ordinalPosition: 2 }),
  column('location', 'text', { nullable: true, ordinalPosition: 3 }),
]);

const employees = object('employees', [
  column('id', 'integer', { isPrimaryKey: true, ordinalPosition: 1 }),
  column('department_id', 'integer', { nullable: true, ordinalPosition: 2 }),
  column('manager_id', 'integer', { nullable: true, ordinalPosition: 3 }),
  column('first_name', 'text', { ordinalPosition: 4 }),
  column('last_name', 'text', { ordinalPosition: 5 }),
  column('email', 'text', { ordinalPosition: 6 }),
  column('hire_date', 'date', { ordinalPosition: 7 }),
  column('salary', 'numeric(10,2)', { ordinalPosition: 8 }),
  column('is_active', 'boolean', { ordinalPosition: 9 }),
]);

const customers = object('customers', [
  column('id', 'integer', { isPrimaryKey: true, ordinalPosition: 1 }),
  column('name', 'text', { ordinalPosition: 2 }),
  column('country', 'text', { ordinalPosition: 3 }),
  column('city', 'text', { nullable: true, ordinalPosition: 4 }),
  column('created_at', 'timestamptz', { ordinalPosition: 5 }),
]);

const products = object('products', [
  column('id', 'integer', { isPrimaryKey: true, ordinalPosition: 1 }),
  column('name', 'text', { ordinalPosition: 2 }),
  column('category', 'text', { ordinalPosition: 3 }),
  column('unit_price', 'numeric(10,2)', { ordinalPosition: 4 }),
  column('is_active', 'boolean', { ordinalPosition: 5 }),
]);

const orders = object('orders', [
  column('id', 'integer', { isPrimaryKey: true, ordinalPosition: 1 }),
  column('customer_id', 'integer', { ordinalPosition: 2 }),
  column('order_date', 'date', { ordinalPosition: 3 }),
  column('status', 'text', { ordinalPosition: 4 }),
]);

const orderItems = object('order_items', [
  column('id', 'integer', { isPrimaryKey: true, ordinalPosition: 1 }),
  column('order_id', 'integer', { ordinalPosition: 2 }),
  column('product_id', 'integer', { ordinalPosition: 3 }),
  column('quantity', 'integer', { ordinalPosition: 4 }),
  column('unit_price', 'numeric(10,2)', { ordinalPosition: 5 }),
]);

export const acmeMetadata: MetadataSnapshotDto = {
  syncedAt: '2026-10-22T15:00:00.000Z',
  schemas: [
    { name: 'hr', objects: [departments, employees] },
    {
      name: 'sales',
      objects: [customers, products, orders, orderItems],
    },
  ],
  relations: [
    {
      id: 'relation-employees-department',
      name: 'employees_department_id_fkey',
      from: { schema: 'hr', object: 'employees', column: 'department_id' },
      to: { schema: 'hr', object: 'departments', column: 'id' },
    },
    {
      id: 'relation-employees-manager',
      name: 'employees_manager_id_fkey',
      from: { schema: 'hr', object: 'employees', column: 'manager_id' },
      to: { schema: 'hr', object: 'employees', column: 'id' },
    },
    {
      id: 'relation-orders-customer',
      name: 'orders_customer_id_fkey',
      from: { schema: 'sales', object: 'orders', column: 'customer_id' },
      to: { schema: 'sales', object: 'customers', column: 'id' },
    },
    {
      id: 'relation-order-items-order',
      name: 'order_items_order_id_fkey',
      from: { schema: 'sales', object: 'order_items', column: 'order_id' },
      to: { schema: 'sales', object: 'orders', column: 'id' },
    },
    {
      id: 'relation-order-items-product',
      name: 'order_items_product_id_fkey',
      from: { schema: 'sales', object: 'order_items', column: 'product_id' },
      to: { schema: 'sales', object: 'products', column: 'id' },
    },
  ],
};
