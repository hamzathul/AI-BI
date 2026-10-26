import { describe, expect, it } from "vitest";
import type { QueryResult } from "@/lib/api/types";
import { buildChartView } from "./adapters";
import { formatCell, formatDate, formatNumber, isDateType, isNumericType } from "./format";
import { pivotRows } from "./pivot";

function result(columns: Array<[string, string]>, rows: Array<Record<string, unknown>>): QueryResult {
  return {
    columns: columns.map(([name, dataType]) => ({ name, dataType })),
    rows,
    rowCount: rows.length,
    truncated: false,
    durationMs: 3,
    meta: {
      modelId: "model",
      modelName: "Acme Inc.",
      dataset: "order_items",
      limit: 1000,
      compiledSql: "select 1",
    },
  };
}

const revenueRows = result(
  [
    ["product_category", "text"],
    ["revenue", "numeric"],
  ],
  [
    { product_category: "Audio", revenue: "24815" },
    { product_category: "Hardware", revenue: "136663" },
    { product_category: "Video", revenue: "4628" },
  ],
);

describe("chart formatting", () => {
  it("detects numeric and date columns from canonical type names", () => {
    expect(isNumericType("numeric(12,2)")).toBe(true);
    expect(isNumericType("bigint")).toBe(true);
    expect(isNumericType("text")).toBe(false);
    expect(isDateType("date")).toBe(true);
    expect(isDateType("timestamp with time zone")).toBe(true);
    expect(isDateType("varchar")).toBe(false);
  });

  it("formats numbers by style without touching the stored value", () => {
    expect(formatNumber("24815")).toBe("24,815");
    expect(formatNumber(0.423, { style: "percent" })).toBe("42.3%");
    expect(
      formatNumber("24815.5", { style: "currency", currency: "USD" }),
    ).toBe("$24,815.50");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber("not a number")).toBe("—");
  });

  it("formats date values with semantic styles", () => {
    expect(formatDate("2025-01-01")).toBe("2025-01-01");
    expect(formatDate("2025-01-01", "month")).toBe("Jan");
    expect(formatDate("2025-01-01", "monthYear")).toBe("Jan 2025");
    expect(formatDate(null)).toBe("—");
  });

  it("formats a table cell by the column's type", () => {
    expect(formatCell("24815", "numeric")).toBe("24,815");
    expect(formatCell("2025-03-01", "date")).toBe("2025-03-01");
    expect(formatCell(true, "boolean")).toBe("Yes");
    expect(formatCell(null, "text")).toBe("—");
  });
});

describe("pivotRows", () => {
  it("keeps query order and parses numeric strings", () => {
    const pivoted = pivotRows(revenueRows, {
      x: "product_category",
      y: "revenue",
      fallbackSeriesName: "revenue",
    });

    expect(pivoted.categories).toEqual(["Audio", "Hardware", "Video"]);
    expect(pivoted.split).toBe(false);
    expect(pivoted.series).toEqual([
      { name: "revenue", values: [24815, 136663, 4628] },
    ]);
  });

  it("splits one series per series value and fills gaps with zero", () => {
    const grouped = result(
      [
        ["order_status", "text"],
        ["product_category", "text"],
        ["revenue", "numeric"],
      ],
      [
        { order_status: "paid", product_category: "Audio", revenue: "10" },
        { order_status: "paid", product_category: "Video", revenue: "20" },
        { order_status: "cancelled", product_category: "Audio", revenue: "5" },
      ],
    );

    const pivoted = pivotRows(grouped, {
      x: "product_category",
      y: "revenue",
      series: "order_status",
      fallbackSeriesName: "revenue",
    });

    expect(pivoted.split).toBe(true);
    expect(pivoted.categories).toEqual(["Audio", "Video"]);
    expect(pivoted.series).toEqual([
      { name: "paid", values: [10, 20] },
      { name: "cancelled", values: [5, 0] },
    ]);
  });

  it("sums duplicate category/series pairs instead of dropping rows", () => {
    const duplicate = result(
      [
        ["product_category", "text"],
        ["revenue", "numeric"],
      ],
      [
        { product_category: "Audio", revenue: "10" },
        { product_category: "Audio", revenue: "15" },
      ],
    );

    const pivoted = pivotRows(duplicate, {
      x: "product_category",
      y: "revenue",
      fallbackSeriesName: "revenue",
    });

    expect(pivoted.series[0]!.values).toEqual([25]);
  });

  it("formats date categories for the x axis", () => {
    const monthly = result(
      [
        ["order_date", "text"],
        ["revenue", "numeric"],
      ],
      [
        { order_date: "2025-01-01", revenue: "100" },
        { order_date: "2025-02-01", revenue: "120" },
      ],
    );

    const pivoted = pivotRows(monthly, {
      x: "order_date",
      y: "revenue",
      dateStyle: "monthYear",
      fallbackSeriesName: "revenue",
    });

    expect(pivoted.categories).toEqual(["Jan 2025", "Feb 2025"]);
  });
});

