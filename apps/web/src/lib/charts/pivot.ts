import type { DateStyle, QueryResult } from "@/lib/api/types";
import { formatDate, toNumber } from "./format";

export interface ChartSeries {
  name: string;
  values: Array<number | null>;
}

export interface PivotedRows {
  /** X-axis labels, in first-seen order (the query already sorted them). */
  categories: string[];
  series: ChartSeries[];
  /** True when a `series` dimension split the rows. */
  split: boolean;
}

export interface PivotOptions {
  x: string;
  y: string;
  series?: string;
  dateStyle?: DateStyle;
  /** Label used when every row is one series. */
  fallbackSeriesName: string;
}

/**
 * Turns flat result rows into categories + one series per `series` value.
 *
 * Duplicate (category, series) pairs are summed rather than overwritten: an
 * aggregated query should not produce them, but a stale or hand-written spec
 * must never silently drop a number.
 */
export function pivotRows(
  result: QueryResult,
  options: PivotOptions,
): PivotedRows {
  const { x, y, series, dateStyle, fallbackSeriesName } = options;
  const categories: string[] = [];
  const seriesValues = new Map<string, Map<string, number>>();

  for (const row of result.rows) {
    const rawCategory = row[x];
    const category =
      dateStyle && rawCategory !== null && rawCategory !== undefined
        ? formatDate(rawCategory, dateStyle)
        : String(rawCategory ?? "—");

    const value = toNumber(row[y]);
    const seriesName = series
      ? String(row[series] ?? "—")
      : fallbackSeriesName;

    if (!categories.includes(category)) categories.push(category);

    const byCategory = seriesValues.get(seriesName) ?? new Map<string, number>();
    const existing = byCategory.get(category);

    if (value !== null) {
      byCategory.set(category, (existing ?? 0) + value);
    } else if (existing === undefined) {
      byCategory.set(category, 0);
    }

    seriesValues.set(seriesName, byCategory);
  }

  return {
    categories,
    split: Boolean(series),
    series: [...seriesValues.entries()].map(([name, byCategory]) => ({
      name,
      values: categories.map((category) => byCategory.get(category) ?? 0),
    })),
  };
}
