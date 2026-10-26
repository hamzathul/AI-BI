import { describe, expect, it } from "vitest";
import type { MetadataSnapshot, SemanticModel } from "@/lib/api/types";
import { buildSemanticGraph } from "@/lib/semantic-graph";
import {
  defaultDraft,
  draftFromChart,
  draftToChart,
  type ChartDraft,
} from "./draft";

const model: SemanticModel = {
  name: "Acme Inc.",
  datasets: [
    {
      name: "order_items",
      source: { schema: "sales", object: "order_items" },
      metrics: [{ name: "revenue", agg: "sum", expression: "quantity * unit_price" }],
    },
    {
      name: "orders",
      source: { schema: "sales", object: "orders" },
      dimensions: [
        { name: "order_date", column: "order_date" },
        { name: "order_status", column: "status" },
      ],
      metrics: [{ name: "orders", agg: "count" }],
    },
    {
      name: "products",
      source: { schema: "sales", object: "products" },
      dimensions: [{ name: "product_category", column: "category" }],
    },
  ],
  joins: [
    {
      name: "order_items_order",
      from: { dataset: "order_items", column: "order_id" },
      to: { dataset: "orders", column: "id" },
    },
    {
      name: "order_items_product",
      from: { dataset: "order_items", column: "product_id" },
      to: { dataset: "products", column: "id" },
    },
  ],
};

function object(name: string, columns: Array<[string, string]>) {
  return {
    id: `${name}-object`,
    name,
    kind: "TABLE" as const,
    primaryKey: ["id"],
    columns: columns.map(([column, dataType], index) => ({
      id: `${name}-${column}`,
      name: column,
      dataType,
      nullable: false,
      defaultValue: null,
      comment: null,
      isPrimaryKey: column === "id",
      ordinalPosition: index + 1,
    })),
  };
}

const metadata: MetadataSnapshot = {
  syncedAt: null,
  schemas: [
    {
      name: "sales",
      objects: [
        object("order_items", [
          ["id", "uuid"],
          ["order_id", "uuid"],
          ["product_id", "uuid"],
          ["quantity", "integer"],
          ["unit_price", "numeric"],
        ]),
        object("orders", [
          ["id", "uuid"],
          ["order_date", "date"],
          ["status", "text"],
        ]),
        object("products", [
          ["id", "uuid"],
          ["category", "text"],
        ]),
      ],
    },
  ],
  relations: [],
};

const graph = buildSemanticGraph(model, metadata);

function draft(overrides: Partial<ChartDraft>): ChartDraft {
  return { ...defaultDraft(graph), ...overrides };
}

describe("defaultDraft", () => {
  it("starts on the fact dataset's first metric and a categorical axis", () => {
    const initial = defaultDraft(graph);

    // order_items joins out to orders and products, so it is the fact dataset.
    expect(initial.metric).toBe("revenue");
    // A date on the X axis would produce one bar per day.
    expect(initial.dimension).toBe("order_status");
    expect(initial.dateDimension).toBe("order_date");
  });
});

