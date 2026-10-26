"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { readChartTheme } from "./echarts-theme";

const THEME_NAME = "aibi";

// Registered once per module load. Only what v0 renders ships to the browser
// (D57); this module itself is loaded client-side through next/dynamic.
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

/**
 * The only module that imports ECharts. It is loaded client-side through
 * `next/dynamic`, so the renderer never enters the server bundle (D8/D57).
 */
export default function EChartsClient({
  option,
  height,
}: {
  option: EChartsCoreOption;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    echarts.registerTheme(THEME_NAME, readChartTheme());

    const chart = echarts.init(containerRef.current, THEME_NAME, {
      renderer: "canvas",
    });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // `notMerge` keeps a shorter series list from leaving stale series behind
    // when the user switches chart types or filters.
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
