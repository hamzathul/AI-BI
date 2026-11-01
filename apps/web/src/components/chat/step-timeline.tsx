"use client";

import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import type { ChatStep } from "@/lib/chat/events";
import { stepLabel } from "@/lib/chat/events";
import { cn } from "@/lib/utils";

function StepIcon({ status }: { status: ChatStep["status"] }) {
  if (status === "error") {
    return <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
  if (status === "retry") {
    return <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-amber-600" />;
  }
  return <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />;
}

/** One short, safe line from a step's whitelisted detail. */
export function stepDetailText(step: ChatStep): string | null {
  const detail = step.detail;

  if (typeof detail.intent === "string") {
    return detail.intent === "data_question" ? "data question" : "out of scope";
  }

  if (typeof detail.dataset === "string") return detail.dataset;

  if (Array.isArray(detail.metrics) || Array.isArray(detail.dimensions)) {
    const parts: string[] = [];
    if (Array.isArray(detail.metrics) && detail.metrics.length > 0) {
      parts.push(detail.metrics.join(", "));
    }
    if (Array.isArray(detail.dimensions) && detail.dimensions.length > 0) {
      parts.push(`by ${detail.dimensions.join(", ")}`);
    }
    return parts.length > 0 ? parts.join(" ") : null;
  }

  if (typeof detail.rowCount === "number") {
    return typeof detail.durationMs === "number"
      ? `${detail.rowCount} row(s) · ${detail.durationMs} ms`
      : `${detail.rowCount} row(s)`;
  }

  if (typeof detail.message === "string") return detail.message;

  return null;
}

/**
 * The timeline of graph nodes for one answer. It is the honest view of what
 * the agent did, including the one repair round when it happened.
 */
export function StepTimeline({
  steps,
  streaming,
}: {
  steps: ChatStep[];
  streaming: boolean;
}) {
  if (steps.length === 0 && !streaming) return null;

  return (
    <ol aria-label="Agent steps" className="space-y-1.5">
      {steps.map((step, index) => {
        const detail = stepDetailText(step);

        return (
          <li
            key={`${step.step}-${index}`}
            className="flex items-start gap-2 text-xs text-muted-foreground"
          >
            <StepIcon status={step.status} />
            <span
              className={cn(
                "font-medium",
                step.status === "error" && "text-destructive",
              )}
            >
              {stepLabel(step.step)}
            </span>
            {detail ? (
              <span className="min-w-0 break-words text-muted-foreground/80">
                {detail}
              </span>
            ) : null}
          </li>
        );
      })}
      {streaming ? (
        <li
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" />
          Working…
        </li>
      ) : null}
    </ol>
  );
}
