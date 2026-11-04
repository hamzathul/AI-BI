"""Per-node tests for 6.3a.

Each node gets a fake LLM and/or fake core-api and a hand-built state slice.
Assertions cover both the state update and the prompt that produced it, because
"the model chose a bad dataset" is usually "the prompt hid the good one".
"""

from datetime import date

from ai_service.agent import prompts
from ai_service.agent.nodes import AgentDeps, AgentNodes
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


def _deps(llm: FakeLlm, core_api: FakeCoreApi | None = None) -> AgentDeps:
    return AgentDeps(
        llm=llm,  # type: ignore[arg-type] — duck-typed fake
        core_api=core_api or FakeCoreApi(acme_context()),  # type: ignore[arg-type]
        today=TODAY,
    )


async def test_classify_intent_returns_the_decision_and_usage() -> None:
    llm = FakeLlm(
        {"IntentDecision": [IntentDecision(intent="data_question", reason="asks for headcount")]}
    )
    nodes = AgentNodes(_deps(llm))

    update = await nodes.classify_intent({"question": "How many people work here?"})

    assert update["intent"] == "data_question"
    assert update["trace"] == ["classify_intent"]
    assert len(update["usages"]) == 1
    assert llm.calls[0]["schema"] == "IntentDecision"
    assert llm.calls[0]["user"] == "How many people work here?"
    assert "How many people work here?" not in llm.calls[0]["system"]


async def test_classify_intent_out_of_scope_keeps_the_reason() -> None:
    llm = FakeLlm(
        {"IntentDecision": [IntentDecision(intent="out_of_scope", reason="weather question")]}
    )

    update = await AgentNodes(_deps(llm)).classify_intent({"question": "Will it rain?"})

    assert update["intent"] == "out_of_scope"
    assert update["intent_reason"] == "weather question"


async def test_classify_intent_llm_failure_is_a_safe_failure() -> None:
    llm = FakeLlm({"IntentDecision": [LlmNotConfigured("LLM is not configured — set LLM_API_KEY")]})

    update = await AgentNodes(_deps(llm)).classify_intent({"question": "headcount?"})

    assert update["outcome"] == "failed"
    assert "LLM_API_KEY" in update["error"]
    assert update["trace"] == ["classify_intent"]
    assert "usages" not in update


async def test_select_context_stores_the_context_and_fact_dataset() -> None:
    llm = FakeLlm(
        {"ContextSelection": [ContextSelection(dataset="employees", reason="headcount lives here")]}
    )
    core = FakeCoreApi(acme_context())
    nodes = AgentNodes(_deps(llm, core))

    update = await nodes.select_context({"question": "Headcount by department?"})

    assert update["fact_dataset"] == "employees"
    assert update["context"].model.name == "Acme Inc."
    assert core.context_calls == 1
    prompt = llm.calls[0]["user"]
    for dataset in ("employees", "departments", "orders", "customers", "products"):
        assert dataset in prompt
    assert "Headcount by department?" in prompt


async def test_select_context_rejects_an_invented_dataset() -> None:
    llm = FakeLlm({"ContextSelection": [ContextSelection(dataset="ghosts", reason="made up")]})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.select_context({"question": "Headcount?"})

    assert update["outcome"] == "failed"
    assert 'unknown dataset "ghosts"' in update["error"]
    assert "fact_dataset" not in update
    assert len(update["usages"]) == 1


async def test_select_context_core_api_failure_never_calls_the_llm() -> None:
    llm = FakeLlm({})
    core = FakeCoreApi(CoreApiRejected(404, "No semantic model is saved."))
    nodes = AgentNodes(_deps(llm, core))

    update = await nodes.select_context({"question": "Headcount?"})

    assert update["outcome"] == "failed"
    assert "No semantic model is saved" in update["error"]
    assert update["trace"] == ["select_context"]
    assert llm.calls == []


# --- 6.7: clarification ----------------------------------------------------


