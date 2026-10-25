import { describe, expect, it } from 'vitest';
import { QueryParameters } from '../query/parameters.js';
import {
  compileFilter,
  SemanticFilterError,
  validateSemanticFilter,
  type SemanticFilter,
} from './semantic-filter.js';

const salary = { name: 'salary', dataType: 'numeric(10,2)' };
const active = { name: 'is_active', dataType: 'boolean' };
const status = { name: 'order_status', dataType: 'text' };
const orderDate = { name: 'order_date', dataType: 'date' };

function compile(
  filter: SemanticFilter,
  dimension: typeof salary,
): {
  sql: string;
  values: readonly unknown[];
} {
  const parameters = new QueryParameters();
  const validated = validateSemanticFilter(filter, dimension);
  const sql = compileFilter(validated, 't0."value"', parameters);
  return { sql, values: parameters.values };
}

describe('semantic filters', () => {
  it('compiles typed, parameterized comparisons', () => {
    expect(
      compile({ dimension: 'salary', operator: 'gte', value: '100' }, salary),
    ).toEqual({
      sql: 't0."value" >= $1::numeric',
      values: ['100'],
    });

    expect(
      compile({ dimension: 'is_active', operator: 'eq', value: true }, active),
    ).toEqual({ sql: 't0."value" = $1::boolean', values: [true] });

    expect(
      compile(
        { dimension: 'order_status', operator: 'neq', value: 'cancelled' },
        status,
      ),
    ).toEqual({ sql: 't0."value" <> $1::text', values: ['cancelled'] });
  });

  it('expands IN lists and BETWEEN ranges into separate parameters', () => {
    expect(
      compile(
        {
          dimension: 'order_status',
          operator: 'in',
          value: ['paid', 'shipped'],
        },
        status,
      ),
    ).toEqual({
      sql: 't0."value" IN ($1::text, $2::text)',
      values: ['paid', 'shipped'],
    });

    expect(
      compile(
        {
          dimension: 'order_date',
          operator: 'between',
          value: ['2024-01-01', '2024-12-31'],
        },
        orderDate,
      ),
    ).toEqual({
      sql: 't0."value" BETWEEN $1::date AND $2::date',
      values: ['2024-01-01', '2024-12-31'],
    });
  });

  it('handles null operators without values', () => {
    expect(
      compile({ dimension: 'order_date', operator: 'is_null' }, orderDate),
    ).toEqual({ sql: 't0."value" IS NULL', values: [] });

    expect(
      compile({ dimension: 'order_date', operator: 'is_not_null' }, orderDate),
    ).toEqual({ sql: 't0."value" IS NOT NULL', values: [] });
  });

  it('never puts a filter value into SQL text', () => {
    const result = compile(
      { dimension: 'order_status', operator: 'eq', value: 'cancelled' },
      status,
    );
    expect(result.sql).not.toContain('cancelled');
    expect(result.values).toEqual(['cancelled']);
  });

  it.each([
    [
      { dimension: 'salary', operator: 'eq', value: 'lots' } as SemanticFilter,
      salary,
      /expects a numeric value/i,
    ],
    [
      {
        dimension: 'is_active',
        operator: 'eq',
        value: 'true',
      } as SemanticFilter,
      active,
      /expects true or false/i,
    ],
    [
      {
        dimension: 'order_date',
        operator: 'eq',
        value: '01/01/2024',
      } as SemanticFilter,
      orderDate,
      /YYYY-MM-DD/i,
    ],
    [
      {
        dimension: 'order_date',
        operator: 'between',
        value: ['2024-01-01'],
      } as SemanticFilter,
      orderDate,
      /exactly two values/i,
    ],
    [
      {
        dimension: 'order_status',
        operator: 'in',
        value: [],
      } as SemanticFilter,
      status,
      /non-empty array/i,
    ],
    [
      {
        dimension: 'order_date',
        operator: 'is_null',
        value: 'x',
      } as SemanticFilter,
      orderDate,
      /does not take a value/i,
    ],
    [
      {
        dimension: 'order_status',
        operator: 'eq',
        value: ['a', 'b'],
      } as SemanticFilter,
      status,
      /expects one value/i,
    ],
    [
      { dimension: 'weird', operator: 'eq', value: 'x' } as SemanticFilter,
      { name: 'weird', dataType: 'jsonb' },
      /no v0 filter mapping/i,
    ],
  ])('rejects invalid filter %#', (filter, dimension, message) => {
    expect(() => validateSemanticFilter(filter, dimension)).toThrow(
      SemanticFilterError,
    );
    expect(() => validateSemanticFilter(filter, dimension)).toThrow(message);
  });
});