describe("buildChartView", () => {
  it("builds a table from the selected columns", () => {
    const view = buildChartView(
      {
        v: 1,
        type: "table",
        title: "Revenue by category",
        query: { metrics: ["revenue"] },
        columns: ["product_category", "revenue"],
        format: { number: { style: "currency", currency: "USD" } },
      },
      revenueRows,
    );

    expect(view).toEqual({
      kind: "table",
      columns: ["product_category", "revenue"],
      rows: [
        ["Audio", "$24,815.00"],
        ["Hardware", "$136,663.00"],
        ["Video", "$4,628.00"],
      ],
    });
  });

  it("shows the first row of a KPI", () => {
    const headcount = result(
      [["headcount", "bigint"]],
      [{ headcount: "38" }],
    );

    const view = buildChartView(
      {
        v: 1,
        type: "kpi",
        title: "Active employees",
        query: { metrics: ["headcount"] },
        value: "headcount",
      },
      headcount,
    );

    expect(view).toEqual({ kind: "kpi", value: "38" });
  });

  it("handles an empty KPI result", () => {
    const view = buildChartView(
      {
        v: 1,
        type: "kpi",
        title: "Active employees",
        query: { metrics: ["headcount"] },
        value: "headcount",
      },
      result([["headcount", "bigint"]], []),
    );

    expect(view).toEqual({ kind: "kpi", value: "—" });
  });

  it("builds a bar option with categories, series, and stacking", () => {
    const view = buildChartView(
      {
        v: 1,
        type: "bar",
        title: "Revenue by category",
        query: { metrics: ["revenue"] },
        x: "product_category",
        y: "revenue",
        stacked: true,
      },
      revenueRows,
    );

    expect(view.kind).toBe("echarts");
    if (view.kind !== "echarts") return;

    const option = view.option as {
      xAxis: { data: string[] };
      series: Array<Record<string, unknown>>;
    };
    expect(option.xAxis.data).toEqual(["Audio", "Hardware", "Video"]);
    expect(option.series).toHaveLength(1);
    expect(option.series[0]).toMatchObject({
      name: "revenue",
      type: "bar",
      stack: "total",
      data: [24815, 136663, 4628],
    });
  });

  it("builds a smooth line option with date categories", () => {
    const monthly = result(
      [
        ["order_date", "text"],
        ["revenue", "numeric"],
      ],
      [
        { order_date: "2025-01-01", revenue: "100" },
        { order_date: "2025-02-01", revenue: "120" },
      ],
    );

    const view = buildChartView(
      {
        v: 1,
        type: "line",
        title: "Monthly revenue",
        query: {
          metrics: ["revenue"],
          timeGrain: { dimension: "order_date", grain: "month" },
        },
        x: "order_date",
        y: "revenue",
        smooth: true,
        area: true,
        format: { date: { style: "month" } },
      },
      monthly,
    );

    expect(view.kind).toBe("echarts");
    if (view.kind !== "echarts") return;

    const option = view.option as {
      xAxis: { data: string[] };
      series: Array<Record<string, unknown>>;
    };
    expect(option.xAxis.data).toEqual(["Jan", "Feb"]);
    expect(option.series[0]).toMatchObject({
      type: "line",
      smooth: true,
      data: [100, 120],
    });
    expect(option.series[0].areaStyle).toEqual({});
  });
});