async def test_select_context_returns_a_validated_clarification() -> None:
    llm = FakeLlm(
        {
            "ContextSelection": [
                ContextSelection(
                    dataset="orders",
                    reason="revenue lives here",
                    clarification=Clarification(
                        question="Which revenue?",
                        options=["revenue", "gross_revenue", "made_up", "revenue"],
                    ),
                )
            ]
        }
    )
    nodes = AgentNodes(_deps(llm))

    update = await nodes.select_context({"question": "What was our revenue?"})

    assert update["outcome"] == "needs_clarification"
    assert update["fact_dataset"] == "orders"
    assert update["clarification"].options == ["revenue", "gross_revenue"]
    assert update["clarification"].question == "Which revenue?"
    assert "spec" not in update
    assert len(update["usages"]) == 1


async def test_select_context_drops_an_under_specified_clarification() -> None:
    llm = FakeLlm(
        {
            "ContextSelection": [
                ContextSelection(
                    dataset="orders",
                    reason="revenue",
                    clarification=Clarification(
                        question="Which revenue?", options=["revenue", "made_up"]
                    ),
                )
            ]
        }
    )

    update = await AgentNodes(_deps(llm)).select_context({"question": "Revenue?"})

    assert "clarification" not in update
    assert "outcome" not in update
    assert update["fact_dataset"] == "orders"


async def test_select_context_ignores_options_outside_the_fact_neighbourhood() -> None:
    llm = FakeLlm(
        {
            "ContextSelection": [
                ContextSelection(
                    dataset="employees",
                    reason="headcount",
                    clarification=Clarification(
                        question="Which one?",
                        options=["avg_salary", "revenue"],
                    ),
                )
            ]
        }
    )

    update = await AgentNodes(_deps(llm)).select_context({"question": "How are we doing?"})

    # `revenue` belongs to `orders`, which `employees` cannot reach, so only one
    # real option remains and the agent answers normally instead of asking.
    assert "clarification" not in update
    assert update["fact_dataset"] == "employees"


async def test_compose_answer_returns_the_clarification_without_an_llm_call() -> None:
    llm = FakeLlm({})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.compose_answer(
        {
            "question": "What was our revenue?",
            "context": acme_context(),
            "fact_dataset": "orders",
            "clarification": Clarification(
                question="Which revenue?", options=["revenue", "gross_revenue"]
            ),
            "outcome": "needs_clarification",
        }
    )

    assert update["outcome"] == "needs_clarification"
    assert update["answer"].startswith("Which revenue?")
    assert "- revenue — Non-cancelled revenue." in update["answer"]
    assert "- gross_revenue — Revenue including cancelled orders." in update["answer"]
    assert llm.calls == []


async def test_draft_spec_returns_a_query_spec_prompted_with_the_narrow_model() -> None:
    spec = QuerySpec(
        dataset="employees",
        metrics=["headcount"],
        dimensions=["department"],
        order_by=[OrderBy(field="headcount", direction="desc")],
    )
    llm = FakeLlm({"QuerySpec": [spec]})
    nodes = AgentNodes(_deps(llm))

    state = {
        "question": "Headcount by department?",
        "context": acme_context(),
        "fact_dataset": "employees",
    }
    update = await nodes.draft_spec(state)  # type: ignore[arg-type]

    assert update["spec"] == spec
    assert "outcome" not in update
    assert len(update["usages"]) == 1
    prompt = llm.calls[0]["user"]
    assert "Today is 2026-10-31 (UTC)." in prompt
    assert "department (text, text)" in prompt
    assert "product_category" not in prompt
    assert "Headcount by department?" in prompt


async def test_draft_spec_sets_the_dataset_when_the_model_omits_it() -> None:
    llm = FakeLlm({"QuerySpec": [QuerySpec(metrics=["headcount"])]})
    nodes = AgentNodes(_deps(llm))

    state = {
        "question": "How many people work here?",
        "context": acme_context(),
        "fact_dataset": "employees",
    }
    update = await nodes.draft_spec(state)  # type: ignore[arg-type]

    assert update["spec"].dataset == "employees"


