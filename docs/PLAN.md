# AI BI — Master Build Plan

**Version 1.0 — October 18, 2026**

> **Current status: Phases 0–5 complete and committed; Phase 6.0–6.2 complete (Python service, the `llm.py` provider boundary, and the internal API between services). Next: 6.3 — the LangGraph graph.**

This is our single source of truth for *what we build, in what order, and how we verify it*. We work in tiny steps. Checkboxes are ticked as we complete steps. Every decision we make along the way is logged in `docs/DECISIONS.md`. Background strategy: `architecture-review.md` (root).

---

## 1. What we are building (one paragraph)

A **single-company AI analytics app**: the company configures a PostgreSQL source database at deploy time, the app introspects it, the user defines light business semantics (metrics & dimensions — generic, works for HR, sales, operations, anything), then asks questions in chat and gets answers plus dashboards built from validated queries. The AI generates a **structured QuerySpec** (never raw SQL as the primary path); the backend compiles, validates, and executes it safely with read-only credentials. Charts are rendered by ECharts behind a **renderer-agnostic chart spec**. No multi-tenancy: one company, one source database (multiple sources deferred; D30).

## 2. Decisions that shape this plan

Full log with dates and rationale in `docs/DECISIONS.md`. Headlines:

- **Single company deployment.** No orgs/workspaces/tenants. Simpler everywhere.
- **Single source database, configured via env.** No connections table or in-app credential management in v0 (D30).
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
| core-api unit | Vitest | compiler (spec→SQL), SQL guard, type mapping, pure logic |
| core-api integration | Vitest + supertest + Docker Postgres | connectors, introspection, endpoints, migrations |
| web unit | Vitest (+ Testing Library when needed) | chart adapters, hooks, form logic |
| web e2e | Playwright | user flows (source → sync → chart → dashboard → chat) |
| ai-service | pytest | graph nodes with mocked LLM; API tests |
| AI evals | pytest runner + golden set | ~30 real questions against sample data; score tracked (Phase 6+) |

> From step 2.1c onward, core-api e2e tests also need the local Docker Postgres (migrations + `PrismaService`).

## 5. Stack (versions verified at plan time, Oct 18 2026)

| Area | Choice | Note |
|---|---|---|
| Runtime | **Node.js 24 LTS** (24.22.x) | Node 26 becomes Active LTS Oct 28 — we may switch later |
| Package manager | **pnpm 11.18** (npm-global, D24), workspaces | one repo, multiple apps |
| Database | **PostgreSQL 18** (Docker `postgres:18`) | 19 is RC — not for us yet |
| Core API | **NestJS 12** + TypeScript | the learning curve we tackle in Phase 1 |
| ORM | **Prisma 7.10.1** (pinned) | migrations + typed queries; `PrismaPg` driver adapter |
| Frontend | **Next.js 16.4** (App Router) + React 19 + TypeScript | Phase 3 |
| UI | **Tailwind CSS 4** + **shadcn/ui** (radix-nova) + sonner (toasts) | consistent, modern |
| Client data | **TanStack Query v5** | server-state cache |
| API client | **openapi-fetch** + generated `openapi-typescript` types | typed transport, no hand-written duplicates |
| Forms/validation | **React Hook Form + Zod** | Phase 4+ |
| Charts | **ECharts** (latest) + custom theme | behind `<ChartRenderer/>` |
| Dashboard grid | **react-grid-layout** | |
| API contract | NestJS **Swagger/OpenAPI** → `openapi-typescript` types | `openapi.json` is generated; `schema.d.ts` is committed |
| API tests | Vitest + supertest | |
| Web tests | Vitest + Testing Library + **Playwright** | unit states + one real-browser happy path |
| AI service (Phase 6) | **Python 3.14** (uv-managed) + **uv 0.11**, **FastAPI 0.162**, **Pydantic v2**, **LangGraph 1.x**, ruff 0.17, pytest 9 | provider SDK via own `llm.py` boundary |

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
**You'll learn:** NestJS modules/controllers/services/DTOs, dependency injection, e2e tests, OpenAPI. Prisma migrations move to Phase 2 with the database work.

