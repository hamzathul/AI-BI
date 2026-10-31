"""State and contracts for the agent graph (6.3).

One question = one in-memory state. There is no checkpointer and no session
storage: the ai-service stays stateless (D16), and 6.4 will stream a run rather
than resume it.

Nodes return only the keys they change; LangGraph merges that partial update
into the running state. `usages` and `trace` use the `operator.add` reducer, so
every node appends instead of replacing.
"""

import operator
from typing import Annotated, Literal, TypedDict

from pydantic import BaseModel, Field

from ai_service.core_api import ModelContext
from ai_service.llm import LlmUsage
from ai_service.spec import QueryResult, QuerySpec

Intent = Literal["data_question", "out_of_scope"]
"""What the router decided the question needs. Clarification arrives in 6.7."""

Outcome = Literal["answered", "out_of_scope", "failed", "planned"]
"""How a run ended.

`planned` is temporary: 6.3a stops after drafting a QuerySpec, and 6.3b turns a
successful run into `answered` once the spec has been executed.
"""


class IntentDecision(BaseModel):
    """LLM answer for `classify_intent`."""

    intent: Intent
    reason: str = Field(min_length=1, max_length=280)


class ContextSelection(BaseModel):
    """LLM answer for `select_context`: which dataset is the fact table."""

    dataset: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=280)


class AgentState(TypedDict, total=False):
    """One question's journey through the graph.

    `total=False` because nodes fill keys over time; only `question` is present
    at the start. Keeping this a plain `TypedDict` (not a Pydantic model) is the
    documented LangGraph default and avoids per-step validation overhead.
    """

    question: str
    intent: Intent
    intent_reason: str
    context: ModelContext
    fact_dataset: str
    selection_reason: str
    spec: QuerySpec
    result: QueryResult
    validation_error: str | None
    repairs: int
    outcome: Outcome
    answer: str
    error: str | None
    usages: Annotated[list[LlmUsage], operator.add]
    trace: Annotated[list[str], operator.add]


class UsageTotals(BaseModel):
    """Token and cost totals for one answer, summed across LLM calls."""

    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float | None = None

    @classmethod
    def from_usages(cls, usages: list[LlmUsage]) -> UsageTotals:
        """Sum call usages. Cost stays `None` when no call reported one."""
        costs = [usage.cost_usd for usage in usages if usage.cost_usd is not None]
        return cls(
            calls=len(usages),
            prompt_tokens=sum(usage.prompt_tokens for usage in usages),
            completion_tokens=sum(usage.completion_tokens for usage in usages),
            total_tokens=sum(usage.total_tokens for usage in usages),
            cost_usd=sum(costs) if costs else None,
        )


class AgentAnswer(BaseModel):
    """What `Agent.run()` returns — the only shape 6.4 needs to render."""

    question: str
    outcome: Outcome
    answer: str = ""
    spec: QuerySpec | None = None
    result: QueryResult | None = None
    repairs: int = 0
    error: str | None = None
    usage: UsageTotals = Field(default_factory=UsageTotals)
    trace: list[str] = Field(default_factory=list)
