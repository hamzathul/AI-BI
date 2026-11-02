import type {
  BarChart,
  ChartSpec,
  LineChart,
  QuerySpec,
  TimeGrain,
} from "@/lib/api/types";
import { isDateType } from "./format";
import type { ChartResultData } from "./types";

/**
 * A deterministic ChartSpec suggestion for a chat answer (6.5).
 *
 * The answer already carries the QuerySpec that ran and its rows, so this is a
 * pure function — no LLM, no second query, no backend field. It returns `null`
 * whenever no chart would be honest: multi-metric results, too many categories,
 * or a truncated preview. In those cases the table is the answer.
 */

/** Bars beyond this are unreadable; a wider result belongs in a table. */
export const MAX_BAR_CATEGORIES = 24;

/** More lines than this and the legend stops helping. */
export const MAX_SERIES = 8;

/** Mirrors core-api's chart title limit. */
const TITLE_MAX = 120;

function readableName(name: string): string {
  return name.replace(/_/g, " ").trim();
}

/**
 * `product_category` -> "Product category". The semantic model uses snake_case,
 * but a chart title is prose, not an identifier.
 */
export function humanizeName(name: string): string {
  const words = readableName(name);
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function chartTitle(metric: string, group: string[]): string {
  const base = humanizeName(metric);
  // Only the metric starts the sentence; dimensions read as common nouns.
  const title =
    group.length === 0
      ? base
      : `${base} by ${group.map(readableName).join(" and ")}`;
  return title.slice(0, TITLE_MAX).trim();
}

/**
 * Monthly/quarterly/yearly points read better as "Jan 2025"; daily and weekly
 * points keep the ISO date so no two labels collide.
 */
function dateStyleForGrain(grain: TimeGrain | undefined) {
  return grain === "month" || grain === "quarter" || grain === "year"
    ? ("monthYear" as const)
    : ("iso" as const);
}

/**
 * The embedded query is copied with a time order so the spec matches what the
 * component draws. The executed rows are sorted separately by the caller; this
 * keeps a suggestion valid if it is ever saved and re-run (Phase 7).
 */
function withTimeOrder(spec: QuerySpec, dimension: string): QuerySpec {
  return { ...spec, orderBy: [{ field: dimension, direction: "asc" }] };
}

function columnDataType(result: ChartResultData, column: string): string {
  return result.columns.find((entry) => entry.name === column)?.dataType ?? "";
}

function distinctValues(
  rows: Record<string, unknown>[],
  column: string,
): number {
  return new Set(rows.map((row) => String(row[column] ?? "\u0000"))).size;
}

function lineChart(
  spec: QuerySpec,
  metric: string,
  x: string,
  series: string | undefined,
  grain: TimeGrain | undefined,
  group: string[],
): LineChart {
  return {
    v: 1,
    title: chartTitle(metric, group),
    query: withTimeOrder(spec, x),
    format: { date: { style: dateStyleForGrain(grain) } },
    type: "line",
    x,
    y: metric,
    ...(series ? { series } : {}),
    smooth: false,
    area: false,
  };
}

function barChart(
  spec: QuerySpec,
  metric: string,
  x: string,
  series: string | undefined,
  group: string[],
): BarChart {
  return {
    v: 1,
    title: chartTitle(metric, group),
    query: spec,
    type: "bar",
    x,
    y: metric,
    ...(series ? { series } : {}),
    stacked: false,
  };
}

/**
 * Pick the default chart for an answered question, or `null` for "show only
 * the table". The order of the rules is the order of confidence: a KPI has one
 * number, a time series has a natural x-axis, and everything categorical is a
 * bar until the categories outgrow the chart.
 */
export function suggestChart(
  spec: QuerySpec | null | undefined,
  result: ChartResultData | null | undefined,
): ChartSpec | null {
  if (!spec || !result) return null;

  if (!Array.isArray(spec.metrics) || spec.metrics.length !== 1) return null;

  const dimensions = spec.dimensions ?? [];
  if (dimensions.length > 2) return null;

  // ai-service sends at most 100 rows but reports the true count. A chart over
  // a partial result would look complete while hiding rows (D62).
  if (result.rowCount === 0 || result.rows.length === 0) return null;
  if (result.rows.length !== result.rowCount) return null;

  const metric = spec.metrics[0];
  const available = new Set(result.columns.map((column) => column.name));
  if (!available.has(metric)) return null;

  const grain = spec.timeGrain;

  if (grain) {
    if (!available.has(grain.dimension)) return null;
    if (grain.dimension === metric) return null;
    // Two grouping dimensions plus a time grain is three axes on one chart.
    if (dimensions.length > 1) return null;

    const series = dimensions[0];
    if (series && !available.has(series)) return null;
    if (series === metric) return null;
    if (series && distinctValues(result.rows, series) > MAX_SERIES) return null;

    return lineChart(spec, metric, grain.dimension, series, grain.grain, [
      grain.grain,
      ...(series ? [series] : []),
    ]);
  }

  const x = dimensions[0];
  if (!x) {
    // An aggregate without dimensions returns exactly one row.
    if (result.rowCount !== 1) return null;
    return {
      v: 1,
      title: chartTitle(metric, []),
      query: spec,
      type: "kpi",
      value: metric,
    };
  }

  if (!available.has(x)) return null;
  // A name can be both a metric and a dimension; ChartSpec needs distinct roles.
  if (x === metric) return null;

  const series = dimensions[1];
  if (series && !available.has(series)) return null;
  if (series === metric || series === x) return null;
  if (series && distinctValues(result.rows, series) > MAX_SERIES) return null;

  if (isDateType(columnDataType(result, x))) {
    return lineChart(
      spec,
      metric,
      x,
      series,
      undefined,
      [x, ...(series ? [series] : [])],
    );
  }

  if (distinctValues(result.rows, x) > MAX_BAR_CATEGORIES) return null;

  return barChart(spec, metric, x, series, [
    x,
    ...(series ? [series] : []),
  ]);
}

/**
 * Copies the rows sorted by one column, leaving the original array alone.
 * ISO dates (`YYYY-MM-DD`, what the compiler returns for time grains) sort
 * lexically, so a plain string compare is enough. Missing values go last.
 */
export function sortRowsByColumn(
  result: ChartResultData,
  column: string,
): ChartResultData {
  const rows = [...result.rows].sort((left, right) => {
    const a = left[column];
    const b = right[column];
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;

    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    const leftText = String(a);
    const rightText = String(b);
    if (leftText === rightText) return 0;
    return leftText < rightText ? -1 : 1;
  });

  return { ...result, rows };
}
