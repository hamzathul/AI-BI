"""SSE events emitted by `Agent.stream()` (6.4).

The web app renders a step timeline from these frames, so the contract is kept
small and stable. Details are whitelisted per node: the graph state also holds
the full semantic context and the compiled result, and neither may leak into a
browser event by accident.

Wire names are camelCase (aliases), matching core-api and the generated
TypeScript client.
"""

import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from ai_service.agent.state import AgentAnswer

StepStatus = Literal["done", "error", "retry"]
"""How a step ended. `retry` marks the single repair round."""

MESSAGE_PREVIEW_CHARS = 200
"""Long error messages are trimmed; the UI has no room for a stack trace."""


class StepEvent(BaseModel):
    """One node finished (or failed) during a run."""

    type: Literal["step"] = "step"
    step: str
    status: StepStatus = "done"
    detail: dict[str, Any] = Field(default_factory=dict)


class AnswerEvent(AgentAnswer):
    """The final answer. Flat on purpose: `event.outcome`, `event.result`."""

    type: Literal["answer"] = "answer"


class ErrorEvent(BaseModel):
    """A failure that happened after the stream started."""

    type: Literal["error"] = "error"
    message: str


AgentEvent = StepEvent | AnswerEvent | ErrorEvent


def step_status(node: str, update: dict[str, Any]) -> StepStatus:
    """A failed node is `error`; a repair is `retry`; everything else is `done`."""
    if update.get("outcome") == "failed":
        return "error"
    if node == "repair_spec":
        return "retry"
    return "done"


def step_detail(node: str, update: dict[str, Any]) -> dict[str, Any]:
    """The small, safe slice of a node update that the timeline can show.

    Never return the raw update: it can contain the whole model context, the
    QuerySpec, or the result rows.
    """
    if node == "classify_intent":
        intent = update.get("intent")
        return {"intent": intent} if intent else {}

    if node == "select_context":
        dataset = update.get("fact_dataset")
        return {"dataset": dataset} if dataset else {}

    if node in {"draft_spec", "repair_spec"}:
        spec = update.get("spec")
        if spec is None:
            return {}
        return {
            "metrics": list(spec.metrics),
            "dimensions": list(spec.dimensions),
        }

    if node == "validate_spec":
        result = update.get("result")
        if result is not None:
            return {"rowCount": result.row_count, "durationMs": result.duration_ms}
        message = update.get("validation_error") or update.get("error")
        return {"message": str(message)[:MESSAGE_PREVIEW_CHARS]} if message else {}

    return {}


def step_event(node: str, update: dict[str, Any]) -> StepEvent:
    """Build one frame for a finished node."""
    return StepEvent(
        step=node,
        status=step_status(node, update),
        detail=step_detail(node, update),
    )


def sse_frame(event: AgentEvent) -> str:
    """One SSE frame: a single `data:` line and a blank line.

    `model_dump(mode="json")` turns models and decimal-ish values into JSON-safe
    ones; `ensure_ascii=False` keeps names readable and `json.dumps` escapes any
    embedded newline, so a data line can never be split by an answer.
    """
    payload = event.model_dump(mode="json", by_alias=True, exclude_none=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"data: {body}\n\n"
