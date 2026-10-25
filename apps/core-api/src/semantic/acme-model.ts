import type { SemanticModelDocument } from './semantic-model.schema.js';

/**
 * Canonical Acme semantic model (D53).
 *
 * One source of truth for the seed script, `GET /api/semantic/example`, the
 * Swagger example, and the compiler tests. It intentionally covers both
 * domains (HR + sales), filtered metrics, time grains, and a two-hop join.
 */
export const ACME_SEMANTIC_MODEL: SemanticModelDocument = {
  name: 'Acme Inc.',
  description:
    'HR and sales semantics for the Acme sample database. Metrics on one fact dataset can be combined with dimensions from any reachable parent dataset.',
  datasets: [
    {
      name: 'customers',
      source: { schema: 'sales', object: 'customers' },
      description: 'Companies that place orders.',
      dimensions: [
        {
          name: 'customer',
          column: 'name',
          description: 'Customer company name.',
        },
        {
          name: 'customer_country',
          column: 'country',
          description: 'Customer country.',
        },
        {
          name: 'customer_city',
          column: 'city',
          description: 'Customer city.',
        },
      ],
      metrics: [
        {
          name: 'customer_count',
          agg: 'count',
          expression: 'id',
          description: 'Number of customer companies.',
          filters: [],
        },
      ],
    },
    {
      name: 'departments',
      source: { schema: 'hr', object: 'departments' },
      description: 'Company departments, one row per department.',
      dimensions: [
        {
          name: 'department',
          column: 'name',
          description: 'Department name.',
        },
        {
          name: 'location',
          column: 'location',
          description: 'Department location.',
        },
      ],
      metrics: [
        {
          name: 'department_count',
          agg: 'count',
          expression: 'id',
          description: 'Number of departments.',
          filters: [],
        },
      ],
    },
    {
      name: 'employees',
      source: { schema: 'hr', object: 'employees' },
      description: 'One row per employee, including inactive people.',
      dimensions: [
        {
          name: 'hire_date',
          column: 'hire_date',
          description: 'Date the employee joined.',
        },
        {
          name: 'is_active',
          column: 'is_active',
          description: 'False for former employees.',
        },
      ],
      metrics: [
        {
          name: 'headcount',
          agg: 'count',
          expression: 'id',
          description: 'Active employees (is_active = true).',
          filters: [{ dimension: 'is_active', operator: 'eq', value: true }],
        },
        {
          name: 'avg_salary',
          agg: 'avg',
          expression: 'salary',
          description: 'Average annual salary of active employees.',
          filters: [{ dimension: 'is_active', operator: 'eq', value: true }],
        },
      ],
    },
    {
      name: 'order_items',
      source: { schema: 'sales', object: 'order_items' },
      description:
        'Order line items. unit_price is the price captured at sale time.',
      dimensions: [],
      metrics: [
        {
          name: 'revenue',
          agg: 'sum',
          expression: 'quantity * unit_price',
          description:
            'Line-item revenue excluding cancelled orders (quantity × captured unit price).',
          filters: [
            {
              dimension: 'order_status',
              operator: 'neq',
              value: 'cancelled',
            },
          ],
        },
        {
          name: 'gross_revenue',
          agg: 'sum',
          expression: 'quantity * unit_price',
          description:
            'Line-item revenue including cancelled orders (quantity × captured unit price).',
          filters: [],
        },
        {
          name: 'units_sold',
          agg: 'sum',
          expression: 'quantity',
          description: 'Units sold excluding cancelled orders.',
          filters: [
            {
              dimension: 'order_status',
              operator: 'neq',
              value: 'cancelled',
            },
          ],
        },
        {
          name: 'net_orders',
          agg: 'count_distinct',
          expression: 'order_id',
          description: 'Distinct orders excluding cancelled orders.',
          filters: [
            {
              dimension: 'order_status',
              operator: 'neq',
              value: 'cancelled',
            },
          ],
        },
      ],
    },
    {
      name: 'orders',
      source: { schema: 'sales', object: 'orders' },
      description: 'One row per customer order, including cancelled orders.',
      dimensions: [
        {
          name: 'order_date',
          column: 'order_date',
          description: 'Date the order was placed.',
        },
        {
          name: 'order_status',
          column: 'status',
          description: 'pending, paid, shipped, or cancelled.',
        },
      ],
      metrics: [
        {
          name: 'orders',
          agg: 'count',
          expression: 'id',
          description: 'All orders, regardless of status.',
          filters: [],
        },
        {
          name: 'cancelled_orders',
          agg: 'count',
          expression: 'id',
          description: 'Orders with status = cancelled.',
          filters: [
            {
              dimension: 'order_status',
              operator: 'eq',
              value: 'cancelled',
            },
          ],
        },
      ],
    },
    {
      name: 'products',
      source: { schema: 'sales', object: 'products' },
      description: 'Products available for sale.',
      dimensions: [
        {
          name: 'product',
          column: 'name',
          description: 'Product name.',
        },
        {
          name: 'product_category',
          column: 'category',
          description: 'Product category.',
        },
      ],
      metrics: [
        {
          name: 'product_count',
          agg: 'count',
          expression: 'id',
          description: 'Number of products.',
          filters: [],
        },
      ],
    },
  ],
  joins: [
    {
      name: 'employees_department',
      from: { dataset: 'employees', column: 'department_id' },
      to: { dataset: 'departments', column: 'id' },
      type: 'left',
    },
    {
      name: 'order_items_order',
      from: { dataset: 'order_items', column: 'order_id' },
      to: { dataset: 'orders', column: 'id' },
      type: 'left',
    },
    {
      name: 'order_items_product',
      from: { dataset: 'order_items', column: 'product_id' },
      to: { dataset: 'products', column: 'id' },
      type: 'left',
    },
    {
      name: 'orders_customer',
      from: { dataset: 'orders', column: 'customer_id' },
      to: { dataset: 'customers', column: 'id' },
      type: 'left',
    },
  ],
};
