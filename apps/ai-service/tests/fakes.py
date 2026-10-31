"""Shared test doubles for the agent graph (6.3).

Duck-typed stand-ins for the two clients in `AgentDeps`: `FakeLlm` replays
queued structured answers (or raises queued errors) and records every prompt;
`FakeCoreApi` serves one `ModelContext` and records executed specs. Neither
touches the network, the clock, or Docker.
"""

from collections.abc import Iterable
from typing import Any

from pydantic import BaseModel

from ai_service.core_api import (
    Capabilities,
    ContextDataset,
    ContextDimension,
    ContextJoin,
    ContextMetric,
    ContextMetricFilter,
    ContextModel,
    ContextSource,
    JoinEndpoint,
    ModelContext,
)
from ai_service.llm import LlmResult, LlmUsage
from ai_service.spec import QueryResult, ResultColumn

USAGE = LlmUsage(
    model="test/model",
    prompt_tokens=10,
    completion_tokens=5,
    total_tokens=15,
    latency_ms=1,
    cost_usd=0.0001,
)


class FakeLlm:
    """Queue one answer per Pydantic schema name; raise queued exceptions."""

    def __init__(self, responses: dict[str, Iterable[BaseModel | Exception]]) -> None:
        self._responses = {name: list(items) for name, items in responses.items()}
        self.calls: list[dict[str, Any]] = []

    async def structured(
        self,
        *,
        schema: type[BaseModel],
        system: str,
        user: str,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LlmResult:
        self.calls.append(
            {
                "schema": schema.__name__,
                "system": system,
                "user": user,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )

        queue = self._responses.get(schema.__name__)
        if not queue:
            raise AssertionError(f"FakeLlm has no queued answer for {schema.__name__}")

        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item

        data = item if isinstance(item, BaseModel) else schema.model_validate(item)
        return LlmResult(data=data, usage=USAGE)

    async def aclose(self) -> None:
        """Match `LlmClient` so the lifespan can close either one."""


class FakeCoreApi:
    """Serve one context and replay queued `execute` outcomes."""

    def __init__(
        self,
        context: ModelContext | Exception,
        results: Iterable[QueryResult | Exception] = (),
    ) -> None:
        self._context = context
        self._results = list(results)
        self.context_calls = 0
        self.executed: list[Any] = []

    async def context(self) -> ModelContext:
        self.context_calls += 1
        if isinstance(self._context, Exception):
            raise self._context
        return self._context

    async def execute(self, spec: Any) -> QueryResult:
        self.executed.append(spec)
        if not self._results:
            raise AssertionError("FakeCoreApi has no queued execute result")

        item = self._results.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    async def aclose(self) -> None:
        """Match `CoreApiClient` so the lifespan can close either one."""


def acme_context() -> ModelContext:
    """A small two-fact model: HR (employees -> departments) and sales.

    Deliberately includes an unreachable pair (`orders` / `products`) so tests
    can prove the draft prompt only shows the selected fact's neighbourhood.
    """
    return ModelContext(
        model=ContextModel(
            id="model-1",
            name="Acme Inc.",
            description="HR and sales semantics.",
        ),
        datasets=[
            ContextDataset(
                name="employees",
                source=ContextSource(schema_name="hr", object_name="employees"),
                description="One row per employee.",
                dimensions=[
                    ContextDimension(
                        name="hire_date",
                        column="hire_date",
                        data_type="date",
                        family="date",
                        description="Date the employee joined.",
                    ),
                    ContextDimension(
                        name="is_active",
                        column="is_active",
                        data_type="boolean",
                        family="boolean",
                    ),
                    ContextDimension(
                        name="department_id",
                        column="department_id",
                        data_type="integer",
                        family="numeric",
                    ),
                ],
                metrics=[
                    ContextMetric(
                        name="headcount",
                        agg="count",
                        expression="id",
                        description="Active employees.",
                        filters=[
                            ContextMetricFilter(dimension="is_active", operator="eq", value=True)
                        ],
                    ),
                    ContextMetric(
                        name="avg_salary",
                        agg="avg",
                        expression="salary",
                        description="Average salary of active employees.",
                        filters=[
                            ContextMetricFilter(dimension="is_active", operator="eq", value=True)
                        ],
                    ),
                ],
            ),
            ContextDataset(
                name="departments",
                source=ContextSource(schema_name="hr", object_name="departments"),
                description="One row per department.",
                dimensions=[
                    ContextDimension(
                        name="department",
                        column="name",
                        data_type="text",
                        family="text",
                        description="Department name.",
                    )
                ],
            ),
            ContextDataset(
                name="orders",
                source=ContextSource(schema_name="sales", object_name="orders"),
                description="One row per order.",
                dimensions=[
                    ContextDimension(
                        name="order_date",
                        column="ordered_at",
                        data_type="date",
                        family="date",
                    ),
                    ContextDimension(
                        name="status",
                        column="status",
                        data_type="text",
                        family="text",
                    ),
                    ContextDimension(
                        name="customer_id",
                        column="customer_id",
                        data_type="integer",
                        family="numeric",
                    ),
                    ContextDimension(
                        name="product_id",
                        column="product_id",
                        data_type="integer",
                        family="numeric",
                    ),
                ],
                metrics=[
                    ContextMetric(
                        name="revenue",
                        agg="sum",
                        expression="total_amount",
                        description="Non-cancelled revenue.",
                        filters=[
                            ContextMetricFilter(
                                dimension="status", operator="neq", value="cancelled"
                            )
                        ],
                    )
                ],
            ),
            ContextDataset(
                name="customers",
                source=ContextSource(schema_name="sales", object_name="customers"),
                dimensions=[
                    ContextDimension(
                        name="country",
                        column="country",
                        data_type="text",
                        family="text",
                    ),
                    ContextDimension(
                        name="segment",
                        column="segment",
                        data_type="text",
                        family="text",
                    ),
                ],
            ),
            ContextDataset(
                name="products",
                source=ContextSource(schema_name="sales", object_name="products"),
                dimensions=[
                    ContextDimension(
                        name="product_category",
                        column="category",
                        data_type="text",
                        family="text",
                    ),
                    ContextDimension(
                        name="product_name",
                        column="name",
                        data_type="text",
                        family="text",
                    ),
                ],
            ),
        ],
        joins=[
            ContextJoin(
                name="employees_department",
                source=JoinEndpoint(dataset="employees", column="department_id"),
                target=JoinEndpoint(dataset="departments", column="id"),
                type="left",
            ),
            ContextJoin(
                name="orders_customer",
                source=JoinEndpoint(dataset="orders", column="customer_id"),
                target=JoinEndpoint(dataset="customers", column="id"),
                type="left",
            ),
            ContextJoin(
                name="orders_product",
                source=JoinEndpoint(dataset="orders", column="product_id"),
                target=JoinEndpoint(dataset="products", column="id"),
                type="left",
            ),
        ],
        capabilities=Capabilities(
            time_grains=["day", "week", "month", "quarter", "year"],
            filter_operators=[
                "eq",
                "neq",
                "in",
                "not_in",
                "gt",
                "gte",
                "lt",
                "lte",
                "between",
                "is_null",
                "is_not_null",
            ],
            max_metrics=20,
            max_dimensions=20,
            max_filters=20,
            max_order_by=10,
            max_rows=10_000,
            default_limit=1_000,
        ),
    )


def headcount_result() -> QueryResult:
    """A canned execution result for 6.3b; harmless here."""
    return QueryResult(
        columns=[
            ResultColumn(name="department", data_type="text"),
            ResultColumn(name="headcount", data_type="bigint"),
        ],
        rows=[
            {"department": "Engineering", "headcount": 11},
            {"department": "Sales", "headcount": 8},
        ],
        row_count=2,
        truncated=False,
        duration_ms=7,
    )
