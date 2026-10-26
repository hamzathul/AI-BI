"use client";

import { useQuery } from "@tanstack/react-query";
import { executeCharts } from "@/lib/api/charts";
import { queryKeys } from "@/lib/query-keys";
import type { ChartSpec, DashboardFilters } from "@/lib/api/types";

export interface ChartBatchItem {
  id: string;
  chart: ChartSpec;
}

/**
 * Canvas execution. The cache key is the chart list plus filters, so a filter
 * change or an edited chart refetches, while dragging a tile does not.
 */
export function useChartBatch(
  items: ChartBatchItem[],
  filters: DashboardFilters,
) {
  return useQuery({
    queryKey: queryKeys.chartExecution(items, filters),
    queryFn: () => executeCharts({ charts: items, filters }),
    enabled: items.length > 0,
  });
}
