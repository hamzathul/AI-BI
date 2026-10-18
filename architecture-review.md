# AI Analytics SaaS — Principal Architect Review

> **Date:** October 18, 2026
> **Scope:** Critical evaluation of the proposed architecture for an AI-powered, agentic analytics & dashboard SaaS platform (conversational BI, multi-warehouse connectors, semantic layer, text-to-SQL, dashboard builder).
> **How to read this:** Sections 1–2 are the evaluation (what's right, where I'd push back). Section 3 lists risks missing from the brief. Sections 4–6 are decisions: MVP split, technical-debt watchlist, and open-source/vendor evaluation. Section 7 is the clarifying questions. Every claim about current tools/frameworks was verified against official docs (LangGraph, Cube, dbt, SQLGlot, Wren, Fabric docs, Langfuse) on the date above.

---

## Verdict first

The proposed architecture is **~80% right, and unusually well-reasoned for a brief** — but it optimizes the wrong layer. The connector abstraction, service split, and repo plan are all sound. The real risk is not connector count or service topology; it's the **metadata → semantic model → SQL generation** path, the **multi-tenancy/security boundaries**, and the **trust UX**.

One central change:

> **Invert the AI-to-SQL pipeline so the LLM generates a structured query plan (IR), never raw SQL as the primary path — the compiler generates SQL deterministically.**

Everything else follows from that. Additionally: the Phase 4 items (conformance tests, second connector) need to move earlier, and the semantic layer should be thin, owned, and portable — **not** Cube or dbt as a foundation.

---

## Table of contents

