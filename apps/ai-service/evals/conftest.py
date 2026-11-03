"""Live eval harness for 6.6.

`pytest evals` is deliberately outside `tests/`, so the default `pytest` run
stays hermetic. This file wires the live run: preflight the stack, validate the
golden names against the real semantic model, collect results, and write the
report/baseline.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import pytest

from ai_service.config import Settings, get_settings
from ai_service.core_api import CoreApiClient, CoreApiError, ModelContext
from ai_service.evaluation import (
    CaseResult,
    EvalError,
    build_report,
    dumps_report,
    load_golden,
    validate_case_names,
)

EVALS_DIR = Path(__file__).resolve().parent
GOLDEN_PATH = EVALS_DIR / "golden.json"
BASELINE_PATH = EVALS_DIR / "baseline.json"
LAST_RUN_PATH = EVALS_DIR / "last-run.json"
REPO_ROOT = EVALS_DIR.parents[2]

try:
    GOLDEN = load_golden(GOLDEN_PATH)
except EvalError as exc:  # a broken golden file must fail before any test runs
    raise pytest.UsageError(str(exc)) from exc


class EvalState:
    """Results collected across the parametrized test cases."""

    def __init__(self) -> None:
        self.results: list[CaseResult] = []
        self.started_at = time.perf_counter()


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--record-baseline",
        action="store_true",
        default=False,
        help="write evals/baseline.json after this run",
    )


def pytest_configure(config: pytest.Config) -> None:
    config._eval_state = EvalState()  # type: ignore[attr-defined]


@pytest.fixture(scope="session")
def eval_state(request: pytest.FixtureRequest) -> EvalState:
    state = getattr(request.config, "_eval_state", None)
    if not isinstance(state, EvalState):
        raise RuntimeError("eval state was not initialized")
    return state


@pytest.fixture(scope="session", autouse=True)
def live_context() -> ModelContext:
    """Fail fast when the stack or the golden file cannot be trusted.

    Checking every expected name against core-api's validated context is cheap
    and happens before the first token is spent. The compiler remains the only
    validator; this is an editorial check for the committed dataset.
    """
    settings = get_settings()
    try:
        context = asyncio.run(_load_context(settings))
    except CoreApiError as exc:
        pytest.fail(
            "Eval preflight failed: "
            f"{exc}\n"
            "Start core-api, load the Acme seed, and run "
            "`pnpm db:seed:semantic` before `pnpm ai:eval`.",
            pytrace=False,
        )

    issues = validate_case_names(GOLDEN, context)
    if issues:
        pytest.fail(
            "The golden set does not match the live semantic model:\n" + "\n".join(issues),
            pytrace=False,
        )

    return context


async def _load_context(settings: Settings) -> ModelContext:
    client = CoreApiClient(settings)
    try:
        return await client.context()
    finally:
        await client.aclose()


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Write the JSON report and print one compact summary."""
    state = getattr(session.config, "_eval_state", None)
    if not isinstance(state, EvalState) or not state.results:
        return

    settings = get_settings()
    report = build_report(state.results, model=settings.llm_model, today=GOLDEN.today)
    LAST_RUN_PATH.write_text(dumps_report(report), encoding="utf-8")

    requested = bool(session.config.getoption("--record-baseline"))
    complete = len(state.results) == len(GOLDEN.cases)
    if requested and not complete:
        _write(
            session,
            f"Baseline NOT recorded: only {len(state.results)}/{len(GOLDEN.cases)} "
            "cases produced a result",
        )
    record = requested and complete
    if record:
        BASELINE_PATH.write_text(dumps_report(report), encoding="utf-8")

    _print_summary(session, record=record)


def _print_summary(session: pytest.Session, *, record: bool) -> None:
    report = json.loads(LAST_RUN_PATH.read_text(encoding="utf-8"))
    score = report["score"]
    usage = report["usage"]
    cost = "unknown" if usage["cost_usd"] is None else f"${usage['cost_usd']:.6f}"

    _write(session)
    _write(
        session,
        f"Evals: {score['passed']}/{score['total']} passed "
        f"({score['percent']:.1f}%)  model={report['model'] or 'unknown'}  "
        f"today={report['today']}",
    )
    for tag, tag_score in score["by_tag"].items():
        _write(
            session,
            f"  {tag:<8} {tag_score['passed']}/{tag_score['total']} ({tag_score['percent']:.1f}%)",
        )
    _write(
        session,
        f"  usage    {usage['calls']} calls, {usage['total_tokens']} tokens, {cost}",
    )

    baseline = _baseline_score()
    if baseline is not None and not record:
        old_passed, old_total, _old_percent = baseline
        _write(
            session,
            f"  baseline {old_passed}/{old_total}, delta {score['passed'] - old_passed:+d} passed",
        )

    seen = {case["case_id"] for case in report["cases"]}
    missing = [case.id for case in GOLDEN.cases if case.id not in seen]
    if missing:
        _write(
            session,
            f"  WARNING  {len(missing)} case(s) produced no result: " + ", ".join(missing),
        )

    failures = [case for case in report["cases"] if not case["passed"]]
    if failures:
        _write(session, "Failures:")
        for case in failures[:12]:
            reason = case["failures"][0] if case["failures"] else "failed"
            _write(session, f"  {case['case_id']}: {reason}")
        if len(failures) > 12:
            _write(
                session,
                f"  ... {len(failures) - 12} more in {_relative(LAST_RUN_PATH)}",
            )

    if record:
        _write(session, f"Baseline recorded: {_relative(BASELINE_PATH)}")
        if score["passed"] != score["total"]:
            _write(session, "  (snapshot with failures — not a passing gate)")

    _write(session, f"Report: {_relative(LAST_RUN_PATH)}")


def _baseline_score() -> tuple[int, int, float] | None:
    if not BASELINE_PATH.exists():
        return None
    try:
        payload = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
        score = payload["score"]
        return int(score["passed"]), int(score["total"]), float(score["percent"])
    except OSError, ValueError, KeyError, TypeError:
        return None


def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def _write(session: pytest.Session, line: str = "") -> None:
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    if reporter is not None:
        reporter.write_line(line)
    else:
        print(line)
