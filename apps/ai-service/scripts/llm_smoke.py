"""One real LLM call — the only check mocks cannot make.

Catches the failures a mocked suite never sees: a revoked key, a slug that no
longer exists in the OpenRouter catalogue, or a provider that ignores JSON mode.

Run: `pnpm ai:smoke` (reads `LLM_API_KEY` / `LLM_MODEL` from apps/ai-service/.env).
Exits 0 with a "skipped" message when the LLM is not configured.
"""

import asyncio
import json

from pydantic import BaseModel

from ai_service.config import get_settings
from ai_service.llm import LlmClient, LlmError

SYSTEM = "You map a business question to exactly one metric id from a fixed list."
USER = (
    'Question: "How many people work here?"\n'
    "Metrics: headcount (active employees), revenue (net sales), units_sold (items shipped)."
)


class MetricChoice(BaseModel):
    metric_id: str
    reason: str


async def main() -> int:
    settings = get_settings()
    if not settings.llm_configured:
        print(f"LLM not configured ({', '.join(settings.missing_llm_settings)}) - skipped.")
        return 0

    llm = LlmClient(settings)
    try:
        result = await llm.structured(schema=MetricChoice, system=SYSTEM, user=USER)
    except LlmError as exc:
        print(f"FAILED [{type(exc).__name__}]: {exc}")
        return 1
    finally:
        await llm.aclose()

    print(f"model:  {settings.llm_model}")
    print(f"answer: {json.dumps(result.data.model_dump(), indent=2)}")
    print(f"usage:  {result.usage.model_dump_json(indent=2)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
