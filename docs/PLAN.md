# AI BI — Master Build Plan

**Version 1.0 — October 18, 2026**

> **Current status: Phase 1 — Core API 101. Next step: 1.1 (scaffold `apps/core-api`).**

This is our single source of truth for *what we build, in what order, and how we verify it*. We work in tiny steps. Checkboxes are ticked as we complete steps. Every decision we make along the way is logged in `docs/DECISIONS.md`. Background strategy: `architecture-review.md` (root).

---

## 1. What we are building (one paragraph)

A **single-company AI analytics app**: the company connects one of their databases, the app introspects it, the user defines light business semantics (metrics & dimensions — generic, works for HR, sales, operations, anything), then asks questions in chat and gets answers plus dashboards built from validated queries. The AI generates a **structured QuerySpec** (never raw SQL as the primary path); the backend compiles, validates, and executes it safely with read-only credentials. Charts are rendered by ECharts behind a **renderer-agnostic chart spec**. No multi-tenancy: one company, one (or a few) connections.

## 2. Decisions that shape this plan

Full log with dates and rationale in `docs/DECISIONS.md`. Headlines:

- **Single company deployment.** No orgs/workspaces/tenants. Simpler everywhere.
- **Domain-agnostic by construction.** Sample data mixes HR *and* sales so we never bake in finance-only assumptions.
- **Monorepo**, apps appear over time: `web` (Next.js), `core-api` (NestJS), `ai-service` (Python — arrives in Phase 6).
- **PostgreSQL** for app data *and* as the first connector target. Docker for local infra.
- **IR-first**: AI outputs a QuerySpec; `core-api` compiles it to SQL (TypeScript for Postgres MVP). Compile location revisited when connector #2 arrives.
- **ECharts**, themed to match our design tokens; persisted chart specs stay renderer-agnostic.
- **Tests are part of every step**, not a separate phase.
- **Minimal infrastructure**: no Redis, no queues, no Kubernetes, no Turborepo until a concrete need appears.

## 3. How we work together (important!)

1. **One step at a time.** We pick the next unchecked step, I explain what & why *before* coding, we build it, you review the code and the diff, we run the tests, then we commit and tick the box.
2. **Every step has the same shape:** *Build → Learn → Verify → Done*. If a step feels too big while doing it, we split it.
3. **Review gates** at the end of each phase: we re-read the code together and you ask anything.
4. Nothing moves forward on red tests.
5. This file is updated as we go (checkboxes + progress log). Architecture-free meanings: you learn, the project grows, both are success.

## 4. Test strategy (what we test, with what)

| Layer | Tool | What it covers |
|---|---|---|
| core-api unit | Jest | compiler (spec→SQL), SQL guard, type mapping, pure logic |
| core-api integration | Jest + supertest + Docker Postgres | connectors, introspection, endpoints, migrations |
| web unit | Vitest (+ Testing Library when needed) | chart adapters, hooks, form logic |
| web e2e | Playwright | user flows (connection → sync → chart → dashboard → chat) |
| ai-service | pytest | graph nodes with mocked LLM; API tests |
| AI evals | pytest runner + golden set | ~30 real questions against sample data; score tracked (Phase 6+) |

## 5. Stack (versions verified at plan time, Oct 18 2026)

| Area | Choice | Note |
|---|---|---|
| Runtime | **Node.js 24 LTS** (24.22.x) | Node 26 becomes Active LTS Oct 28 — we may switch later |
| Package manager | **pnpm** (via corepack), workspaces | one repo, multiple apps |
| Database | **PostgreSQL 18** (Docker `postgres:18`) | 19 is RC — not for us yet |
| Core API | **NestJS 12** + TypeScript | the learning curve we tackle in Phase 1 |
| ORM | **Prisma** (latest at install) | migrations + typed queries |
| Frontend | **Next.js 16.2** (App Router) + TypeScript | Phase 3 |
| UI | Tailwind CSS + **shadcn/ui** + sonner (toasts) | consistent, modern |
| Client data | **TanStack Query v5** | server-state cache |
| Forms/validation | **React Hook Form + Zod** | |
| Charts | **ECharts** (latest) + custom theme | behind `<ChartRenderer/>` |
| Dashboard grid | **react-grid-layout** | |
| API contract | NestJS **Swagger/OpenAPI** → `openapi-typescript` types | no hand-written duplicates |
| API tests | Jest + supertest | |
| Web tests | Vitest + **Playwright** | |
| AI service (Phase 6) | Python + **uv**, **FastAPI**, **Pydantic v2**, **LangGraph 1.x**, ruff, pytest | provider SDK via own `llm.py` boundary |

