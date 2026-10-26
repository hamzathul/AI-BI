/**
 * ECharts theme built from the app's design tokens at mount time.
 *
 * Reading the variables instead of hardcoding colors keeps charts in step with
 * light/dark mode without shipping a second palette (D8 stays intact: the theme
 * lives in the web app, never in a persisted chart spec).
 */
export function readChartTheme(): Record<string, unknown> {
  const styles =
    typeof window === "undefined"
      ? null
      : getComputedStyle(document.documentElement);

  const token = (name: string, fallback: string) =>
    styles?.getPropertyValue(name).trim() || fallback;

  const palette = [1, 2, 3, 4, 5].map((index) =>
    token(`--chart-${index}`, "#a1a1a1"),
  );
  const foreground = token("--foreground", "#171717");
  const muted = token("--muted-foreground", "#737373");
  const border = token("--border", "#e5e5e5");
  const background = token("--background", "#ffffff");

  return {
    color: palette,
    backgroundColor: "transparent",
    textStyle: { color: foreground, fontFamily: "inherit" },
    title: { textStyle: { color: foreground } },
    legend: { textStyle: { color: muted } },
    tooltip: {
      backgroundColor: background,
      borderColor: border,
      textStyle: { color: foreground },
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { lineStyle: { color: border } },
      axisLabel: { color: muted },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: border, type: "dashed" } },
    },
  };
}
