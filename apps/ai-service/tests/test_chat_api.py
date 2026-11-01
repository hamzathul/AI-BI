"""Route tests for `POST /chat` (6.4a).

A fake agent replaces the graph, so these tests need no key, no network, and no
Docker — the same hermetic style as the graph tests.
"""

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi.testclient import TestClient

from ai_service.agent.events import AnswerEvent, ErrorEvent, StepEvent, sse_frame
from ai_service.config import Settings
from ai_service.main import create_app

TOKEN = "test-only-token-0123456789abcdef0123456789abcdef"


class FakeAgent:
    """The smallest thing the route needs: `stream(message)`."""

    def __init__(
        self,
        events: list[Any] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.events = events or []
        self.error = error
        self.messages: list[str] = []

    async def stream(self, message: str) -> AsyncIterator[Any]:
        self.messages.append(message)
        if self.error is not None:
            raise self.error
        for event in self.events:
            yield event


def _client(agent: FakeAgent, *, configured: bool = True) -> TestClient:
    settings = Settings(
        _env_file=None,
        llm_api_key="sk-test",
        llm_model="test/model",
        internal_api_token=TOKEN if configured else None,
    )
    return TestClient(create_app(settings, agent=agent))


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def _events() -> list[Any]:
    return [
        StepEvent(step="classify_intent", detail={"intent": "data_question"}),
        AnswerEvent(
            question="Headcount?",
            outcome="answered",
            answer="Six departments.",
            trace=["classify_intent"],
        ),
    ]


def _payloads(text: str) -> list[dict[str, Any]]:
    frames = [chunk for chunk in text.split("\n\n") if chunk.startswith("data: ")]
    return [json.loads(frame[len("data: ") :]) for frame in frames]


def test_chat_streams_steps_then_the_answer() -> None:
    agent = FakeAgent(_events())
    client = _client(agent)

    response = client.post("/chat", json={"message": "Headcount?"}, headers=_auth())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache, no-transform"

    payloads = _payloads(response.text)
    assert [payload["type"] for payload in payloads] == ["step", "answer"]
    assert payloads[0]["step"] == "classify_intent"
    assert payloads[1]["outcome"] == "answered"
    assert agent.messages == ["Headcount?"]


def test_chat_trims_the_message() -> None:
    agent = FakeAgent(_events())

    response = _client(agent).post(
        "/chat",
        json={"message": "  Headcount?  "},
        headers=_auth(),
    )

    assert response.status_code == 200
    assert agent.messages == ["Headcount?"]


def test_chat_requires_the_service_token() -> None:
    client = _client(FakeAgent(_events()))

    assert client.post("/chat", json={"message": "Headcount?"}).status_code == 401
    assert (
        client.post(
            "/chat",
            json={"message": "Headcount?"},
            headers={"Authorization": "Bearer nope"},
        ).status_code
        == 401
    )


def test_chat_refuses_to_run_without_a_configured_token() -> None:
    response = _client(FakeAgent(_events()), configured=False).post(
        "/chat",
        json={"message": "Headcount?"},
        headers=_auth(),
    )

    assert response.status_code == 503


def test_chat_rejects_blank_and_oversized_messages() -> None:
    client = _client(FakeAgent(_events()))

    assert client.post("/chat", json={"message": "   "}, headers=_auth()).status_code == 422
    assert client.post("/chat", json={"message": "x" * 2001}, headers=_auth()).status_code == 422


def test_an_unexpected_crash_becomes_one_error_frame() -> None:
    client = _client(FakeAgent(error=RuntimeError("boom")))

    response = client.post("/chat", json={"message": "Headcount?"}, headers=_auth())

    assert response.status_code == 200
    payloads = _payloads(response.text)
    assert len(payloads) == 1
    assert payloads[0]["type"] == "error"
    assert "boom" not in response.text


def test_openapi_documents_the_chat_stream() -> None:
    schema = _client(FakeAgent(_events())).get("/openapi.json").json()

    assert "/chat" in schema["paths"]
    assert "text/event-stream" in schema["paths"]["/chat"]["post"]["responses"]["200"]["content"]


def test_sse_frame_ends_with_a_blank_line() -> None:
    frame = sse_frame(ErrorEvent(message="stopped"))

    assert frame == 'data: {"type":"error","message":"stopped"}\n\n'
