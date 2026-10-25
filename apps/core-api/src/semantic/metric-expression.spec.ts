import { describe, expect, it } from 'vitest';
import {
  collectMetricExpressionColumns,
  MetricExpressionError,
  parseMetricExpression,
  renderMetricExpression,
} from './metric-expression.js';

function render(expression: string): string {
  return renderMetricExpression(parseMetricExpression(expression), 't0');
}

describe('metric expressions', () => {
  it('renders columns and arithmetic with only the needed parentheses', () => {
    expect(render('salary')).toBe('t0."salary"');
    expect(render('quantity * unit_price')).toBe(
      't0."quantity" * t0."unit_price"',
    );
    expect(render('(quantity + 1) * unit_price')).toBe(
      '(t0."quantity" + 1) * t0."unit_price"',
    );
    expect(render('quantity * (unit_price + tax)')).toBe(
      't0."quantity" * (t0."unit_price" + t0."tax")',
    );
    expect(render('a - (b - c)')).toBe('t0."a" - (t0."b" - t0."c")');
    expect(render('a / (b * c)')).toBe('t0."a" / (t0."b" * t0."c")');
    expect(render('a * b / c')).toBe('t0."a" * t0."b" / t0."c"');
  });

  it('collects each referenced column once', () => {
    const node = parseMetricExpression('quantity * unit_price + quantity');
    expect(collectMetricExpressionColumns(node)).toEqual([
      'quantity',
      'unit_price',
    ]);
  });

  it.each([
    ['', /must not be empty/i],
    ['salary +', /Expected a column, number, or/i],
    ['2x', /Unexpected token "x"/i],
    ['pg_sleep(1)', /Unexpected token "\("/i],
    ['"salary"', /Unexpected character/i],
    ['a; DROP TABLE', /Unexpected character/i],
    ['1.', /decimal point/i],
    ['(a + b', /Expected "\)"/i],
  ])('rejects %j', (expression, message) => {
    expect(() => parseMetricExpression(expression)).toThrow(
      MetricExpressionError,
    );
    expect(() => parseMetricExpression(expression)).toThrow(message);
  });
});