- [x] **1.1 Scaffold `apps/core-api`** · *Build:* Nest CLI app (Nest 12, ESM), strict TS, `GET /api/health`. *Learn:* `main.ts`, `app.module.ts`, modules ↔ controllers ↔ services. *Done:* dev server runs on :3001, health responds.
- [x] **1.2 Config & environment** · *Build:* `.env` + `.env.example`, ConfigModule, validated env (Zod). *Learn:* why config is validated at boot. *Done:* missing env → clear error at startup.
- [x] **1.3 Errors & logging conventions** · *Build:* global exception filter (consistent error shape) + request logging middleware. *Done:* one error format everywhere; each request logged with method/path/status/ms.
- [x] **1.4 OpenAPI** · *Build:* Swagger module at `/api/docs`; document the health response with a DTO. *Learn:* contract-first thinking; how Nest decorators become OpenAPI. *Done:* `/api/docs` live; `/api/docs-json` returns the document; DTO visible.
- [x] **1.5 Phase 1 review + test audit** · *Build:* walk through `main.ts`, `configure-app.ts`, filters, middleware, config, and tests; fill any test gaps; finalize the env-only plan/decision docs. *Learn:* how the pieces fit together; what unit vs e2e covers. *Done:* code reviewed, tests green, docs consistent.

**Phase 1 done when:** `start:dev` runs, tests green, `/api/docs` live, code reviewed.

---

### Phase 2 — PostgreSQL connector (the core of the product) *(est. 10–14 sessions — biggest phase)*

**Goal:** wire Prisma to the app DB, connect a real source database, introspect it safely, store normalized metadata, run capped read-only queries.
**You'll learn:** Prisma schema/migrations/client, Postgres internals (catalogs), pooling, env-based read-only credentials, SQL safety fundamentals.

- [x] **2.1a Sample database "Acme Inc."** · *Build:* `sample-data/seed.sql` — HR side (departments, employees with salary) + sales side (customers, products, orders, order_items) + a read-only role `acme_reader`. Loader script. Add `SOURCE_DATABASE_URL` (read-only) to `.env`/`.env.example` and Zod. *Learn:* real-world schema patterns, read-only users, app DB vs source DB. *Verify:* run 3 sample queries as `acme_reader`. *Done:* sample DB live in Docker PG; app boots with both URLs.
- [x] **2.1b Prisma foundation + first migration** · *Build:* pin Prisma 7.10.1; `prisma.config.ts`; `SyncRun` model + first migration; generated client; `prisma:*` scripts; generated-dir ignores. *Learn:* schema → migration → client workflow. *Verify:* `prisma migrate status`, `psql \d+ sync_runs`, Studio. *Done:* table exists; client generated.
- [x] **2.1c Prisma in Nest + integration test** · *Build:* `PrismaService` (`PrismaPg` adapter, `OnModuleDestroy`), `PrismaModule`, `enableShutdownHooks()`, e2e create/read/delete a `SyncRun`. *Learn:* DI lifecycle, graceful shutdown, integration tests. *Verify:* unit + e2e + build + lint. *Done:* green; app closes cleanly.
- [x] **2.2 Connector contract** · *Build:* `connectors/` — interface types (`testConnection`, `discoverSchema`, `executeQuery`), capability manifest, normalized error taxonomy (AUTH/PERMISSION/SYNTAX/TIMEOUT/…), registry. *Learn:* adapter pattern in practice. *Verify:* unit tests on registry. *Done:* interfaces frozen enough to build against.
- [x] **2.3 Source status API** · *Build:* `GET /api/source` returning safe metadata (database, last sync, configured flag); no host/user/password in responses or logs. *Verify:* tests prove redaction. *Done:* status endpoint works without leaking credentials.
- [x] **2.4 Postgres connector: test connection** · *Build:* `pg` driver wrapper, pool management, `POST /api/source/test` (auth check, server version, verify read-only privileges). *Verify:* integration test vs Acme DB; wrong password → clean `AUTH` error. *Done:* green test + real error mapping.
- [x] **2.5 Introspect: schemas & tables** · *Build:* catalog queries → normalized DTOs (schemas, tables, views). *Learn:* `pg_catalog` vs `information_schema`. *Done:* endpoint lists all Acme tables/views.
- [x] **2.6 Introspect: columns & types** · *Build:* columns, nullability, comments, **canonical type mapping** (e.g. `numeric(10,2)`, `timestamptz`). *Verify:* unit tests per PG type family. *Done:* full column metadata per table.
- [x] **2.7 Introspect: keys & relations** · *Build:* PK/FK extraction → relationship DTOs (the join graph the AI will use later). *Done:* FK graph correct for Acme.
- [x] **2.8 Metadata storage + sync** · *Build:* app tables (`db_objects`, `db_columns`, `db_relations`; `sync_runs` exists from 2.1b), full sync service, `POST /api/source/sync`, metadata read APIs, sync status/timestamps. *Done:* sync visible in API + browsable metadata.
- [x] **2.9 Safe query execution** · *Build:* SQL guard (single statement only, `SELECT`-only, comments/`;` rejected, keyword denylist), `statement_timeout`, **row cap 10k**, cancellation, normalized errors. *Verify:* guard unit tests (DROP/UPDATE/multi-statement rejected); integration executes aggregate query. *Done:* only safe reads can leave the API.
- [x] **2.10 Review gate** · Walk through Phase 2 code together; you try the endpoints in `/api/docs` yourself.

