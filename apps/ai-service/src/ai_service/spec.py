"""The query contract shared with core-api (D51/D60).

Mirrors core-api's Zod `querySpecSchema`. core-api stays authoritative: a spec
this module lets through but the compiler rejects comes back as a 400 and the
graph's repair node (6.3) gets one chance to fix it.

Field names are snake_case in Python and camelCase on the wire
(`timeGrain`, `orderBy`), matching the TypeScript contract.
"""

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Mirrors core-api's query.constants.ts.
MAX_ROWS = 10_000
DEFAULT_LIMIT = 1_000


class ContractModel(BaseModel):
    """Base for wire models: camelCase aliases accepted, extras ignored."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class FilterOperator(StrEnum):
    EQ = "eq"
    NEQ = "neq"
    IN = "in"
    NOT_IN = "not_in"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    BETWEEN = "between"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"


class TimeGrain(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"


FilterScalar = str | int | float | bool
FilterValue = FilterScalar | list[FilterScalar]


class QueryFilter(ContractModel):
    """One condition. `value` is omitted for is_null / is_not_null."""

    dimension: str = Field(min_length=1, max_length=64)
    operator: FilterOperator
    value: FilterValue | None = None


class TimeGrainSpec(ContractModel):
    dimension: str = Field(min_length=1, max_length=64)
    grain: TimeGrain


class OrderBy(ContractModel):
    field: str = Field(min_length=1, max_length=64)
    direction: Literal["asc", "desc"] = "asc"


class QuerySpec(ContractModel):
    """The only query language core-api accepts (D9/D51)."""

    dataset: str | None = None
    metrics: list[str] = Field(min_length=1, max_length=20)
    dimensions: list[str] = Field(default_factory=list, max_length=20)
    time_grain: TimeGrainSpec | None = Field(default=None, alias="timeGrain")
    filters: list[QueryFilter] = Field(default_factory=list, max_length=20)
    order_by: list[OrderBy] = Field(default_factory=list, alias="orderBy", max_length=10)
    limit: int | None = Field(default=None, ge=1, le=MAX_ROWS)

    def to_payload(self) -> dict[str, Any]:
        """JSON for core-api: camelCase keys, unset optionals omitted.

        Defaults (`dimensions: []`, `filters: []`, `direction: "asc"`) are
        dropped too; the Zod schema fills them in, so the wire body stays as
        small as the question.
        """
        return self.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
            exclude_defaults=True,
        )


class ResultColumn(ContractModel):
    name: str
    data_type: str = Field(alias="dataType")


class QueryResult(ContractModel):
    """Rows plus the metadata needed to present them. `meta` is ignored."""

    columns: list[ResultColumn]
    rows: list[dict[str, Any]]
    row_count: int = Field(alias="rowCount")
    truncated: bool
    duration_ms: int = Field(alias="durationMs")