async def test_draft_spec_llm_failure_is_a_safe_failure() -> None:
    llm = FakeLlm({"QuerySpec": [LlmBadOutput("model output did not match QuerySpec")]})
    nodes = AgentNodes(_deps(llm))

    state = {
        "question": "Headcount?",
        "context": acme_context(),
        "fact_dataset": "employees",
    }
    update = await nodes.draft_spec(state)  # type: ignore[arg-type]

    assert update["outcome"] == "failed"
    assert "QuerySpec" in update["error"]
    assert update["trace"] == ["draft_spec"]


# --- 6.3b: execution, repair, prose ---------------------------------------


def _spec(
    metrics: list[str] | None = None,
    dimensions: list[str] | None = None,
) -> QuerySpec:
    return QuerySpec(
        dataset="employees",
        metrics=metrics or ["headcount"],
        dimensions=dimensions or ["department"],
    )


async def test_validate_spec_executes_and_keeps_the_result() -> None:
    spec = _spec()
    core = FakeCoreApi(acme_context(), [headcount_result()])
    nodes = AgentNodes(_deps(FakeLlm({}), core))

    update = await nodes.validate_spec({"question": "Headcount?", "spec": spec})

    assert update["result"].row_count == 2
    assert update["validation_error"] is None
    assert update["trace"] == ["validate_spec"]
    assert core.executed == [spec]


async def test_validate_spec_records_a_rejection_for_the_repair_round() -> None:
    core = FakeCoreApi(
        acme_context(),
        [CoreApiRejected(400, 'Unknown metric "headcounts".')],
    )
    nodes = AgentNodes(_deps(FakeLlm({}), core))

    update = await nodes.validate_spec({"question": "Headcount?", "spec": _spec()})

    assert update["validation_error"] == 'Unknown metric "headcounts".'
    assert "outcome" not in update
    assert update["trace"] == ["validate_spec"]


async def test_validate_spec_infrastructure_failure_is_not_repairable() -> None:
    core = FakeCoreApi(acme_context(), [CoreApiUnavailable("core-api is unreachable")])
    nodes = AgentNodes(_deps(FakeLlm({}), core))

    update = await nodes.validate_spec({"question": "Headcount?", "spec": _spec()})

    assert update["outcome"] == "failed"
    assert "validation_error" not in update


async def test_repair_spec_returns_a_new_spec_and_marks_the_round() -> None:
    failed = QuerySpec(dataset="employees", metrics=["headcounts"])
    repaired = _spec()
    llm = FakeLlm({"QuerySpec": [repaired]})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.repair_spec(
        {
            "question": "Headcount by department?",
            "context": acme_context(),
            "fact_dataset": "employees",
            "spec": failed,
            "validation_error": 'Unknown metric "headcounts".',
        }
    )

    assert update["spec"] == repaired
    assert update["repairs"] == 1
    assert update["validation_error"] is None
    assert update["trace"] == ["repair_spec"]
    prompt = llm.calls[0]["user"]
    assert 'Unknown metric "headcounts".' in prompt
    assert '"headcounts"' in prompt
    assert "Headcount by department?" in prompt
    assert "product_category" not in prompt


async def test_repair_spec_fails_when_the_model_repeats_itself() -> None:
    failed = QuerySpec(dataset="employees", metrics=["headcounts"])
    llm = FakeLlm({"QuerySpec": [failed]})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.repair_spec(
        {
            "question": "Headcount?",
            "context": acme_context(),
            "fact_dataset": "employees",
            "spec": failed,
            "validation_error": 'Unknown metric "headcounts".',
        }
    )

    assert update["outcome"] == "failed"
    assert "same spec" in update["error"]
    assert "spec" not in update
    assert "repairs" not in update


