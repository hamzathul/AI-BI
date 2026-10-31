"""The LangGraph graph that answers one question (6.3).

    START -> classify_intent -> [out_of_scope] -> compose_answer -> END
                             -> select_context -> draft_spec -> END (6.3a)

Every node is async because both external calls (LLM and core-api) are async.
The graph is compiled per `Agent`; compilation is cheap and holds no state.
6.3b adds `validate_spec`, the one-shot `repair_spec` loop, and the success
branch of `compose_answer`.
"""

from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ai_service.agent.nodes import AgentDeps, AgentNodes
from ai_service.agent.state import AgentAnswer, AgentState, UsageTotals


def build_graph(deps: AgentDeps) -> CompiledStateGraph:
    """Wire the nodes and conditional edges around one dependency bundle."""
    nodes = AgentNodes(deps)

    builder = StateGraph(AgentState)
    builder.add_node("classify_intent", nodes.classify_intent)
    builder.add_node("select_context", nodes.select_context)
    builder.add_node("draft_spec", nodes.draft_spec)
    builder.add_node("compose_answer", nodes.compose_answer)

    builder.add_edge(START, "classify_intent")
    builder.add_conditional_edges("classify_intent", _after_classify)
    builder.add_conditional_edges("select_context", _after_select)
    builder.add_conditional_edges("draft_spec", _after_draft)
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
    return "compose_answer" if state.get("outcome") == "failed" else "draft_spec"


def _after_draft(state: AgentState) -> str:
    # 6.3b routes a drafted spec to validate_spec instead of ending here.
    return "compose_answer" if state.get("outcome") == "failed" else END


class Agent:
    """Run one question through the graph and return the final answer."""

    def __init__(self, deps: AgentDeps) -> None:
        self._deps = deps
        self._graph = build_graph(deps)

    async def run(self, question: str) -> AgentAnswer:
        """Answer one question. Expected failures come back as `outcome="failed"`."""
        question = question.strip()
        if not question:
            raise ValueError("question must not be empty")

        final: dict[str, Any] = await self._graph.ainvoke({"question": question})

        outcome = final.get("outcome")
        if outcome is None:
            raise RuntimeError("graph finished without an outcome")

        return AgentAnswer(
            question=question,
            outcome=outcome,
            answer=final.get("answer", ""),
            spec=final.get("spec"),
            result=final.get("result"),
            repairs=final.get("repairs", 0),
            error=final.get("error"),
            usage=UsageTotals.from_usages(final.get("usages", [])),
            trace=final.get("trace", []),
        )
