"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clarificationFollowUp } from "@/lib/chat/clarify";
import type { ChatAnswer } from "@/lib/chat/events";
import type { ChatTurn } from "@/lib/chat/state";
import { AnswerChart } from "./answer-chart";
import { AnswerTable } from "./answer-table";
import { StepTimeline } from "./step-timeline";

function AnswerMeta({ answer }: { answer: ChatAnswer }) {
  const bits: string[] = [];

  if (answer.repairs) {
    bits.push(`${answer.repairs} query repair`);
  }
  if (answer.usage?.calls) {
    bits.push(`${answer.usage.calls} LLM call(s)`);
  }
  if (answer.usage?.totalTokens) {
    bits.push(`${answer.usage.totalTokens} tokens`);
  }
  if (typeof answer.usage?.costUsd === "number") {
    bits.push(`$${answer.usage.costUsd.toFixed(6)}`);
  }

  if (bits.length === 0) return null;

  return (
    <p className="text-xs text-muted-foreground/80">{bits.join(" · ")}</p>
  );
}

function AnswerBody({
  answer,
  onAsk,
  disabled,
}: {
  answer: ChatAnswer;
  onAsk?: (question: string) => void;
  disabled?: boolean;
}) {
  if (answer.outcome === "failed") {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>{answer.answer}</AlertTitle>
        {answer.error ? <AlertDescription>{answer.error}</AlertDescription> : null}
      </Alert>
    );
  }

  if (answer.outcome === "needs_clarification") {
    const options = answer.clarification?.options ?? [];

    return (
      <div className="space-y-3">
        <Badge variant="secondary">One detail needed</Badge>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
        {options.length > 0 && onAsk ? (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <Button
                key={option}
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onAsk(clarificationFollowUp(answer.question, option))
                }
              >
                Use {option}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (answer.outcome === "out_of_scope") {
    return (
      <div className="space-y-2">
        <Badge variant="secondary">Out of scope</Badge>
        <p className="text-sm leading-relaxed">{answer.answer}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">{answer.answer}</p>
      <AnswerChart spec={answer.spec} result={answer.result} />
      {answer.result ? <AnswerTable result={answer.result} /> : null}
      <AnswerMeta answer={answer} />
    </div>
  );
}

/**
 * One question and everything that came back. The question stays in the
 * transcript even when the run fails, so the user can see what was asked.
 */
export function ChatTurnView({
  turn,
  onAsk,
  disabled,
}: {
  turn: ChatTurn;
  onAsk?: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <article className="space-y-3" aria-label={`Question: ${turn.question}`}>
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {turn.question}
        </p>
      </div>

      <div className="space-y-3 rounded-2xl rounded-tl-sm border bg-card px-4 py-3">
        <StepTimeline steps={turn.steps} streaming={turn.status === "streaming"} />

        {turn.answer ? (
          <AnswerBody answer={turn.answer} onAsk={onAsk} disabled={disabled} />
        ) : null}

        {!turn.answer && turn.status === "error" ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Chat failed</AlertTitle>
            <AlertDescription>{turn.error}</AlertDescription>
          </Alert>
        ) : null}

        {!turn.answer && turn.status === "stopped" ? (
          <p className="text-sm text-muted-foreground">Stopped.</p>
        ) : null}
      </div>
    </article>
  );
}
