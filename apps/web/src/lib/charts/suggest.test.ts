import { describe, expect, it } from "vitest";
import type { ChartSpec, QuerySpec } from "@/lib/api/types";
import {
  humanizeName,
  MAX_BAR_CATEGORIES,
  MAX_SERIES,
  sortRowsByColumn,
  suggestChart,
} from "./suggest";
import type { ChartResultData } from "./types";

function spec(partial: Partial<QuerySpec> = {}): QuerySpec {
  return {
    metrics: ["headcount"],
    dimensions: [],
    filters: [],
    orderBy: [],
    ...partial,
  };
}

function result(
  columns: Array<[string, string]>,
  rows: Array<Record<string, unknown>>,
  rowCount = rows.length,
): ChartResultData {
  return {
    columns: columns.map(([name, dataType]) => ({ name, dataType })),
    rows,
    rowCount,
  };
}

function cartesian(chart: ChartSpec | null) {
  if (!chart || (chart.type !== "bar" && chart.type !== "line")) {
    throw new Error(`expected a bar or line chart, got ${chart?.type ?? "null"}`);
  }

  return chart;
}

describe("humanizeName", () => {
  it("turns a semantic name into a chart title fragment", () => {
    expect(humanizeName("headcount")).toBe("Headcount");
    expect(humanizeName("product_category")).toBe("Product category");
    expect(humanizeName("")).toBe("");
  });
});

