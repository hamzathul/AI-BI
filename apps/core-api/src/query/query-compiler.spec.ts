import { describe, expect, it } from 'vitest';
import { acmeMetadata } from '../../test/fixtures/acme-metadata.js';
import { ACME_SEMANTIC_MODEL } from '../semantic/acme-model.js';
import { semanticModelDocumentSchema } from '../semantic/semantic-model.schema.js';
import { buildSemanticCatalog } from '../semantic/semantic-model.validation.js';
import { compileQuery, QueryCompilationError } from './query-compiler.js';
import { querySpecSchema } from './query-spec.schema.js';

const catalog = buildSemanticCatalog(
  semanticModelDocumentSchema.parse(ACME_SEMANTIC_MODEL),
  acmeMetadata,
);

function compile(spec: unknown) {
  return compileQuery(querySpecSchema.parse(spec), catalog);
}

function compileError(spec: unknown): string[] {
  try {
    compile(spec);
  } catch (error) {
    expect(error).toBeInstanceOf(QueryCompilationError);
    return (error as QueryCompilationError).issues;
  }
  throw new Error('Expected compilation to fail');
}

describe('QuerySpec compiler', () => {
  it('compiles a filtered base-dataset metric', () => {
    expect(compile({ metrics: ['headcount'] })).toMatchSnapshot();
  });

  it('joins a parent dataset for a grouped dimension', () => {
    expect(
      compile({
        metrics: ['headcount'],
        dimensions: ['department'],
        orderBy: [{ field: 'headcount', direction: 'desc' }],
        limit: 10,
      }),
    ).toMatchSnapshot();
  });

  it('joins two hops for a metric filter and a product dimension', () => {
    expect(
      compile({
        metrics: ['revenue'],
        dimensions: ['product_category'],
        orderBy: [{ field: 'product_category', direction: 'asc' }],
        limit: 100,
      }),
    ).toMatchSnapshot();
  });

  it('joins two hops from order items to customers', () => {
    expect(
      compile({
        metrics: ['revenue'],
        dimensions: ['customer_country'],
        orderBy: [{ field: 'revenue', direction: 'desc' }],
        limit: 8,
      }),
    ).toMatchSnapshot();
  });

  it('compiles a monthly time grain with a bounded date filter', () => {
    expect(
      compile({
        metrics: ['revenue'],
        timeGrain: { dimension: 'order_date', grain: 'month' },
        filters: [
          {
            dimension: 'order_date',
            operator: 'between',
            value: ['2024-01-01', '2024-12-31'],
          },
        ],
        orderBy: [{ field: 'order_date', direction: 'asc' }],
        limit: 100,
      }),
    ).toMatchSnapshot();
  });

  it('formats a date dimension as YYYY-MM-DD text', () => {
    expect(
      compile({
        metrics: ['headcount'],
        dimensions: ['hire_date'],
        orderBy: [{ field: 'hire_date', direction: 'asc' }],
      }),
    ).toMatchSnapshot();
  });

  it('compiles a metric on a different fact dataset', () => {
    expect(
      compile({
        dataset: 'orders',
        metrics: ['cancelled_orders'],
        dimensions: ['order_status'],
        orderBy: [{ field: 'cancelled_orders', direction: 'desc' }],
        limit: 10,
      }),
    ).toMatchSnapshot();
  });

  it('orders query-filter parameters after metric-filter parameters', () => {
    expect(
      compile({
        metrics: ['headcount'],
        dimensions: ['location'],
        filters: [{ dimension: 'is_active', operator: 'eq', value: true }],
        orderBy: [{ field: 'location', direction: 'asc' }],
        limit: 50,
      }),
    ).toMatchSnapshot();
  });

  it('rejects unknown names and cross-dataset metrics', () => {
    expect(compileError({ metrics: ['missing'] })[0]).toMatch(
      /Unknown metric "missing"/,
    );
    expect(compileError({ metrics: ['headcount', 'revenue'] })[0]).toMatch(
      /span datasets/,
    );
    expect(
      compileError({ metrics: ['headcount'], dimensions: ['missing'] })[0],
    ).toMatch(/Unknown dimension "missing"/);
    expect(
      compileError({
        metrics: ['headcount'],
        filters: [{ dimension: 'missing', operator: 'eq', value: 'x' }],
      })[0],
    ).toMatch(/Unknown filter dimension/);
  });

  it('rejects a time grain on a non-date dimension', () => {
    expect(
      compileError({
        metrics: ['headcount'],
        timeGrain: { dimension: 'department', grain: 'month' },
      })[0],
    ).toMatch(/requires a date or timestamp dimension/);
  });

  it('rejects an order field that is not selected', () => {
    expect(
      compileError({
        metrics: ['headcount'],
        orderBy: [{ field: 'avg_salary', direction: 'desc' }],
      })[0],
    ).toMatch(/is not in the result columns/);
  });

  it('rejects a dataset that does not match the metrics', () => {
    expect(
      compileError({ dataset: 'orders', metrics: ['revenue'] })[0],
    ).toMatch(/not "orders"/);
  });

  it('reports a dimension on a dataset with no join path', () => {
    const isolated = {
      ...catalog,
      joins: catalog.joins.filter((join) => join.name !== 'order_items_order'),
    };

    try {
      compileQuery(
        querySpecSchema.parse({
          metrics: ['revenue'],
          dimensions: ['order_status'],
        }),
        isolated,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(QueryCompilationError);
      expect((error as QueryCompilationError).issues[0]).toMatch(
        /not reachable from "order_items"/,
      );
      return;
    }

    throw new Error('Expected compilation to fail');
  });
});
