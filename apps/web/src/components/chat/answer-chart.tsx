"use client";

import { memo, useMemo } from "react";
import { ChartView } from "@/components/charts/chart-view";
import { Badge } from "@/components/ui/badge";
import type { QuerySpec } from "@/lib/api/types";
import type { ChatQueryResult } from "@/lib/chat/events";
import { sortRowsByColumn, suggestChart } from "@/lib/charts/suggest";

/**
 * The suggested chart for an answered question (6.5).
 *
 * Everything comes from the answer frame: `spec` says what the query meant,
 * `result` holds the rows. No request is made, and the chart is a plain
 * ChartSpec rendered by the same `ChartView` as Explore and dashboards (D8).
 *
 * Memoized because one streaming turn re-renders the whole transcript on every
 * event; completed turns keep the same answer object, so they can skip it.
 */
export const AnswerChart = memo(function AnswerChart({
  spec,
  result,
}: {
  spec?: QuerySpec | null;
  result?: ChatQueryResult | null;
}) {
  const chart = useMemo(
    () => (spec && result ? suggestChart(spec, result) : null),
    [spec, result],
  );

  // A line reads left-to-right in time even when the agent did not order the
  // spec; the suggestion embeds `orderBy`, so the display and the spec agree.
  const chartResult = useMemo(
    () =>
      chart?.type === "line" && result
        ? sortRowsByColumn(result, chart.x)
        : result,
    [chart, result],
  );

  if (!chart || !chartResult) return null;

  return (
    <figure className="rounded-md border bg-muted/20 p-3">
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{chart.title}</span>
        <Badge variant="secondary">{chart.type}</Badge>
      </figcaption>
      <ChartView chart={chart} result={chartResult} height={260} />
    </figure>
  );
});