1. [What the brief gets right](#1-what-the-brief-gets-right)
2. [Where I'd push back](#2-where-id-push-back)
   - 2.1 [Service split (Q1)](#21-service-split-q1-keep-it--but-impose-two-hard-rules)
   - 2.2 [Repositories (Q2)](#22-repos-q2-exactly-two--and-put-more-in-the-platform-monorepo)
   - 2.3 [Connectors (Q3)](#23-connectors-q3-right-pattern-three-missing-pieces)
   - 2.4 [The pipeline (Q4 + Q7)](#24-the-pipeline-q4--q7-invert-it-generate-ir-compile-sql)
   - 2.5 [Semantic layer (Q5)](#25-semantic-layer-q5-build-a-thin-owned-one-integrate-later-dont-adopt-now)
   - 2.6 [Agent design (Q6)](#26-agent-design-q6-langgraph-yes-langchain-mostly-no)
   - 2.7 [Charts & dashboards (Q8)](#27-chart-specs--dashboard-changes-q8-two-corrections)
   - 2.8 [Filters (Q9)](#28-filters-q9-filters-are-first-class-ir-citizens)
   - 2.9 [Multi-tenancy (Q10)](#29-multi-tenancy-q10-single-writer--scoped-tokens--cache-key-discipline)
   - 2.10 [Execution & scaling (Q11)](#210-execution-caching-jobs-scaling-q11-start-boring-scale-by-subtraction)
3. [Missing from the brief (risks)](#3-missing-from-your-brief-risks-id-put-on-the-board)
4. [MVP vs. postponed (Q12)](#4-mvp-vs-postponed-q12)
5. [Technical debt watchlist (Q13)](#5-expensive-tech-debt-watchlist-q13)
6. [OSS & vendor evaluation (Q14)](#6-oss--vendor-evaluation-q14--state-as-of-today)
7. [The four questions that actually change the design](#7-the-four-questions-that-actually-change-the-design)

---

## 1. What the brief gets right

- **Agent must not decide its own safety**; deterministic policy enforcement outside the LLM. Correct, and rarer than it should be.
- **Don't make the LLM do CRUD** (rename a chart ≠ SQL generation). Correct — this is where many products drown.
- **Structured chart specs, not generated React.** Correct.
- **Patches, not regeneration**, for dashboard edits; optimistic concurrency. Correct.
- **Adapters + registry for connectors**, minimal rewrite when adding a warehouse. Correct concept.
- **Resist premature infra** (no Kafka/K8s until workload justifies). Correct.
- **The core backend is the security boundary.** Correct — and it should be the *only* writer of domain state (see §2.1).

---

## 2. Where I'd push back

### 2.1 Service split (Q1): keep it — but impose two hard rules

NestJS core + Python AI service is right, but the justification isn't "clean architecture." It's:

1. **Ecosystem gravity.** SQLGlot, LangGraph, and the Python eval/ML tooling have no equal on the JS side. There is no production-grade TS equivalent of SQLGlot's 30+ dialect AST toolkit (verified: SQLGlot is a no-dependency parser/transpiler/optimizer supporting 30+ dialects). Forcing this into Node means fighting your ecosystem permanently.
2. **Different scaling/volatility profiles.** The AI service iterates weekly and is LLM-bursty; the core API is latency-critical CRUD that should be boring.

Two rules the brief hints at but doesn't state:

- **The AI service is stateless.** It owns *no* domain data — no conversations, dashboards, connections. Core API is the single writer for everything. Conversation state lives in LangGraph checkpoints (keyed by thread = conversation, referencing core API IDs), but dashboards, queries, metadata, audit — core API only. Two writers = split-brain debugging that will cost months.
- **The AI service never touches customer warehouses and never sees credentials.** It generates plans and SQL strings; core API (and later, query workers) executes them through connectors. This is the cleanest security boundary — keep it absolute.

If the team is tiny and TS-first, a defensible alternative: build Phases 1–2 with the core API only (deterministic pipeline, no LLM service yet), then add the Python AI service. **Not** recommended: a single all-Python backend — you'd trade a clean language boundary for a messier one between you and your Next.js contracts, and NestJS's guards/DI/CRUD patterns are genuinely productive for the product surface.

### 2.2 Repos (Q2): exactly two — and put more in the platform monorepo

- `analytics-platform` monorepo: `apps/core-api`, `apps/ai-service`, plus:
  - `packages/contracts` — OpenAPI specs + JSON Schemas for dashboard/chart/query IR, jointly versioned
  - `packages/connector-sdk` — interfaces + canonical types
  - `packages/connector-testkit` — conformance suite
- `analytics-web`: Next.js, consuming a *generated* client + Zod schemas emitted from `packages/contracts`. No hand-maintained duplication of API types, ever. Contract tests run in CI on both sides.

Three repos only when there are independent owners with independent release access controls — that's an org problem, not an architecture problem. Do **not** create a separate public connector SDK repo until external partners exist; premature platformization here is a classic trap.

### 2.3 Connectors (Q3): right pattern, three missing pieces

The adapter + registry is correct. What's missing:

1. **Async-first query lifecycle.** Design `QueryExecutor` as `submit → status → fetchBatch/cancel → cleanup` from day one, even though Postgres executes in 50 ms. Snowflake, BigQuery, and Databricks are job-based (query handles, jobs API, statement execution APIs); Fabric is a TDS/SQL-Server surface with different timeout behavior. A sync-only interface becomes a rewrite when you add connector #2. Treat "fast query" as the happy path of an async lifecycle, not the only path.
2. **A capability manifest, not just an interface.** Each connector declares machine-readable capabilities (async queries? cancel? parameterization? FK metadata? column comments? per-statement timeout? result streaming?), and the UI + AI service consume that manifest. This is what makes "consistent experience, vendor-specific config" real — the connection wizard renders from the manifest's config schema.
3. **A conformance test kit from day one** (originally planned for Phase 4 — move to Phase 1) plus **a second, deliberately different connector spike early** (2–3 days, not production support). Pick BigQuery (async, nested types) or Fabric. A connector abstraction validated against one implementation is fiction.

Also:

- Canonical type system (small enum: `decimal(p,s)`, `timestamp(unit,tz)`, `string`, `bool`, …) with per-dialect coercion.
- **Arrow as the result transport** between services (both ecosystems support it natively).
- A **normalized error taxonomy** (`AUTH`, `PERMISSION`, `SYNTAX`, `TIMEOUT`, `RATE_LIMIT`, `UNSUPPORTED`, `TRANSIENT`, `CANCELLED`) — the repair loop and the UX depend on it.

**Fabric specifics** (verified from Microsoft docs, since the brief lists Fabric twice):

- Read-only **TDS endpoint on port 1433**, **Entra ID auth** (user or service principal).
- SPN access requires a **tenant-admin Fabric setting** ("Service principals can use Fabric APIs") — i.e., the customer's admin must enable it.
- The connection string **requires a valid Initial Catalog** (warehouse/lakehouse name).
- The lakehouse endpoint has **no foreign-key metadata** to give you (Delta tables don't declare FKs, and adding them blocks further schema changes).
- It supports SQL-level RLS/DLS/Dynamic Data Masking, and a user-identity passthrough mode.

Practical consequence: Fabric is the **hardest** connector — plan it as a dedicated milestone, expect the semantic layer to carry all join knowledge, and remember SPN setup requires *your customer's* tenant admin. Sane order: **Postgres → Snowflake → BigQuery → Fabric/Databricks** for most markets.

### 2.4 The pipeline (Q4 + Q7): invert it. Generate IR, compile SQL.

The brief says "build a structured query plan → generate warehouse-specific SQL." Make the structured plan the *entire* contract:

```
question
 → scoped metadata retrieval (authorized slice only)
 → intent + ambiguity resolution   (may ask 1 clarifying question)
 → Query IR: {metrics, dimensions, filters, time_grain, order, limit, joins}
 → deterministic IR→SQL compile (SQLGlot; dialect = connector)
 → validation layers
 → execute via core API job → Arrow result
 → chart spec → dashboard patch (semantic ops)
```

The LLM never emits table names, column names, or SQL in the primary path. It emits **semantic IDs** from the semantic model; the compiler resolves them to physical expressions and renders dialect SQL. Consequences:

- **Validation becomes deterministic:** validate the IR against the semantic model (metric exists? filter is a dimension? join path valid?) instead of trying to certify generated SQL. SQL is produced by *your code* from validated input.
- **Dialect support becomes a compile target**, not a per-connector prompt-writing exercise. This is exactly the pattern Wren Engine uses (verified: user SQL → sqlglot parse → MDL manifest expansion → CTE rewriter → transpile to target dialect) — battle-tested thinking to align with.
- **Cache keys stabilize:** cache on IR hash + filters + auth context + schema version, not on SQL-string equality (which flakes on whitespace/aliasing and fragments the cache).
- **Repair loops get cheap and bounded:** fix the IR (or return a structured "cannot express" error), max 1–2 attempts, then fail with a friendly explanation. Never an unlimited SQL-repair loop.
- **Raw SQL becomes an escape hatch**, gated (analyst mode, full validation, maybe review), not the default.

**Layered enforcement** (keep all of these — none alone is a boundary):

1. Pydantic IR validation.
2. SQLGlot parse → single-statement SELECT-only AST allowlist; no DDL/DML/COPY/SET; identifier allowlist against synced metadata; LIMIT injection.
3. Policy layer injecting row filters / column masks from the semantic model.
4. **Read-only warehouse credentials — the actual security boundary.**
5. Timeouts, row/byte caps, cancellation at the connector.

"SQL parsing is not a security boundary" — agreed. The IR-first design means the parser mostly enforces *quality*, while credentials + policy injection + limits enforce *safety*.

One more thing not in the brief: **provenance UX**. Show the plan, the SQL, and the semantic definitions used ("Net Revenue = …"), with a feedback / "this is wrong" button. Wrong answers *will* happen; the product survives them if users can see why and teach it. Close the loop: accepted corrected queries become **per-tenant verified examples** (few-shot + retrieval material). This store is a compounding moat — Wren calls the same idea "proven examples."

### 2.5 Semantic layer (Q5): build a thin, owned one; integrate later, don't adopt now

**Build — but only the thin version:**

- Entities (tables), joins (from FKs + manual), dimensions (with time grains), metrics (expression + aggregation + filters), synonyms, policies, verified queries.
- Declarative YAML/JSON per tenant, **versioned**.
- **AI-drafted + human-approved** metric suggestions as the onboarding experience. That suggestion/approval flow is a genuine differentiator, not overhead — customers can't write a semantic model, but they *can* approve one.

**Do not build:** a pre-aggregation engine, a full OLAP compiler, or materialized metric stores. That's where Cube-class projects have years of head start.

**Why not adopt Cube or dbt as the foundation** (both verified current):

- Cube is mature (RLS via access policies, member-level + row-level security, multi-tenant dynamic models via `COMPILE_CONTEXT`), but adopting it means a second source of truth, a second stateful service to operate, and a foreign abstraction in the critical path.
- dbt: MetricFlow now lives in dbt Core, but the hosted Semantic Layer API is **dbt Cloud**-only — a dependency on customers' dbt Cloud subscription.
- The semantic layer's representation **is** your AI quality: retrieval, prompt construction, IR binding, and policy injection all depend on its shape. That's product differentiation, not infra — own it.

Keep the escape hatches:

- Cube remains the best **adopt-candidate later** as an optional query engine / publish target.
- dbt definitions: support as **import** (read customers' MetricFlow YAML).
- Malloy: watch; interesting compiler, don't standardize.
- **Alignment tip:** model your IR so it can be *exported* to an open manifest format (Wren's MDL is a de-facto reference; its engine is Apache-2.0). Portability keeps options open; lock-in never pays.

### 2.6 Agent design (Q6): LangGraph yes; LangChain mostly no

Verified current state (LangGraph 1.0.x):

- `PostgresSaver` checkpointing (thread-per-conversation).
- `interrupt()` + `Command(resume=...)` for human-in-the-loop.
- `stream_events` for token + custom event streaming.

That's **exactly** the target model: explicit nodes, one controlled agent, deterministic workflow, resumable conversations, and a natural place for "Which revenue did you mean?" clarification or "Approve this dashboard change?" interrupts. **Adopt it.**

**LangChain: no as a framework.** Use it (or just provider SDKs) behind a thin `LLMClient` interface of your own; keep Pydantic as the contract layer; avoid black-box prebuilt agent-loop abstractions in the critical path. The LangChain of 2026 is thinner than its reputation, but the interface risk (types and callbacks leaking through your codebase) is real and cheap to avoid.

**Critical distinction: LangGraph is not your job queue.** Long-running warehouse queries, schema syncs, and result processing belong to the core API's job system. Graph nodes should call core-api internal APIs (idempotency keys) that enqueue/await jobs. Don't hold graph executions open for minutes performing warehouse I/O. Graph state is ~kilobytes; query execution state is the core API's problem.

### 2.7 Chart specs & dashboard changes (Q8): two corrections

1. **Never persist ECharts options.** Persist a renderer-agnostic, versioned spec (the brief has this right) with encodings bound to result field IDs + types, and compile to ECharts at render time. If ECharts config leaks into stored data, every renderer upgrade becomes a data migration.
2. **Patches should be semantic ops, not raw JSON diffs:** `add_widget`, `update_encodings`, `set_global_filter`, `bind_filter_to_widget`, `remove_widget`, `set_layout`, `rename_dashboard`. Each is schema-validated, permission-checked, applied by deterministic handlers, idempotency-keyed, and guarded by optimistic concurrency (version/ETag). Trivial ops (rename, layout nudge, filter value change) never touch the LLM. RFC 6902 can be the low-level mechanism, but not the API/LLM-facing surface.

### 2.8 Filters (Q9): filters are first-class IR citizens

The design that works:

- Every filter references a **semantic dimension**, not a column name.
- Every widget's query IR declares which dimensions it **can** be filtered by (persisted `filter_bindings`, AI-proposed but stored).
- Dashboard filter state is compiled *into* each affected widget's IR and re-executed **server-side**.
- Compatibility rules (which widget accepts which filter; behavior across grains) live in the **semantic model**, not the frontend — naive cross-filtering across different aggregation grains produces subtly wrong numbers, which is worse than no cross-filtering.
- Cross-filter interactions emit `{dimension, value}` events; dashboard state has `filter` vs `highlight` modes.
- Drill-downs are hierarchies in the semantic layer (day→week→month).

Global filters (MVP) already require the IR + bindings design — which is why filters can't be bolted on later. Cross-filtering itself is Phase 3.

### 2.9 Multi-tenancy (Q10): single writer + scoped tokens + cache-key discipline

- Shared-schema Postgres with `tenant_id` everywhere **plus** RLS as defense-in-depth (app-layer checks + DB-layer backstop), from the first migration. Retrofitting tenant isolation is the single most expensive mistake available.
- AI service requests carry short-lived, scoped, signed tokens: `{tenant, connection, allowed_dataset_ids, dashboard_id, user_permissions_digest}`. It never gets a DB connection, a warehouse credential, or an unscoped query capability.
- **Every cache key includes tenant + auth-context hash** (compiled SQL, metadata slices, query results, LLM intent classifications, embeddings).
- Write the leak tests as a **first-class test suite**: cache keys, vector search filters, LangGraph thread isolation, result artifacts/presigned URLs, log redaction, prompt/observability logs (Langfuse traces), and error messages echoing another tenant's SQL/metadata. These are the real leak vectors; make them executable tests or they erode.

**Warehouse-side RLS decision (the big fork):**

- **MVP:** service account + deterministic predicate injection from semantic policies (works on every connector, fully auditable, no per-user warehouse credentials).
- **Enterprise later:** identity passthrough/impersonation (Snowflake OAuth, BigQuery per-user creds, Fabric Entra passthrough — verified that Fabric supports a user-identity mode).
- Design the policy layer so predicates are injectable from either source; don't build impersonation until a paying customer needs per-viewer segregation.

### 2.10 Execution, caching, jobs, scaling (Q11): start boring, scale by subtraction

**MVP:**

- Core API executes queries with **per-tenant token buckets/semaphores + a global cap** (a semaphore alone gives noisy-neighbor incidents).
- DB-backed job rows for anything > 5s; connector-level timeout + cancel; row/byte caps.
- Redis for compiled-SQL / metadata / result caching (TTL minutes; keys per §2.9).
- Schema sync: jittered scheduled jobs, incremental hashing, staleness surfaced in UI.

**When you outgrow it:** a `query-worker` process — same codebase, different entrypoint, same queue (pg-boss or BullMQ; pg-boss if you want one less moving piece, BullMQ if Redis is already in).

**Budgets:** per-tenant LLM token + query budgets; cheap model for intent routing, strong model for planning/SQL.

**Observability from day one:** OTel traces across web → core → job → warehouse, plus **Langfuse** (verified: self-hostable, tracing + evals + prompt management) for LLM spans. Debugging a silent async LLM+SQL chain without traces is genuinely miserable — this is the one "premature" investment worth insisting on.

Also: **event streaming from day one** (SSE): `intent → metadata → plan → SQL → validating → executing → chart`. The differentiator vs. "spinner SaaS" is visible reasoning; LangGraph's `stream_events` provides the hooks.

---

## 3. Missing from your brief (risks I'd put on the board)

1. **Ambiguity resolution UX.** "What was revenue last quarter?" with four revenue-ish columns must trigger a *clarifying question*, not a guess. This is a product behavior, a graph node, and an eval category — design it explicitly.
2. **Prompt injection from warehouse content.** Descriptions, comments, even *data values* are attacker-controlled in multi-tenant settings. Treat all warehouse-derived text as untrusted: length caps, never instructions, never permission-expanding; keep raw rows out of prompts (aggregates/samples only).
3. **Schema drift.** Tables get renamed/dropped between syncs and mid-conversation. Version metadata, record the version used per query, fail friendly ("schema changed, refreshing…"), re-sync on error heuristics.
4. **Evaluation harness as infrastructure, not QA.** A golden set of 50–150 customer-style questions with expected IR/answers, run in CI. Note: even academic text-to-SQL benchmarks have high annotation error rates (a 2026 CIDR paper measured ~53% in BIRD) — your own golden set is the only truth that matters.
5. **Cost/latency budgets per interaction** (tokens, warehouse credits, wall-clock), enforced and visible in traces.
6. **Contract versioning:** `schema_version` on chart specs, dashboard specs, query IR, connector capability manifests, internal APIs — from v1, with migrations on read.
7. **Result transport:** define it now (Arrow batches + row caps over internal HTTP/streaming) — don't discover it when someone returns 2M rows.
8. **Sensitive-column classification** (PII flags in the semantic layer; masking/exclusion policies). Cheap early, embarrassing late.
9. **A defined MVP success metric.** "Works" is not a spec. One design partner, N questions/week, X% answer-acceptance, <20s median response — pick numbers; they'll kill features for you.

---

## 4. MVP vs. postponed (Q12)

### MVP (Phases 1–3, tightened)

- Auth + orgs + basic roles (owner/editor/viewer); tenant isolation + RLS in first migration
- **PostgreSQL connector only**, on the async-first interface + capability manifest + conformance kit
- Schema sync, metadata browser, authorized dataset selection
- Thin semantic layer (entities, joins, dimensions, metrics, synonyms) with **AI-drafted, human-approved** suggestions
- IR-first text-to-SQL with bounded repair, all validation layers, read-only creds, limits
- 4 chart types: KPI, table, bar, line — renderer-agnostic spec → ECharts
- Dashboard CRUD + versioning + **semantic patches** + global filters; internal sharing
- Chat with streaming reasoning + show-SQL provenance + feedback
- Audit log (connect / query / dashboard mutations), per-tenant quotas, Langfuse + golden eval set in CI

### Postponed

- Snowflake/BigQuery/Fabric/Databricks *production* connectors — but conformance kit + 1 spike early
- Cross-filtering & drill-downs
- Embeddings/vector retrieval (lexical + FK-graph first)
- Cube / dbt / external semantic integrations
- Anomaly detection
- SSO/SCIM, private networking/on-prem agents, CMEK, data residency
- External (cross-org) sharing, impersonation-based RLS

**Cadence:** Snowflake next (market default), then BigQuery, then Fabric/Databricks by demand.

---

## 5. Expensive tech-debt watchlist (Q13)

1. Sync-only query interface → async-first now, or rewrite later.
2. Raw-SQL-first generation → IR-first now, or permanent validation/dialect/cache pain.
3. Persisting renderer configs (ECharts options) in chart specs.
4. Two state owners (AI service persisting domain data).
5. Unversioned internal contracts (IR, chart spec, dashboard, API, capabilities).
6. Cache keys without tenant + auth context.
7. Credentials reachable from the AI service, browser, or logs.
8. Leaky connector results (raw driver types) instead of canonical types + Arrow.
9. Embedding stack before lexical retrieval is proven insufficient.
10. LangChain types leaking through the codebase.
11. Multi-tenancy retrofitted rather than foundational.
12. No eval harness → invisible regressions, no quality ratchet.
13. A home-grown semantic compiler with no import/export escape hatch.

---

## 6. OSS & vendor evaluation (Q14) — state as of today

| Project | Current state (verified) | Verdict |
|---|---|---|
| **Wren AI / Wren Engine** | Active (~17k★). Engine/MDL/MCP/connectors **Apache-2.0**; the GenBI app/cloud is AGPL-3.0 + commercial. Pipeline: sqlglot parse → MDL expansion → CTE rewrite → transpile → execute. | **Study seriously; possible component.** Reference architecture for the IR/compile layer; consider `wren-core` as a compiler library (keep execution in your own core). Verify per-component licenses before commercial use. Also a competitor — don't build *on* the AGPL app layer. |
| **Cube** | v1.3.x, active. RLS via access policies (member+row level), multi-tenancy via `COMPILE_CONTEXT`, pre-aggregations, SQL API. | **Best adopt-candidate later** as optional query engine/publish target. Not the foundation — second stateful service + second source of truth. |
| **dbt Semantic Layer / MetricFlow** | MetricFlow runs in **dbt Core**; the hosted SL API is **dbt Cloud**-only. | **Integration, not foundation:** import customer metric YAML later. |
| **SQLGlot** | 30+ dialects, parse/AST/transpile/optimize, pure Python. | **Adopt** — your IR→SQL compiler and validation core. |
| **LangGraph** | 1.0.x: Postgres checkpointer, interrupts/HITL, event streaming. | **Adopt** for agent orchestration. Not for job execution. |
| **LangChain** | Thin wrapper layer now. | **Minimal use** behind your own LLM interface. |
| **Vanna** | Main repo **reportedly archived Mar 2026**. | **Avoid as foundation**; ideas only. |
| **Dataherald** | Apache-2.0 but appears dormant / tiny team. | Reference only. |
| **Superset / Metabase / Lightdash** | Mature BI, but embedding + multi-tenant UX mismatch. | Don't embed; mine Superset for filter/dashboard engineering patterns. |
| **Langfuse** | Self-hostable; tracing, evals, prompt management. | **Adopt** for LLM observability + eval loop. |
| **pg-boss / BullMQ, Redis, Arrow** | Standard. | Adopt incrementally. |
| **Malloy** | Interesting compiler; niche adoption. | Watch; spike only. |
| **Temporal** | Heavyweight durable execution. | Only if LangGraph + job queue genuinely outgrow you (unlikely near-term). |

**The one place "evaluate before building" clearly pays:** the IR→SQL compile + semantic rewrite layer (Wren) — expensive to build, hard to differentiate. Everything else (connector SDK, dashboard engine, agent flow) is differentiated by *your* product and cheap enough to own.

---

## 7. The four questions that actually change the design

1. **External product or internal platform?** External SaaS forces pricing/quotas/self-serve UX into MVP; internal lets you defer all of it and optimize for one customer. Changes ~30% of scope.
2. **Will your customers' *end users* see dashboards with per-viewer row restrictions (embedded analytics), or is the audience analysts/data teams of the customer?** The biggest architecture fork: per-viewer segregation means identity passthrough/impersonation, per-user tokens, and a completely different security model (§2.9). Analysts-only means service account + predicate injection is fine for years.
3. **Who is design partner #1, and on which warehouse(s)?** If it's a Fabric shop, connector order and effort allocation change drastically (Fabric is 3–5× as much work as Postgres, including *their* admin enabling SPN access).
4. **Team profile and MVP definition-of-done?** Two TS engineers shipping to one pilot ≠ five engineers targeting a fundraise demo — it changes repos, service-split timing, and how much of §4 is real.

---

## Next step

Answer those four (even roughly), and the implementation work begins in this order:

1. **Connector interface** — async lifecycle + capability manifest + canonical types + conformance kit
2. **Metadata schema** — normalized tables, versioning, sync strategy
3. **Secure execution path** — validation layers + policy injection + limits

Delivered as concrete interface definitions and a first migration — not prose. That's the part worth getting exactly right, because everything later compiles against it.
