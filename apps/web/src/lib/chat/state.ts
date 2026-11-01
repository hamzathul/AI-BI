/**
 * Chat UI state as a pure reducer (6.4).
 *
 * Keeping every transition here means the hook only owns the network, and the
 * interesting cases — an error frame, a stream that ends early, a user pressing
 * Stop — are testable without rendering anything.
 */

import type { ChatAnswer, ChatEvent, ChatStep } from "./events";

export type TurnStatus = "streaming" | "done" | "error" | "stopped";

export interface ChatTurn {
  id: string;
  question: string;
  steps: ChatStep[];
  answer: ChatAnswer | null;
  error: string | null;
  status: TurnStatus;
}

export interface ChatState {
  turns: ChatTurn[];
}

export type ChatAction =
  | { type: "ask"; id: string; question: string }
  | { type: "event"; id: string; event: ChatEvent }
  | { type: "finish"; id: string }
  | { type: "fail"; id: string; message: string }
  | { type: "stop"; id: string };

export const initialChatState: ChatState = { turns: [] };

export const STREAM_ENDED_EARLY =
  "The stream ended before an answer arrived. Is ai-service running?";

export const STOPPED_MESSAGE = "Stopped.";

function updateTurn(
  state: ChatState,
  id: string,
  update: (turn: ChatTurn) => ChatTurn,
): ChatState {
  return {
    turns: state.turns.map((turn) => (turn.id === id ? update(turn) : turn)),
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ask":
      return {
        turns: [
          ...state.turns,
          {
            id: action.id,
            question: action.question,
            steps: [],
            answer: null,
            error: null,
            status: "streaming",
          },
        ],
      };

    case "event":
      return updateTurn(state, action.id, (turn) => {
        if (turn.status !== "streaming") return turn;

        if (action.event.type === "step") {
          return { ...turn, steps: [...turn.steps, action.event] };
        }

        if (action.event.type === "answer") {
          return { ...turn, answer: action.event, status: "done" };
        }

        return { ...turn, error: action.event.message, status: "error" };
      });

    case "finish":
      return updateTurn(state, action.id, (turn) => {
        if (turn.status !== "streaming") return turn;

        // A well-behaved stream always ends with `answer` or `error`. Anything
        // else means the connection dropped after the headers went out.
        return turn.answer
          ? { ...turn, status: "done" }
          : { ...turn, status: "error", error: STREAM_ENDED_EARLY };
      });

    case "fail":
      return updateTurn(state, action.id, (turn) =>
        turn.status === "streaming"
          ? { ...turn, status: "error", error: action.message }
          : turn,
      );

    case "stop":
      return updateTurn(state, action.id, (turn) =>
        turn.status === "streaming"
          ? { ...turn, status: "stopped", error: STOPPED_MESSAGE }
          : turn,
      );
  }
}

export function isStreaming(state: ChatState): boolean {
  return state.turns.some((turn) => turn.status === "streaming");
}
