"""Hermetic tests for the eval scoring module (6.6).

No Docker, no LLM, no core-api: these pin the golden-file rules and every check
the live harness relies on.
"""

import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from ai_service import evaluation
from ai_service.agent.state import AgentAnswer, UsageTotals
from ai_service.evaluation import (
    CaseResult,
    EvalCase,
    EvalError,
    GoldenSet,
    build_report,
    dumps_report,
    load_golden,
    score_case,
    summarize,
    validate_case_names,
)
from ai_service.spec import OrderBy, QueryResult, QuerySpec, ResultColumn
from tests.fakes import acme_context

TODAY = date(2026, 6, 1)
GOLDEN_PATH = Path(__file__).resolve().parents[1] / "evals" / "golden.json"
USAGE = UsageTotals(
    calls=4,
    prompt_tokens=40,
    completion_tokens=20,
    total_tokens=60,
    cost_usd=0.0004,
)


def _answered_case(**expected: Any) -> EvalCase:
    payload: dict[str, Any] = {
        "outcome": "answered",
        "dataset": "employees",
        "metrics": ["headcount"],
        "dimensions": ["department"],
        "time_grain": None,
        "filters": [],
        "result": {
            "min_rows": 1,
            "includes": [{"department": "Engineering", "headcount": 11}],
        },
    }
    payload.update(expected)
    return EvalCase(
        id="case-1",
        tag="hr",
        question="Headcount by department?",
        expected=payload,
    )


def _simple_case(outcome: str) -> EvalCase:
    return EvalCase(
        id=f"{outcome.replace('_', '-')}-case",
        tag="tricky",
        question="A question?",
        expected={"outcome": outcome},
    )


def _spec(**overrides: Any) -> QuerySpec:
    values: dict[str, Any] = {
        "dataset": "employees",
        "metrics": ["headcount"],
        "dimensions": ["department"],
    }
    values.update(overrides)
    return QuerySpec(**values)


def _result(**overrides: Any) -> QueryResult:
    values: dict[str, Any] = {
        "columns": [
            ResultColumn(name="department", data_type="text"),
            ResultColumn(name="headcount", data_type="bigint"),
        ],
        "rows": [
            {"department": "Engineering", "headcount": "11"},
            {"department": "Sales", "headcount": "8"},
        ],
        "row_count": 2,
        "truncated": False,
        "duration_ms": 7,
    }
    values.update(overrides)
    return QueryResult(**values)


def _answer(**overrides: Any) -> AgentAnswer:
    values: dict[str, Any] = {
        "question": "Headcount by department?",
        "outcome": "answered",
        "answer": "Engineering has the most people.",
        "spec": _spec(),
        "result": _result(),
        "repairs": 0,
        "error": None,
        "usage": USAGE,
        "trace": [],
    }
    values.update(overrides)
    return AgentAnswer(**values)


def _golden(*cases: EvalCase) -> GoldenSet:
    return GoldenSet(version=1, today=TODAY, cases=list(cases))


def test_committed_golden_file_is_valid_and_balanced() -> None:
    golden = load_golden(GOLDEN_PATH)

    assert golden.today == TODAY
    assert len(golden.cases) == 30
    assert Counter(case.tag for case in golden.cases) == {
        "hr": 9,
        "sales": 13,
        "tricky": 8,
    }

    outcomes = Counter(case.expected.outcome for case in golden.cases)
    assert outcomes["answered"] == 26
    assert outcomes["failed"] == 3
    assert outcomes["out_of_scope"] == 1

    for case in golden.cases:
        assert case.question.strip()


def test_load_golden_reports_bad_json(tmp_path: Path) -> None:
    path = tmp_path / "golden.json"
    path.write_text("{", encoding="utf-8")

    with pytest.raises(EvalError, match="not valid JSON"):
        load_golden(path)


def test_golden_set_rejects_duplicate_ids() -> None:
    case = _answered_case()

    with pytest.raises(ValidationError, match="duplicate case ids"):
        _golden(case, case)


def test_answered_case_must_not_look_like_a_failure() -> None:
    with pytest.raises(ValidationError, match="must not declare"):
        EvalCase(
            id="bad-case",
            tag="tricky",
            question="A question?",
            expected={"outcome": "failed", "dataset": "employees"},
        )


