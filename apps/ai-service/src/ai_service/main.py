from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from ai_service import __version__
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


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the ASGI app. Tests use this factory; uvicorn imports `app`."""
    settings = settings or get_settings()
    llm = LlmClient(settings)
    core_api = CoreApiClient(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await core_api.aclose()
        await llm.aclose()

    app = FastAPI(title="AI BI ai-service", version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.state.llm = llm
    app.state.core_api = core_api

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
