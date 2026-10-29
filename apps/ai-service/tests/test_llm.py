import json
import logging
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from openai import AsyncOpenAI
from pydantic import BaseModel

from ai_service.config import Settings
from ai_service.llm import (
    LlmBadOutput,
    LlmClient,
    LlmNotConfigured,
    LlmRefusal,
    LlmUnavailable,
)


class MetricChoice(BaseModel):
    metric_id: str
    reason: str


Handler = Callable[[int, dict[str, Any]], httpx2.Response]


def _ok(content: str | None, *, refusal: str | None = None) -> httpx2.Response:
    """A canned chat completion, shaped like OpenRouter's response."""
    return httpx2.Response(
        200,
        json={
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": "test/model",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": content, "refusal": refusal},
                }
            ],
            "usage": {
                "prompt_tokens": 11,
                "completion_tokens": 7,
                "total_tokens": 18,
                "cost": 0.00042,
            },
        },
    )


def _error(status: int, message: str) -> httpx2.Response:
    return httpx2.Response(status, json={"error": {"message": message, "type": "test_error"}})


def _llm(handler: Handler, *, max_retries: int = 0) -> tuple[LlmClient, list[dict[str, Any]]]:
    """A real SDK client pointed at an in-memory transport — no network, no key."""
    sent: list[dict[str, Any]] = []

    def record(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        sent.append(body)
        return handler(len(sent) - 1, body)

    sdk = AsyncOpenAI(
        api_key="sk-test-key",
        base_url="https://openrouter.ai/api/v1",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(record)),
        max_retries=max_retries,
    )
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        llm_api_key="sk-test-key",
        llm_model="test/model",
        llm_max_retries=max_retries,
    )
    return LlmClient(settings, client=sdk), sent


async def test_structured_returns_validated_model_with_usage(
    caplog: pytest.LogCaptureFixture,
) -> None:
    content = '{"metric_id": "headcount", "reason": "counts employees"}'
    llm, sent = _llm(lambda _i, _body: _ok(content))

    with caplog.at_level(logging.INFO, logger="ai_service.llm"):
        result = await llm.structured(
            schema=MetricChoice,
            system="You are a BI assistant.",
            user="How many people work here?",
        )

    assert result.data == MetricChoice(metric_id="headcount", reason="counts employees")
    assert result.usage.model == "test/model"
    assert (result.usage.prompt_tokens, result.usage.completion_tokens) == (11, 7)
    assert result.usage.total_tokens == 18
    assert result.usage.cost_usd == pytest.approx(0.00042)

    body = sent[0]
    assert body["model"] == "test/model"
    assert body["response_format"] == {"type": "json_object"}
    assert body["max_tokens"] == 2000
    assert body["usage"] == {"include": True}
    assert body["messages"][0] == {"role": "system", "content": "You are a BI assistant."}
    user_prompt = body["messages"][1]["content"]
    assert user_prompt.startswith("How many people work here?")
    assert "JSON Schema" in user_prompt
    assert '"metric_id"' in user_prompt

    assert "llm_call schema=MetricChoice" in caplog.text
    assert "outcome=ok" in caplog.text
    assert "sk-test-key" not in caplog.text
    assert "How many people work here?" not in caplog.text


async def test_custom_temperature_and_token_budget_are_forwarded() -> None:
    llm, sent = _llm(lambda _i, _body: _ok('{"metric_id": "revenue", "reason": "sales"}'))

    await llm.structured(schema=MetricChoice, system="s", user="u", temperature=0.4, max_tokens=256)

    assert sent[0]["temperature"] == 0.4
    assert sent[0]["max_tokens"] == 256


async def test_refusal_becomes_llm_refusal(caplog: pytest.LogCaptureFixture) -> None:
    llm, _ = _llm(lambda _i, _body: _ok(None, refusal="I can't help with that."))

    with (
        caplog.at_level(logging.INFO, logger="ai_service.llm"),
        pytest.raises(LlmRefusal, match="can't help"),
    ):
        await llm.structured(schema=MetricChoice, system="s", user="u")

    assert "outcome=error" in caplog.text


async def test_invalid_json_becomes_llm_bad_output() -> None:
    llm, _ = _llm(lambda _i, _body: _ok("Sure! Here is your answer."))

    with pytest.raises(LlmBadOutput, match="did not match MetricChoice"):
        await llm.structured(schema=MetricChoice, system="s", user="u")


async def test_wrong_shape_becomes_llm_bad_output() -> None:
    llm, _ = _llm(lambda _i, _body: _ok('{"metricId": "headcount"}'))

    with pytest.raises(LlmBadOutput):
        await llm.structured(schema=MetricChoice, system="s", user="u")


async def test_transient_server_error_is_retried_by_the_sdk() -> None:
    def handler(index: int, _body: dict[str, Any]) -> httpx2.Response:
        if index == 0:
            return _error(500, "upstream hiccup")
        return _ok('{"metric_id": "headcount", "reason": "ok"}')

    llm, sent = _llm(handler, max_retries=1)

    result = await llm.structured(schema=MetricChoice, system="s", user="u")

    assert result.data.metric_id == "headcount"
    assert len(sent) == 2


async def test_auth_failure_is_not_retried() -> None:
    llm, sent = _llm(lambda _i, _body: _error(401, "invalid api key"), max_retries=2)

    with pytest.raises(LlmUnavailable, match="HTTP 401"):
        await llm.structured(schema=MetricChoice, system="s", user="u")

    assert len(sent) == 1


async def test_provider_rejecting_json_mode_is_retried_without_it() -> None:
    def handler(index: int, _body: dict[str, Any]) -> httpx2.Response:
        if index == 0:
            return _error(400, "response_format is not supported for this model")
        return _ok('{"metric_id": "headcount", "reason": "ok"}')

    llm, sent = _llm(handler)

    result = await llm.structured(schema=MetricChoice, system="s", user="u")

    assert result.data.metric_id == "headcount"
    assert "response_format" in sent[0]
    assert "response_format" not in sent[1]


async def test_missing_key_fails_before_any_request() -> None:
    llm = LlmClient(Settings(_env_file=None))  # type: ignore[call-arg]

    with pytest.raises(LlmNotConfigured, match="LLM_API_KEY, LLM_MODEL"):
        await llm.structured(schema=MetricChoice, system="s", user="u")


async def test_aclose_closes_the_http_pool() -> None:
    llm, _ = _llm(lambda _i, _body: _ok('{"metric_id": "x", "reason": "y"}'))
    await llm.structured(schema=MetricChoice, system="s", user="u")

    await llm.aclose()

    assert llm._client is None  # private on purpose: resource cleanup check
