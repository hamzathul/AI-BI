"""Live golden-set run (6.6).

`pytest evals` answers every committed question with the real LLM and the real
core-api, scores each answer, and writes `last-run.json`. It is kept out of
`tests/` so the default `pytest` run stays hermetic (no network, no Docker).

The run is skipped only when configuration is missing. Once
`LLM_API_KEY`, `LLM_MODEL`, and `INTERNAL_API_TOKEN` are set, a broken stack is
a failure, not a skip: an eval that silently does nothing is worse than a red
build.
"""

import time
from pathlib import Path

import pytest

from ai_service.agent import Agent, AgentDeps
from ai_service.config import get_settings
from ai_service.core_api import CoreApiClient
from ai_service.evaluation import load_golden, score_case
from ai_service.llm import LlmClient

GOLDEN_PATH = Path(__file__).resolve().parent / "golden.json"
GOLDEN = load_golden(GOLDEN_PATH)

SETTINGS = get_settings()
MISSING = SETTINGS.missing_llm_settings + SETTINGS.missing_core_api_settings

pytestmark = pytest.mark.skipif(
    bool(MISSING),
    reason=f"live evals need {', '.join(MISSING)} in apps/ai-service/.env",
)


@pytest.mark.parametrize("case", GOLDEN.cases, ids=[case.id for case in GOLDEN.cases])
async def test_agent_answers_golden_case(case, eval_state, live_context) -> None:
    """One real question: run the graph, score the answer, keep the result."""
    llm = LlmClient(SETTINGS)
    core_api = CoreApiClient(SETTINGS)
    agent = Agent(AgentDeps(llm=llm, core_api=core_api, today=GOLDEN.today))

    started = time.perf_counter()
    try:
        answer = await agent.run(case.question)
    finally:
        await llm.aclose()
        await core_api.aclose()

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    result = score_case(case, answer, elapsed_ms=elapsed_ms)
    eval_state.results.append(result)

    assert result.passed, "\n".join(result.failures)
