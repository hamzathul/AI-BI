"""The LangGraph graph that answers one question (6.3).

    START -> classify_intent -> [out_of_scope] -> compose_answer -> END
                             -> select_context -> draft_spec -> validate_spec
                                -> [rejected, first time] -> repair_spec
                                -> validate_spec -> [ok] -> compose_answer -> END

Every node is async because both external calls (LLM and core-api) are async.
The graph is compiled per `Agent`; compilation is cheap and holds no state, so
one agent can serve concurrent runs.

`run()` returns the final answer for tests and scripts; `stream()` yields the
same steps as SSE-ready events for the HTTP endpoint (6.4). Both share
`_answer_from_state`, so their results cannot drift.
"""

from collections.abc import AsyncIterator
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ai_service.agent.events import AgentEvent, AnswerEvent, StepEvent, step_event
from ai_service.agent.nodes import AgentDeps, AgentNodes
from ai_service.agent.state import (
    ANSWER_ROW_LIMIT,
    AgentAnswer,
    AgentState,
    UsageTotals,
)


def build_graph(deps: AgentDeps) -> CompiledStateGraph:
    """Wire the nodes and conditional edges around one dependency bundle."""
    nodes = AgentNodes(deps)

    builder = StateGraph(AgentState)
    builder.add_node("classify_intent", nodes.classify_intent)
    builder.add_node("select_context", nodes.select_context)
    builder.add_node("draft_spec", nodes.draft_spec)
    builder.add_node("validate_spec", nodes.validate_spec)
    builder.add_node("repair_spec", nodes.repair_spec)
    builder.add_node("compose_answer", nodes.compose_answer)

    builder.add_edge(START, "classify_intent")
    builder.add_conditional_edges("classify_intent", _after_classify)
    builder.add_conditional_edges("select_context", _after_select)
    builder.add_conditional_edges("draft_spec", _after_draft)
    builder.add_conditional_edges("validate_spec", _after_validate)
    builder.add_conditional_edges("repair_spec", _after_repair)
    builder.add_edge("compose_answer", END)

    return builder.compile()


def _after_classify(state: AgentState) -> str:
    """Out-of-scope and failed runs skip selection entirely."""
    if state.get("outcome") == "failed":
        return "compose_answer"
    if state.get("intent") == "out_of_scope":
        return "compose_answer"
    return "select_context"


def _after_select(state: AgentState) -> str:
    """A failed or ambiguous selection skips drafting and querying entirely."""
    if state.get("outcome") in {"failed", "needs_clarification"}:
        return "compose_answer"
    return "draft_spec"


def _after_draft(state: AgentState) -> str:
    return "compose_answer" if state.get("outcome") == "failed" else "validate_spec"


def _after_validate(state: AgentState) -> str:
    """Success ends the query phase; one rejection earns one repair."""
    if state.get("result") is not None:
        return "compose_answer"
    if state.get("validation_error") and state.get("repairs", 0) == 0:
        return "repair_spec"
    return "compose_answer"


def _after_repair(state: AgentState) -> str:
    return "compose_answer" if state.get("outcome") == "failed" else "validate_spec"


def _answer_from_state(question: str, final: dict[str, Any]) -> AgentAnswer:
    """The one place that turns graph state into the public answer.

    Rows are capped here (D62), not in the nodes, so the graph still holds the
    full result for a future caller while the API payload stays small.
    """
    outcome = final.get("outcome")
    if outcome is None:
        raise RuntimeError("graph finished without an outcome")

    result = final.get("result")
    if result is not None and len(result.rows) > ANSWER_ROW_LIMIT:
        result = result.model_copy(update={"rows": result.rows[:ANSWER_ROW_LIMIT]})

    return AgentAnswer(
        question=question,
        outcome=outcome,
        answer=final.get("answer", ""),
        clarification=final.get("clarification"),
        spec=final.get("spec"),
        result=result,
        repairs=final.get("repairs", 0),
        error=final.get("error"),
        usage=UsageTotals.from_usages(final.get("usages", [])),
        trace=final.get("trace", []),
    )


class Agent:
    """Run one question through the graph and return the final answer."""

    def __init__(self, deps: AgentDeps) -> None:
        self._deps = deps
        self._graph = build_graph(deps)

    async def run(self, question: str) -> AgentAnswer:
        """Answer one question. Expected failures come back as `outcome="failed"`."""
        question = _clean(question)
        final: dict[str, Any] = await self._graph.ainvoke({"question": question})
        return _answer_from_state(question, final)

    async def stream(self, question: str) -> AsyncIterator[AgentEvent]:
        """Answer one question as a sequence of step events, then one answer.

        `updates` supplies the node name and the partial update (for the
        timeline), `values` supplies the accumulated state (for the final
        answer). Asking for both avoids re-implementing LangGraph's reducers.
        """
        question = _clean(question)
        final: dict[str, Any] | None = None

        async for mode, chunk in self._graph.astream(
            {"question": question},
            stream_mode=["updates", "values"],
        ):
            if mode == "updates":
                for node, update in chunk.items():
                    if isinstance(update, dict):
                        yield step_event(node, update)
            elif mode == "values":
                final = chunk

        if final is None:
            raise RuntimeError("graph produced no state")

        yield AnswerEvent(**_answer_from_state(question, final).model_dump())


def _clean(question: str) -> str:
    question = question.strip()
    if not question:
        raise ValueError("question must not be empty")
    return question


__all__ = ["Agent", "StepEvent", "build_graph"]
