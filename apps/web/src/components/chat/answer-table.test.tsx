import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatQueryResult } from "@/lib/chat/events";
import { AnswerTable, formatCell } from "./answer-table";

const result: ChatQueryResult = {
  columns: [
    { name: "department", dataType: "text" },
    { name: "active", dataType: "boolean" },
    { name: "note", dataType: "text" },
  ],
  rows: [{ department: "Engineering", active: true, note: null }],
  rowCount: 5,
  truncated: true,
  durationMs: 7,
};

describe("formatCell", () => {
  it("renders null, booleans, and objects without throwing", () => {
    expect(formatCell(null)).toBe("—");
    expect(formatCell(undefined)).toBe("—");
    expect(formatCell(false)).toBe("false");
    expect(formatCell({ a: 1 })).toBe('{"a":1}');
    expect(formatCell("Engineering")).toBe("Engineering");
  });
});

describe("AnswerTable", () => {
  it("renders columns, rows, and the preview caption", () => {
    render(<AnswerTable result={result} />);

    expect(screen.getByRole("columnheader", { name: "department" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Engineering" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "true" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 5 row/)).toBeInTheDocument();
    expect(screen.getByText(/query limit/)).toBeInTheDocument();
  });

  it("explains an empty result instead of showing an empty table", () => {
    render(<AnswerTable result={{ ...result, rows: [], rowCount: 0 }} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/No rows matched/)).toBeInTheDocument();
  });
});
