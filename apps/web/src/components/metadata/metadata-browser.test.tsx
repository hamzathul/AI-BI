import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { metadataSnapshot } from "@/test/fixtures";
import { MetadataBrowser } from "./metadata-browser";

describe("MetadataBrowser", () => {
  it("selects a table and shows its columns, types, and FK badges", async () => {
    render(<MetadataBrowser snapshot={metadataSnapshot} />);

    await userEvent.click(screen.getByRole("button", { name: "hr.employees" }));

    expect(screen.getByText("hr.employees")).toBeInTheDocument();
    expect(screen.getByText("salary")).toBeInTheDocument();
    expect(screen.getByText("numeric(10,2)")).toBeInTheDocument();

    const departmentColumn = screen.getByRole("row", {
      name: /department_id/,
    });
    expect(within(departmentColumn).getByText("FK")).toBeInTheDocument();
    expect(
      within(departmentColumn).getByTitle("→ hr.departments.id"),
    ).toBeInTheDocument();
  });

  it("shows the relation graph for the selected table", async () => {
    render(<MetadataBrowser snapshot={metadataSnapshot} />);

    await userEvent.click(screen.getByRole("button", { name: "hr.employees" }));

    expect(
      screen.getByText("employees_department_id_fkey"),
    ).toBeInTheDocument();
    // A self-relation appears once as outgoing and once as incoming.
    expect(
      screen.getAllByText("employees_manager_id_fkey").length,
    ).toBeGreaterThan(0);
  });

  it("shows VIEW badges and the empty relation state", async () => {
    render(<MetadataBrowser snapshot={metadataSnapshot} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "hr.headcount_by_department",
      }),
    );

    expect(screen.getAllByText("VIEW").length).toBeGreaterThan(0);
    expect(
      screen.getByText("No foreign keys touch this table."),
    ).toBeInTheDocument();
  });
});
