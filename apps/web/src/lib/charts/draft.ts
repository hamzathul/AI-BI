import type {
  ChartSpec,
  ChartType,
  DateStyle,
  NumberStyle,
  QuerySpec,
  TimeGrain,
} from "@/lib/api/types";
import type { SemanticGraph } from "@/lib/semantic-graph";

export const CHART_TYPE_OPTIONS: Array<{ value: ChartType; label: string }> = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "table", label: "Table" },
  { value: "kpi", label: "KPI" },
];

export const GRAIN_OPTIONS: Array<{ value: TimeGrain | "none"; label: string }> = [
  { value: "none", label: "No time grain" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export const NUMBER_STYLE_OPTIONS: Array<{
  value: NumberStyle;
  label: string;
}> = [
  { value: "plain", label: "Plain number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent (0.42 = 42%)" },
];

export const DATE_STYLE_OPTIONS: Array<{ value: DateStyle; label: string }> = [
  { value: "iso", label: "2025-01-31" },
  { value: "month", label: "Jan" },
  { value: "monthYear", label: "Jan 2025" },
];

/**
 * Flat form state for the builder. It is deliberately not a ChartSpec: the
 * form allows incomplete input, while a ChartSpec is validated and encodings
 * must exist. `draftToChart` is the single bridge between the two.
 */
export interface ChartDraft {
  type: ChartType;
  title: string;
  metric: string;
  dimension: string;
  series: string;
  grain: TimeGrain | "none";
  dateDimension: string;
  stacked: boolean;
  smooth: boolean;
  area: boolean;
  numberStyle: NumberStyle;
  currency: string;
  decimals: string;
  dateStyle: DateStyle;
}

/**
 * The starting point for a new chart: the primary (fact) dataset's first
 * metric, then its nearest non-date dimension as the category. Starting on a
 * date would fill a bar chart with one bar per day.
 */
export function defaultDraft(
  graph: SemanticGraph,
  type: ChartType = "bar",
): ChartDraft {
  const primary = graph.primaryDataset;
  const metric =
    (primary ? graph.metricsFor(primary)[0] : undefined) ?? graph.metrics[0];
  const dimensions = metric ? graph.dimensionsFor(metric.dataset) : [];
  const dateDimension = dimensions.find((dimension) => dimension.isDate);
  const category = dimensions.find((dimension) => !dimension.isDate);

  return {
    type,
    title: metric ? `${metric.name}` : "New chart",
    metric: metric?.name ?? "",
    dimension: category?.name ?? dimensions[0]?.name ?? "",
    series: "",
    grain: "none",
    dateDimension: dateDimension?.name ?? "",
    stacked: false,
    smooth: true,
    area: false,
    numberStyle: "plain",
    currency: "USD",
    decimals: "",
    dateStyle: "monthYear",
  };
}

export type DraftResult =
  | { chart: ChartSpec }
  | { error: string };

function buildQuery(
  draft: ChartDraft,
  graph: SemanticGraph,
  xDimension: string,
  seriesDimension: string,
): QuerySpec {
  const groupBy = [
    ...(xDimension ? [xDimension] : []),
    ...(seriesDimension ? [seriesDimension] : []),
  ];

  const usesGrain = draft.type === "line" && draft.grain !== "none";
  const dimensions = usesGrain
    ? groupBy.filter((name) => name !== draft.dateDimension)
    : groupBy;

  const orderBy: QuerySpec["orderBy"] = usesGrain
    ? [{ field: draft.dateDimension, direction: "asc" }]
    : dimensions.length === 1
      ? [{ field: draft.metric, direction: "desc" }]
      : dimensions.length > 1
        ? [{ field: dimensions[0], direction: "asc" }]
        : [];

  return {
    metrics: [draft.metric],
    ...(dimensions.length > 0 ? { dimensions } : {}),
    ...(usesGrain
      ? {
          timeGrain: {
            dimension: draft.dateDimension,
            grain: draft.grain as TimeGrain,
          },
        }
      : {}),
    ...(orderBy && orderBy.length > 0 ? { orderBy } : {}),
    limit: draft.type === "table" ? 200 : 100,
  };
}

function chartFormat(draft: ChartDraft): ChartSpec["format"] {
  const decimals = draft.decimals.trim();

  return {
    number: {
      style: draft.numberStyle,
      ...(draft.numberStyle === "currency"
        ? { currency: draft.currency.toUpperCase() }
        : {}),
      ...(decimals ? { decimals: Number(decimals) } : {}),
    },
    date: { style: draft.dateStyle },
  };
}

/**
 * Turns the form into a ChartSpec the server will accept, or explains what is
 * still missing. The server remains the authority (it validates encodings
 * against the compiled query); this only keeps the form honest.
 */
export function draftToChart(
  draft: ChartDraft,
  graph: SemanticGraph,
): DraftResult {
  const metric = graph.metrics.find((entry) => entry.name === draft.metric);

  if (!metric) return { error: "Choose a metric." };

  const title = draft.title.trim();
  if (!title) return { error: "Give the chart a title." };

  const reachable = new Set(
    graph.dimensionsFor(metric.dataset).map((dimension) => dimension.name),
  );

  const usesGrain = draft.type === "line" && draft.grain !== "none";

  if (usesGrain && !draft.dateDimension) {
    return { error: "Choose a date dimension or turn the time grain off." };
  }

  if (draft.dimension && !reachable.has(draft.dimension)) {
    return {
      error: `"${draft.dimension}" cannot be reached from the ${metric.dataset} dataset.`,
    };
  }

  if (draft.series && !reachable.has(draft.series)) {
    return {
      error: `"${draft.series}" cannot be reached from the ${metric.dataset} dataset.`,
    };
  }

  const xDimension =
    draft.type === "kpi"
      ? ""
      : usesGrain
        ? draft.dateDimension
        : draft.dimension;
  const seriesDimension = draft.type === "kpi" ? "" : draft.series;

  if (draft.type === "bar" || draft.type === "line") {
    if (!xDimension) return { error: "Choose a dimension for the X axis." };
    if (seriesDimension && seriesDimension === xDimension) {
      return { error: "The series dimension must differ from the X axis." };
    }
  }

  const query = buildQuery(draft, graph, xDimension, seriesDimension);
  const base = { v: 1 as const, title, query, format: chartFormat(draft) };

  if (draft.type === "kpi") {
    return { chart: { ...base, type: "kpi", value: draft.metric } };
  }

  if (draft.type === "table") {
    return {
      chart: {
        ...base,
        type: "table",
        columns: [...(query.dimensions ?? []), draft.metric],
      },
    };
  }

  if (draft.type === "bar") {
    return {
      chart: {
        ...base,
        type: "bar",
        x: xDimension,
        y: draft.metric,
        ...(seriesDimension ? { series: seriesDimension } : {}),
        stacked: draft.stacked,
      },
    };
  }

  return {
    chart: {
      ...base,
      type: "line",
      x: xDimension,
      y: draft.metric,
      ...(seriesDimension ? { series: seriesDimension } : {}),
      smooth: draft.smooth,
      area: draft.area,
    },
  };
}

/** Restores the form from an existing spec, for editing a widget. */
export function draftFromChart(
  chart: ChartSpec,
  graph: SemanticGraph,
): ChartDraft {
  const base = defaultDraft(graph, chart.type);
  const query = chart.query;
  const grain = query.timeGrain;

  return {
    ...base,
    title: chart.title,
    metric: query.metrics[0] ?? base.metric,
    dimension:
      chart.type === "bar" || chart.type === "line"
        ? grain?.dimension === chart.x
          ? base.dimension
          : chart.x
        : query.dimensions?.[0] ?? "",
    series:
      chart.type === "table"
        ? query.dimensions?.[1] ?? ""
        : chart.type === "bar" || chart.type === "line"
          ? chart.series ?? ""
          : "",
    // A KPI has no axis, and a table may legitimately have no dimensions.
    grain: grain?.grain ?? "none",
    dateDimension: grain?.dimension ?? base.dateDimension,
    stacked: chart.type === "bar" ? Boolean(chart.stacked) : false,
    smooth: chart.type === "line" ? Boolean(chart.smooth) : true,
    area: chart.type === "line" ? Boolean(chart.area) : false,
    numberStyle: chart.format?.number?.style ?? "plain",
    currency: chart.format?.number?.currency ?? "USD",
    decimals:
      chart.format?.number?.decimals === undefined
        ? ""
        : String(chart.format.number.decimals),
    dateStyle: chart.format?.date?.style ?? "monthYear",
  };
}