describe("suggestChart", () => {
  it("suggests a KPI for one aggregate with no grouping", () => {
    const input = spec({ metrics: ["headcount"] });

    const chart = suggestChart(
      input,
      result([["headcount", "bigint"]], [{ headcount: 38 }]),
    );

    expect(chart).toMatchObject({
      type: "kpi",
      title: "Headcount",
      value: "headcount",
    });
  });

  it("suggests a bar for one metric grouped by one dimension", () => {
    const input = spec({
      metrics: ["headcount"],
      dimensions: ["department"],
    });

    const chart = cartesian(
      suggestChart(
        input,
        result(
          [
            ["department", "text"],
            ["headcount", "bigint"],
          ],
          [
            { department: "Engineering", headcount: 12 },
            { department: "Sales", headcount: 8 },
          ],
        ),
      ),
    );

    expect(chart.type).toBe("bar");
    expect(chart.x).toBe("department");
    expect(chart.y).toBe("headcount");
    expect(chart.title).toBe("Headcount by department");
    // The executed spec is embedded as-is; only line suggestions copy it.
    expect(chart.query).toBe(input);
  });

  it("suggests a line for a monthly time grain and orders it by time", () => {
    const input = spec({
      metrics: ["revenue"],
      timeGrain: { dimension: "order_date", grain: "month" },
    });

    const chart = cartesian(
      suggestChart(
        input,
        result(
          [
            ["order_date", "text"],
            ["revenue", "numeric"],
          ],
          [
            { order_date: "2025-02-01", revenue: "20" },
            { order_date: "2025-01-01", revenue: "10" },
          ],
        ),
      ),
    );

    expect(chart.type).toBe("line");
    expect(chart.x).toBe("order_date");
    expect(chart.y).toBe("revenue");
    expect(chart.format?.date?.style).toBe("monthYear");
    expect(chart.query.orderBy).toEqual([
      { field: "order_date", direction: "asc" },
    ]);
    expect(chart.query).not.toBe(input);
    expect(input.orderBy).toEqual([]);
  });

  it("keeps ISO dates for a daily grain", () => {
    const chart = cartesian(
      suggestChart(
        spec({
          metrics: ["revenue"],
          timeGrain: { dimension: "order_date", grain: "day" },
        }),
        result(
          [
            ["order_date", "text"],
            ["revenue", "numeric"],
          ],
          [
            { order_date: "2025-01-01", revenue: "10" },
            { order_date: "2025-01-02", revenue: "12" },
          ],
        ),
      ),
    );

    expect(chart.format?.date?.style).toBe("iso");
  });

  it("treats a date dimension without a grain as a line", () => {
    const chart = cartesian(
      suggestChart(
        spec({ metrics: ["revenue"], dimensions: ["order_date"] }),
        result(
          [
            ["order_date", "date"],
            ["revenue", "numeric"],
          ],
          [
            { order_date: "2025-02-01", revenue: "20" },
            { order_date: "2025-01-01", revenue: "10" },
          ],
        ),
      ),
    );

    expect(chart.type).toBe("line");
    expect(chart.x).toBe("order_date");
    expect(chart.format?.date?.style).toBe("iso");
    expect(chart.query.orderBy).toEqual([
      { field: "order_date", direction: "asc" },
    ]);
  });

  it("adds a series when a time grain has one extra dimension", () => {
    const chart = cartesian(
      suggestChart(
        spec({
          metrics: ["revenue"],
          dimensions: ["product_category"],
          timeGrain: { dimension: "order_date", grain: "month" },
        }),
        result(
          [
            ["product_category", "text"],
            ["order_date", "text"],
            ["revenue", "numeric"],
          ],
          [
            { product_category: "Audio", order_date: "2025-01-01", revenue: "1" },
            { product_category: "Video", order_date: "2025-01-01", revenue: "2" },
            { product_category: "Audio", order_date: "2025-02-01", revenue: "3" },
            { product_category: "Video", order_date: "2025-02-01", revenue: "4" },
          ],
        ),
      ),
    );

    expect(chart.type).toBe("line");
    expect(chart.series).toBe("product_category");
    expect(chart.title).toBe("Revenue by month and product category");
  });

  it("uses the first dimension as x and the second as series for bars", () => {
    const chart = cartesian(
      suggestChart(
        spec({
          metrics: ["headcount"],
          dimensions: ["department", "location"],
        }),
        result(
          [
            ["department", "text"],
            ["location", "text"],
            ["headcount", "bigint"],
          ],
          [
            { department: "Engineering", location: "Berlin", headcount: 5 },
            { department: "Engineering", location: "Paris", headcount: 4 },
            { department: "Sales", location: "Berlin", headcount: 2 },
          ],
        ),
      ),
    );

    expect(chart.type).toBe("bar");
    expect(chart.x).toBe("department");
    expect(chart.series).toBe("location");
    expect(chart.title).toBe("Headcount by department and location");
  });

  it("treats a date x with a series dimension as a line", () => {
    const chart = cartesian(
      suggestChart(
        spec({
          metrics: ["revenue"],
          dimensions: ["order_date", "region"],
        }),
        result(
          [
            ["order_date", "date"],
            ["region", "text"],
            ["revenue", "numeric"],
          ],
          [
            { order_date: "2025-01-01", region: "EMEA", revenue: "10" },
            { order_date: "2025-02-01", region: "EMEA", revenue: "12" },
          ],
        ),
      ),
    );

    expect(chart.type).toBe("line");
    expect(chart.series).toBe("region");
  });

  it("shows only the table when the answer has more than one metric", () => {
    const chart = suggestChart(
      spec({
        metrics: ["revenue", "units_sold"],
        dimensions: ["product_category"],
      }),
      result(
        [
          ["product_category", "text"],
          ["revenue", "numeric"],
          ["units_sold", "bigint"],
        ],
        [{ product_category: "Audio", revenue: "10", units_sold: 2 }],
      ),
    );

    expect(chart).toBeNull();
  });

  it("shows only the table for three grouping dimensions", () => {
    const chart = suggestChart(
      spec({
        metrics: ["revenue"],
        dimensions: ["product_category", "region", "order_status"],
      }),
      result(
        [
          ["product_category", "text"],
          ["region", "text"],
          ["order_status", "text"],
          ["revenue", "numeric"],
        ],
        [
          {
            product_category: "Audio",
            region: "EMEA",
            order_status: "paid",
            revenue: "10",
          },
        ],
      ),
    );

    expect(chart).toBeNull();
  });

  it("shows only the table when a time grain has two grouping dimensions", () => {
    const chart = suggestChart(
      spec({
        metrics: ["revenue"],
        dimensions: ["product_category", "region"],
        timeGrain: { dimension: "order_date", grain: "month" },
      }),
      result(
        [
          ["product_category", "text"],
          ["region", "text"],
          ["order_date", "text"],
          ["revenue", "numeric"],
        ],
        [
          {
            product_category: "Audio",
            region: "EMEA",
            order_date: "2025-01-01",
            revenue: "10",
          },
        ],
      ),
    );

    expect(chart).toBeNull();
  });

  it("shows only the table when there are too many bars", () => {
    const rows = Array.from({ length: MAX_BAR_CATEGORIES + 1 }, (_, index) => ({
      department: `Department ${index}`,
      headcount: index,
    }));

    const chart = suggestChart(
      spec({ metrics: ["headcount"], dimensions: ["department"] }),
      result(
        [
          ["department", "text"],
          ["headcount", "bigint"],
        ],
        rows,
      ),
    );

    expect(chart).toBeNull();
  });

  it("shows only the table when there are too many series", () => {
    const rows = Array.from({ length: MAX_SERIES + 1 }, (_, index) => ({
      department: index % 2 === 0 ? "Engineering" : "Sales",
      location: `Location ${index}`,
      headcount: index,
    }));

    const chart = suggestChart(
      spec({
        metrics: ["headcount"],
        dimensions: ["department", "location"],
      }),
      result(
        [
          ["department", "text"],
          ["location", "text"],
          ["headcount", "bigint"],
        ],
        rows,
      ),
    );

    expect(chart).toBeNull();
  });

  it("shows only the table when the answer preview is truncated", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      department: `Department ${index}`,
      headcount: index,
    }));

    const chart = suggestChart(
      spec({ metrics: ["headcount"], dimensions: ["department"] }),
      result(
        [
          ["department", "text"],
          ["headcount", "bigint"],
        ],
        rows,
        150,
      ),
    );

    expect(chart).toBeNull();
  });

  it("shows nothing for an empty result", () => {
    const chart = suggestChart(
      spec({ metrics: ["headcount"] }),
      result([["headcount", "bigint"]], [], 0),
    );

    expect(chart).toBeNull();
  });

  it("shows nothing when a dimension reuses the metric name", () => {
    const chart = suggestChart(
      spec({ metrics: ["revenue"], dimensions: ["revenue"] }),
      result([["revenue", "numeric"]], [{ revenue: "10" }]),
    );

    expect(chart).toBeNull();
  });

  it("shows nothing when an encoding is missing from the result", () => {
    const chart = suggestChart(
      spec({ metrics: ["revenue"], dimensions: ["department"] }),
      result([["department", "text"]], [{ department: "Sales" }]),
    );

    expect(chart).toBeNull();
  });

  it("does not suggest a KPI when one grouping row is missing", () => {
    const chart = suggestChart(
      spec({ metrics: ["headcount"] }),
      result([["headcount", "bigint"]], [{ headcount: 1 }], 2),
    );

    expect(chart).toBeNull();
  });
});

describe("sortRowsByColumn", () => {
  it("sorts ISO dates ascending, keeps nulls last, and copies the rows", () => {
    const data = result(
      [
        ["order_date", "text"],
        ["revenue", "numeric"],
      ],
      [
        { order_date: "2025-03-01", revenue: "3" },
        { order_date: null, revenue: "4" },
        { order_date: "2025-01-01", revenue: "1" },
        { order_date: "2025-02-01", revenue: "2" },
      ],
    );

    const sorted = sortRowsByColumn(data, "order_date");

    expect(sorted.rows.map((row) => row.order_date)).toEqual([
      "2025-01-01",
      "2025-02-01",
      "2025-03-01",
      null,
    ]);
    expect(data.rows[0]?.order_date).toBe("2025-03-01");
    expect(sorted).not.toBe(data);
  });
});
