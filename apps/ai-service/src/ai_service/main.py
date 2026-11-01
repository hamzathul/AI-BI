from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from ai_service import __version__
from ai_service.agent import Agent, AgentDeps
from ai_service.chat import router as chat_router
from ai_service.config import Settings, get_settings
from ai_service.core_api import CoreApiClient
from ai_service.llm import LlmClient

SERVICE_NAME = "ai-service"


class HealthResponse(BaseModel):
    """Liveness payload for the internal AI service."""

    status: Literal["ok"]
    service: str
    version: str
    timestamp: datetime
    llm: Literal["configured", "missing"]


def create_app(settings: Settings | None = None, *, agent: Agent | None = None) -> FastAPI:
    """Build the ASGI app. Tests use this factory; uvicorn imports `app`.

    `agent` is injectable so route tests can stream from a fake without a key,
    a network, or Docker. One agent is safe to reuse: it holds no run state.
    """
    settings = settings or get_settings()
    llm = LlmClient(settings)
    core_api = CoreApiClient(settings)
    agent = agent or Agent(AgentDeps(llm=llm, core_api=core_api))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await core_api.aclose()
        await llm.aclose()

    app = FastAPI(title="AI BI ai-service", version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.state.llm = llm
    app.state.core_api = core_api
    app.state.agent = agent

    app.include_router(chat_router)

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=SERVICE_NAME,
            version=__version__,
            timestamp=datetime.now(UTC),
            llm="configured" if settings.llm_configured else "missing",
        )

    return app


app = create_app()