**Phase 2 done when:** source test → sync → metadata → guarded query, all working against Acme, all tested; Prisma wired to the app DB.

---

### Phase 3 — Web 101 (learn Next.js) + source UX *(est. 5–7 sessions)*

**Goal:** the whole Phase 2 flow available in the browser.
**You'll learn:** App Router, client components, TanStack Query, forms, typed clients from OpenAPI.

- [x] **3.1 Scaffold `apps/web`** · *Build:* Next.js 16.4.2 + TS + Tailwind 4 + shadcn (radix-nova); app shell + nav; `WEB_ORIGIN` CORS in `configureApp()`; root `pnpm dev` runs both apps. *Learn:* App Router layout/pages. *Done:* both apps run with one command; CORS e2e covers the web origin + preflight.
- [x] **3.2 Typed API client** · *Build:* `ApiErrorDto` in the OpenAPI contract; in-process `openapi:export`; committed `openapi-typescript` schema; `openapi-fetch` wrapper + one `ApiError`; `QueryClientProvider`; `useSourceStatus`. *Learn:* why generated types beat hand-written ones. *Done:* source status renders from the live API; error envelopes and network failures normalize.
- [x] **3.3 Source overview page** · *Build:* configuration card (database name only), last-sync card (status/timestamps/safe error), connection-result card; loading, empty, error states; `/` redirects to `/source`. *Done:* page renders the env-configured source safely without exposing host/credentials.
- [x] **3.4 Test & Sync actions** · *Build:* Test connection + Sync metadata mutations, busy states, sonner toasts, 1.5 s source polling only while sync is in flight, source/metadata cache invalidation, connector-code display. *Done:* source test + sync feedback in the UI; Browse metadata appears after success.
- [x] **3.5 Metadata browser** · *Build:* pure metadata index (counts, PK/FK lookups, incoming/outgoing relations); schema → object master list; column table with type/nullability/default/comment and PK/FK badges; relations panel. *Done:* you can explore Acme visually, including the self-relation.
- [x] **3.6 Playwright setup + first e2e** · *Build:* Playwright config with both dev servers; serial happy path: test source → sync → see "employees" → `salary`/`numeric(10,2)`/FK. *Learn:* e2e vs unit; selectors that don't break. *Done:* `pnpm --filter web e2e` green (1 test), web build/lint/typecheck green.
- [x] **3.7 Review gate** · Browser walkthrough of the full source → sync → metadata flow; review the web data layer and state handling; then commit.

