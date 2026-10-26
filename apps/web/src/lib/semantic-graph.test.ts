import { describe, expect, it } from "vitest";
import type { MetadataSnapshot, SemanticModel } from "@/lib/api/types";
import { buildSemanticGraph } from "./semantic-graph";

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
      name: "customers",
      source: { schema: "sales", object: "customers" },
      dimensions: [{ name: "customer", column: "name" }],
    },
  ],
  joins: [
    {
      name: "order_items_order",
      from: { dataset: "order_items", column: "order_id" },
      to: { dataset: "orders", column: "id" },
    },
    {
      name: "orders_customer",
      from: { dataset: "orders", column: "customer_id" },
      to: { dataset: "customers", column: "id" },
    },
  ],
};

function column(name: string, dataType: string, ordinalPosition: number) {
  return {
    id: `${name}-id`,
    name,
    dataType,
    nullable: false,
    defaultValue: null,
    comment: null,
    isPrimaryKey: name === "id",
    ordinalPosition,
  };
}

function object(name: string, columns: ReturnType<typeof column>[]) {
  return {
    id: `${name}-object`,
    name,
    kind: "TABLE" as const,
    primaryKey: ["id"],
    columns,
  };
}

const metadata: MetadataSnapshot = {
  syncedAt: "2026-10-26T10:00:00.000Z",
  schemas: [
    {
      name: "sales",
      objects: [
        object("order_items", [
          column("id", "uuid", 1),
          column("quantity", "integer", 2),
          column("unit_price", "numeric", 3),
        ]),
        object("orders", [
          column("id", "uuid", 1),
          column("order_date", "date", 2),
          column("status", "text", 3),
        ]),
        object("customers", [
          column("id", "uuid", 1),
          column("name", "text", 2),
        ]),
      ],
    },
  ],
  relations: [],
};

describe("buildSemanticGraph", () => {
  const graph = buildSemanticGraph(model, metadata);

  it("attaches source column types from metadata", () => {
    const orderDate = graph.dimensions.find(
      (dimension) => dimension.name === "order_date",
    );

    expect(orderDate).toMatchObject({
      dataset: "orders",
      column: "order_date",
      dataType: "date",
      isDate: true,
    });
    expect(graph.isDateDimension("order_date")).toBe(true);
    expect(graph.isDateDimension("order_status")).toBe(false);
  });

  it("walks joins in the child -> parent direction only", () => {
    expect([...graph.reachableFrom("order_items")]).toEqual([
      "order_items",
      "orders",
      "customers",
    ]);
    expect([...graph.reachableFrom("customers")]).toEqual(["customers"]);
  });

  it("picks the dataset that joins out the most as the primary one", () => {
    expect(graph.primaryDataset).toBe("order_items");
  });

  it("orders reachable dimensions nearest first", () => {
    expect(
      graph.dimensionsFor("order_items").map((dimension) => dimension.name),
    ).toEqual(["order_date", "order_status", "customer"]);
  });

  it("offers only reachable dimensions for a fact dataset", () => {
    expect(
      graph.dimensionsFor("order_items").map((dimension) => dimension.name),
    ).toEqual(["order_date", "order_status", "customer"]);
    expect(graph.dimensionsFor("customers").map((d) => d.name)).toEqual([
      "customer",
    ]);
  });

  it("resolves the fact dataset of a metric list", () => {
    expect(graph.datasetForMetrics(["revenue"])).toBe("order_items");
    expect(graph.datasetForMetrics(["revenue", "orders"])).toBeUndefined();
    expect(graph.datasetOfMetric("orders")).toBe("orders");
    expect(graph.datasetOfDimension("customer")).toBe("customers");
  });

  it("lists metrics for one dataset", () => {
    expect(graph.metricsFor("orders")).toEqual([
      { name: "orders", dataset: "orders", agg: "count", description: undefined },
    ]);
  });
});
