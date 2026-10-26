"use client";

import dynamic from "next/dynamic";
import type { EChartsCoreOption } from "echarts/core";
import { Skeleton } from "@/components/ui/skeleton";

const EChartsClient = dynamic(() => import("./echarts-client"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * Client-only boundary for the chart renderer. Server rendering a canvas is
 * pointless and would drag ECharts into the server bundle.
 */
export function EChartsChart({
  option,
  height = 280,
}: {
  option: EChartsCoreOption;
  height?: number;
}) {
  return <EChartsClient option={option} height={height} />;
}
