"""Typed client for core-api's internal API (D60).

The ai-service is stateless (D16): it never opens the app or source database.
Everything it knows arrives through these two calls, and every question is
answered by a QuerySpec that core-api compiles and executes.

The shared token comes from `INTERNAL_API_TOKEN` (the same value core-api
validates). It travels only in the Authorization header and is never logged.
"""

import logging
import time
from typing import Any

import httpx2
from pydantic import BaseModel, Field, ValidationError

from ai_service.config import Settings, get_settings
from ai_service.spec import ContractModel, QueryResult, QuerySpec

logger = logging.getLogger(__name__)

CONTEXT_PATH = "/api/internal/context"
EXECUTE_PATH = "/api/internal/specs/execute"


class CoreApiError(Exception):
    """Base class for every failure raised by this client."""


class CoreApiNotConfigured(CoreApiError):
    """`INTERNAL_API_TOKEN` is missing, so no call can be attempted."""


class CoreApiRejected(CoreApiError):
    """core-api answered 4xx: the request was wrong, retrying will not help."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(f"core-api rejected the request (HTTP {status_code}): {message}")
        self.status_code = status_code
        self.message = message


class CoreApiUnavailable(CoreApiError):
    """Connection, timeout, or a 5xx from core-api. Possibly transient."""


class CoreApiBadResponse(CoreApiError):
    """core-api answered 2xx with something that is not the agreed shape."""


class ContextSource(ContractModel):
    schema_name: str = Field(alias="schema")
    object_name: str = Field(alias="object")


class ContextDimension(ContractModel):
    name: str
    column: str
    data_type: str = Field(alias="dataType")
    family: str
    description: str | None = None


class ContextMetricFilter(ContractModel):
    dimension: str
    operator: str
    value: Any = None


class ContextMetric(ContractModel):
    name: str
    agg: str
    expression: str | None = None
    description: str | None = None
    filters: list[ContextMetricFilter] = Field(default_factory=list)


class ContextDataset(ContractModel):
    name: str
    source: ContextSource
    description: str | None = None
    dimensions: list[ContextDimension] = Field(default_factory=list)
    metrics: list[ContextMetric] = Field(default_factory=list)


class JoinEndpoint(ContractModel):
    dataset: str
    column: str


class ContextJoin(ContractModel):
    name: str
    source: JoinEndpoint = Field(alias="from")
    target: JoinEndpoint = Field(alias="to")
    type: str


class ContextModel(ContractModel):
    id: str | None = None
    name: str
    description: str | None = None


class Capabilities(ContractModel):
    time_grains: list[str] = Field(alias="timeGrains")
    filter_operators: list[str] = Field(alias="filterOperators")
    max_metrics: int = Field(alias="maxMetrics")
    max_dimensions: int = Field(alias="maxDimensions")
    max_filters: int = Field(alias="maxFilters")
    max_order_by: int = Field(alias="maxOrderBy")
    max_rows: int = Field(alias="maxRows")
    default_limit: int = Field(alias="defaultLimit")


class ModelContext(ContractModel):
    """A validated semantic model, ready to be described to the LLM."""

    model: ContextModel
    datasets: list[ContextDataset]
    joins: list[ContextJoin]
    capabilities: Capabilities


def error_message(response: httpx2.Response) -> str:
    """Read core-api's error envelope, whose `message` may be a string or list."""
    try:
        body = response.json()
    except ValueError:
        return f"core-api returned HTTP {response.status_code}"

    message = body.get("message") if isinstance(body, dict) else None

    if isinstance(message, list):
        return "; ".join(str(entry) for entry in message)
    if isinstance(message, str) and message.strip():
        return message

    return f"core-api returned HTTP {response.status_code}"


class CoreApiClient:
    """Two calls, one token: read the model, execute a QuerySpec."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._client = http_client
        self._owns_client = http_client is None

    @property
    def configured(self) -> bool:
        return self._settings.core_api_configured

    def _token(self) -> str:
        token = self._settings.internal_api_token
        if token is None:  # unreachable after the configuration check
            raise CoreApiNotConfigured("INTERNAL_API_TOKEN is not set")
        return token.get_secret_value()

    def _http(self) -> httpx2.AsyncClient:
        missing = self._settings.missing_core_api_settings
        if missing:
            raise CoreApiNotConfigured(
                f"core-api is not configured — set {', '.join(missing)} in apps/ai-service/.env"
            )

        if self._client is None:
            self._client = httpx2.AsyncClient(
                base_url=self._settings.core_api_url,
                timeout=self._settings.core_api_timeout_seconds,
            )

        return self._client

    async def aclose(self) -> None:
        """Release the connection pool we created (FastAPI lifespan)."""
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    async def context(self) -> ModelContext:
        """The saved semantic model, validated against the current metadata."""
        response = await self._request("GET", CONTEXT_PATH)
        return self._parse(response, ModelContext)

    async def execute(self, spec: QuerySpec) -> QueryResult:
        """Compile and run a QuerySpec against the read-only source."""
        response = await self._request("POST", EXECUTE_PATH, json=spec.to_payload())
        return self._parse(response, QueryResult)

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx2.Response:
        http = self._http()
        headers = {
            "Authorization": f"Bearer {self._token()}",
            "Accept": "application/json",
        }
        started = time.perf_counter()
        status = 0

        try:
            response = await http.request(method, path, headers=headers, **kwargs)
            status = response.status_code
        except httpx2.TimeoutException as exc:
            raise CoreApiUnavailable(f"core-api timed out ({type(exc).__name__})") from exc
        except httpx2.HTTPError as exc:
            raise CoreApiUnavailable(f"core-api is unreachable ({type(exc).__name__})") from exc
        finally:
            # One line per call; never the token, never the body.
            logger.info(
                "core_api_call method=%s path=%s status=%d latency_ms=%d",
                method,
                path,
                status,
                int((time.perf_counter() - started) * 1000),
            )

        if 400 <= status < 500:
            raise CoreApiRejected(status, error_message(response))
        if status >= 500:
            raise CoreApiUnavailable(f"core-api returned HTTP {status}")

        return response

    @staticmethod
    def _parse[T: BaseModel](response: httpx2.Response, schema: type[T]) -> T:
        try:
            payload = response.json()
        except ValueError as exc:
            raise CoreApiBadResponse("core-api returned a non-JSON body") from exc

        try:
            return schema.model_validate(payload)
        except ValidationError as exc:
            first = exc.errors()[0]
            where = ".".join(str(part) for part in first["loc"]) or "<root>"
            raise CoreApiBadResponse(
                f"core-api response did not match {schema.__name__} ({where}: {first['type']})"
            ) from exc
