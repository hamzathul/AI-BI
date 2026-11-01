"use client";

import { useCallback, useReducer, useRef } from "react";
import { getErrorMessage } from "@/lib/api/client";
import { streamChat } from "@/lib/api/chat";
import {
  chatReducer,
  initialChatState,
  isStreaming,
} from "@/lib/chat/state";

let nextId = 0;

function newTurnId(): string {
  nextId += 1;
  return `turn-${Date.now()}-${nextId}`;
}

/**
 * One question at a time (6.4).
 *
 * History lives in memory only: a reload starts a new chat. That is deliberate
 * — the agent is stateless (D16), and nothing in this phase stores messages.
 */
export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const controllerRef = useRef<AbortController | null>(null);

  const ask = useCallback(async (question: string) => {
    const message = question.trim();
    if (!message || controllerRef.current) return;

    const id = newTurnId();
    dispatch({ type: "ask", id, question: message });

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      await streamChat(message, {
        signal: controller.signal,
        onEvent: (event) => dispatch({ type: "event", id, event }),
      });
      dispatch({ type: "finish", id });
    } catch (error) {
      dispatch(
        controller.signal.aborted
          ? { type: "stop", id }
          : { type: "fail", id, message: getErrorMessage(error) },
      );
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return {
    turns: state.turns,
    ask,
    stop,
    isStreaming: isStreaming(state),
  };
}
