"""Prompt text for the agent graph (6.3).

Prompts live here, not inside nodes, so they are reviewable and diffable, and so
tests can assert exactly what the model sees. Every catalog line comes from
core-api's validated context (D60) — the model can only choose real names.

The user's question is always the *user* message; it never enters a system
prompt (prompt-injection hygiene, hardened further in 8.4).
"""

from datetime import date

from ai_service.core_api import ContextDataset, ContextDimension, ModelContext

CLASSIFY_SYSTEM = (
    "You route messages for a business-intelligence assistant. Decide whether the "
    "message is a question about the company's data (metrics, dimensions, trends, "
    "comparisons, record counts) or whether it is out of scope (small talk, coding "
    "help, unrelated topics).\n"
    "Choose `data_question` whenever the message plausibly asks about the data; "
    "choose `out_of_scope` only when it is clearly unrelated."
)

SELECT_SYSTEM = (
    "You plan queries for a business-intelligence assistant. Given the semantic "
    "model and a question, choose the single fact dataset the question should be "
    "answered from.\n"
    "The fact dataset is the one whose metrics the question asks about. Dimensions "
    "may come from parent datasets reachable through joins. Never invent names."
)

DRAFT_SYSTEM = (
    "You translate a question into one QuerySpec for a business-intelligence "
    "backend. The backend compiles the spec to SQL; you never write SQL.\n"
    "Use only metric and dimension names listed below. Grouping fields belong in "
    "`dimensions`; aggregates belong in `metrics`; filters use dimension names, "
    "never columns.\n"
    "For a time series, put the date dimension in `timeGrain` with the requested "
    "grain instead of adding it to `dimensions`.\n"
    "Convert relative date ranges into explicit ISO `gte`/`lte` filter values "
    "relative to today's date. For rankings, add `orderBy` on the metric and a "
    "reasonable `limit`."
)

OUT_OF_SCOPE_ANSWER = (
    "I can only answer questions about the connected data model. "
    "Try asking about one of the metrics or dimensions defined there."
)

FAILED_ANSWER = "I couldn't answer that question. Please try rephrasing it."


def _describe(dataset: ContextDataset) -> str:
    return f" — {dataset.description}" if dataset.description else ""


def _dimension_label(dimension: ContextDimension) -> str:
    return f"{dimension.name} ({dimension.data_type}, {dimension.family})"


def _dimension_line(dimension: ContextDimension) -> str:
    description = f" — {dimension.description}" if dimension.description else ""
    return f"- {_dimension_label(dimension)}{description}"


def render_catalog(context: ModelContext) -> str:
    """Compact, sorted overview of every dataset, metric, dimension, and join."""
    lines = [f"Model: {context.model.name}"]
    if context.model.description:
        lines.append(context.model.description)

    lines.append("")
    lines.append("Datasets (pick exactly one fact dataset):")
    for dataset in sorted(context.datasets, key=lambda item: item.name):
        lines.append(f"- {dataset.name}{_describe(dataset)}")
        if dataset.metrics:
            metrics = ", ".join(sorted(metric.name for metric in dataset.metrics))
            lines.append(f"  metrics: {metrics}")
        if dataset.dimensions:
            dimensions = ", ".join(
                _dimension_label(dimension)
                for dimension in sorted(dataset.dimensions, key=lambda item: item.name)
            )
            lines.append(f"  dimensions: {dimensions}")

    lines.append("")
    lines.append("Joins (child -> parent, one hop each):")
    for join in sorted(context.joins, key=lambda item: item.name):
        lines.append(
            f"- {join.name}: {join.source.dataset}.{join.source.column} -> "
            f"{join.target.dataset}.{join.target.column} ({join.type})"
        )

    return "\n".join(lines)


def reachable_datasets(context: ModelContext, base: str) -> set[str]:
    """The base dataset plus every parent reachable by following joins.

    Joins are directed child -> parent, mirroring the compiler (D50), so this
    walks outward exactly as the query planner will. Returns an empty set for an
    unknown base name.
    """
    known = {dataset.name for dataset in context.datasets}
    if base not in known:
        return set()

    reachable = {base}
    changed = True
    while changed:
        changed = False
        for join in context.joins:
            if join.source.dataset in reachable and join.target.dataset not in reachable:
                reachable.add(join.target.dataset)
                changed = True
    return reachable


def render_dataset_context(context: ModelContext, base: str, today: date) -> str:
    """The narrow view handed to `draft_spec`: one fact plus its parents.

    Offering only reachable datasets keeps the model from mixing metrics across
    fact tables, which the compiler would reject anyway.
    """
    datasets = {dataset.name: dataset for dataset in context.datasets}
    if base not in datasets:
        raise ValueError(f"unknown dataset: {base}")

    reachable = reachable_datasets(context, base)
    fact = datasets[base]

    lines = [f"Today is {today.isoformat()} (UTC).", "", f"Fact dataset: {base}"]
    if fact.description:
        lines.append(fact.description)

    lines.append("")
    lines.append("Metrics (aggregate only these; they belong to the fact dataset):")
    for metric in sorted(fact.metrics, key=lambda item: item.name):
        detail = f"- {metric.name} (agg: {metric.agg}"
        if metric.expression:
            detail += f", expression: {metric.expression}"
        if metric.filters:
            filters = ", ".join(
                f"{item.dimension} {item.operator} {item.value}" for item in metric.filters
            )
            detail += f"; built-in filters: {filters}"
        detail += ")"
        if metric.description:
            detail += f" — {metric.description}"
        lines.append(detail)

    lines.append("")
    lines.append("Dimensions you can group or filter by:")
    for dimension in sorted(fact.dimensions, key=lambda item: item.name):
        lines.append(_dimension_line(dimension))

    for parent_name in sorted(reachable - {base}):
        parent = datasets[parent_name]
        lines.append("")
        lines.append(f"Dimensions from `{parent_name}` (reachable through joins):")
        if parent.description:
            lines.append(parent.description)
        for dimension in sorted(parent.dimensions, key=lambda item: item.name):
            lines.append(_dimension_line(dimension))

    lines.append("")
    lines.append("Joins available for this fact dataset:")
    for join in sorted(context.joins, key=lambda item: item.name):
        if join.source.dataset in reachable and join.target.dataset in reachable:
            lines.append(
                f"- {join.source.dataset}.{join.source.column} -> "
                f"{join.target.dataset}.{join.target.column} ({join.type})"
            )

    capabilities = context.capabilities
    lines.append("")
    lines.append(
        f"Limits: at most {capabilities.max_metrics} metrics, "
        f"{capabilities.max_dimensions} dimensions, {capabilities.max_filters} filters, "
        f"{capabilities.max_order_by} orderBy entries; rows are capped at "
        f"{capabilities.max_rows}; default limit {capabilities.default_limit}. "
        f"Time grains: {', '.join(capabilities.time_grains)}. "
        f"Filter operators: {', '.join(capabilities.filter_operators)}."
    )

    return "\n".join(lines)


def select_user(context: ModelContext, question: str) -> str:
    """User message for `select_context`: catalog first, question last."""
    return f"{render_catalog(context)}\n\nQuestion:\n{question}"


def draft_user(context: ModelContext, base: str, question: str, today: date) -> str:
    """User message for `draft_spec`: the narrowed model, rules, then question."""
    return (
        f"{render_dataset_context(context, base, today)}\n\n"
        f'Build one QuerySpec. Set "dataset" to "{base}".\n'
        "Use metric names for `metrics`, dimension names for `dimensions` and "
        "`filters`, and metric or dimension names for `orderBy` fields.\n\n"
        f"Question:\n{question}"
    )
