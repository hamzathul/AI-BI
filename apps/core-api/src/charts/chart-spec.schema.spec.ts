import { describe, expect, it } from 'vitest';
import {
  chartSpecSchema,
  queryDimensionColumns,
  queryOutputColumns,
} from './chart-spec.schema.js';

const revenueByCategory = {
  metrics: ['revenue'],
  dimensions: ['product_category'],
};

function chart(overrides: Record<string, unknown>) {
  return {
    v: 1,
    title: 'Revenue by category',
    query: revenueByCategory,
    ...overrides,
  };
}

function issues(input: unknown): string[] {
  const result = chartSpecSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe('chartSpecSchema', () => {
  it('accepts a bar chart and applies query defaults', () => {
    const parsed = chartSpecSchema.parse(
      chart({ type: 'bar', x: 'product_category', y: 'revenue' }),
    );

    expect(parsed.type).toBe('bar');
    expect(parsed.query.filters).toEqual([]);
    expect(parsed.query.orderBy).toEqual([]);
  });

  it('accepts table, KPI, and line charts', () => {
    const table = chartSpecSchema.parse(
      chart({
        type: 'table',
        columns: ['product_category', 'revenue'],
        format: { number: { style: 'currency', currency: 'USD' } },
      }),
    );
    const kpi = chartSpecSchema.parse(
      chart({
        type: 'kpi',
        title: 'Revenue',
        query: { metrics: ['revenue'] },
        value: 'revenue',
      }),
    );
    const line = chartSpecSchema.parse(
      chart({
        type: 'line',
        title: 'Monthly revenue',
        query: {
          metrics: ['revenue'],
          timeGrain: { dimension: 'order_date', grain: 'month' },
        },
        x: 'order_date',
        y: 'revenue',
        smooth: true,
      }),
    );

    expect(table.type).toBe('table');
    expect(kpi.type).toBe('kpi');
    expect(line.type).toBe('line');
  });

  it('rejects renderer options — the spec stays renderer-agnostic (D8)', () => {
    expect(
      issues(
        chart({
          type: 'bar',
          x: 'product_category',
          y: 'revenue',
          option: { series: [] },
        }),
      ).join(' ').toLowerCase(),
    ).toContain('unrecognized key');

    expect(
      issues(
        chart({
          type: 'bar',
          x: 'product_category',
          y: 'revenue',
          series: ['a', 'b'],
        }),
      ).join(' '),
    ).toContain('expected string');
  });

  it('rejects columns the query does not return', () => {
    const messages = issues(
      chart({ type: 'bar', x: 'product_category', y: 'profit' }),
    ).join(' ');

    expect(messages).toContain('"profit" is not in the query result');
    expect(messages).toContain('product_category, revenue');
  });

  it('keeps metrics and dimensions in their roles', () => {
    expect(
      issues(chart({ type: 'bar', x: 'revenue', y: 'revenue' })).join(' '),
    ).toContain('must be a dimension');

    expect(
      issues(chart({ type: 'bar', x: 'product_category', y: 'product_category' })).join(
        ' ',
      ),
    ).toContain('must be a metric');
  });

  it('rejects a KPI over a grouped query', () => {
    expect(
      issues(chart({ type: 'kpi', value: 'revenue' })).join(' '),
    ).toContain('A KPI shows one number');
  });

  it('rejects ambiguous and duplicate encodings', () => {
    expect(
      issues(chart({ type: 'bar', x: 'product_category', y: 'revenue', series: 'product_category' })).join(
        ' ',
      ),
    ).toContain('series column must differ');

    expect(
      issues(
        chart({ type: 'table', columns: ['revenue', 'revenue'] }),
      ).join(' '),
    ).toContain('must not repeat');
  });

  it('validates number formats', () => {
    expect(
      issues(
        chart({
          type: 'table',
          columns: ['revenue'],
          format: { number: { style: 'currency' } },
        }),
      ).join(' '),
    ).toContain('needs a currency code');

    expect(
      issues(
        chart({
          type: 'table',
          columns: ['revenue'],
          format: { number: { style: 'plain', currency: 'USD' } },
        }),
      ).join(' '),
    ).toContain('only applies to the currency style');
  });

  it('rejects an unknown chart type and version', () => {
    expect(issues(chart({ type: 'pie', x: 'a', y: 'b' })).join(' ').toLowerCase()).toContain(
      'invalid discriminator',
    );

    expect(issues({ ...chart({ type: 'kpi', value: 'revenue' }), query: { metrics: ['revenue'] }, v: 2 }).join(' ')).toContain(
      'Invalid input',
    );
  });
});

describe('query output columns', () => {
  it('follows compiler order: dimensions, grain, metrics', () => {
    expect(
      queryOutputColumns({
        metrics: ['revenue'],
        dimensions: ['product_category'],
        timeGrain: { dimension: 'order_date', grain: 'month' },
        filters: [],
        orderBy: [],
      }),
    ).toEqual(['product_category', 'order_date', 'revenue']);

    expect(
      queryDimensionColumns({
        metrics: ['revenue'],
        dimensions: [],
        timeGrain: { dimension: 'order_date', grain: 'month' },
        filters: [],
        orderBy: [],
      }),
    ).toEqual(['order_date']);
  });
});
