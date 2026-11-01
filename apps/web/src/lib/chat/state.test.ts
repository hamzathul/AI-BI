import { describe, expect, it } from "vitest";
import type { ChatAnswer, ChatStep } from "./events";
import {
  chatReducer,
  initialChatState,
  isStreaming,
  STREAM_ENDED_EARLY,
  STOPPED_MESSAGE,
  type ChatState,
} from "./state";

const step: ChatStep = {
  type: "step",
  step: "classify_intent",
  status: "done",
  detail: { intent: "data_question" },
};

const answer: ChatAnswer = {
  type: "answer",
  question: "Headcount?",
  outcome: "answered",
  answer: "Two departments.",
  result: {
    columns: [{ name: "department", dataType: "text" }],
    rows: [{ department: "Engineering" }],
    rowCount: 1,
    truncated: false,
    durationMs: 4,
  },
  usage: { calls: 4, promptTokens: 1, completionTokens: 1, totalTokens: 2 },
};

function asked(): ChatState {
  return chatReducer(initialChatState, {
    type: "ask",
    id: "turn-1",
    question: "Headcount?",
  });
}

describe("chatReducer", () => {
  it("adds a streaming turn", () => {
    const state = asked();

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "turn-1",
      question: "Headcount?",
      steps: [],
      answer: null,
      status: "streaming",
    });
    expect(isStreaming(state)).toBe(true);
  });

  it("appends steps in arrival order", () => {
    const state = chatReducer(asked(), {
      type: "event",
      id: "turn-1",
      event: step,
    });

    expect(state.turns[0].steps).toEqual([step]);
    expect(state.turns[0].status).toBe("streaming");
  });

  it("finishes on the answer frame", () => {
    const state = chatReducer(asked(), {
      type: "event",
      id: "turn-1",
      event: answer,
    });

    expect(state.turns[0].answer).toEqual(answer);
    expect(state.turns[0].status).toBe("done");
    expect(isStreaming(state)).toBe(false);
  });

  it("marks an error frame as a failed turn", () => {
    const state = chatReducer(asked(), {
      type: "event",
      id: "turn-1",
      event: { type: "error", message: "The AI service stopped." },
    });

    expect(state.turns[0].status).toBe("error");
    expect(state.turns[0].error).toBe("The AI service stopped.");
    expect(state.turns[0].answer).toBeNull();
  });

  it("treats a stream that ends without an answer as an error", () => {
    const state = chatReducer(asked(), { type: "finish", id: "turn-1" });

    expect(state.turns[0].status).toBe("error");
    expect(state.turns[0].error).toBe(STREAM_ENDED_EARLY);
  });

  it("does not turn a late finish into an error after the answer", () => {
    const answered = chatReducer(asked(), {
      type: "event",
      id: "turn-1",
      event: answer,
    });
    const state = chatReducer(answered, { type: "finish", id: "turn-1" });

    expect(state.turns[0].status).toBe("done");
  });

  it("ignores events that arrive after the turn ended", () => {
    const answered = chatReducer(asked(), {
      type: "event",
      id: "turn-1",
      event: answer,
    });
    const state = chatReducer(answered, {
      type: "event",
      id: "turn-1",
      event: step,
    });

    expect(state.turns[0].steps).toEqual([]);
  });

  it("records a transport failure", () => {
    const state = chatReducer(asked(), {
      type: "fail",
      id: "turn-1",
      message: "Cannot reach the API.",
    });

    expect(state.turns[0].status).toBe("error");
    expect(state.turns[0].error).toBe("Cannot reach the API.");
  });

  it("records a user stop without an error alert", () => {
    const state = chatReducer(asked(), { type: "stop", id: "turn-1" });

    expect(state.turns[0].status).toBe("stopped");
    expect(state.turns[0].error).toBe(STOPPED_MESSAGE);
  });

  it("leaves other turns untouched", () => {
    const first = chatReducer(asked(), {
      type: "event",
      id: "turn-1",
      event: answer,
    });
    const second = chatReducer(first, {
      type: "ask",
      id: "turn-2",
      question: "Revenue?",
    });
    const state = chatReducer(second, {
      type: "event",
      id: "turn-2",
      event: { type: "error", message: "boom" },
    });

    expect(state.turns[0].answer).toEqual(answer);
    expect(state.turns[0].status).toBe("done");
    expect(state.turns[1].status).toBe("error");
  });
});
