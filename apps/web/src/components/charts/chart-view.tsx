"use client";

import type { ChartSpec, QueryResult } from "@/lib/api/types";
import { buildChartView } from "@/lib/charts/adapters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EChartsChart } from "./echarts-chart";

interface ChartViewProps {
  chart: ChartSpec;
  result?: QueryResult;
  error?: string;
  /** Height of the chart area. Tables scroll instead of growing. */
  height?: number;
  emptyMessage?: string;
}

/**
 * Renders one chart from its spec and a result. All four types share this
 * component so the explore preview and a dashboard tile cannot drift.
 */
export function ChartView({
  chart,
  result,
  error,
  height = 280,
  emptyMessage = "No rows returned for this query.",
}: ChartViewProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex h-full min-h-24 items-center justify-center rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (!result) {
    return <Skeleton className="h-full min-h-24 w-full" />;
  }

  if (result.rowCount === 0) {
    return (
      <div className="flex h-full min-h-24 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const view = buildChartView(chart, result);

  if (view.kind === "kpi") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 py-6">
        <span className="text-4xl font-semibold tracking-tight">
          {view.value}
        </span>
        <span className="text-xs text-muted-foreground">of this query</span>
      </div>
    );
  }

  if (view.kind === "table") {
    return (
      <div className="max-h-[22rem] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {view.columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={view.columns[cellIndex]}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return <EChartsChart option={view.option} height={height} />;
}
