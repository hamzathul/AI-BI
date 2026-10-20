import { describe, expect, it } from "vitest";
import { metadataSnapshot } from "@/test/fixtures";
import { buildMetadataIndex, columnKey, objectKey } from "./metadata-index";

describe("buildMetadataIndex", () => {
  const index = buildMetadataIndex(metadataSnapshot);

  it("groups objects by schema and counts the snapshot", () => {
    expect(index.counts).toEqual({
      schemas: 1,
      objects: 3,
      columns: 10,
      relations: 2,
    });
    expect(index.schemas[0].objects.map((object) => object.name)).toEqual([
      "departments",
      "employees",
      "headcount_by_department",
    ]);
  });

  it("maps both sides of every foreign key to its column", () => {
    expect(
      index.fkByColumn.get(columnKey("hr", "employees", "department_id")),
    ).toHaveLength(1);
    expect(
      index.fkByColumn.get(columnKey("hr", "departments", "id")),
    ).toHaveLength(1);
  });

  it("keeps outgoing and incoming relations per object", () => {
    const employeeRelations = index.relationsByObject.get(
      objectKey("hr", "employees"),
    );

    expect(employeeRelations?.outgoing).toHaveLength(2);
    expect(employeeRelations?.incoming).toHaveLength(1);

    const departmentRelations = index.relationsByObject.get(
      objectKey("hr", "departments"),
    );

    expect(departmentRelations?.incoming).toHaveLength(1);
  });
});
