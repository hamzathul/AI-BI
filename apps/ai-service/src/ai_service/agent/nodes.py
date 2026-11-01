"""The agent graph's nodes (6.3).

Each node receives the state and returns only the keys it changes. Expected
failures — LLM not configured, core-api has no model, the model invented a
dataset — do not raise: they set `outcome="failed"` plus a safe `error`, and the
graph routes to `compose_answer`. Unexpected bugs still raise, so they surface
as a 500 (or an SSE error frame) in 6.4 instead of hiding.

6.3b adds execution (`validate_spec`), one repair round, and the prose answer.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from ai_service.agent import prompts
from ai_service.agent.state import (
    AgentState,
    AnswerProse,
    ContextSelection,
    IntentDecision,
)
from ai_service.core_api import CoreApiClient, CoreApiError, CoreApiRejected
from ai_service.llm import LlmClient, LlmError
from ai_service.spec import QuerySpec

logger = logging.getLogger(__name__)

SMALL_MAX_TOKENS = 300
"""Budget for routing and selection: two short sentences plus a name."""

DRAFT_MAX_TOKENS = 1500
"""Budget for a QuerySpec: small JSON, but long names and a few filters."""

ANSWER_MAX_TOKENS = 400
"""Budget for the prose answer: three sentences, never a table."""


@dataclass(frozen=True)
class AgentDeps:
    """Everything the nodes need from the outside world.

    Injected rather than imported so tests can pass fakes and `today` is fixed
    in prompt tests. `today=None` means "ask the clock" at request time.
    """

    llm: LlmClient
    core_api: CoreApiClient
    today: date | None = None

    def current_date(self) -> date:
        return self.today or datetime.now(UTC).date()


class AgentNodes:
    """Node implementations bound to one set of dependencies."""

    def __init__(self, deps: AgentDeps) -> None:
        self._deps = deps

    async def classify_intent(self, state: AgentState) -> dict[str, Any]:
        """Route the message: data question or out of scope."""
        try:
            result = await self._deps.llm.structured(
                schema=IntentDecision,
                system=prompts.CLASSIFY_SYSTEM,
                user=state["question"],
                max_tokens=SMALL_MAX_TOKENS,
            )
        except LlmError as exc:
            return self._failed("classify_intent", exc)

        return {
            "intent": result.data.intent,
            "intent_reason": result.data.reason,
            "usages": [result.usage],
            "trace": ["classify_intent"],
        }

    async def select_context(self, state: AgentState) -> dict[str, Any]:
        """Read the semantic model, then let the LLM pick one fact dataset."""
        try:
            context = await self._deps.core_api.context()
        except CoreApiError as exc:
            return self._failed("select_context", exc)

        try:
            result = await self._deps.llm.structured(
                schema=ContextSelection,
                system=prompts.SELECT_SYSTEM,
                user=prompts.select_user(context, state["question"]),
                max_tokens=SMALL_MAX_TOKENS,
            )
        except LlmError as exc:
            return self._failed("select_context", exc)

        known = {dataset.name for dataset in context.datasets}
        dataset = result.data.dataset
        if dataset not in known:
            # Fail honestly instead of guessing; 6.6 evals will show whether
            # this needs a retry or a lexical fallback.
            logger.warning("agent_unknown_dataset dataset=%s", dataset)
            return {
                "outcome": "failed",
                "error": f'The model picked an unknown dataset "{dataset}".',
                "usages": [result.usage],
                "trace": ["select_context"],
            }

        return {
            "context": context,
            "fact_dataset": dataset,
            "selection_reason": result.data.reason,
            "usages": [result.usage],
            "trace": ["select_context"],
        }

    async def draft_spec(self, state: AgentState) -> dict[str, Any]:
        """Turn the question into one QuerySpec, against the narrowed model."""
        context = state["context"]
        base = state["fact_dataset"]

        try:
            result = await self._deps.llm.structured(
                schema=QuerySpec,
                system=prompts.DRAFT_SYSTEM,
                user=prompts.draft_user(
                    context,
                    base,
                    state["question"],
                    self._deps.current_date(),
                ),
                max_tokens=DRAFT_MAX_TOKENS,
            )
        except LlmError as exc:
            return self._failed("draft_spec", exc)

        spec = result.data
        if spec.dataset is None:
            # The compiler infers the dataset from the first metric; setting it
            # here keeps the spec explicit and makes 6.3b's check meaningful.
            spec = spec.model_copy(update={"dataset": base})

        return {
            "spec": spec,
            "usages": [result.usage],
            "trace": ["draft_spec"],
        }

    async def validate_spec(self, state: AgentState) -> dict[str, Any]:
        """Execute the spec through core-api: a spec that runs is valid.

        There is no dry-run route by design (D9/D52): the compiler is the only
        judge, so "validate" means "compile and run". A 400 is the one failure a
        second LLM call can fix, so it is recorded as `validation_error` instead
        of ending the run; infrastructure failures end it.
        """
        spec = state["spec"]

        try:
            result = await self._deps.core_api.execute(spec)
        except CoreApiRejected as exc:
            logger.warning("agent_spec_rejected status=%d", exc.status_code)
            return {
                "validation_error": exc.message,
                "trace": ["validate_spec"],
            }
        except CoreApiError as exc:
            return self._failed("validate_spec", exc)

        return {
            "result": result,
            "validation_error": None,
            "trace": ["validate_spec"],
        }

    async def repair_spec(self, state: AgentState) -> dict[str, Any]:
        """One repair round, fed the compiler's message and the failed spec."""
        base = state["fact_dataset"]
        failed = state["spec"]
        error = state.get("validation_error") or "The backend rejected the spec."

        try:
            result = await self._deps.llm.structured(
                schema=QuerySpec,
                system=prompts.REPAIR_SYSTEM,
                user=prompts.repair_user(
                    state["context"],
                    base,
                    state["question"],
                    failed,
                    error,
                    self._deps.current_date(),
                ),
                max_tokens=DRAFT_MAX_TOKENS,
            )
        except LlmError as exc:
            return self._failed("repair_spec", exc)

        repaired = result.data
        if repaired.dataset is None:
            repaired = repaired.model_copy(update={"dataset": base})

        if repaired == failed:
            # Running the same spec again can only fail again. Failing here is
            # honest and saves one query.
            logger.warning("agent_repair_unchanged")
            return {
                "outcome": "failed",
                "error": "The model returned the same spec after it was rejected.",
                "usages": [result.usage],
                "trace": ["repair_spec"],
            }

        return {
            "spec": repaired,
            "validation_error": None,
            "repairs": 1,
            "usages": [result.usage],
            "trace": ["repair_spec"],
        }

    async def compose_answer(self, state: AgentState) -> dict[str, Any]:
        """Prose over the executed rows, with a deterministic floor.

        Failures and out-of-scope runs get fixed text. An empty result gets its
        own sentence and no LLM call: there is nothing to summarize and every
        invented word would be a liability. If the prose call fails, the rows
        are still the answer.
        """
        if state.get("outcome") == "failed":
            return {
                "answer": prompts.FAILED_ANSWER,
                "trace": ["compose_answer"],
            }

        if state.get("intent") == "out_of_scope":
            return {
                "answer": prompts.OUT_OF_SCOPE_ANSWER,
                "outcome": "out_of_scope",
                "trace": ["compose_answer"],
            }

        result = state.get("result")
        if result is None:
            # A second rejection lands here: keep the compiler's safe message so
            # the UI can explain what still failed.
            error = state.get("validation_error") or "The run finished without a result."
            return {
                "outcome": "failed",
                "answer": prompts.FAILED_ANSWER,
                "error": error,
                "trace": ["compose_answer"],
            }

        if result.row_count == 0:
            return {
                "answer": prompts.EMPTY_RESULT_ANSWER,
                "outcome": "answered",
                "trace": ["compose_answer"],
            }

        try:
            composed = await self._deps.llm.structured(
                schema=AnswerProse,
                system=prompts.ANSWER_SYSTEM,
                user=prompts.answer_user(state["question"], result),
                max_tokens=ANSWER_MAX_TOKENS,
            )
        except LlmError as exc:
            logger.warning("agent_answer_llm_failed error=%s", type(exc).__name__)
            return {
                "answer": prompts.FALLBACK_ANSWER,
                "outcome": "answered",
                "trace": ["compose_answer"],
            }

        return {
            "answer": composed.data.answer,
            "outcome": "answered",
            "usages": [composed.usage],
            "trace": ["compose_answer"],
        }

    @staticmethod
    def _failed(node: str, exc: Exception) -> dict[str, Any]:
        """A safe failure update: friendly answer text, technical detail separate.

        Only the exception type is logged — messages from core-api can contain
        semantic names, and prompts must never reach the logs.
        """
        logger.warning("agent_node_failed node=%s error=%s", node, type(exc).__name__)
        return {
            "outcome": "failed",
            "error": str(exc),
            "trace": [node],
        }
