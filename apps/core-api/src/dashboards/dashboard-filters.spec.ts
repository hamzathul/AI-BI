import { describe, expect, it } from 'vitest';
import type {
  CatalogDataset,
  CatalogDimension,
  CatalogMetric,
  SemanticCatalog,
} from '../semantic/semantic-catalog.js';
import { typeFamily } from '../semantic/type-family.js';
import {
  applyDashboardFilters,
  DashboardFilterError,
  validateDashboardFilters,
} from './dashboard-filters.js';
import type { QuerySpec } from '../query/query-spec.schema.js';

function dimension(
  name: string,
  dataset: string,
  column: string,
  dataType: string,
): CatalogDimension {
  return { name, dataset, column, dataType, family: typeFamily(dataType) };
}

function metric(name: string, dataset: string): CatalogMetric {
  return {
    name,
    dataset,
    aggregation: 'sum',
    expression: null,
    filters: [],
  };
}

function dataset(
  name: string,
  dimensions: CatalogDimension[],
  metrics: CatalogMetric[],
): CatalogDataset {
  return {
    name,
    schemaName: 'sales',
    objectName: name,
    columns: new Map(),
    dimensions: new Map(dimensions.map((entry) => [entry.name, entry])),
    metrics: new Map(metrics.map((entry) => [entry.name, entry])),
  };
}

function buildCatalog(): SemanticCatalog {
  const orderDate = dimension('order_date', 'orders', 'order_date', 'date');
  const orderStatus = dimension('order_status', 'orders', 'status', 'text');
  const category = dimension(
    'product_category',
    'products',
    'category',
    'text',
  );
  const customer = dimension('customer', 'customers', 'name', 'text');
  const region = dimension('region', 'regions', 'name', 'text');

  const datasets = [
    dataset('order_items', [], [metric('revenue', 'order_items')]),
    dataset(
      'orders',
      [orderDate, orderStatus],
      [metric('orders', 'orders')],
    ),
    dataset('products', [category], [metric('product_count', 'products')]),
    dataset('customers', [customer], [metric('customer_count', 'customers')]),
    dataset('regions', [region], [metric('region_count', 'regions')]),
  ];

  const dimensions = new Map<string, CatalogDimension>();
  const metrics = new Map<string, CatalogMetric>();

  for (const entry of datasets) {
    for (const item of entry.dimensions.values()) {
      dimensions.set(item.name, item);
    }
    for (const item of entry.metrics.values()) {
      metrics.set(item.name, item);
    }
  }

  return {
    model: { name: 'Test' },
    datasets: new Map(datasets.map((entry) => [entry.name, entry])),
    dimensions,
    metrics,
    joins: [
      {
        name: 'order_items_order',
        fromDataset: 'order_items',
        fromColumn: 'order_id',
        toDataset: 'orders',
        toColumn: 'id',
        type: 'left',
      },
      {
        name: 'order_items_product',
        fromDataset: 'order_items',
        fromColumn: 'product_id',
        toDataset: 'products',
        toColumn: 'id',
        type: 'left',
      },
      {
        name: 'orders_customer',
        fromDataset: 'orders',
        fromColumn: 'customer_id',
        toDataset: 'customers',
        toColumn: 'id',
        type: 'left',
      },
    ],
  };
}

function spec(overrides: Partial<QuerySpec> = {}): QuerySpec {
  return {
    metrics: ['revenue'],
    dimensions: [],
    filters: [],
    orderBy: [],
    ...overrides,
  };
}

