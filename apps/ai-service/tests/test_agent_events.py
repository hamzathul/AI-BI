"""Tests for the SSE event contract (6.4a)."""

import json

from ai_service.agent.events import (
    AnswerEvent,
    StepEvent,
    sse_frame,
    step_detail,
    step_event,
    step_status,
)
from ai_service.spec import QueryResult, QuerySpec, ResultColumn
from tests.fakes import acme_context, headcount_result


def test_step_status_marks_failures_and_the_retry_round() -> None:
    assert step_status("draft_spec", {"spec": object()}) == "done"
    assert step_status("repair_spec", {"spec": object()}) == "retry"
    assert step_status("validate_spec", {"outcome": "failed"}) == "error"


def test_step_detail_is_a_whitelist_not_a_state_dump() -> None:
    event = step_event(
        "select_context",
        {"context": acme_context(), "fact_dataset": "employees"},
    )

    assert event.detail == {"dataset": "employees"}
    assert "context" not in event.model_dump()


def test_validate_detail_reports_rows_or_the_compiler_message() -> None:
    success = step_detail("validate_spec", {"result": headcount_result()})
    failure = step_detail("validate_spec", {"validation_error": 'Unknown metric "x".'})

    assert success == {"rowCount": 2, "durationMs": 7}
    assert failure == {"message": 'Unknown metric "x".'}


def test_validate_detail_trims_long_messages() -> None:
    detail = step_detail("validate_spec", {"validation_error": "x" * 500})

    assert len(detail["message"]) == 200


def test_draft_detail_lists_only_names() -> None:
    spec = QuerySpec(dataset="employees", metrics=["headcount"], dimensions=["department"])

    assert step_detail("draft_spec", {"spec": spec}) == {
        "metrics": ["headcount"],
        "dimensions": ["department"],
    }


def test_sse_frame_is_one_data_line() -> None:
    frame = sse_frame(StepEvent(step="classify_intent", detail={"intent": "data_question"}))

    assert frame.startswith("data: {")
    assert frame.endswith("\n\n")
    assert frame.count("\n") == 2
    assert json.loads(frame[len("data: ") :]) == {
        "type": "step",
        "step": "classify_intent",
        "status": "done",
        "detail": {"intent": "data_question"},
    }


def test_sse_frame_escapes_newlines_in_answers() -> None:
    frame = sse_frame(AnswerEvent(question="q", outcome="answered", answer="first\nsecond"))

    # A raw newline would split the SSE frame; the JSON encoder must escape it.
    assert frame.count("\n") == 2
    payload = json.loads(frame[len("data: ") :].strip())
    assert payload["answer"] == "first\nsecond"


def test_answer_frame_uses_camel_case_aliases() -> None:
    result = QueryResult(
        columns=[ResultColumn(name="count", data_type="bigint")],
        rows=[{"count": 1}],
        row_count=1,
        truncated=False,
        duration_ms=2,
    )
    frame = sse_frame(AnswerEvent(question="q", outcome="answered", result=result, repairs=0))

    payload = json.loads(frame[len("data: ") :].strip())

    assert payload["type"] == "answer"
    assert payload["result"]["rowCount"] == 1
    assert payload["result"]["durationMs"] == 2
    assert "error" not in payload  # exclude_none keeps frames small
