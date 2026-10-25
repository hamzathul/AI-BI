import { describe, expect, it } from 'vitest';
import { querySpecSchema } from './query-spec.schema.js';

describe('QuerySpec schema', () => {
  it('applies defaults for the optional parts', () => {
    expect(querySpecSchema.parse({ metrics: ['headcount'] })).toEqual({
      metrics: ['headcount'],
      dimensions: [],
      filters: [],
      orderBy: [],
    });
  });

  it('accepts a full spec', () => {
    const spec = {
      dataset: 'order_items',
      metrics: ['revenue'],
      dimensions: ['product_category'],
      timeGrain: { dimension: 'order_date', grain: 'month' },
      filters: [{ dimension: 'order_status', operator: 'eq', value: 'paid' }],
      orderBy: [{ field: 'revenue', direction: 'desc' }],
      limit: 500,
    };

    expect(querySpecSchema.parse(spec)).toEqual(spec);
  });

  it.each([
    [{}, /expected array/i],
    [{ metrics: [] }, />=1 items/i],
    [{ metrics: ['revenue', 'revenue'] }, /duplicates/i],
    [
      { metrics: ['revenue'], dimensions: ['product', 'product'] },
      /duplicates/i,
    ],
    [
      {
        metrics: ['revenue'],
        timeGrain: { dimension: 'order_date', grain: 'month' },
        dimensions: ['order_date'],
      },
      /cannot also appear/i,
    ],
    [
      {
        metrics: ['revenue'],
        orderBy: [
          { field: 'revenue', direction: 'asc' },
          { field: 'revenue', direction: 'desc' },
        ],
      },
      /duplicates/i,
    ],
    [{ metrics: ['revenue'], limit: 0 }, />=1/i],
    [{ metrics: ['revenue'], limit: 10_001 }, /<=10000/i],
    [{ metrics: ['revenue'], limit: 1.5 }, /expected int/i],
    [{ metrics: ['Revenue'] }, /lower_snake_case/i],
    [{ metrics: ['update'] }, /reserved SQL keyword/i],
    [
      {
        metrics: ['revenue'],
        timeGrain: { dimension: 'order_date', grain: 'hour' },
      },
      /expected one of "day"/i,
    ],
    [{ metrics: ['revenue'], sql: 'SELECT 1' }, /unrecognized key/i],
  ])('rejects invalid spec %#', (spec, message) => {
    const result = querySpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.message).join(' '),
      ).toMatch(message);
    }
  });
});