## 6. Target repo layout

```
AI BI/
├── AGENTS.md                # instructions for the AI agent working in this repo
├── README.md
├── architecture-review.md   # background strategy doc (Oct 2026)
├── docs/
│   ├── PLAN.md              # this file
│   └── DECISIONS.md         # decision log
├── sample-data/             # seed SQL for the practice database (Phase 2)
├── apps/
│   ├── web/                 # Next.js            (Phase 3)
│   ├── core-api/            # NestJS             (Phase 1)
│   └── ai-service/          # Python/FastAPI     (Phase 6)
├── docker-compose.yml       # Postgres for local dev
├── pnpm-workspace.yaml
└── package.json
```

---

## 7. Phases

Legend per step: **Build** (what we create) · **Learn** (what you take away) · **Verify** (how we prove it) · **Done** (definition).

### Phase 0 — Foundations & workspace *(est. 3–5 short sessions)*

**Goal:** reproducible local dev environment + repo skeleton.
**You'll learn:** pnpm workspaces, Docker basics, how our repo is organized.

- [x] **0.0 Plan docs created** — `docs/PLAN.md`, `docs/DECISIONS.md`, `AGENTS.md`, `README.md`.
- [x] **0.1 Install & verify tools** · *Build:* install Git, Node 24 LTS, pnpm (`corepack enable`), Docker Desktop (WSL2 backend). *Verify:* `git --version`, `node -v`, `pnpm -v`, `docker --version`, `docker compose version` all respond. *Done:* a checklist in the README.
- [x] **0.2 `git init` + first commit** · *Build:* `.gitignore` (node_modules, .env, dist, .next), `.editorconfig`. *Learn:* what we ignore and why (secrets never in git). *Done:* first commit on `main`.
- [x] **0.3 Review `AGENTS.md` together** · *Build:* small wording tweaks if needed. *Learn:* how you and I collaborate in this repo. *Done:* you're happy with the working agreement.
- [x] **0.4 pnpm workspace skeleton** · *Build:* `pnpm-workspace.yaml`, root `package.json` with placeholder `dev`/`test`/`lint` scripts. *Learn:* workspaces, root vs app scripts. *Done:* `pnpm install` runs clean.
- [x] **0.5 Postgres via Docker** · *Build:* `docker-compose.yml` (`postgres:18`, healthcheck, named volume, port 5432). *Learn:* containers vs local installs; volumes. *Verify:* `docker compose up -d` → `docker exec` psql `SELECT version();`. *Done:* DB reachable, survives restart.
- [x] **0.6 README quickstart** · *Build:* real quickstart section. *Done:* a fresh person could boot the repo.

**Phase 0 done when:** one command boots Postgres; repo history started; plan docs readable.

---

### Phase 1 — Core API 101 (learn NestJS) *(est. 4–6 sessions)*

**Goal:** a running, tested, documented skeleton API — you understand its anatomy.
**You'll learn:** NestJS modules/controllers/services/DTOs, dependency injection, Prisma migrations, e2e tests, OpenAPI.