async def test_repair_spec_llm_failure_is_a_safe_failure() -> None:
    llm = FakeLlm({"QuerySpec": [LlmBadOutput("model output did not match QuerySpec")]})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.repair_spec(
        {
            "question": "Headcount?",
            "context": acme_context(),
            "fact_dataset": "employees",
            "spec": _spec(),
            "validation_error": "rejected",
        }
    )

    assert update["outcome"] == "failed"
    assert update["trace"] == ["repair_spec"]


async def test_compose_answer_is_deterministic_for_an_empty_result() -> None:
    empty = QueryResult(
        columns=[ResultColumn(name="headcount", data_type="bigint")],
        rows=[],
        row_count=0,
        truncated=False,
        duration_ms=1,
    )
    llm = FakeLlm({})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.compose_answer(
        {"question": "Headcount?", "result": empty, "fact_dataset": "employees"}
    )

    assert update["answer"] == prompts.EMPTY_RESULT_ANSWER
    assert update["outcome"] == "answered"
    assert llm.calls == []


async def test_compose_answer_writes_prose_over_the_rows() -> None:
    llm = FakeLlm(
        {"AnswerProse": [AnswerProse(answer="Engineering has the most people, with 11.")]}
    )
    nodes = AgentNodes(_deps(llm))

    update = await nodes.compose_answer(
        {
            "question": "Headcount by department?",
            "result": headcount_result(),
            "fact_dataset": "employees",
        }
    )

    assert update["answer"] == "Engineering has the most people, with 11."
    assert update["outcome"] == "answered"
    assert len(update["usages"]) == 1
    prompt = llm.calls[0]["user"]
    assert "Headcount by department?" in prompt
    assert "Engineering" in prompt
    assert "Result: 2 row(s)" in prompt


async def test_compose_answer_prompt_caps_rows_at_twenty() -> None:
    many = QueryResult(
        columns=[ResultColumn(name="i", data_type="integer")],
        rows=[{"i": index} for index in range(50)],
        row_count=50,
        truncated=False,
        duration_ms=1,
    )
    llm = FakeLlm({"AnswerProse": [AnswerProse(answer="Fifty rows.")]})
    nodes = AgentNodes(_deps(llm))

    await nodes.compose_answer({"question": "Rows?", "result": many, "fact_dataset": "employees"})

    prompt = llm.calls[0]["user"]
    assert prompt.count('"i":') == 20
    assert "Rows shown (20 of 50)" in prompt


async def test_compose_answer_prompt_truncates_long_cells() -> None:
    long_text = "x" * 300
    result = QueryResult(
        columns=[ResultColumn(name="note", data_type="text")],
        rows=[{"note": long_text}],
        row_count=1,
        truncated=False,
        duration_ms=1,
    )
    llm = FakeLlm({"AnswerProse": [AnswerProse(answer="One note.")]})
    nodes = AgentNodes(_deps(llm))

    await nodes.compose_answer({"question": "Notes?", "result": result})

    prompt = llm.calls[0]["user"]
    assert "x" * 120 in prompt
    assert "x" * 121 not in prompt


async def test_compose_answer_falls_back_when_the_prose_call_fails() -> None:
    llm = FakeLlm({"AnswerProse": [LlmUnavailable("provider is down")]})
    nodes = AgentNodes(_deps(llm))

    update = await nodes.compose_answer({"question": "Headcount?", "result": headcount_result()})

    assert update["answer"] == prompts.FALLBACK_ANSWER
    assert update["outcome"] == "answered"
    assert "usages" not in update


async def test_compose_answer_without_a_result_fails_instead_of_guessing() -> None:
    nodes = AgentNodes(_deps(FakeLlm({})))

    update = await nodes.compose_answer({"question": "Headcount?"})

    assert update["outcome"] == "failed"
    assert "result" in update["error"]
