"""Whole-graph tests for 6.3, with no network and no Docker.

These pin routing, the one-repair loop, the append-only trace, the row cap, and
the safe-failure boundary.
"""

from datetime import date

import pytest

from ai_service.agent import Agent, AgentDeps, prompts
from ai_service.agent.state import (
    AnswerProse,
    Clarification,
    ContextSelection,
    IntentDecision,
)
from ai_service.core_api import CoreApiRejected, CoreApiUnavailable
from ai_service.llm import LlmBadOutput, LlmNotConfigured, LlmUnavailable
from ai_service.spec import OrderBy, QueryResult, QuerySpec, ResultColumn
from tests.fakes import FakeCoreApi, FakeLlm, acme_context, headcount_result

TODAY = date(2026, 10, 31)


def _agent(llm: FakeLlm, core: FakeCoreApi | None = None) -> Agent:
    deps = AgentDeps(
        llm=llm,  # type: ignore[arg-type] — duck-typed fake
        core_api=core or FakeCoreApi(acme_context()),  # type: ignore[arg-type]
        today=TODAY,
    )
    return Agent(deps)


def _context_selection(dataset: str = "employees") -> ContextSelection:
    return ContextSelection(dataset=dataset, reason="fact dataset")


def _draft(**overrides: object) -> QuerySpec:
    values: dict[str, object] = {
        "dataset": "employees",
        "metrics": ["headcount"],
        "dimensions": ["department"],
        "order_by": [OrderBy(field="headcount", direction="desc")],
    }
    values.update(overrides)
    return QuerySpec(**values)


async def test_happy_path_executes_and_answers_with_four_llm_calls() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="asks for headcount")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [_draft()],
            "AnswerProse": [AnswerProse(answer="Engineering has the most people.")],
        }
    )
    core = FakeCoreApi(acme_context(), [headcount_result()])

    answer = await _agent(llm, core).run("How many people work in each department?")

    assert answer.outcome == "answered"
    assert answer.answer == "Engineering has the most people."
    assert answer.spec is not None
    assert answer.spec.metrics == ["headcount"]
    assert answer.spec.dataset == "employees"
    assert answer.result is not None and answer.result.row_count == 2
    assert answer.repairs == 0
    assert answer.trace == [
        "classify_intent",
        "select_context",
        "draft_spec",
        "validate_spec",
        "compose_answer",
    ]
    assert answer.usage.calls == 4
    assert (answer.usage.prompt_tokens, answer.usage.completion_tokens) == (40, 20)
    assert answer.usage.cost_usd == pytest.approx(0.0004)
    assert len(core.executed) == 1
    assert core.executed[0].metrics == ["headcount"]
    assert [call["schema"] for call in llm.calls] == [
        "IntentDecision",
        "ContextSelection",
        "QuerySpec",
        "AnswerProse",
    ]


async def test_an_ambiguous_question_asks_instead_of_querying() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="asks for revenue")],
            "ContextSelection": [
                ContextSelection(
                    dataset="orders",
                    reason="revenue lives here",
                    clarification=Clarification(
                        question="Which revenue should I use?",
                        options=["revenue", "gross_revenue"],
                    ),
                )
            ],
        }
    )
    core = FakeCoreApi(acme_context())

    answer = await _agent(llm, core).run("What was our revenue?")

    assert answer.outcome == "needs_clarification"
    assert answer.spec is None
    assert answer.result is None
    assert answer.clarification is not None
    assert answer.clarification.options == ["revenue", "gross_revenue"]
    assert "Which revenue should I use?" in answer.answer
    assert core.executed == []
    assert answer.trace == ["classify_intent", "select_context", "compose_answer"]
    assert [call["schema"] for call in llm.calls] == ["IntentDecision", "ContextSelection"]
    assert answer.usage.calls == 2


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
            "ContextSelection": [_context_selection("ghosts")],
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
            "ContextSelection": [_context_selection()],
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


