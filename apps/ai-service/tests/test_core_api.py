import json
from collections.abc import Callable
from typing import Any

import httpx2
import pytest

from ai_service.config import Settings
from ai_service.core_api import (
    CoreApiBadResponse,
    CoreApiClient,
    CoreApiNotConfigured,
    CoreApiRejected,
    CoreApiUnavailable,
)
from ai_service.spec import FilterOperator, OrderBy, QueryFilter, QuerySpec

TOKEN = "test-token-0123456789abcdef0123456789abcdef"

CONTEXT: dict[str, Any] = {
    "model": {
        "id": "model-1",
        "name": "Acme Inc.",
        "description": "HR and sales semantics.",
    },
    "datasets": [
        {
            "name": "employees",
            "source": {"schema": "hr", "object": "employees"},
            "description": "One row per employee.",
            "dimensions": [
                {
                    "name": "hire_date",
                    "column": "hire_date",
                    "dataType": "date",
                    "family": "date",
                    "description": "Date the employee joined.",
                }
            ],
            "metrics": [
                {
                    "name": "headcount",
                    "agg": "count",
                    "expression": "id",
                    "description": "Active employees.",
                    "filters": [{"dimension": "is_active", "operator": "eq", "value": True}],
                }
            ],
        }
    ],
    "joins": [
        {
            "name": "employees_department",
            "from": {"dataset": "employees", "column": "department_id"},
            "to": {"dataset": "departments", "column": "id"},
            "type": "left",
        }
    ],
    "capabilities": {
        "timeGrains": ["day", "week", "month", "quarter", "year"],
        "filterOperators": ["eq", "neq"],
        "maxMetrics": 20,
        "maxDimensions": 20,
        "maxFilters": 20,
        "maxOrderBy": 10,
        "maxRows": 10_000,
        "defaultLimit": 1_000,
    },
}

RESULT: dict[str, Any] = {
    "columns": [
        {"name": "department", "dataType": "text"},
        {"name": "headcount", "dataType": "bigint"},
    ],
    "rows": [{"department": "Engineering", "headcount": 11}],
    "rowCount": 1,
    "truncated": False,
    "durationMs": 12,
    # The client ignores meta; it must not break parsing when present.
    "meta": {"modelId": "model-1", "compiledSql": "SELECT ..."},
}

Handler = Callable[[httpx2.Request], httpx2.Response]


def _settings(**overrides: object) -> Settings:
    """Hermetic settings: never read the developer's .env."""
    return Settings(
        _env_file=None,
        internal_api_token=TOKEN,
        **overrides,  # type: ignore[arg-type]
    )


def _client(handler: Handler, settings: Settings | None = None) -> CoreApiClient:
    http = httpx2.AsyncClient(
        transport=httpx2.MockTransport(handler),
        base_url="http://core-api.test",
    )
    return CoreApiClient(settings or _settings(), http_client=http)


def _route(method: str, body: dict[str, Any], status: int = 200) -> Handler:
    def handler(request: httpx2.Request) -> httpx2.Response:
        assert request.method == method
        return httpx2.Response(status, json=body)

    return handler


async def test_context_sends_the_service_token_and_parses() -> None:
    calls: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(200, json=CONTEXT)

    context = await _client(handler).context()

    assert calls[0].method == "GET"
    assert calls[0].url.path == "/api/internal/context"
    assert calls[0].headers["authorization"] == f"Bearer {TOKEN}"
    assert calls[0].headers["accept"] == "application/json"

    assert context.model.name == "Acme Inc."
    assert context.datasets[0].source.schema_name == "hr"
    assert context.datasets[0].source.object_name == "employees"
    assert context.datasets[0].metrics[0].filters[0].value is True
    assert context.joins[0].source.dataset == "employees"
    assert context.joins[0].target.dataset == "departments"
    assert context.capabilities.time_grains[-1] == "year"
    assert context.capabilities.max_rows == 10_000


