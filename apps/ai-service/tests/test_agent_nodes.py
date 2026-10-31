"""Per-node tests for 6.3a.

Each node gets a fake LLM and/or fake core-api and a hand-built state slice.
Assertions cover both the state update and the prompt that produced it, because
"the model chose a bad dataset" is usually "the prompt hid the good one".
"""

from datetime import date

from ai_service.agent.nodes import AgentDeps, AgentNodes
from ai_service.agent.state import ContextSelection, IntentDecision
from ai_service.core_api import CoreApiRejected
from ai_service.llm import LlmBadOutput, LlmNotConfigured
from ai_service.spec import OrderBy, QuerySpec
from tests.fakes import FakeCoreApi, FakeLlm, acme_context

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
    assert update["outcome"] == "planned"
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
