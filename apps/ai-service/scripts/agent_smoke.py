"""One real question through the whole agent (6.3b).

Needs `LLM_API_KEY` + `LLM_MODEL` in `apps/ai-service/.env`, a running core-api,
and the seeded Acme source:

    pnpm ai:smoke:agent
    pnpm ai:smoke:agent "Monthly revenue for the last 12 months"

Exits 0 with a SKIP line when the configuration is incomplete.
"""

import asyncio
import sys

from ai_service.agent import Agent, AgentDeps
from ai_service.config import get_settings
from ai_service.core_api import CoreApiClient, CoreApiError
from ai_service.llm import LlmClient, LlmError


async def main() -> int:
    settings = get_settings()
    missing = settings.missing_llm_settings + settings.missing_core_api_settings

    if missing:
        print(f"SKIP  set {', '.join(missing)} in apps/ai-service/.env")
        return 0

    question = " ".join(sys.argv[1:]).strip() or "Headcount by department?"
    llm = LlmClient(settings)
    core = CoreApiClient(settings)

    try:
        answer = await Agent(AgentDeps(llm=llm, core_api=core)).run(question)
    except (LlmError, CoreApiError) as exc:
        print(f"FAILED  {exc}")
        return 1
    finally:
        await core.aclose()
        await llm.aclose()

    print(f"question  {question}")
    print(f"outcome   {answer.outcome} (repairs={answer.repairs})")
    print(f"trace     {' -> '.join(answer.trace)}")

    if answer.spec is not None:
        print(f"spec      {answer.spec.to_payload()}")
    if answer.result is not None:
        print(f"result    {answer.result.row_count} rows in {answer.result.duration_ms} ms")
        for row in answer.result.rows[:5]:
            print(f"  {row}")
    if answer.error:
        print(f"error     {answer.error}")

    print(f"answer    {answer.answer}")
    usage = answer.usage
    cost = "unknown" if usage.cost_usd is None else f"${usage.cost_usd:.6f}"
    print(f"usage     {usage.calls} calls, {usage.total_tokens} tokens, {cost}")

    return 0 if answer.outcome != "failed" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