def test_result_expectation_rejects_impossible_shapes() -> None:
    with pytest.raises(ValidationError, match="row_count is 0"):
        _answered_case(result={"row_count": 0, "includes": [{"headcount": 1}]})

    with pytest.raises(ValidationError, match="below result.min_rows"):
        _answered_case(result={"row_count": 1, "min_rows": 2})


def test_matching_answer_passes_and_keeps_run_metadata() -> None:
    result = score_case(_answered_case(), _answer(), elapsed_ms=123)

    assert result.passed, result.failures
    assert result.case_id == "case-1"
    assert result.tag == "hr"
    assert result.elapsed_ms == 123
    assert result.duration_ms == 7
    assert result.row_count == 2
    assert result.usage.calls == 4


def test_extra_actual_filters_and_numeric_strings_are_accepted() -> None:
    case = _answered_case(filters=[{"dimension": "hire_date", "operator": "gte"}])
    answer = _answer(
        spec=_spec(
            filters=[
                {"dimension": "hire_date", "operator": "gte", "value": "2024-01-01"},
                {"dimension": "hire_date", "operator": "lte", "value": "2026-01-01"},
            ]
        )
    )

    result = score_case(case, answer)

    assert result.passed, result.failures


def test_missing_expected_filter_fails() -> None:
    case = _answered_case(filters=[{"dimension": "hire_date", "operator": "gte"}])

    result = score_case(case, _answer(spec=_spec(filters=[])))

    assert not result.passed
    assert any("filters: missing hire_date gte" in failure for failure in result.failures)


@pytest.mark.parametrize(
    ("spec_overrides", "fragment"),
    [
        ({"dataset": "departments"}, "dataset:"),
        ({"metrics": ["avg_salary"]}, "metrics:"),
        ({"dimensions": []}, "dimensions:"),
        ({"time_grain": {"dimension": "hire_date", "grain": "year"}}, "timeGrain:"),
    ],
)
def test_shape_mismatches_are_reported(spec_overrides: dict[str, Any], fragment: str) -> None:
    result = score_case(_answered_case(), _answer(spec=_spec(**spec_overrides)))

    assert not result.passed
    assert any(fragment in failure for failure in result.failures)


def test_ranking_checks_order_by_and_limit() -> None:
    case = _answered_case(
        order_by=[{"field": "headcount", "direction": "desc"}],
        limit=5,
    )

    wrong_order = score_case(
        case,
        _answer(spec=_spec(order_by=[OrderBy(field="headcount", direction="asc")])),
    )
    wrong_limit = score_case(
        case,
        _answer(
            spec=_spec(
                order_by=[OrderBy(field="headcount", direction="desc")],
                limit=10,
            )
        ),
    )

    assert any("orderBy:" in failure for failure in wrong_order.failures)
    assert any("limit:" in failure for failure in wrong_limit.failures)


def test_result_checks_rows_and_values() -> None:
    too_few = score_case(_answered_case(result={"min_rows": 3}), _answer())
    wrong_count = score_case(_answered_case(result={"row_count": 3}), _answer())
    wrong_value = score_case(_answered_case(result={"includes": [{"headcount": 12}]}), _answer())

    assert any("at least 3 rows" in failure for failure in too_few.failures)
    assert any("expected 3 rows" in failure for failure in wrong_count.failures)
    assert any("no row matches" in failure for failure in wrong_value.failures)


def test_each_included_row_must_match_a_distinct_row() -> None:
    case = _answered_case(
        result={
            "includes": [
                {"department": "Engineering", "headcount": 11},
                {"department": "Engineering", "headcount": 11},
            ]
        }
    )

    result = score_case(case, _answer())

    assert not result.passed
    assert sum("no row matches" in failure for failure in result.failures) == 1


def test_answered_requires_spec_result_prose_and_no_error() -> None:
    missing_spec = score_case(_answered_case(), _answer(spec=None))
    missing_result = score_case(_answered_case(), _answer(result=None))
    empty_prose = score_case(_answered_case(), _answer(answer="   "))
    unexpected_error = score_case(_answered_case(), _answer(error="boom"))

    assert any("spec: missing" in failure for failure in missing_spec.failures)
    assert any("result: missing" in failure for failure in missing_result.failures)
    assert any("answer: empty" in failure for failure in empty_prose.failures)
    assert any("unexpected error" in failure for failure in unexpected_error.failures)