**Phase 3 done when:** browser happy path complete; e2e green; you can trace the full data flow yourself and have reviewed/committed the code.

---

### Phase 4 — Semantic layer v0 (generic, any domain) *(est. 4–6 sessions)*

**Goal:** define what data *means* once (metrics/dimensions), then query it safely via a structured spec.
**You'll learn:** query-spec design, safe SQL assembly (quoting, allowlists), golden-file testing.

- [x] **4.1 Semantic model schema** · *Build:* tables: `semantic_models`, `datasets` (exposed tables), `dimensions`, `metrics`, `metric_filters`, `semantic_joins`; migration. *Learn:* why joins/grains live in the model, not the UI. *Done:* tables + relations in app DB.
- [x] **4.2 Semantic CRUD API** · *Build:* document endpoints + validation rules (metric needs expression + agg; dimension needs column; etc.) + tests. *Done:* validated endpoints.
- [x] **4.3 Minimal editor UI** · *Build:* JSON editor page with validate/save/reset/load-example (forms come later if we want). *Done:* you can define a metric in the browser.
- [x] **4.4 QuerySpec v0 + compiler** · *Build:* Zod QuerySpec type (metrics, dimensions, filters, timeGrain, order, limit) + **compiler → SQL** using metadata identifier allowlist + parameterized filters. *Verify:* golden snapshot tests for 8 representative specs. *Learn:* this is the "IR-first" heart of the product. *Done:* compiler trustworthy, snapshots reviewed by you.
- [x] **4.5 `POST /query/execute`** · *Build:* spec → compile → guard → execute → `{columns, rows, meta}`; error taxonomy mapped. *Done:* endpoint returns correct aggregates.
- [x] **4.6 Seed the Acme semantic model** · *Build:* HR (headcount, avg_salary) + sales (revenue, orders) metrics and dimensions. *Done:* both domains queryable — proves we're not finance-locked. **Review gate here.**

**Phase 4 done when:** HR *and* sales aggregates come back correct through QuerySpec; compiler tests green.

---

### Phase 5 — Charts & dashboards, manual mode *(est. 6–8 sessions)*

**Goal:** build & save dashboards by hand — this is the canvas the AI will later drive.
**You'll learn:** ECharts theming/API, renderer-agnostic specs, optimistic concurrency, grid layouts.

- [x] **5.1 ChartSpec v0** · *Build:* Zod spec (type, title, querySpec ref, encodings bound to result columns, number/date formats). **No ECharts details inside, ever.** *Verify:* validation tests. *Done:* spec schema reviewed together.
- [x] **5.2 `<ChartRenderer/>`** · *Build:* owned ECharts wrapper: theme from design tokens, lazy-loaded, resize handling, loading/error states. *Learn:* ECharts `setOption`, themes, event wiring. *Done:* renders a hardcoded demo chart beautifully.
- [x] **5.3 Adapters: table, KPI, bar, line** · *Build:* pure functions ChartSpec(+rows) → ECharts option; unit tests. *Done:* four chart types in the registry.
- [x] **5.4 Explore page** · *Build:* manual builder — pick model, metrics/dimensions/filters → chart renders. No saving yet. *Done:* you can explore Acme data visually.
- [x] **5.5 Dashboard persistence** · *Build:* `dashboards` + `widgets` tables (spec JSONB + `version` int), CRUD + **optimistic concurrency** (409 on stale version) + tests. *Done:* APIs versioned and tested.
- [x] **5.6 Dashboard canvas** · *Build:* react-grid-layout canvas: add/edit/remove/save/reload widgets. *Done:* a dashboard survives reload.
- [x] **5.7 Global filters v0** · *Build:* dashboard-level date range + one categorical filter; applied server-side by rewriting widget QuerySpecs and re-executing; filter bar UI; tests. *Learn:* why filters are first-class in the spec. *Done:* "filter everything to Engineering dept" works manually.

**Phase 5 done when:** hand-built 4-widget dashboard with filters persists & reloads; every adapter unit-tested; specs are renderer-agnostic. **Review gate here** (chart spec + patch model walkthrough).

