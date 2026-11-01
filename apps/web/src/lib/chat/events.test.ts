import { describe, expect, it } from "vitest";
import { parseChatEvent, stepLabel } from "./events";

describe("parseChatEvent", () => {
  it("parses a step frame", () => {
    const event = parseChatEvent(
      '{"type":"step","step":"validate_spec","status":"done","detail":{"rowCount":2}}',
    );

    expect(event).toEqual({
      type: "step",
      step: "validate_spec",
      status: "done",
      detail: { rowCount: 2 },
    });
  });

  it("parses an answer frame with camelCase result fields", () => {
    const event = parseChatEvent(
      JSON.stringify({
        type: "answer",
        question: "Headcount?",
        outcome: "answered",
        answer: "Two departments.",
        result: {
          columns: [{ name: "department", dataType: "text" }],
          rows: [{ department: "Engineering" }],
          rowCount: 1,
          truncated: false,
          durationMs: 7,
        },
        usage: { calls: 4, promptTokens: 40, completionTokens: 20, totalTokens: 60 },
        trace: ["compose_answer"],
      }),
    );

    expect(event?.type).toBe("answer");
    if (event?.type !== "answer") throw new Error("expected an answer");
    expect(event.result?.rowCount).toBe(1);
    expect(event.result?.columns[0].dataType).toBe("text");
    expect(event.usage?.totalTokens).toBe(60);
  });

  it("parses an error frame and keeps the message", () => {
    expect(parseChatEvent('{"type":"error","message":"stopped"}')).toEqual({
      type: "error",
      message: "stopped",
    });
  });

  it("returns null for malformed JSON instead of killing the stream", () => {
    expect(parseChatEvent("not json")).toBeNull();
    expect(parseChatEvent("[]")).toBeNull();
    expect(parseChatEvent("null")).toBeNull();
  });

  it("returns null for unknown or incomplete events", () => {
    expect(parseChatEvent('{"type":"future"}')).toBeNull();
    expect(
      parseChatEvent('{"type":"step","step":"draft_spec","status":"weird","detail":{}}'),
    ).toBeNull();
    expect(
      parseChatEvent('{"type":"answer","question":"q","outcome":"answered"}'),
    ).toBeNull();
    expect(parseChatEvent('{"type":"error"}')).toBeNull();
  });
});

describe("stepLabel", () => {
  it("uses a human label for graph nodes and falls back to the raw name", () => {
    expect(stepLabel("classify_intent")).toBe("Understanding the question");
    expect(stepLabel("something_new")).toBe("something_new");
  });
});