describe('applyDashboardFilters', () => {
  const catalog = buildCatalog();

  it('adds inclusive date bounds on a reachable date dimension', () => {
    const result = applyDashboardFilters(
      spec(),
      { dateRange: { dimension: 'order_date', from: '2025-01-01', to: '2025-06-30' } },
      catalog,
    );

    expect(result.applied).toEqual(['order_date']);
    expect(result.skipped).toEqual([]);
    expect(result.query.filters).toEqual([
      { dimension: 'order_date', operator: 'gte', value: '2025-01-01' },
      { dimension: 'order_date', operator: 'lte', value: '2025-06-30' },
    ]);
  });

  it('adds one bound when only one side is set', () => {
    const result = applyDashboardFilters(
      spec(),
      { dateRange: { dimension: 'order_date', from: '2025-01-01' } },
      catalog,
    );

    expect(result.query.filters).toEqual([
      { dimension: 'order_date', operator: 'gte', value: '2025-01-01' },
    ]);
  });

  it('maps a string to eq and an array to in', () => {
    const eq = applyDashboardFilters(
      spec(),
      { categorical: { dimension: 'product_category', value: 'Audio' } },
      catalog,
    );
    expect(eq.query.filters).toEqual([
      { dimension: 'product_category', operator: 'eq', value: 'Audio' },
    ]);

    const list = applyDashboardFilters(
      spec(),
      { categorical: { dimension: 'product_category', value: ['Audio', 'Video'] } },
      catalog,
    );
    expect(list.query.filters).toEqual([
      { dimension: 'product_category', operator: 'in', value: ['Audio', 'Video'] },
    ]);
  });

  it('lets the dashboard filter replace a widget filter on the same dimension', () => {
    const result = applyDashboardFilters(
      spec({
        filters: [
          { dimension: 'order_status', operator: 'neq', value: 'cancelled' },
          { dimension: 'product_category', operator: 'eq', value: 'Audio' },
        ],
      }),
      { categorical: { dimension: 'product_category', value: 'Hardware' } },
      catalog,
    );

    expect(result.query.filters).toEqual([
      { dimension: 'order_status', operator: 'neq', value: 'cancelled' },
      { dimension: 'product_category', operator: 'eq', value: 'Hardware' },
    ]);
  });

  it('skips a dimension the widget cannot reach, without guessing', () => {
    const result = applyDashboardFilters(
      spec(),
      { categorical: { dimension: 'region', value: 'EMEA' } },
      catalog,
    );

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['region']);
    expect(result.query.filters).toEqual([]);
  });

  it('reaches a grandparent dimension through two joins', () => {
    const result = applyDashboardFilters(
      spec(),
      { categorical: { dimension: 'customer', value: 'Acme' } },
      catalog,
    );

    expect(result.applied).toEqual(['customer']);
    expect(result.query.filters).toEqual([
      { dimension: 'customer', operator: 'eq', value: 'Acme' },
    ]);
  });

  it('returns the query untouched when there is nothing to apply', () => {
    const query = spec();
    const result = applyDashboardFilters(query, {}, catalog);

    expect(result.query).toBe(query);
    expect(result.applied).toEqual([]);
  });

  it('throws for a dimension that is not in the model', () => {
    expect(() =>
      applyDashboardFilters(
        spec(),
        { categorical: { dimension: 'ghost', value: 'x' } },
        catalog,
      ),
    ).toThrow(DashboardFilterError);
  });

  it('measures reachability from the query fact dataset', () => {
    const result = applyDashboardFilters(
      spec({ metrics: ['orders'], dimensions: ['order_status'] }),
      { categorical: { dimension: 'product_category', value: 'Audio' } },
      catalog,
    );

    expect(result.skipped).toEqual(['product_category']);
  });
});

describe('validateDashboardFilters', () => {
  const catalog = buildCatalog();

  it('accepts a date range on a date dimension', () => {
    expect(() =>
      validateDashboardFilters(
        { dateRange: { dimension: 'order_date', from: '2025-01-01' } },
        catalog,
      ),
    ).not.toThrow();
  });

  it('rejects a date range on a text dimension', () => {
    expect(() =>
      validateDashboardFilters(
        { dateRange: { dimension: 'product_category', from: '2025-01-01' } },
        catalog,
      ),
    ).toThrow(/needs a date or timestamp dimension/);
  });

  it('rejects unknown dimensions, naming what exists', () => {
    expect(() =>
      validateDashboardFilters(
        { categorical: { dimension: 'ghost', value: 'x' } },
        catalog,
      ),
    ).toThrow(/Unknown filter dimension "ghost".*order_date/);
  });

  it('accepts an empty filter set', () => {
    expect(() => validateDashboardFilters({}, catalog)).not.toThrow();
  });
});