- [ ] **1.1 Scaffold `apps/core-api`** · *Build:* Nest CLI app, strict TS, `GET /health`. *Learn:* `main.ts`, `app.module.ts`, modules ↔ controllers ↔ services. *Done:* dev server runs on :3001, health responds.
- [ ] **1.2 Config & environment** · *Build:* `.env` + `.env.example`, ConfigModule, validated env (Zod). *Learn:* why config is validated at boot. *Done:* missing env → clear error at startup.
- [ ] **1.3 Errors & logging conventions** · *Build:* global exception filter (consistent error shape) + request logging interceptor. *Done:* one error format everywhere; each request logged with method/path/status/ms.
- [ ] **1.4 Prisma + first migration** · *Build:* `Connection` model, migration `0001`, `PrismaService` + module. *Learn:* schema → migration → client workflow. *Done:* table exists in Docker PG; `prisma studio` shows it.
- [ ] **1.5 Test setup** · *Build:* Jest unit example + supertest e2e for `/health`; scripts `test`, `test:e2e`. *Done:* `pnpm --filter core-api test` green.
- [ ] **1.6 OpenAPI** · *Build:* Swagger module at `/api/docs`. *Learn:* contract-first thinking. *Done:* DTOs visible in the docs UI.

**Phase 1 done when:** `start:dev` runs, tests green, `/api/docs` live, migration applied.

---

### Phase 2 — PostgreSQL connector (the core of the product) *(est. 8–12 sessions — biggest phase)*

**Goal:** connect a real database, introspect it safely, store normalized metadata, run capped read-only queries.
**You'll learn:** Postgres internals (catalogs), connection pooling, secret handling, SQL safety fundamentals.

- [ ] **2.1 Sample database "Acme Inc."** · *Build:* `sample-data/seed.sql` — HR side (departments, employees, salaries) + sales side (customers, products, orders, order_items) + a read-only role `acme_reader`. Loader script. *Learn:* real-world schema patterns, read-only users. *Verify:* run 3 sample queries as `acme_reader`. *Done:* sample DB live in Docker PG.
- [ ] **2.2 Connector contract** · *Build:* `connectors/` — interface types (`testConnection`, `discoverSchema`, `executeQuery`), capability manifest, normalized error taxonomy (AUTH/PERMISSION/SYNTAX/TIMEOUT/…), registry. *Learn:* adapter pattern in practice. *Verify:* unit tests on registry. *Done:* interfaces frozen enough to build against.
- [ ] **2.3 Connections API + credential encryption** · *Build:* CRUD endpoints, DTO validation, **AES-256-GCM encryption at rest** (key from env), secrets never in responses/logs. *Verify:* tests prove encryption + redaction. *Done:* connection records safe in app DB.
- [ ] **2.4 Postgres connector: test connection** · *Build:* `pg` driver wrapper, pool management, `POST /connections/:id/test` (auth check, server version, verify read-only privileges). *Verify:* integration test vs Acme DB; wrong password → clean `AUTH` error. *Done:* green test + real error mapping.
- [ ] **2.5 Introspect: schemas & tables** · *Build:* catalog queries → normalized DTOs (schemas, tables, views). *Learn:* `pg_catalog` vs `information_schema`. *Done:* endpoint lists all Acme tables/views.
- [ ] **2.6 Introspect: columns & types** · *Build:* columns, nullability, comments, **canonical type mapping** (e.g. `numeric(10,2)`, `timestamptz`). *Verify:* unit tests per PG type family. *Done:* full column metadata per table.
- [ ] **2.7 Introspect: keys & relations** · *Build:* PK/FK extraction → relationship DTOs (the join graph the AI will use later). *Done:* FK graph correct for Acme.
- [ ] **2.8 Metadata storage + sync** · *Build:* app tables (`db_objects`, `db_columns`, `db_relations`, `sync_runs`), full sync service, `POST /connections/:id/sync`, metadata read APIs, sync status/timestamps. *Done:* sync visible in API + browsable metadata.
- [ ] **2.9 Safe query execution** · *Build:* SQL guard (single statement only, `SELECT`-only, comments/`;` rejected, keyword denylist), `statement_timeout`, **row cap 10k**, cancellation, normalized errors. *Verify:* guard unit tests (DROP/UPDATE/multi-statement rejected); integration executes aggregate query. *Done:* only safe reads can leave the API.
- [ ] **2.10 Review gate** · Walk through Phase 2 code together; you try the endpoints in `/api/docs` yourself.

**Phase 2 done when:** connection → test → sync → metadata → guarded query, all working against Acme, all tested.

---

### Phase 3 — Web 101 (learn Next.js) + connection UX *(est. 5–7 sessions)*

