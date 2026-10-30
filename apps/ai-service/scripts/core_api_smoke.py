"""One real round-trip against a running core-api (6.2).

Start Postgres + core-api, make sure both `.env` files share the same
`INTERNAL_API_TOKEN`, then run:

    pnpm ai:smoke:core

Exits 0 with a SKIP line when the token is missing, like `pnpm ai:smoke`.
"""

import asyncio
import sys

from ai_service.config import get_settings
from ai_service.core_api import CoreApiClient, CoreApiError
from ai_service.spec import FilterOperator, OrderBy, QueryFilter, QuerySpec


async def main() -> int:
    settings = get_settings()

    if not settings.core_api_configured:
        print("SKIP  INTERNAL_API_TOKEN is not set in apps/ai-service/.env")
        return 0

    client = CoreApiClient(settings)

    try:
        context = await client.context()
        metrics = sum(len(dataset.metrics) for dataset in context.datasets)
        print(
            f"context  {context.model.name}: {len(context.datasets)} datasets, "
            f"{metrics} metrics, {len(context.joins)} joins"
        )

        result = await client.execute(
            QuerySpec(
                metrics=["headcount"],
                dimensions=["department"],
                filters=[
                    QueryFilter(
                        dimension="department",
                        operator=FilterOperator.IS_NOT_NULL,
                    )
                ],
                order_by=[OrderBy(field="headcount", direction="desc")],
            )
        )
        print(
            f"execute  headcount by department: {result.row_count} rows in {result.duration_ms} ms"
        )
        for row in result.rows:
            department = row.get("department") or "?"
            print(f"  {department:<20} {row.get('headcount', '?')}")
    except CoreApiError as exc:
        print(f"FAILED  {exc}")
        return 1
    finally:
        await client.aclose()

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
