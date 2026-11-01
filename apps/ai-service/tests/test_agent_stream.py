"""Streaming tests for `Agent.stream()` (6.4a).

The important property: `stream()` and `run()` are two views of the same run.
They share `_answer_from_state`, and this test pins that the payloads match.
"""

from datetime import date

from ai_service.agent import Agent, AgentDeps
from ai_service.agent.events import AnswerEvent, StepEvent
from ai_service.agent.state import AnswerProse, ContextSelection, IntentDecision
from ai_service.core_api import CoreApiRejected
from ai_service.llm import LlmNotConfigured
from ai_service.spec import QuerySpec
from tests.fakes import FakeCoreApi, FakeLlm, acme_context, headcount_result

TODAY = date(2026, 10, 31)
QUESTION = "How many people work in each department?"


def _llm() -> FakeLlm:
    return FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [ContextSelection(dataset="employees", reason="fact dataset")],
            "QuerySpec": [
                QuerySpec(
                    dataset="employees",
                    metrics=["headcount"],
                    dimensions=["department"],
                )
            ],
            "AnswerProse": [AnswerProse(answer="Engineering has the most people.")],
        }
    )


def _core() -> FakeCoreApi:
    return FakeCoreApi(acme_context(), [headcount_result()])


def _agent(llm: FakeLlm | None = None, core: FakeCoreApi | None = None) -> Agent:
    return Agent(
        AgentDeps(
            llm=llm or _llm(),  # type: ignore[arg-type]
            core_api=core or _core(),  # type: ignore[arg-type]
            today=TODAY,
        )
    )


async def test_stream_yields_steps_then_the_same_answer_as_run() -> None:
    expected = await _agent().run(QUESTION)
    events = [event async for event in _agent().stream(QUESTION)]

    steps = [event for event in events if isinstance(event, StepEvent)]
    final = events[-1]

    assert isinstance(final, AnswerEvent)
    assert [step.step for step in steps] == expected.trace
    assert all(step.status == "done" for step in steps)
    assert final.model_dump(exclude={"type"}) == expected.model_dump()


async def test_stream_marks_a_failed_node_as_an_error_step() -> None:
    llm = FakeLlm({"IntentDecision": [LlmNotConfigured("LLM is not configured — set LLM_API_KEY")]})
    events = [event async for event in _agent(llm).stream(QUESTION)]

    steps = [event for event in events if isinstance(event, StepEvent)]
    final = events[-1]

    assert steps[0].step == "classify_intent"
    assert steps[0].status == "error"
    assert isinstance(final, AnswerEvent)
    assert final.outcome == "failed"


async def test_stream_marks_the_repair_round_as_retry() -> None:
    llm = FakeLlm(
        {
            "IntentDecision": [IntentDecision(intent="data_question", reason="data")],
            "ContextSelection": [ContextSelection(dataset="employees", reason="fact dataset")],
            "QuerySpec": [
                QuerySpec(dataset="employees", metrics=["headcounts"]),
                QuerySpec(dataset="employees", metrics=["headcount"]),
            ],
            "AnswerProse": [AnswerProse(answer="Engineering leads.")],
        }
    )
    core = FakeCoreApi(
        acme_context(),
        [CoreApiRejected(400, "Unknown metric"), headcount_result()],
    )

    events = [event async for event in _agent(llm, core).stream(QUESTION)]
    steps = [event for event in events if isinstance(event, StepEvent)]

    assert [step.step for step in steps] == [
        "classify_intent",
        "select_context",
        "draft_spec",
        "validate_spec",
        "repair_spec",
        "validate_spec",
        "compose_answer",
    ]
    assert steps[4].status == "retry"
    assert events[-1].repairs == 1


async def test_stream_rejects_an_empty_question_before_the_graph_runs() -> None:
    agent = _agent()

    try:
        [event async for event in agent.stream("   ")]
    except ValueError as exc:
        assert "must not be empty" in str(exc)
    else:  # pragma: no cover - the raise is the assertion
        raise AssertionError("expected ValueError")