**Goal:** the whole Phase 2 flow available in the browser.
**You'll learn:** App Router, client components, TanStack Query, forms, typed clients from OpenAPI.

- [ ] **3.1 Scaffold `apps/web`** · *Build:* Next.js 16 + TS + Tailwind + shadcn init; app shell + nav; CORS with core-api; root script runs both. *Learn:* App Router layout/pages. *Done:* both apps run with one command.
- [ ] **3.2 Typed API client** · *Build:* generate types from OpenAPI (`openapi-typescript`) + tiny `openapi-fetch` wrapper + QueryClientProvider; first hook (list connections). *Learn:* why generated types beat hand-written ones. *Done:* connections render from live API.
- [ ] **3.3 Connections page** · *Build:* list / create / delete; React Hook Form + Zod; loading, empty, error states. *Done:* create + delete with validation feedback.
- [ ] **3.4 Test & Sync actions** · *Build:* buttons with status polling + toasts (sonner). *Done:* connection test + sync feedback in UI.
- [ ] **3.5 Metadata browser** · *Build:* schema → table tree; column table with type/PK/FK badges. *Done:* you can explore Acme visually.
- [ ] **3.6 Playwright setup + first e2e** · *Build:* e2e happy path: create connection → sync → see "employees" table. *Learn:* e2e vs unit; selectors that don't break. *Done:* `pnpm --filter web e2e` green.

**Phase 3 done when:** browser happy path complete; e2e green; you can trace the full data flow yourself.

---

### Phase 4 — Semantic layer v0 (generic, any domain) *(est. 4–6 sessions)*

**Goal:** define what data *means* once (metrics/dimensions), then query it safely via a structured spec.
**You'll learn:** query-spec design, safe SQL assembly (quoting, allowlists), golden-file testing.

- [ ] **4.1 Semantic model schema** · *Build:* tables: `semantic_models`, `datasets` (exposed tables), `dimensions`, `metrics`, `joins`; migration. *Learn:* why joins/grains live in the model, not the UI. *Done:* tables + relations in app DB.
- [ ] **4.2 Semantic CRUD API** · *Build:* endpoints + validation rules (metric needs expression + agg; dimension needs column; etc.) + tests. *Done:* validated endpoints.
- [ ] **4.3 Minimal editor UI** · *Build:* JSON editor page with validate/save (forms come later if we want). *Done:* you can define a metric in the browser.
- [ ] **4.4 QuerySpec v0 + compiler** · *Build:* Zod QuerySpec type (metrics, dimensions, filters, timeGrain, order, limit) + **compiler → SQL** using metadata identifier allowlist + parameterized filters. *Verify:* golden snapshot tests for 6–8 representative specs. *Learn:* this is the "IR-first" heart of the product. *Done:* compiler trustworthy, snapshots reviewed by you.
- [ ] **4.5 `POST /query/execute`** · *Build:* spec → compile → guard → execute → `{columns, rows, meta}`; error taxonomy mapped. *Done:* endpoint returns correct aggregates.
- [ ] **4.6 Seed the Acme semantic model** · *Build:* HR (headcount, avg_salary) + sales (revenue, orders) metrics and dimensions. *Done:* both domains queryable — proves we're not finance-locked. **Review gate here.**

**Phase 4 done when:** HR *and* sales aggregates come back correct through QuerySpec; compiler tests green.

---

### Phase 5 — Charts & dashboards, manual mode *(est. 6–8 sessions)*

**Goal:** build & save dashboards by hand — this is the canvas the AI will later drive.
**You'll learn:** ECharts theming/API, renderer-agnostic specs, optimistic concurrency, grid layouts.