- [x] **5.8 Review gate** · Walk through ChartSpec v0, the batch endpoint, and the versioned dashboard document; review the explore/canvas code; then commit.

**Phase 5 status:** complete and committed (`c25b369`); every step built and green; widget count is capped at 12 rather than fixed at 4.

---

### Phase 6 — AI service v0 (Python + LangGraph) *(est. 8–10 sessions)*

**Goal:** chat that answers real questions against the connected DB — safely, always through QuerySpec.
**You'll learn:** Python tooling (uv/FastAPI/pytest), Pydantic contracts, LangGraph nodes, SSE streaming, prompt design + guardrails, evaluation.

- [x] **6.0 Python toolchain** · *Build:* `apps/ai-service` with uv, FastAPI skeleton, `/health`, ruff + pytest; run scripts. *Learn:* pyproject, virtualenvs — the Python mental model vs Node. *Done:* service runs next to the others.
- [x] **6.1 `llm.py` boundary** · *Build:* provider SDK behind one module: structured output → Pydantic models, env key, usage logging. *Verify:* mocked tests. *Done:* the rest of the codebase never imports the LLM SDK directly. *(D59)*
- [x] **6.2 Internal API between services** · *Build:* service-token auth; core-api exposes: `GET /internal/context` (semantic model + dataset slices) and `POST /internal/specs/execute`. *Done:* ai-service can read context and execute specs, nothing more.
- [ ] **6.3 LangGraph graph v0** · *Build:* nodes: `classify_intent → select_context → draft_spec → validate_spec (max 1 repair) → compose_answer`; in-memory state first. *Learn:* StateGraph, nodes/edges, where determinism vs LLM lives. *Verify:* pytest per node with a fake LLM. *Done:* "question in → validated QuerySpec + answer out".
- [ ] **6.4 Chat endpoint + streaming** · *Build:* core-api `POST /chat` proxying to ai-service; SSE step events; web chat page with message list + step timeline. *Done:* you watch `intent → context → spec → executed` live.
- [ ] **6.5 Result rendering** · *Build:* reply shows data table + an automatically suggested chart (QuerySpec → default ChartSpec heuristic); reuses `<ChartRenderer/>`. *Done:* answers feel like mini-reports.
- [ ] **6.6 Evals v0** · *Build:* golden set of ~30 questions (HR + sales + tricky: ambiguous metric, unknown column, wide date range); pytest runner; **record baseline score**. *Learn:* why evals are infrastructure, not QA. *Done:* `pnpm eval` style command we can rerun after every change.
- [ ] **6.7 Stretch — clarification v0** · *Build:* ambiguous question → the agent asks instead of guessing (LangGraph interrupt or simple question message). *Done:* duplicates like "revenue" vs "net revenue" prompt a question.

**Phase 6 done when:** "headcount by department" and "monthly revenue, last 12 months" answered correctly in chat; evals repeatable; no raw LLM SQL anywhere. **Review gate here.**

**Phase 6 status:** 6.0–6.2 complete — uv-managed Python 3.14 service with `/health`, pytest + ruff green, the LLM provider behind `llm.py` (OpenRouter via the OpenAI SDK), and a token-guarded internal API that lets ai-service read the validated model and execute QuerySpecs; next is 6.3.

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
- [ ] **8.2 Audit log** · source/test/sync/query/dashboard events.
- [ ] **8.3 Background sync + drift** · scheduled sync; schema-change flag in the metadata UI.
- [ ] **8.4 Guardrails** · sanitize warehouse-derived text in prompts (treat as untrusted); excluded/sensitive columns per model; prompt-injection tests.
- [ ] **8.5 Limits & observability** · rate limit, query concurrency cap, request IDs, structured logs.
- [ ] **8.6 CI + packaging** · GitHub Actions (lint + unit + e2e + eval smoke), Dockerfiles, deploy recipe, backup/restore note.
- [ ] **8.7 Operator docs** · how to create a read-only user, `DATABASE_URL`/`SOURCE_DATABASE_URL` env reference, runbook.

