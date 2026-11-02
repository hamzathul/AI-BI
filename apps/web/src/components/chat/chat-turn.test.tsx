import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatAnswer, ChatQueryResult } from "@/lib/chat/events";
import type { ChatTurn } from "@/lib/chat/state";
import { ChatTurnView } from "./chat-turn";

// The real renderer needs a canvas; the wiring is what this test covers.
vi.mock("@/components/charts/echarts-chart", () => ({
  EChartsChart: () => <div data-testid="echart" />,
}));

function turn(answer: ChatAnswer): ChatTurn {
  return {
    id: "turn-1",
    question: answer.question,
    steps: [],
    answer,
    error: null,
    status: "done",
  };
}

const barResult: ChatQueryResult = {
  columns: [
    { name: "department", dataType: "text" },
    { name: "headcount", dataType: "bigint" },
  ],
  rows: [
    { department: "Engineering", headcount: 12 },
    { department: "Sales", headcount: 8 },
  ],
  rowCount: 2,
  truncated: false,
  durationMs: 5,
};

const barAnswer: ChatAnswer = {
  type: "answer",
  question: "Headcount by department",
  outcome: "answered",
  answer: "Engineering has the most people.",
  spec: {
    dataset: "employees",
    metrics: ["headcount"],
    dimensions: ["department"],
    filters: [],
    orderBy: [],
  },
  result: barResult,
};

describe("ChatTurnView", () => {
  it("shows the suggested chart above the row table", () => {
    render(<ChatTurnView turn={turn(barAnswer)} />);

    const figure = screen.getByRole("figure");
    expect(
      within(figure).getByText("Headcount by department"),
    ).toBeInTheDocument();
    expect(within(figure).getByText("bar")).toBeInTheDocument();
    expect(screen.getByTestId("echart")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "department" }),
    ).toBeInTheDocument();
  });

  it("keeps the table alone when no honest chart exists", () => {
    render(
      <ChatTurnView
        turn={turn({
          ...barAnswer,
          answer: "Revenue and units sold by category.",
          spec: {
            ...barAnswer.spec,
            metrics: ["revenue", "units_sold"],
          },
          result: {
            ...barResult,
            columns: [
              { name: "department", dataType: "text" },
              { name: "revenue", dataType: "numeric" },
              { name: "units_sold", dataType: "bigint" },
            ],
            rows: [
              { department: "Engineering", revenue: "10", units_sold: 2 },
            ],
            rowCount: 1,
          },
        })}
      />,
    );

    expect(screen.queryByTestId("echart")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows no chart or table for a failed answer", () => {
    render(
      <ChatTurnView
        turn={turn({
          type: "answer",
          question: "Revenue?",
          outcome: "failed",
          answer: "I couldn't answer that question. Please try rephrasing it.",
          error: "Unknown metric",
        })}
      />,
    );

    expect(screen.queryByTestId("echart")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't answer/)).toBeInTheDocument();
  });

  it("shows no chart for an out-of-scope answer", () => {
    render(
      <ChatTurnView
        turn={turn({
          type: "answer",
          question: "What is your favorite color?",
          outcome: "out_of_scope",
          answer: "I can only answer questions about the connected data model.",
        })}
      />,
    );

    expect(screen.queryByTestId("echart")).not.toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
  });
});