- [ ] **5.1 ChartSpec v0** · *Build:* Zod spec (type, title, querySpec ref, encodings bound to result columns, number/date formats). **No ECharts details inside, ever.** *Verify:* validation tests. *Done:* spec schema reviewed together.
- [ ] **5.2 `<ChartRenderer/>`** · *Build:* owned ECharts wrapper: theme from design tokens, lazy-loaded, resize handling, loading/error states. *Learn:* ECharts `setOption`, themes, event wiring. *Done:* renders a hardcoded demo chart beautifully.
- [ ] **5.3 Adapters: table, KPI, bar, line** · *Build:* pure functions ChartSpec(+rows) → ECharts option; unit tests. *Done:* four chart types in the registry.
- [ ] **5.4 Explore page** · *Build:* manual builder — pick model, metrics/dimensions/filters → chart renders. No saving yet. *Done:* you can explore Acme data visually.
- [ ] **5.5 Dashboard persistence** · *Build:* `dashboards` + `widgets` tables (spec JSONB + `version` int), CRUD + **optimistic concurrency** (409 on stale version) + tests. *Done:* APIs versioned and tested.
- [ ] **5.6 Dashboard canvas** · *Build:* react-grid-layout canvas: add/edit/remove/save/reload widgets. *Done:* a dashboard survives reload.
- [ ] **5.7 Global filters v0** · *Build:* dashboard-level date range + one categorical filter; applied server-side by rewriting widget QuerySpecs and re-executing; filter bar UI; tests. *Learn:* why filters are first-class in the spec. *Done:* "filter everything to Engineering dept" works manually.

**Phase 5 done when:** hand-built 4-widget dashboard with filters persists & reloads; every adapter unit-tested; specs are renderer-agnostic. **Review gate here** (chart spec + patch model walkthrough).

---

### Phase 6 — AI service v0 (Python + LangGraph) *(est. 8–10 sessions)*

**Goal:** chat that answers real questions against the connected DB — safely, always through QuerySpec.
**You'll learn:** Python tooling (uv/FastAPI/pytest), Pydantic contracts, LangGraph nodes, SSE streaming, prompt design + guardrails, evaluation.

- [ ] **6.0 Python toolchain** · *Build:* `apps/ai-service` with uv, FastAPI skeleton, `/health`, ruff + pytest; run scripts. *Learn:* pyproject, virtualenvs — the Python mental model vs Node. *Done:* service runs next to the others.
- [ ] **6.1 `llm.py` boundary** · *Build:* provider SDK behind one module: structured output → Pydantic models, env key, usage logging. *Verify:* mocked tests. *Done:* the rest of the codebase never imports the LLM SDK directly.
- [ ] **6.2 Internal API between services** · *Build:* service-token auth; core-api exposes: `GET /internal/context` (semantic model + dataset slices) and `POST /internal/specs/execute`. *Done:* ai-service can read context and execute specs, nothing more.
- [ ] **6.3 LangGraph graph v0** · *Build:* nodes: `classify_intent → select_context → draft_spec → validate_spec (max 1 repair) → compose_answer`; in-memory state first. *Learn:* StateGraph, nodes/edges, where determinism vs LLM lives. *Verify:* pytest per node with a fake LLM. *Done:* "question in → validated QuerySpec + answer out".
- [ ] **6.4 Chat endpoint + streaming** · *Build:* core-api `POST /chat` proxying to ai-service; SSE step events; web chat page with message list + step timeline. *Done:* you watch `intent → context → spec → executed` live.
- [ ] **6.5 Result rendering** · *Build:* reply shows data table + an automatically suggested chart (QuerySpec → default ChartSpec heuristic); reuses `<ChartRenderer/>`. *Done:* answers feel like mini-reports.
- [ ] **6.6 Evals v0** · *Build:* golden set of ~30 questions (HR + sales + tricky: ambiguous metric, unknown column, wide date range); pytest runner; **record baseline score**. *Learn:* why evals are infrastructure, not QA. *Done:* `pnpm eval` style command we can rerun after every change.
- [ ] **6.7 Stretch — clarification v0** · *Build:* ambiguous question → the agent asks instead of guessing (LangGraph interrupt or simple question message). *Done:* duplicates like "revenue" vs "net revenue" prompt a question.

**Phase 6 done when:** "headcount by department" and "monthly revenue, last 12 months" answered correctly in chat; evals repeatable; no raw LLM SQL anywhere. **Review gate here.**

---

### Phase 7 — Chat-driven dashboards *(est. 5–7 sessions)*

**Goal:** create and modify dashboards through chat via validated, versioned patches.
**You'll learn:** schema-driven patch design, deterministic apply, agent output constraints, e2e testing of agent flows.

