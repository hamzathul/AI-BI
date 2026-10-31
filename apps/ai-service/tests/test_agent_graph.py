"""Whole-graph tests for 6.3a, with no network and no Docker.

These are the tests that will keep passing when 6.3b adds execution and repair:
they pin routing, the append-only trace, and the safe-failure boundary.
"""

from datetime import date

import pytest

from ai_service.agent import Agent, AgentDeps, prompts
from ai_service.agent.state import ContextSelection, IntentDecision
from ai_service.llm import LlmBadOutput, LlmNotConfigured
from ai_service.spec import OrderBy, QuerySpec
from tests.fakes import FakeCoreApi, FakeLlm, acme_context

TODAY = date(2026, 10, 31)


def _agent(llm: FakeLlm, core: FakeCoreApi | None = None) -> Agent:
    deps = AgentDeps(
        llm=llm,  # type: ignore[arg-type] — duck-typed fake
        core_api=core or FakeCoreApi(acme_context()),  # type: ignore[arg-type]
        today=TODAY,
    )
    return Agent(deps)


async def test_happy_path_drafts_a_spec_with_three_llm_calls() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="asks for headcount")],
            "ContextSelection": [
                ContextSelection(dataset="employees", reason="headcount lives here")
            ],
            "QuerySpec": [
                QuerySpec(
                    dataset="employees",
                    metrics=["headcount"],
                    dimensions=["department"],
                    order_by=[OrderBy(field="headcount", direction="desc")],
                )
            ],
        }
    )
    core = FakeCoreApi(acme_context())

    answer = await _agent(llm, core).run("How many people work in each department?")

    assert answer.outcome == "planned"
    assert answer.spec is not None
    assert answer.spec.metrics == ["headcount"]
    assert answer.spec.dataset == "employees"
    assert answer.trace == ["classify_intent", "select_context", "draft_spec"]
    assert answer.usage.calls == 3
    assert (answer.usage.prompt_tokens, answer.usage.completion_tokens) == (30, 15)
    assert answer.usage.cost_usd == pytest.approx(0.0003)
    assert core.context_calls == 1
    assert core.executed == []  # 6.3a stops before execution
    assert [call["schema"] for call in llm.calls] == [
        "IntentDecision",
        "ContextSelection",
        "QuerySpec",
    ]


async def test_out_of_scope_short_circuits_before_context() -> None:
    llm = FakeLlm({"IntentDecision": [IntentDecision(intent="out_of_scope", reason="small talk")]})
    core = FakeCoreApi(acme_context())

    answer = await _agent(llm, core).run("Tell me a joke about cats")

    assert answer.outcome == "out_of_scope"
    assert answer.answer == prompts.OUT_OF_SCOPE_ANSWER
    assert answer.trace == ["classify_intent", "compose_answer"]
    assert answer.spec is None
    assert core.context_calls == 0
    assert len(llm.calls) == 1


async def test_missing_llm_configuration_fails_cleanly() -> None:
    llm = FakeLlm({"IntentDecision": [LlmNotConfigured("LLM is not configured — set LLM_API_KEY")]})

    answer = await _agent(llm).run("How many people work here?")

    assert answer.outcome == "failed"
    assert answer.answer == prompts.FAILED_ANSWER
    assert answer.error is not None and "LLM_API_KEY" in answer.error
    assert answer.trace == ["classify_intent", "compose_answer"]


async def test_an_invented_dataset_fails_without_drafting() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [ContextSelection(dataset="ghosts", reason="made up")],
        }
    )
    core = FakeCoreApi(acme_context())

    answer = await _agent(llm, core).run("Headcount by department?")

    assert answer.outcome == "failed"
    assert answer.answer == prompts.FAILED_ANSWER
    assert answer.error is not None and "ghosts" in answer.error
    assert answer.trace == ["classify_intent", "select_context", "compose_answer"]
    assert [call["schema"] for call in llm.calls] == ["IntentDecision", "ContextSelection"]
    assert core.context_calls == 1


async def test_a_bad_spec_fails_without_executing() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [ContextSelection(dataset="employees", reason="fact")],
            "QuerySpec": [LlmBadOutput("model output did not match QuerySpec")],
        }
    )
    core = FakeCoreApi(acme_context())

    answer = await _agent(llm, core).run("Headcount by department?")

    assert answer.outcome == "failed"
    assert answer.error is not None and "QuerySpec" in answer.error
    assert answer.trace == [
        "classify_intent",
        "select_context",
        "draft_spec",
        "compose_answer",
    ]
    assert core.executed == []


async def test_an_empty_question_is_rejected_before_the_graph_runs() -> None:
    agent = _agent(FakeLlm({}))

    with pytest.raises(ValueError, match="must not be empty"):
        await agent.run("   ")
