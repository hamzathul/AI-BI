"""Golden-set evaluation for the agent (6.6).

Unit tests prove the code works; evals measure whether the *agent* still makes
good choices. One golden case is one real question plus the query shape we
expect: dataset, metrics, dimensions, time grain, filters, and a few result
checks. `score_case` compares an `AgentAnswer` with that expectation and returns
a value, never an exception, so a run can report every case.

The module is pure on purpose: no network, no pytest, no file writes beyond
loading JSON. The live harness lives in `evals/`, and `tests/test_evaluation.py`
exercises this module without Docker or an LLM.
"""

import json
from collections.abc import Iterable
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from ai_service.agent.prompts import reachable_datasets
from ai_service.agent.state import AgentAnswer, Outcome, UsageTotals
from ai_service.core_api import ContextDimension, ModelContext
from ai_service.spec import FilterOperator, FilterValue, OrderBy, TimeGrainSpec

DATE_FAMILIES = {"date", "timestamp", "timestamptz"}
"""Dimension families that can carry a time grain (mirrors the compiler)."""


class EvalError(ValueError):
    """The golden set or a report could not be read."""


class StrictModel(BaseModel):
    """Reject unknown keys: a typo in the golden file must fail loudly."""

    model_config = ConfigDict(extra="forbid")


class FilterExpectation(StrictModel):
    """A filter the agent must include.

    `operator` and `value` are optional. Omitting them checks only that the
    dimension is filtered, which tolerates a valid `between` instead of `gte`.
    """

    dimension: str = Field(min_length=1, max_length=64)
    operator: FilterOperator | None = None
    value: FilterValue | None = None

    def describe(self) -> str:
        operator = f" {self.operator}" if self.operator else ""
        value = f" {self.value!r}" if self.value is not None else ""
        return f"{self.dimension}{operator}{value}"


class ResultExpectation(StrictModel):
    """What the executed result must contain.

    `includes` is checked against the answer preview (at most 100 rows, D62).
    Each expected row must match a distinct returned row.
    """

    min_rows: int | None = Field(default=None, ge=0)
    row_count: int | None = Field(default=None, ge=0)
    includes: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate(self) -> ResultExpectation:
        for row in self.includes:
            if not row:
                raise ValueError("result.includes entries must not be empty")
        if self.row_count == 0 and self.includes:
            raise ValueError("result.row_count is 0 but result.includes is not empty")
        return self


class Expected(StrictModel):
    """The declared expectation for one question.

    Answered cases must describe a full query shape. Failed and out-of-scope
    cases must not declare one: the outcome is the whole expectation.
    """

    outcome: Outcome
    dataset: str | None = None
    metrics: list[str] | None = None
    dimensions: list[str] | None = None
    time_grain: TimeGrainSpec | None = None
    filters: list[FilterExpectation] | None = None
    order_by: list[OrderBy] | None = None
    limit: int | None = Field(default=None, ge=1, le=10_000)
    result: ResultExpectation | None = None

    @model_validator(mode="after")
    def _validate_shape(self) -> Expected:
        if self.outcome == "answered":
            missing: list[str] = []
            if self.dataset is None:
                missing.append("dataset")
            if not self.metrics:
                missing.append("metrics")
            if self.dimensions is None:
                missing.append("dimensions")
            if self.filters is None:
                missing.append("filters")
            if self.result is None:
                missing.append("result")
            if missing:
                raise ValueError(f"an answered case must declare {', '.join(missing)}")

            if len(self.metrics or []) != len(set(self.metrics or [])):
                raise ValueError("metrics must not contain duplicates")
            if len(self.dimensions or []) != len(set(self.dimensions or [])):
                raise ValueError("dimensions must not contain duplicates")

            result = self.result
            if result is not None:
                if (
                    result.min_rows is not None
                    and result.row_count is not None
                    and result.row_count < result.min_rows
                ):
                    raise ValueError("result.row_count is below result.min_rows")
                if self.limit is not None:
                    if result.row_count is not None and result.row_count > self.limit:
                        raise ValueError("result.row_count is larger than limit")
                    if result.min_rows is not None and result.min_rows > self.limit:
                        raise ValueError("result.min_rows is larger than limit")
            return self

        declared = [
            name
            for name in (
                "dataset",
                "metrics",
                "dimensions",
                "time_grain",
                "filters",
                "order_by",
                "limit",
                "result",
            )
            if getattr(self, name) is not None
        ]
        if declared:
            raise ValueError(f"a {self.outcome} case must not declare {', '.join(declared)}")
        return self


