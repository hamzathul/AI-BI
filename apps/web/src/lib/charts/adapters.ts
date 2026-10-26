import type { EChartsCoreOption } from "echarts/core";
import type {
  BarChart,
  ChartSpec,
  DateStyle,
  LineChart,
  QueryResult,
} from "@/lib/api/types";
import { formatCell, formatNumber, isDateType } from "./format";
import { pivotRows } from "./pivot";

/**
 * A view model, not a renderer option: the components decide what to mount.
 * `option` is the only renderer-specific value and it is produced fresh on
 * every render — never stored (D8).
 */
export type ChartView =
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "kpi"; value: string }
  | { kind: "echarts"; option: EChartsCoreOption };

export function chartColumnDataType(
  result: QueryResult,
  column: string,
): string {
  return result.columns.find((entry) => entry.name === column)?.dataType ?? "";
}

function dateStyleFor(
  chart: BarChart | LineChart,
  result: QueryResult,
): DateStyle | undefined {
  // The compiler returns a time-grain dimension as text, so the query's grain
  // is a stronger signal than the result column type.
  const isDate =
    isDateType(chartColumnDataType(result, chart.x)) ||
    chart.query.timeGrain?.dimension === chart.x;

  if (!isDate) return undefined;
  return chart.format?.date?.style ?? "monthYear";
}

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function cartesianOption(
  chart: BarChart | LineChart,
  result: QueryResult,
): EChartsCoreOption {
  const dateStyle = dateStyleFor(chart, result);
  const pivoted = pivotRows(result, {
    x: chart.x,
    y: chart.y,
    series: chart.series,
    dateStyle,
    fallbackSeriesName: chart.y,
  });

  const isLine = chart.type === "line";
  const stacked = isLine ? false : Boolean(chart.stacked);

  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) =>
        typeof value === "number" ? formatNumber(value, chart.format?.number) : "—",
    },
    legend: {
      show: pivoted.split,
      type: "scroll",
      bottom: 0,
    },
    grid: {
      left: 8,
      right: 16,
      top: 8,
      bottom: pivoted.split ? 36 : 8,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: pivoted.categories,
      boundaryGap: !isLine,
      axisLabel: { hideOverlap: true },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (value: number) => compact.format(value),
      },
    },
    series: pivoted.series.map((entry) => ({
      name: entry.name,
      type: isLine ? "line" : "bar",
      data: entry.values,
      ...(isLine
        ? {
            smooth: Boolean((chart as LineChart).smooth),
            areaStyle: (chart as LineChart).area ? {} : undefined,
            symbolSize: 6,
          }
        : { stack: stacked ? "total" : undefined, barMaxWidth: 48 }),
    })),
  };
}

export function buildChartView(
  chart: ChartSpec,
  result: QueryResult,
): ChartView {
  if (chart.type === "table") {
    return {
      kind: "table",
      columns: chart.columns,
      rows: result.rows.map((row) =>
        chart.columns.map((column) =>
          formatCell(row[column], chartColumnDataType(result, column), chart.format),
        ),
      ),
    };
  }

  if (chart.type === "kpi") {
    const first = result.rows[0];
    return {
      kind: "kpi",
      value:
        first === undefined
          ? "—"
          : formatCell(
              first[chart.value],
              chartColumnDataType(result, chart.value),
              chart.format,
            ),
    };
  }

  return { kind: "echarts", option: cartesianOption(chart, result) };
}