async def test_one_rejection_is_repaired_and_then_answered() -> None:
    rejected = _draft(metrics=["headcounts"])
    repaired = _draft()
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [rejected, repaired],
            "AnswerProse": [AnswerProse(answer="Engineering leads.")],
        }
    )
    core = FakeCoreApi(
        acme_context(),
        [CoreApiRejected(400, 'Unknown metric "headcounts".'), headcount_result()],
    )

    answer = await _agent(llm, core).run("Headcount by department?")

    assert answer.outcome == "answered"
    assert answer.repairs == 1
    assert answer.answer == "Engineering leads."
    assert len(core.executed) == 2
    assert core.executed[1].metrics == ["headcount"]
    assert answer.trace == [
        "classify_intent",
        "select_context",
        "draft_spec",
        "validate_spec",
        "repair_spec",
        "validate_spec",
        "compose_answer",
    ]
    assert answer.usage.calls == 5
    repair_prompt = llm.calls[3]["user"]
    assert 'Unknown metric "headcounts".' in repair_prompt


async def test_two_rejections_stop_after_one_repair() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [
                _draft(metrics=["headcounts"]),
                _draft(metrics=["headcount_typo"]),
            ],
        }
    )
    core = FakeCoreApi(
        acme_context(),
        [
            CoreApiRejected(400, 'Unknown metric "headcounts".'),
            CoreApiRejected(400, 'Unknown metric "headcount_typo".'),
        ],
    )

    answer = await _agent(llm, core).run("Headcount by department?")

    assert answer.outcome == "failed"
    assert answer.answer == prompts.FAILED_ANSWER
    assert answer.repairs == 1
    assert len(core.executed) == 2
    assert answer.result is None
    assert answer.error is not None
    assert 'Unknown metric "headcount_typo".' in answer.error
    assert answer.trace[-1] == "compose_answer"
    assert answer.trace.count("validate_spec") == 2
    assert [call["schema"] for call in llm.calls].count("QuerySpec") == 2


async def test_core_api_outage_is_not_repaired() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [_draft()],
        }
    )
    core = FakeCoreApi(acme_context(), [CoreApiUnavailable("core-api is unreachable")])

    answer = await _agent(llm, core).run("Headcount by department?")

    assert answer.outcome == "failed"
    assert answer.repairs == 0
    assert len(core.executed) == 1
    assert "repair_spec" not in answer.trace
    assert [call["schema"] for call in llm.calls].count("QuerySpec") == 1


async def test_a_failed_prose_call_still_returns_the_rows() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [_draft()],
            "AnswerProse": [LlmUnavailable("provider is down")],
        }
    )
    core = FakeCoreApi(acme_context(), [headcount_result()])

    answer = await _agent(llm, core).run("Headcount by department?")

    assert answer.outcome == "answered"
    assert answer.answer == prompts.FALLBACK_ANSWER
    assert answer.result is not None and answer.result.row_count == 2
    assert answer.usage.calls == 3


async def test_an_empty_result_gets_a_sentence_without_another_llm_call() -> None:
    empty = QueryResult(
        columns=[ResultColumn(name="department", data_type="text")],
        rows=[],
        row_count=0,
        truncated=False,
        duration_ms=3,
    )
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [_draft()],
        }
    )
    core = FakeCoreApi(acme_context(), [empty])

    answer = await _agent(llm, core).run("Headcount in a department with no people?")

    assert answer.outcome == "answered"
    assert answer.answer == prompts.EMPTY_RESULT_ANSWER
    assert answer.result is not None and answer.result.row_count == 0
    assert len(llm.calls) == 3


async def test_answer_payload_caps_rows_but_keeps_the_true_count() -> None:
    many = QueryResult(
        columns=[ResultColumn(name="i", data_type="integer")],
        rows=[{"i": index} for index in range(150)],
        row_count=150,
        truncated=False,
        duration_ms=5,
    )
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [_context_selection()],
            "QuerySpec": [_draft()],
            "AnswerProse": [AnswerProse(answer="Many rows.")],
        }
    )
    core = FakeCoreApi(acme_context(), [many])

    answer = await _agent(llm, core).run("All rows?")

    assert answer.result is not None
    assert len(answer.result.rows) == 100
    assert answer.result.row_count == 150


async def test_an_empty_question_is_rejected_before_the_graph_runs() -> None:
    agent = _agent(FakeLlm({}))

    with pytest.raises(ValueError, match="must not be empty"):
        await agent.run("   ")
