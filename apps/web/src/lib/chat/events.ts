/**
 * The chat event contract (6.4), hand-written on purpose.
 *
 * OpenAPI cannot describe an SSE body, so `schema.d.ts` stops at
 * `/api/chat` and these types take over. They mirror ai-service's
 * `agent/events.py` (the owner) and are the only place the wire shape is
 * spelled out in TypeScript.
 */

import type { QuerySpec } from "@/lib/api/types";

export type StepStatus = "done" | "error" | "retry";

export interface ChatStep {
  type: "step";
  step: string;
  status: StepStatus;
  detail: Record<string, unknown>;
}

export interface ChatResultColumn {
  name: string;
  dataType: string;
}

/**
 * The rows carried by an answer. Like core-api's `QueryResult` but without
 * `meta`: the agent's result never had it. `rowCount` is the true count even
 * when only the first 100 rows were sent (D62).
 */
export interface ChatQueryResult {
  columns: ChatResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export interface ChatUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number | null;
}

export type ChatOutcome = "answered" | "out_of_scope" | "failed" | "needs_clarification";

/**
 * The question the agent asked instead of guessing (6.7). `options` are real
 * metric or dimension names, validated by ai-service before they reach here.
 */
export interface ChatClarification {
  question: string;
  options: string[];
}

export interface ChatAnswer {
  type: "answer";
  question: string;
  outcome: ChatOutcome;
  answer: string;
  clarification?: ChatClarification | null;
  spec?: QuerySpec | null;
  result?: ChatQueryResult | null;
  repairs?: number;
  error?: string | null;
  usage?: ChatUsage;
  trace?: string[];
}

export interface ChatError {
  type: "error";
  message: string;
}

export type ChatEvent = ChatStep | ChatAnswer | ChatError;

const STEP_STATUSES: readonly StepStatus[] = ["done", "error", "retry"];
const OUTCOMES: readonly ChatOutcome[] = [
  "answered",
  "out_of_scope",
  "failed",
  "needs_clarification",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClarification(value: unknown): value is ChatClarification {
  return (
    isRecord(value) &&
    typeof value.question === "string" &&
    Array.isArray(value.options) &&
    value.options.length >= 2 &&
    value.options.every((option) => typeof option === "string")
  );
}

function isStep(value: unknown): value is ChatStep {
  if (!isRecord(value)) return false;

  return (
    typeof value.step === "string" &&
    STEP_STATUSES.includes(value.status as StepStatus) &&
    isRecord(value.detail)
  );
}

function isAnswer(value: unknown): value is ChatAnswer {
  if (!isRecord(value)) return false;

  const clarificationOk =
    value.clarification === undefined ||
    value.clarification === null ||
    isClarification(value.clarification);

  return (
    typeof value.question === "string" &&
    OUTCOMES.includes(value.outcome as ChatOutcome) &&
    typeof value.answer === "string" &&
    clarificationOk
  );
}

/**
 * Turn one SSE `data:` payload into an event.
 *
 * Returns `null` instead of throwing: a frame may come from a future version
 * of the service, and one unknown frame must not kill an otherwise good
 * stream. A stream that ends without any answer is caught by the reducer.
 */
export function parseChatEvent(data: string): ChatEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;

  if (value.type === "step" && isStep(value)) return value;
  if (value.type === "answer" && isAnswer(value)) return value;
  if (value.type === "error" && typeof value.message === "string") {
    return { type: "error", message: value.message };
  }

  return null;
}

export const STEP_LABELS: Record<string, string> = {
  classify_intent: "Understanding the question",
  select_context: "Choosing the dataset",
  draft_spec: "Drafting the query",
  validate_spec: "Running the query",
  repair_spec: "Fixing the query",
  compose_answer: "Writing the answer",
};

export function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}