- [ ] **7.1 Patch ops v0** · *Build:* `add_widget`, `update_widget`, `remove_widget`, `set_filter`, `rename_dashboard` as typed, validated ops + apply endpoint with version checks + tests. *Done:* patches apply deterministically, LLM never applies anything directly.
- [ ] **7.2 AI → patch proposal** · *Build:* dashboard intent → patch proposal (Pydantic) → core-api validates & applies → chat summarizes applied changes ("Added a line chart widget…"). *Done:* first chat-created widget live.
- [ ] **7.3 Create-dashboard flow e2e** · *Build:* "Create a dashboard showing monthly revenue by product category" (Acme data) end-to-end. *Done:* dashboard appears with correct chart + saved.
- [ ] **7.4 Modify flows** · *Build:* "make it a line chart", "filter everything to Engineering dept", "rename to HR Overview"; unsupported ops → clear message, no hallucinated actions. *Done:* bounded set of ops works reliably.
- [ ] **7.5 Playwright e2e** · *Build:* chat → dashboard visible → modify → still correct after reload. *Done:* green e2e.

**Phase 7 done when:** the brief's example conversations (adapted to Acme data) work end-to-end.

---

### Phase 8 — Hardening & ship-ready (single company) *(est. 6–8 sessions)*

**Goal:** safe enough for real internal use against a real database.

- [ ] **8.1 Auth v0** · users + argon2 passwords + JWT sessions; guards on every route; web login page. (Single company — no orgs.)
- [ ] **8.2 Audit log** · connection/test/sync/query/dashboard events.
- [ ] **8.3 Background sync + drift** · scheduled sync; schema-change flag in the metadata UI.
- [ ] **8.4 Guardrails** · sanitize warehouse-derived text in prompts (treat as untrusted); excluded/sensitive columns per model; prompt-injection tests.
- [ ] **8.5 Limits & observability** · rate limit, query concurrency cap, request IDs, structured logs.
- [ ] **8.6 CI + packaging** · GitHub Actions (lint + unit + e2e + eval smoke), Dockerfiles, deploy recipe, backup/restore note.
- [ ] **8.7 Operator docs** · how to create a read-only user, env reference, runbook.

**Phase 8 done when:** a colleague can clone, configure, connect their own database (read-only user), and use it.

---

### Phase 9 — Deferred backlog (decisions for later, with reasons)

Not scheduled. Each gets a DECISIONS.md entry when its turn comes:

- Connector #2 (Snowflake or BigQuery) + extract `packages/connector-sdk` + formal conformance kit; **revisit compiler location (SQLGlot/Python)**.
- Cross-filtering, drill-downs, more chart types (heatmap, area, funnel).
- Semantic layer: AI-suggested metrics, verified-queries store, dbt import.
- Retrieval upgrade (embeddings) — only if lexical search fails at real scale.
- Infra: Redis cache, queue (pg-boss), Arrow results, OTel, Langfuse.
- Multi-user polish: sharing; enterprise: SSO, private networking, impersonation, on-prem agent.

---

## 8. Progress log

| Date | Phase | Step | Note |
|---|---|---|---|
| 2026-10-18 | 0 | 0.0 | Plan, decisions log, AGENTS.md, README created |
| 2026-10-18 | 0 | 0.1 | Tools verified: Node 24.22.0 active (nvm), pnpm 11.18.0, Git 2.51.0, Docker 29.6.1 + Compose v5.2.0. README toolchain checklist; decisions D23–D24 |
| 2026-10-18 | 0 | 0.2 | Repo initialized on `main`; `.gitignore`, `.editorconfig`, `.gitattributes`; first commit `9e1e5e5` |
| 2026-10-18 | 0 | 0.3 | AGENTS.md reviewed; commands section labeled by availability |
| 2026-10-18 | 0 | 0.4 | pnpm workspace skeleton: `pnpm-workspace.yaml`, root `package.json` (+ lockfile) |
| 2026-10-18 | 0 | 0.5 | Postgres 18 via docker compose on port 5433; persistence verified; decision D25 |
| 2026-10-18 | 0 | 0.6 | README quickstart real. **Phase 0 complete** |