class EvalCase(StrictModel):
    """One question and its expectation."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    tag: str = Field(min_length=1, max_length=32)
    question: str = Field(min_length=1, max_length=2_000)
    expected: Expected
    notes: str | None = Field(default=None, max_length=500)


class GoldenSet(StrictModel):
    """The committed eval dataset."""

    version: Literal[1] = 1
    today: date
    description: str | None = Field(default=None, max_length=500)
    cases: list[EvalCase] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_ids(self) -> GoldenSet:
        ids = [case.id for case in self.cases]
        duplicates = sorted({case_id for case_id in ids if ids.count(case_id) > 1})
        if duplicates:
            raise ValueError(f"duplicate case ids: {', '.join(duplicates)}")
        return self


class CaseResult(StrictModel):
    """The scored outcome of one question."""

    case_id: str
    tag: str
    passed: bool
    failures: list[str] = Field(default_factory=list)
    elapsed_ms: int | None = None
    duration_ms: int | None = None
    repairs: int = 0
    row_count: int | None = None
    usage: UsageTotals = Field(default_factory=UsageTotals)


class TagScore(StrictModel):
    passed: int
    total: int
    percent: float


class ScoreSummary(StrictModel):
    passed: int
    total: int
    percent: float
    by_tag: dict[str, TagScore] = Field(default_factory=dict)


class RunReport(StrictModel):
    """A full eval run, written to `last-run.json` or `baseline.json`."""

    generated_at: datetime
    model: str | None
    today: date
    score: ScoreSummary
    usage: UsageTotals
    cases: list[CaseResult]


def load_golden(path: Path) -> GoldenSet:
    """Read and validate a golden file, with one readable error."""
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise EvalError(f"could not read {path}: {exc}") from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise EvalError(f"{path} is not valid JSON: {exc}") from exc

    try:
        return GoldenSet.model_validate(payload)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(part) for part in first["loc"]) or "<root>"
        raise EvalError(
            f"{path} does not match the golden format ({where}: {first['msg']})"
        ) from exc


def score_case(
    case: EvalCase,
    answer: AgentAnswer,
    *,
    elapsed_ms: int | None = None,
) -> CaseResult:
    """Compare one answer with its expectation. Never raises for a bad answer."""
    failures: list[str] = []
    expected = case.expected

    if answer.outcome != expected.outcome:
        detail = f" ({answer.error})" if answer.error else ""
        failures.append(f"outcome: expected {expected.outcome}, got {answer.outcome}{detail}")
    elif expected.outcome == "answered":
        _score_answered(expected, answer, failures)
    elif expected.outcome == "out_of_scope":
        _score_out_of_scope(answer, failures)
    else:
        _score_failed(answer, failures)

    return CaseResult(
        case_id=case.id,
        tag=case.tag,
        passed=not failures,
        failures=failures,
        elapsed_ms=elapsed_ms,
        duration_ms=answer.result.duration_ms if answer.result else None,
        repairs=answer.repairs,
        row_count=answer.result.row_count if answer.result else None,
        usage=answer.usage,
    )


def _score_answered(
    expected: Expected,
    answer: AgentAnswer,
    failures: list[str],
) -> None:
    if not answer.answer.strip():
        failures.append("answer: empty")
    if answer.error:
        failures.append(f"answer: unexpected error ({answer.error})")

    spec = answer.spec
    if spec is None:
        failures.append("spec: missing")
    else:
        if spec.dataset != expected.dataset:
            failures.append(f"dataset: expected {expected.dataset!r}, got {spec.dataset!r}")

        _check_names("metrics", expected.metrics or [], spec.metrics, failures)
        _check_names("dimensions", expected.dimensions or [], spec.dimensions, failures)

        actual_grain = _grain_payload(spec.time_grain)
        expected_grain = _grain_payload(expected.time_grain)
        if actual_grain != expected_grain:
            failures.append(f"timeGrain: expected {expected_grain!r}, got {actual_grain!r}")

        for wanted in expected.filters or []:
            if not any(_filter_matches(wanted, actual) for actual in spec.filters):
                failures.append(f"filters: missing {wanted.describe()}")

        if expected.order_by is not None:
            _check_order_by(expected.order_by, spec.order_by, failures)

        if expected.limit is not None and spec.limit != expected.limit:
            failures.append(f"limit: expected {expected.limit}, got {spec.limit}")

    result = answer.result
    if result is None:
        failures.append("result: missing")
        return

    expectation = expected.result
    if expectation is None:  # guarded by Expected; keeps the type checker happy
        return

    if expectation.row_count is not None and result.row_count != expectation.row_count:
        failures.append(f"result: expected {expectation.row_count} rows, got {result.row_count}")

    if expectation.min_rows is not None and result.row_count < expectation.min_rows:
        failures.append(
            f"result: expected at least {expectation.min_rows} rows, got {result.row_count}"
        )

    remaining = list(result.rows)
    for wanted_row in expectation.includes:
        match = next(
            (index for index, row in enumerate(remaining) if _row_matches(row, wanted_row)),
            None,
        )
        if match is None:
            failures.append(f"result: no row matches {wanted_row!r}")
        else:
            remaining.pop(match)


def _score_out_of_scope(answer: AgentAnswer, failures: list[str]) -> None:
    if not answer.answer.strip():
        failures.append("answer: empty")
    if answer.error:
        failures.append(f"answer: unexpected error ({answer.error})")
    if answer.spec is not None:
        failures.append("spec: out-of-scope runs must not draft a QuerySpec")
    if answer.result is not None:
        failures.append("result: out-of-scope runs must not execute a query")


def _score_failed(answer: AgentAnswer, failures: list[str]) -> None:
    if not answer.answer.strip():
        failures.append("answer: empty")
    if not answer.error:
        failures.append("error: a failed run must carry a safe technical error")
    if answer.result is not None:
        failures.append("result: a failed run must not carry rows")


def _check_names(
    label: str,
    expected: list[str],
    actual: list[str],
    failures: list[str],
) -> None:
    if sorted(expected) != sorted(actual):
        failures.append(f"{label}: expected {sorted(expected)}, got {sorted(actual)}")


def _check_order_by(
    expected: list[OrderBy],
    actual: list[OrderBy],
    failures: list[str],
) -> None:
    wanted = [(entry.field, entry.direction) for entry in expected]
    got = [(entry.field, entry.direction) for entry in actual]
    if not wanted:
        if got:
            failures.append(f"orderBy: expected none, got {got}")
        return
    if got[: len(wanted)] != wanted:
        failures.append(f"orderBy: expected {wanted} first, got {got}")


def _grain_payload(grain: TimeGrainSpec | None) -> dict[str, str] | None:
    return grain.model_dump() if grain is not None else None


def _filter_matches(expected: FilterExpectation, actual: Any) -> bool:
    if expected.dimension != actual.dimension:
        return False
    if expected.operator is not None and expected.operator != actual.operator:
        return False
    if expected.value is not None and not _values_equal(expected.value, actual.value):
        return False
    return True


def _row_matches(row: dict[str, Any], expected: dict[str, Any]) -> bool:
    return all(key in row and _values_equal(value, row[key]) for key, value in expected.items())


def _values_equal(expected: Any, actual: Any) -> bool:
    """Numbers compare numerically, everything else exactly.

    PostgreSQL returns `bigint`/`numeric` as strings (D42), so a golden file can
    say `38` while the answer says `"38"`. Booleans are checked before numbers
    because `bool` is an `int` subclass in Python.
    """
    if isinstance(expected, list) or isinstance(actual, list):
        if not isinstance(expected, list) or not isinstance(actual, list):
            return False
        return len(expected) == len(actual) and all(
            _values_equal(left, right) for left, right in zip(expected, actual, strict=True)
        )

    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected is actual

    left = _as_decimal(expected)
    right = _as_decimal(actual)
    if left is not None and right is not None:
        return left == right
    return expected == actual


def _as_decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        try:
            return Decimal(str(value))
        except InvalidOperation:
            return None
    if isinstance(value, str):
        try:
            return Decimal(value.strip())
        except InvalidOperation:
            return None
    return None


def validate_case_names(golden: GoldenSet, context: ModelContext) -> list[str]:
    """Check every expected name against the live model before any LLM call.

    The compiler remains authoritative; this is a cheap editorial check that
    catches a typo in the committed golden file before it costs tokens.
    """
    datasets = {dataset.name: dataset for dataset in context.datasets}
    issues: list[str] = []

    for case in golden.cases:
        expected = case.expected
        if expected.outcome != "answered":
            continue

        dataset_name = expected.dataset or ""
        dataset = datasets.get(dataset_name)
        if dataset is None:
            issues.append(f"{case.id}: unknown dataset {dataset_name!r}")
            continue

        reachable = reachable_datasets(context, dataset_name)
        dimensions: dict[str, ContextDimension] = {}
        for name in reachable:
            source = datasets.get(name)
            if source is None:
                continue
            for dimension in source.dimensions:
                dimensions.setdefault(dimension.name, dimension)

        metrics = {metric.name for metric in dataset.metrics}
        for metric in expected.metrics or []:
            if metric not in metrics:
                issues.append(f"{case.id}: unknown metric {metric!r} on {dataset_name!r}")

        for dimension in expected.dimensions or []:
            if dimension not in dimensions:
                issues.append(f"{case.id}: unknown dimension {dimension!r} for {dataset_name!r}")

        if expected.time_grain is not None:
            grain = expected.time_grain.dimension
            dimension = dimensions.get(grain)
            if dimension is None:
                issues.append(f"{case.id}: unknown time dimension {grain!r} for {dataset_name!r}")
            elif dimension.family not in DATE_FAMILIES:
                issues.append(
                    f"{case.id}: time dimension {grain!r} is {dimension.data_type}, not a date"
                )

        for wanted_filter in expected.filters or []:
            if wanted_filter.dimension not in dimensions:
                issues.append(
                    f"{case.id}: unknown filter dimension "
                    f"{wanted_filter.dimension!r} for {dataset_name!r}"
                )

        output_columns = set(expected.metrics or []) | set(expected.dimensions or [])
        if expected.time_grain is not None:
            output_columns.add(expected.time_grain.dimension)

        for order in expected.order_by or []:
            if order.field not in output_columns:
                issues.append(f"{case.id}: orderBy {order.field!r} is not a result column")

        if expected.result is not None:
            for row in expected.result.includes:
                for key in row:
                    if key not in output_columns:
                        issues.append(f"{case.id}: includes key {key!r} is not a result column")

    return issues


def summarize(results: Iterable[CaseResult]) -> ScoreSummary:
    """Overall and per-tag pass rates."""
    items = list(results)
    total = len(items)
    passed = sum(1 for result in items if result.passed)
    by_tag: dict[str, TagScore] = {}
    for tag in sorted({result.tag for result in items}):
        tagged = [result for result in items if result.tag == tag]
        tag_passed = sum(1 for result in tagged if result.passed)
        by_tag[tag] = TagScore(
            passed=tag_passed,
            total=len(tagged),
            percent=_percent(tag_passed, len(tagged)),
        )

    return ScoreSummary(
        passed=passed,
        total=total,
        percent=_percent(passed, total),
        by_tag=by_tag,
    )


def total_usage(results: Iterable[CaseResult]) -> UsageTotals:
    """Sum token and cost usage across cases; cost stays `None` when unknown."""
    items = list(results)
    costs = [item.usage.cost_usd for item in items if item.usage.cost_usd is not None]
    return UsageTotals(
        calls=sum(item.usage.calls for item in items),
        prompt_tokens=sum(item.usage.prompt_tokens for item in items),
        completion_tokens=sum(item.usage.completion_tokens for item in items),
        total_tokens=sum(item.usage.total_tokens for item in items),
        cost_usd=sum(costs) if costs else None,
    )


def build_report(
    results: Iterable[CaseResult],
    *,
    model: str | None,
    today: date,
    generated_at: datetime | None = None,
) -> RunReport:
    """Assemble the committed/local report from scored cases."""
    items = list(results)
    return RunReport(
        generated_at=generated_at or datetime.now(UTC),
        model=model,
        today=today,
        score=summarize(items),
        usage=total_usage(items),
        cases=items,
    )


def dumps_report(report: RunReport) -> str:
    """Pretty JSON with a trailing newline, ready to write to disk."""
    payload = report.model_dump(mode="json")
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def _percent(passed: int, total: int) -> float:
    return round(100.0 * passed / total, 1) if total else 0.0


__all__ = [
    "CaseResult",
    "EvalCase",
    "EvalError",
    "Expected",
    "FilterExpectation",
    "GoldenSet",
    "ResultExpectation",
    "RunReport",
    "ScoreSummary",
    "TagScore",
    "build_report",
    "dumps_report",
    "load_golden",
    "score_case",
    "summarize",
    "total_usage",
    "validate_case_names",
]
