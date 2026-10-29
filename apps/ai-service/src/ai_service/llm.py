"""The single boundary around the LLM provider SDK (D15).

Nothing outside this module may import `openai`; `tests/test_import_boundary.py`
enforces that. Callers describe the shape they want as a Pydantic model and get
validated data plus token usage back — never a provider type, never raw JSON.

One call in, one call out: retrying a *bad answer* belongs to the LangGraph
repair node (6.3), not here. Transport retries (429/5xx/timeouts) stay inside
the SDK via `max_retries`.
"""

import json
import logging
import time
from typing import Any

from openai import APIStatusError, AsyncOpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from ai_service.config import Settings, get_settings

logger = logging.getLogger(__name__)

JSON_MODE = {"type": "json_object"}
"""Portable structured output. Strict `json_schema` is not available on every
OpenRouter route, so the schema travels in the prompt and Pydantic validates."""

USAGE_INCLUDE = {"usage": {"include": True}}
"""OpenRouter extension: returns `cost` alongside token counts."""


class LlmError(Exception):
    """Base class for every failure raised by this boundary."""


class LlmNotConfigured(LlmError):
    """`LLM_API_KEY` or `LLM_MODEL` is missing."""


class LlmRefusal(LlmError):
    """The provider's safety layer refused to answer."""


class LlmBadOutput(LlmError):
    """The model answered with text that does not match the requested schema."""


class LlmUnavailable(LlmError):
    """Transport, auth, rate-limit, or provider-side failure."""


class LlmUsage(BaseModel):
    """Token accounting for one call. Persistence arrives with the audit log."""

    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    cost_usd: float | None = None


class LlmResult[T](BaseModel):
    """Validated payload plus the usage that produced it."""

    data: T
    usage: LlmUsage


def _schema_instruction(schema: type[BaseModel]) -> str:
    """Inline the JSON Schema and demand JSON only.

    `json_object` mode is prompt-driven: without the word "json" and the shape,
    providers either return prose or reject the request.
    """
    schema_json = json.dumps(schema.model_json_schema(), indent=2)
    return (
        "Reply with a single JSON object and nothing else: no prose, no markdown, "
        "no code fences.\n"
        f"It must validate against the `{schema.__name__}` JSON Schema below. "
        "Use only the listed properties and types.\n\n"
        f"JSON Schema:\n{schema_json}"
    )


def _cost_of(usage: Any) -> float | None:
    """Read OpenRouter's cost extension without depending on its typing."""
    cost = getattr(usage, "cost", None)
    if cost is None:
        cost = (getattr(usage, "model_extra", None) or {}).get("cost")
    return float(cost) if isinstance(cost, (int, float)) else None


def _rejects_json_mode(exc: APIStatusError) -> bool:
    """A provider 400 that names `response_format` means "not supported here"."""
    return exc.status_code == 400 and "response_format" in str(exc).lower()


class LlmClient:
    """Typed, provider-agnostic wrapper over one OpenAI-compatible endpoint."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        client: AsyncOpenAI | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._client = client

    @property
    def configured(self) -> bool:
        return self._settings.llm_configured

    def _sdk(self) -> AsyncOpenAI:
        """Create the SDK client on first use, after checking configuration."""
        missing = self._settings.missing_llm_settings
        if missing:
            raise LlmNotConfigured(
                f"LLM is not configured — set {', '.join(missing)} in apps/ai-service/.env"
            )
        if self._client is None:
            api_key = self._settings.llm_api_key
            if api_key is None:  # unreachable after the check above; narrows the type
                raise LlmNotConfigured("LLM_API_KEY is not set")
            self._client = AsyncOpenAI(
                api_key=api_key.get_secret_value(),
                base_url=self._settings.llm_base_url,
                timeout=self._settings.llm_timeout_seconds,
                max_retries=self._settings.llm_max_retries,
            )
        return self._client

    async def aclose(self) -> None:
        """Release the HTTP connection pool (FastAPI lifespan shutdown)."""
        if self._client is not None:
            await self._client.close()
            self._client = None

    async def structured[T: BaseModel](
        self,
        *,
        schema: type[T],
        system: str,
        user: str,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LlmResult[T]:
        """Ask for one `schema`-shaped object. Raises an `LlmError` subclass."""
        client = self._sdk()  # raises LlmNotConfigured before any HTTP call
        model = self._settings.llm_model or ""
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": f"{user}\n\n{_schema_instruction(schema)}"},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens or self._settings.llm_max_output_tokens,
            "extra_body": USAGE_INCLUDE,
        }

        started = time.perf_counter()
        prompt_tokens = completion_tokens = total_tokens = 0
        cost_usd: float | None = None
        outcome = "error"  # flipped to "ok" only on the success return below

        try:
            completion = await self._create(client, payload, json_mode=True)
            choice = completion.choices[0]
            refusal = getattr(choice.message, "refusal", None)
            if refusal:
                raise LlmRefusal(str(refusal))

            content = choice.message.content or ""
            try:
                data = schema.model_validate_json(content)
            except ValidationError as exc:
                first = exc.errors()[0]
                where = ".".join(str(part) for part in first["loc"]) or "<root>"
                raise LlmBadOutput(
                    f"model output did not match {schema.__name__} ({where}: {first['type']})"
                ) from exc

            usage = completion.usage
            if usage is not None:
                prompt_tokens = usage.prompt_tokens or 0
                completion_tokens = usage.completion_tokens or 0
                total_tokens = usage.total_tokens or 0
                cost_usd = _cost_of(usage)

            result = LlmResult[T](
                data=data,
                usage=LlmUsage(
                    model=model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    cost_usd=cost_usd,
                ),
            )
            outcome = "ok"
            return result
        finally:
            # Exactly one log line per call; never prompt text, never the key.
            logger.info(
                "llm_call schema=%s model=%s outcome=%s prompt_tokens=%d "
                "completion_tokens=%d total_tokens=%d cost_usd=%s latency_ms=%d",
                schema.__name__,
                model,
                outcome,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cost_usd,
                int((time.perf_counter() - started) * 1000),
            )

    async def _create(
        self, client: AsyncOpenAI, payload: dict[str, Any], *, json_mode: bool
    ) -> Any:
        """POST one chat completion, retrying once without `response_format` if
        the provider rejects that parameter (some OpenRouter routes do)."""
        body = {**payload}
        if json_mode:
            body["response_format"] = JSON_MODE
        try:
            return await client.chat.completions.create(**body)
        except APIStatusError as exc:
            if json_mode and _rejects_json_mode(exc):
                logger.warning("provider rejected response_format; retrying without it")
                return await self._create(client, payload, json_mode=False)
            raise LlmUnavailable(f"provider returned HTTP {exc.status_code}") from exc
        except OpenAIError as exc:
            raise LlmUnavailable(f"{type(exc).__name__}: {exc}") from exc