async def test_execute_sends_camel_case_and_parses_rows() -> None:
    calls: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(200, json=RESULT)

    spec = QuerySpec(
        metrics=["revenue"],
        dimensions=["product_category"],
        time_grain={"dimension": "order_date", "grain": "month"},  # type: ignore[arg-type]
        order_by=[OrderBy(field="revenue", direction="desc")],
        limit=100,
    )

    result = await _client(handler).execute(spec)

    assert calls[0].method == "POST"
    assert calls[0].url.path == "/api/internal/specs/execute"
    assert json.loads(calls[0].content) == {
        "metrics": ["revenue"],
        "dimensions": ["product_category"],
        "timeGrain": {"dimension": "order_date", "grain": "month"},
        "orderBy": [{"field": "revenue", "direction": "desc"}],
        "limit": 100,
    }
    assert result.row_count == 1
    assert result.rows[0]["headcount"] == 11
    assert result.columns[1].data_type == "bigint"


async def test_a_minimal_spec_stays_minimal() -> None:
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        bodies.append(json.loads(request.content))
        return httpx2.Response(200, json=RESULT)

    await _client(handler).execute(QuerySpec(metrics=["headcount"]))

    assert bodies[0] == {"metrics": ["headcount"]}


async def test_boolean_filter_values_stay_booleans() -> None:
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        bodies.append(json.loads(request.content))
        return httpx2.Response(200, json=RESULT)

    await _client(handler).execute(
        QuerySpec(
            metrics=["headcount"],
            filters=[
                QueryFilter(
                    dimension="is_active",
                    operator=FilterOperator.EQ,
                    value=True,
                )
            ],
        )
    )

    assert bodies[0]["filters"] == [{"dimension": "is_active", "operator": "eq", "value": True}]


async def test_missing_token_fails_before_any_network_call() -> None:
    calls: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(200, json=CONTEXT)

    client = _client(handler, settings=Settings(_env_file=None))

    assert client.configured is False
    with pytest.raises(CoreApiNotConfigured, match="INTERNAL_API_TOKEN"):
        await client.context()
    assert calls == []


async def test_401_becomes_a_rejected_error() -> None:
    handler = _route(
        "GET",
        {"statusCode": 401, "message": "Invalid or missing service token."},
        status=401,
    )

    with pytest.raises(CoreApiRejected) as caught:
        await _client(handler).context()

    assert caught.value.status_code == 401
    assert caught.value.message == "Invalid or missing service token."
    assert TOKEN not in str(caught.value)


async def test_a_list_message_is_joined() -> None:
    handler = _route(
        "POST",
        {
            "statusCode": 400,
            "message": ["metrics: too small", "limit: too small"],
        },
        status=400,
    )

    with pytest.raises(CoreApiRejected) as caught:
        await _client(handler).execute(QuerySpec(metrics=["headcount"]))

    assert caught.value.message == "metrics: too small; limit: too small"


async def test_a_5xx_becomes_unavailable() -> None:
    handler = _route("GET", {"message": "boom"}, status=503)

    with pytest.raises(CoreApiUnavailable, match="HTTP 503"):
        await _client(handler).context()


async def test_a_connection_error_becomes_unavailable() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("connection refused")

    with pytest.raises(CoreApiUnavailable, match="unreachable"):
        await _client(handler).context()


async def test_a_non_json_body_becomes_bad_response() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, text="<html>not json</html>")

    with pytest.raises(CoreApiBadResponse, match="non-JSON"):
        await _client(handler).context()


async def test_a_wrong_shape_becomes_bad_response() -> None:
    handler = _route("GET", {"model": {}})

    with pytest.raises(CoreApiBadResponse, match="ModelContext"):
        await _client(handler).context()


async def test_closing_an_owned_client_is_safe_twice() -> None:
    client = CoreApiClient(_settings())
    await client.aclose()
    await client.aclose()