**Phase 8 done when:** a colleague can clone, configure their source database via env (read-only user), and use it.

---

### Phase 9 — Deferred backlog (decisions for later, with reasons)

Not scheduled. Each gets a DECISIONS.md entry when its turn comes:

- Connector #2 (Snowflake or BigQuery) + extract `packages/connector-sdk` + formal conformance kit; **revisit compiler location (SQLGlot/Python)**.
- Cross-filtering, drill-downs, more chart types (heatmap, area, funnel).
- Semantic layer: AI-suggested metrics, verified-queries store, dbt import.
- Retrieval upgrade (embeddings) — only if lexical search fails at real scale.
- Infra: Redis cache, queue (pg-boss), Arrow results, OTel, Langfuse.
- Multi-user polish: sharing; enterprise: SSO, private networking, impersonation, on-prem agent.
- Multiple source databases + in-app connection management (revisit D30).

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
| 2026-10-19 | 1 | 1.1 | Nest 12 scaffold in `apps/core-api` (ESM + Vitest, D26); `GET /api/health` on :3001 (D27); unit + e2e green |
| 2026-10-19 | 1 | 1.2 | `@nestjs/config` + Zod `validateEnv`; `.env`/`.env.example`; fail-fast verified (exit 1, names `DATABASE_URL`); PORT override via `process.env` verified (D28) |
| 2026-10-19 | 1 | 1.3 | `AllExceptionsFilter` (uniform error envelope, generic 500s) + `requestLogger` middleware (method/path/status/ms; 4xx warn, 5xx error); e2e covers 404 body; D29 |
| 2026-10-19 | 1 | 1.4 | Swagger at `/api/docs` (lazy document factory, `useGlobalPrefix`) + `HealthDto`; e2e covers `/api/docs-json`; Prisma deferred to 2.1b/c and plan pivoted to env-only single source (D30–D32); 1.5 next |
| 2026-10-19 | 1 | 1.5 | Phase 1 review: request-lifecycle walkthrough; `HealthService` spec + isolated controller spec; e2e log-wiring and generic-500 coverage; README "How a request flows" + "Tests". **Phase 1 complete** |
| 2026-10-19 | 2 | 2.1a | Acme source DB: `acme` with `hr`+`sales` schemas, views, `acme_reader` SELECT-only (writes/temp denied), deterministic data; `pnpm db:seed` (idempotent); `SOURCE_DATABASE_URL` required at boot (D33) |
| 2026-10-19 | 2 | 2.1b | Prisma 7.10.1 pinned (pnpm `allowBuilds` for `prisma` + `@prisma/engines`); `prisma.config.ts` via native `process.loadEnvFile`; `SyncRun` + `sync_status` enum migrated to `aibi` (`20261019161202_init_sync_runs`); client → `src/generated/prisma`, gitignored, postinstall-verified (D34) |
| 2026-10-19 | 2 | 2.1c | `PrismaService` (PrismaPg adapter, lazy connect, `$disconnect` on destroy) + explicit `PrismaModule` wired into AppModule; `enableShutdownHooks()` in main.ts; e2e DB round-trip (`SyncRun` create/read/update/delete vs Docker Postgres, self-cleaning); README flow + Prisma commands (D35) |
| 2026-10-20 | 2 | 2.2 | Connector contract: `SourceConnector` (`testConnection` / `discoverSchema` / `executeQuery`), normalized metadata + query result types, `ConnectorError` taxonomy (8 codes, safe messages, driver cause), `ConnectorRegistry` (register/get/list); 5 unit tests; not wired into the app yet (D36) |
| 2026-10-20 | 2 | 2.3 | `GET /api/source` (env + app DB only, no source connection): configured flag, database name parsed from `SOURCE_DATABASE_URL`, latest `SyncRun` (`startedAt`/`id` desc, ISO strings); redaction proven in unit + e2e against the live env; README endpoint row (D37) |
| 2026-10-20 | 2 | 2.4 | Postgres connector: pooled `pg` (max 4, 5 s connect, 30 s idle, `application_name`), read-only privilege audit (never writes), `POST /api/source/test`; `ConnectorError` → HTTP mapping with optional `code`; direct e2e covers Acme, wrong password (`AUTH`), missing DB, writable app role; `@types/pg@8.23.1` explicit (D38/D39) |
| 2026-10-20 | 2 | 2.5–2.7 | `pg_catalog` introspection in one `REPEATABLE READ, READ ONLY` transaction: 3 schemas, 8 objects (6 tables + 2 views), 38 columns, 5 FKs incl. `employees.manager_id → employees.id`; canonical types, comments/defaults, column/primary-key order; unit fixtures + Acme integration test (D40) |
| 2026-10-20 | 2 | 2.8 | Metadata migration `20261020034647_add_metadata_tables` (`db_objects`, `db_columns`, `db_relations`, `db_object_kind`); synchronous full-replace sync (`RUNNING` → `SUCCEEDED`/`FAILED`, stale >15 min, 409 concurrent), `POST /api/source/sync`, `GET /api/metadata`; snapshot IDs change per sync; e2e proves empty → exact counts → idempotence → 409/stale; e2e files now run sequentially (D41) |
| 2026-10-20 | 2 | 2.9 | Guarded query execution: strict `SELECT`/`WITH` guard (single statement, no comments/`;`, keyword/function denylist, ≤20k chars), Zod pipe, wrapper LIMIT (10k cap + `truncated`), 15 s `statement_timeout`, read-only transaction, abort → `pg_cancel_backend`, OID type cache; temporary `POST /api/query/execute`; guard/unit + HTTP e2e (aggregate, types, cap, rejects, timeout/cancel); **132 unit / 41 e2e green**, build/lint/Prettier clean (D42) |
| 2026-10-20 | 3 | 3.1 | Scaffolded `apps/web` (Next 16.4.2, React 19.3.1, Tailwind 4, shadcn radix-nova/neutral) with app shell + Source/Metadata nav; added exact-origin CORS via `WEB_ORIGIN` in `configureApp()` + unit/e2e coverage; root `pnpm dev` runs both apps (D43/D45) |
| 2026-10-20 | 3 | 3.2 | Added `ApiErrorDto` to the shared error envelope + OpenAPI responses; `openapi:export` writes `openapi.json` in-process (gitignored); generated + committed `schema.d.ts`; `openapi-fetch` client normalizes envelopes/network errors; TanStack `QueryClientProvider`, `useSourceStatus`; web Vitest/jsdom harness (D44) |
| 2026-10-20 | 3 | 3.3 | Source page: configuration, last-sync, and session connection cards; loading skeletons, no-sync empty state, retryable error; `/` → `/source`; safe database-name-only rendering (D37) |
| 2026-10-20 | 3 | 3.4 | Test + Sync mutations with disabled/busy states, toasts, connector code badges, conditional 1.5 s polling while sync is in flight, source+metadata invalidation, Browse metadata link (D46) |
| 2026-10-20 | 3 | 3.5 | Metadata browser: pure index (counts, FK-by-column, directional relations), schema/object master list (default first TABLE), column table with type/nullability/default/comment + PK/FK badges, relations panel (D48) |
| 2026-10-20 | 3 | 3.6 | Playwright config (two web servers, chromium, workers=1) + serial e2e: `/` → source → test → sync → metadata → employees salary/type/FK; **44 core-api e2e / 21 web unit / 1 Playwright green**, web build/lint/typecheck clean (D47). Review gate 3.7 open |
| 2026-10-23 | 4 | 4.1–4.6 | Semantic schema + migration (`semantic_models`, `datasets`, `dimensions`, `metrics`, `metric_filters`, `semantic_joins`); whole-document API (`GET`/`PUT`/`DELETE /api/semantic/model`, `POST .../validate`, `GET /api/semantic/example`) with metadata/FK/expression validation; QuerySpec v0 + parameterized compiler (8 golden snapshots); `POST /api/query/execute` replaces raw SQL; Acme seed (6 datasets, 11 dimensions, 11 metrics, 4 joins) + `/semantic` JSON editor; **196 core-api unit / 55 e2e / 26 web unit / 2 Playwright green**, core-api build/lint + web build/lint/typecheck clean (D49–D53). Human review/commit next |
| 2026-10-25 | 2–4 | gates | Review gates closed: 2.10 (Swagger endpoint walkthrough), 3.7 (browser source → sync → metadata + web data layer), Phase 4 gate (semantic editor + QuerySpec compile/execute flow). **Phases 0–4 complete and committed**; next is Phase 5.1 |
| 2026-10-26 | 5 | 5.1–5.7 | ChartSpec v0 (Zod, embeds its QuerySpec, encodings validated against result columns, `table`/`kpi`/`bar`/`line`, semantic number/date formats) + `POST /api/charts/execute` batches (≤12 charts, 3 at a time, per-chart error isolation); versioned dashboards (`dashboards` + `widgets`, whole-document `PUT` + `expectedVersion` → 409, migration `20261026142336_add_dashboards`) + v0 dashboard filters rewritten server-side (`dateRange` + one categorical, warnings for unreachable dimensions); web: pure adapters/format/pivot + draft bridge, ECharts 6.1.0 client-only wrapper, form-based `/explore`, react-grid-layout canvas with add/edit/remove/save/reload and 409 reload UX, filter bar; **227 core-api unit / 75 e2e / 56 web unit / 3 Playwright green**, lint + typecheck clean (D54–D57). 5.8 review/commit next |
| 2026-10-27 | 5 | 5.8 | Phase 5 review gate closed: ChartSpec v0, batch execute endpoint, and versioned dashboard document walked through; explore/canvas code reviewed; Phase 5 committed (`c25b369`). **Phases 0–5 complete and committed**; next is Phase 6.0 |
| 2026-10-27 | 6 | 6.0 | Scaffolded `apps/ai-service` as a uv project (Python 3.14; committed `uv.lock` + `.python-version`), FastAPI app factory + typed `GET /health`, ruff + pytest (`httpx2` TestClient); added root `pnpm ai:install/dev/test/lint/format`, Python ignore rules, and root `test`/`lint` now include Python; **2 pytest green**, ruff clean, health + OpenAPI verified on `127.0.0.1:8000`; docs/decisions updated (D58). 6.1 next |
| 2026-10-28 | 6 | 6.1 | `llm.py` boundary: OpenRouter through the OpenAI SDK in one module; `config.py` (pydantic-settings) with `SecretStr` key, no default model, `.env` by absolute path; `structured()` inlines the JSON Schema + `json_object` + Pydantic validation, one retry without `response_format` on a provider 400, errors mapped to `LlmNotConfigured`/`LlmRefusal`/`LlmBadOutput`/`LlmUnavailable`, usage (tokens + cost) returned and logged without prompts or keys; `/health` reports `configured`/`missing`; AST test enforces the import boundary; `pnpm ai:smoke` for one real call; **22 pytest green**, ruff clean, live `/health` verified (D59). 6.2 next |
| 2026-10-29 | 6 | 6.2 | Internal API between services: `GET /api/internal/context` (validated catalog → per-dataset metrics/dimensions with descriptions, types, filters, joins, compiler limits; 404 without a model) and `POST /api/internal/specs/execute` (same Zod spec + compiler/guard/connector, D52 error mapping), both behind a required `INTERNAL_API_TOKEN` checked in constant time and hidden from Swagger/`openapi.json` via `@ApiExcludeController`; ai-service `CoreApiClient` (`context()`/`execute()`, typed errors, camelCase `QuerySpec`/result Pydantic models, 30 s timeout) wired into the app lifespan, plus `pnpm ai:smoke:core`; **240 core-api unit / 85 e2e / 56 web unit / 37 pytest green**, lint clean; live smoke read Acme and returned headcount by department (38 across 6 rows); `pnpm --filter web api:types` left `schema.d.ts` unchanged (D60). 6.3 next |