def test_wrong_outcome_short_circuits_with_the_actual_error() -> None:
    result = score_case(
        _answered_case(),
        _answer(
            outcome="failed",
            spec=None,
            result=None,
            answer="I couldn't answer that.",
            error='Unknown dimension "job_title".',
        ),
    )

    assert len(result.failures) == 1
    assert "outcome: expected answered, got failed" in result.failures[0]
    assert "job_title" in result.failures[0]


def test_out_of_scope_rules() -> None:
    case = _simple_case("out_of_scope")
    good = _answer(
        outcome="out_of_scope",
        spec=None,
        result=None,
        answer="I can only answer questions about the data.",
    )
    with_spec = _answer(
        outcome="out_of_scope",
        result=None,
        answer="I can only answer questions about the data.",
    )

    assert score_case(case, good).passed
    assert any("must not draft" in failure for failure in score_case(case, with_spec).failures)


def test_failed_rules() -> None:
    case = _simple_case("failed")
    good = _answer(
        outcome="failed",
        spec=None,
        result=None,
        answer="I couldn't answer that.",
        error='Unknown metric "profit".',
    )
    no_error = _answer(
        outcome="failed",
        spec=None,
        result=None,
        answer="I couldn't answer that.",
    )
    with_rows = _answer(outcome="failed", answer="I couldn't answer that.", error="boom")

    assert score_case(case, good).passed
    assert any("must carry" in failure for failure in score_case(case, no_error).failures)
    assert any("must not carry rows" in failure for failure in score_case(case, with_rows).failures)


def test_validate_case_names_accepts_a_reachable_shape() -> None:
    case = _answered_case(
        dimensions=[],
        time_grain={"dimension": "hire_date", "grain": "month"},
        filters=[{"dimension": "hire_date"}],
        result={"min_rows": 1},
    )

    issues = validate_case_names(_golden(case), acme_context())

    assert issues == []


def test_validate_case_names_reports_every_unknown_name() -> None:
    case = _answered_case(
        metrics=["profit"],
        dimensions=["job_title"],
        time_grain={"dimension": "department", "grain": "year"},
        filters=[{"dimension": "office"}],
        order_by=[{"field": "salary", "direction": "desc"}],
        result={"min_rows": 1, "includes": [{"salary": 1}]},
    )

    issues = validate_case_names(_golden(case), acme_context())

    joined = "\n".join(issues)
    assert "unknown metric 'profit'" in joined
    assert "unknown dimension 'job_title'" in joined
    assert "not a date" in joined
    assert "unknown filter dimension 'office'" in joined
    assert "orderBy 'salary' is not a result column" in joined
    assert "includes key 'salary' is not a result column" in joined


def test_summarize_and_report_are_json_ready() -> None:
    results = [
        CaseResult(case_id="a", tag="hr", passed=True, usage=USAGE),
        CaseResult(case_id="b", tag="hr", passed=False, failures=["boom"], usage=USAGE),
        CaseResult(case_id="c", tag="sales", passed=True, usage=USAGE),
    ]

    score = summarize(results)
    report = build_report(results, model="openai/gpt-5-mini", today=TODAY)
    payload = json.loads(dumps_report(report))

    assert (score.passed, score.total, score.percent) == (2, 3, 66.7)
    assert score.by_tag["hr"].passed == 1
    assert score.by_tag["sales"].percent == 100.0
    assert payload["model"] == "openai/gpt-5-mini"
    assert payload["today"] == "2026-06-01"
    assert payload["score"] == {
        "passed": 2,
        "total": 3,
        "percent": 66.7,
        "by_tag": {
            "hr": {"passed": 1, "total": 2, "percent": 50.0},
            "sales": {"passed": 1, "total": 1, "percent": 100.0},
        },
    }
    assert payload["usage"]["calls"] == 12
    assert payload["usage"]["cost_usd"] == pytest.approx(0.0012)


def test_evaluation_module_does_not_import_pytest() -> None:
    source = Path(evaluation.__file__).read_text(encoding="utf-8")

    assert "import pytest" not in source
