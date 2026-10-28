from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from ai_service import __version__

SERVICE_NAME = "ai-service"


class HealthResponse(BaseModel):
    """Liveness payload for the internal AI service."""

    status: Literal["ok"]
    service: str
    version: str
    timestamp: datetime


def create_app() -> FastAPI:
    """Build the ASGI app. Tests use this factory; uvicorn imports `app`."""
    app = FastAPI(title="AI BI ai-service", version=__version__)

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=SERVICE_NAME,
            version=__version__,
            timestamp=datetime.now(UTC),
        )

    return app


app = create_app()