describe("draftToChart", () => {
  it("builds a bar chart with a metric ordering", () => {
    const result = draftToChart(
      draft({
        type: "bar",
        title: "Revenue by category",
        dimension: "product_category",
        numberStyle: "currency",
        currency: "usd",
        decimals: "0",
      }),
      graph,
    );

    expect(result).toMatchObject({
      chart: {
        v: 1,
        type: "bar",
        title: "Revenue by category",
        x: "product_category",
        y: "revenue",
        stacked: false,
        query: {
          metrics: ["revenue"],
          dimensions: ["product_category"],
          orderBy: [{ field: "revenue", direction: "desc" }],
          limit: 100,
        },
        format: {
          number: { style: "currency", currency: "USD", decimals: 0 },
          date: { style: "monthYear" },
        },
      },
    });
  });

  it("puts the time grain in the query and on the X axis", () => {
    const result = draftToChart(
      draft({
        type: "line",
        dimension: "",
        grain: "month",
        dateDimension: "order_date",
        smooth: true,
        area: true,
      }),
      graph,
    );

    expect(result).toMatchObject({
      chart: {
        type: "line",
        x: "order_date",
        y: "revenue",
        query: {
          metrics: ["revenue"],
          timeGrain: { dimension: "order_date", grain: "month" },
          orderBy: [{ field: "order_date", direction: "asc" }],
        },
      },
    });
    if ("chart" in result && result.chart.type === "line") {
      expect(result.chart.query.dimensions).toBeUndefined();
      expect(result.chart.smooth).toBe(true);
      expect(result.chart.area).toBe(true);
    }
  });

  it("keeps a series dimension when a time grain is used", () => {
    const result = draftToChart(
      draft({
        type: "line",
        grain: "month",
        dateDimension: "order_date",
        series: "order_status",
      }),
      graph,
    );

    expect(result).toMatchObject({
      chart: {
        type: "line",
        x: "order_date",
        series: "order_status",
        query: {
          dimensions: ["order_status"],
          timeGrain: { dimension: "order_date", grain: "month" },
        },
      },
    });
  });

  it("builds a KPI without dimensions", () => {
    const result = draftToChart(draft({ type: "kpi", title: "Revenue" }), graph);

    expect(result).toEqual({
      chart: {
        v: 1,
        type: "kpi",
        title: "Revenue",
        value: "revenue",
        query: { metrics: ["revenue"], limit: 100 },
        format: {
          number: { style: "plain" },
          date: { style: "monthYear" },
        },
      },
    });
  });

  it("builds a table with its selected columns", () => {
    const result = draftToChart(
      draft({
        type: "table",
        dimension: "product_category",
        series: "order_status",
      }),
      graph,
    );

    expect(result).toMatchObject({
      chart: {
        type: "table",
        columns: ["product_category", "order_status", "revenue"],
        query: { limit: 200 },
      },
    });
  });

  it("explains what is missing instead of emitting an invalid spec", () => {
    expect(draftToChart(draft({ metric: "" }), graph)).toEqual({
      error: "Choose a metric.",
    });

    expect(draftToChart(draft({ title: "  " }), graph)).toEqual({
      error: "Give the chart a title.",
    });

    expect(draftToChart(draft({ type: "bar", dimension: "" }), graph)).toEqual({
      error: "Choose a dimension for the X axis.",
    });

    expect(
      draftToChart(draft({ type: "line", grain: "month", dateDimension: "" }), graph),
    ).toEqual({
      error: "Choose a date dimension or turn the time grain off.",
    });
  });
});

describe("draftFromChart", () => {
  it("round-trips a bar chart", () => {
    const built = draftToChart(
      draft({
        type: "bar",
        dimension: "product_category",
        series: "order_status",
        stacked: true,
      }),
      graph,
    );

    if (!("chart" in built)) throw new Error(built.error);

    const restored = draftFromChart(built.chart, graph);

    expect(restored).toMatchObject({
      type: "bar",
      metric: "revenue",
      dimension: "product_category",
      series: "order_status",
      stacked: true,
    });
    expect(draftToChart(restored, graph)).toEqual(built);
  });

  it("round-trips a monthly line chart", () => {
    const built = draftToChart(
      draft({
        type: "line",
        grain: "month",
        dateDimension: "order_date",
        series: "order_status",
      }),
      graph,
    );

    if (!("chart" in built)) throw new Error(built.error);

    const restored = draftFromChart(built.chart, graph);

    expect(restored).toMatchObject({
      type: "line",
      grain: "month",
      dateDimension: "order_date",
      series: "order_status",
    });
    expect(draftToChart(restored, graph)).toEqual(built);
  });

  it("round-trips a table with two dimensions", () => {
    const built = draftToChart(
      draft({
        type: "table",
        dimension: "product_category",
        series: "order_status",
      }),
      graph,
    );

    if (!("chart" in built)) throw new Error(built.error);

    const restored = draftFromChart(built.chart, graph);
    expect(draftToChart(restored, graph)).toEqual(built);
  });
});
