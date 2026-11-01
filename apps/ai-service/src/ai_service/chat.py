"""`POST /chat`: one question, streamed as server-sent events (6.4a).

The browser never calls this service directly: core-api holds the only public
surface and proxies these frames (D43/D63). The route still requires the shared
service token so nothing else on the host can spend LLM credits.

Frames are `data: <json>` lines; the JSON carries `type` (`step`, `answer`, or
`error`). See `agent/events.py` for the contract.
"""

import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from ai_service.agent.events import AgentEvent, ErrorEvent, sse_frame
from ai_service.security import require_service_token

logger = logging.getLogger(__name__)

MAX_MESSAGE_CHARS = 2000

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    """One user message. Whitespace-only input is rejected, not sent."""

    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator("message")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        message = value.strip()
        if not message:
            raise ValueError("message must not be empty")
        return message


@router.post(
    "/chat",
    dependencies=[Depends(require_service_token)],
    response_class=StreamingResponse,
    summary="Answer one question as server-sent events",
    responses={
        200: {
            "description": (
                "SSE frames. `step` events report progress, `answer` is final, "
                "`error` means the run broke after streaming started."
            ),
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
        },
        401: {"description": "Missing or wrong service token"},
        503: {"description": "The service has no INTERNAL_API_TOKEN configured"},
    },
)
async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
    """Start one run and stream its steps.

    Expected failures are inside the stream: the graph turns them into a normal
    `answer` event with `outcome="failed"`, which the UI can render. Only an
    unexpected bug produces an `error` frame.
    """
    agent = request.app.state.agent
    return StreamingResponse(
        _frames(agent.stream(body.message)),
        media_type="text/event-stream",
        headers={
            # No caching and no proxy buffering: the timeline must appear live.
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


async def _frames(events: AsyncIterator[AgentEvent]) -> AsyncIterator[str]:
    """Serialize events, converting an unexpected crash into one final frame."""
    try:
        async for event in events:
            yield sse_frame(event)
    except Exception:
        # Never include the exception text: it can name semantic objects.
        logger.exception("chat_stream_failed")
        yield sse_frame(ErrorEvent(message="The AI service stopped before finishing."))
