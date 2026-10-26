import { z } from 'zod';
import { querySpecSchema, type QuerySpec } from '../query/query-spec.schema.js';

/**
 * ChartSpec v0 (D8/D54).
 *
 * A chart knows *what* to show — a QuerySpec plus encodings and formats — never
 * *how* to draw it. ECharts options are produced at render time by a web
 * adapter, so a renderer swap never touches stored data.
 *
 * Encodings point at result columns. Result columns are exactly the query's
 * dimensions, the time-grain dimension, and its metrics (the compiler aliases
 * each one by name), so the schema can validate encodings without touching the
 * semantic model.
 */
export const CHART_TYPES = ['table', 'kpi', 'bar', 'line'] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const NUMBER_STYLES = ['plain', 'percent', 'currency'] as const;

export type NumberStyle = (typeof NUMBER_STYLES)[number];

/** Display styles are semantic, not library format strings (D8). */
export const DATE_STYLES = ['iso', 'month', 'monthYear'] as const;

export type DateStyle = (typeof DATE_STYLES)[number];

const columnSchema = z
  .string()
  .min(1, 'A column name is required.')
  .max(64, 'A column name must be at most 64 characters.');

const numberFormatSchema = z
  .object({
    style: z.enum(NUMBER_STYLES),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code, for example USD.')
      .optional(),
    decimals: z.number().int().min(0).max(4).optional(),
  })
  .strict();

const formatSchema = z
  .object({
    number: numberFormatSchema.optional(),
    date: z.object({ style: z.enum(DATE_STYLES) }).strict().optional(),
  })
  .strict();

const baseShape = {
  v: z.literal(1),
  title: z.string().trim().min(1, 'A chart needs a title.').max(120),
  query: querySpecSchema,
  format: formatSchema.optional(),
};

const tableChartSchema = z
  .object({
    ...baseShape,
    type: z.literal('table'),
    columns: z.array(columnSchema).min(1).max(20),
  })
  .strict();

const kpiChartSchema = z
  .object({
    ...baseShape,
    type: z.literal('kpi'),
    value: columnSchema,
  })
  .strict();

const barChartSchema = z
  .object({
    ...baseShape,
    type: z.literal('bar'),
    x: columnSchema,
    y: columnSchema,
    series: columnSchema.optional(),
    stacked: z.boolean().optional(),
  })
  .strict();

const lineChartSchema = z
  .object({
    ...baseShape,
    type: z.literal('line'),
    x: columnSchema,
    y: columnSchema,
    series: columnSchema.optional(),
    smooth: z.boolean().optional(),
    area: z.boolean().optional(),
  })
  .strict();

export const chartSpecSchema = z
  .discriminatedUnion('type', [
    tableChartSchema,
    kpiChartSchema,
    barChartSchema,
    lineChartSchema,
  ])
  .superRefine((chart, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: 'custom', message: `"${chart.title}": ${message}`, path });
    };

    const outputs = queryOutputColumns(chart.query);
    const dimensionNames = new Set(queryDimensionColumns(chart.query));
    const metricNames = new Set(chart.query.metrics);

    const checkOutput = (
      column: string,
      path: (string | number)[],
      role: string,
    ) => {
      if (!outputs.includes(column)) {
        issue(
          path,
          `${role} "${column}" is not in the query result (${outputs.join(', ')}).`,
        );
      }
    };

    const checkDimension = (
      column: string,
      path: (string | number)[],
      role: string,
    ) => {
      checkOutput(column, path, role);
      if (outputs.includes(column) && !dimensionNames.has(column)) {
        issue(path, `${role} "${column}" must be a dimension, not a metric.`);
      }
    };

    const checkMetric = (
      column: string,
      path: (string | number)[],
      role: string,
    ) => {
      checkOutput(column, path, role);
      if (outputs.includes(column) && !metricNames.has(column)) {
        issue(path, `${role} "${column}" must be a metric, not a dimension.`);
      }
    };

    if (chart.type === 'table') {
      if (new Set(chart.columns).size !== chart.columns.length) {
        issue(['columns'], 'Table columns must not repeat.');
      }
      chart.columns.forEach((column, index) =>
        checkOutput(column, ['columns', index], 'Column'),
      );
    }

    if (chart.type === 'kpi') {
      checkMetric(chart.value, ['value'], 'Value');

      const dimensions = queryDimensionColumns(chart.query);
      if (dimensions.length > 0) {
        issue(
          ['query', 'dimensions'],
          `A KPI shows one number, but this query groups by ${dimensions.join(', ')}.`,
        );
      }
    }

    if (chart.type === 'bar' || chart.type === 'line') {
      checkDimension(chart.x, ['x'], 'X column');
      checkMetric(chart.y, ['y'], 'Y column');

      if (chart.x === chart.y) {
        issue(['y'], 'The X and Y columns must be different.');
      }

      if (chart.series) {
        checkDimension(chart.series, ['series'], 'Series column');
        if (chart.series === chart.x || chart.series === chart.y) {
          issue(['series'], 'The series column must differ from X and Y.');
        }
      }
    }

    const numberFormat = chart.format?.number;
    if (numberFormat) {
      if (numberFormat.style === 'currency' && !numberFormat.currency) {
        issue(
          ['format', 'number', 'currency'],
          'Currency formatting needs a currency code.',
        );
      }
      if (numberFormat.style !== 'currency' && numberFormat.currency) {
        issue(
          ['format', 'number', 'currency'],
          'A currency code only applies to the currency style.',
        );
      }
    }
  });

export type ChartSpec = z.infer<typeof chartSpecSchema>;

/**
 * Result columns in compiler order: dimensions, the time grain, then metrics.
 * Mirrors `compileQuery`'s SELECT order so the table adapter can default to it.
 */
export function queryOutputColumns(query: QuerySpec): string[] {
  const dimensions = [...query.dimensions];

  if (query.timeGrain && !dimensions.includes(query.timeGrain.dimension)) {
    dimensions.push(query.timeGrain.dimension);
  }

  const metrics = query.metrics.filter((name) => !dimensions.includes(name));

  return [...dimensions, ...metrics];
}

/** Columns that describe rows (dimensions plus the time grain). */
export function queryDimensionColumns(query: QuerySpec): string[] {
  const dimensions = [...query.dimensions];

  if (query.timeGrain && !dimensions.includes(query.timeGrain.dimension)) {
    dimensions.push(query.timeGrain.dimension);
  }

  return dimensions;
}
