import type { QueryResult } from "@/lib/api/types";

/**
 * The part of a result a chart actually reads.
 *
 * `QueryExecutionResultDto` adds `meta` (the compiled SQL and model identity),
 * but chat answers never carry it: ai-service only forwards columns, rows, and
 * counts (D62). Widening the chart components to this shape lets the same
 * `ChartView` render both API previews and answer results (6.5).
 */
export type ChartResultData = Pick<
  QueryResult,
  "columns" | "rows" | "rowCount"
>;
