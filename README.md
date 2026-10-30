# AI BI — Agentic Analytics (single-company)

An AI-powered analytics app: configure a PostgreSQL source database at deploy time, let the app introspect it, define light business semantics (metrics & dimensions), then ask questions in chat and build dashboards from validated, safely-compiled queries.

- **Domain-agnostic**: built to handle HR, sales, operations — any tabular data.
- **IR-first**: the AI produces a structured query spec; the backend compiles and validates the SQL. The model never decides what is safe to run.
- **Single-company**: no multi-tenancy by design.

## Documentation

| Doc                                                | What it is                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [`docs/PLAN.md`](docs/PLAN.md)                     | **Master plan** — phases, steps, progress tracking. Start here. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)           | Decision log (what, why, when to revisit)                       |
| [`AGENTS.md`](AGENTS.md)                           | How we (human + AI) work in this repo                           |
| [`architecture-review.md`](architecture-review.md) | Background architecture review & strategy (Oct 2026)            |

## Toolchain

Verified on the dev machine 2026-10-18 (step 0.1); uv/Python added 2026-10-27 (step 6.0). Run these — all must respond:

| Tool                  | Expected              | Verify                                              |
| --------------------- | --------------------- | --------------------------------------------------- |
| Node.js               | 24.22.x (LTS)         | `node -v`                                           |
| pnpm                  | 11.18.x               | `pnpm -v`                                           |
| Git                   | 2.51.x                | `git --version`                                     |
| Docker CLI + Compose  | 29.x / v5.x           | `docker --version`, `docker compose version`        |
| Docker daemon running | —                     | `docker ps`                                         |
| uv                    | 0.11.x                | `uv --version`                                      |
| Python                | 3.14.x (uv-managed)   | `uv run --directory apps/ai-service python -V`      |

Notes:

- Node versions are managed with **nvm-windows** (D23): `nvm list` shows what's installed, `nvm use 24.22.0` activates one. On some Windows setups switching needs an admin terminal (symlink rule) — if `nvm use` refuses, reopen the terminal as Administrator.
- pnpm is an npm-global install (D24); its exact version is pinned in `package.json` (`packageManager`) since the workspace skeleton landed.
- **uv owns the Python side** (D58): it downloads/uses the version in `apps/ai-service/.python-version`, creates the app-local `.venv`, and locks dependencies in `uv.lock`. Your system `python` is irrelevant here — always go through `uv run` or the `pnpm ai:*` scripts.

## Quickstart

Phases 0–5 are implemented and committed. Phase 6 has started: the Python **ai-service** runs, tests, and lints (6.0), and the LLM provider now sits behind a single module (6.1); chat logic is next.

```bash
# 1. Verify tools — see "Toolchain" above
# 2. Start local Postgres 18 (container aibi-postgres)
docker compose up -d

# 3. Create local env files (gitignored; .env.example is the template)
cp apps/core-api/.env.example apps/core-api/.env
cp apps/ai-service/.env.example apps/ai-service/.env
# Generate one shared token and paste it into BOTH files as INTERNAL_API_TOKEN
# (core-api and ai-service reject calls without it):
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# The web app defaults to http://localhost:3001; copy apps/web/.env.example
# to apps/web/.env.local only if you need to override it.
# ai-service: set LLM_API_KEY + LLM_MODEL to make real model calls. Optional —
# everything else (including the test suite) runs without a key.

# 4. Install the workspace and apply app-database migrations
pnpm install
pnpm ai:install
pnpm --filter core-api prisma:migrate

# 5. Load the Acme sample source database (destructive, dev-only — re-runnable)
pnpm db:seed

# 6. Seed the Acme semantic model (builds core-api, syncs metadata, saves the model)
pnpm db:seed:semantic

# 7. Sanity-check the app database
docker exec aibi-postgres psql -U postgres -d aibi -c "SELECT version();"

# 8. Run the TypeScript apps (web :3000, api :3001)
pnpm dev
# API health + Swagger: http://localhost:3001/api/health, /api/docs

#    In a second terminal, run the Python AI service (:8000)
pnpm ai:dev
# AI health + OpenAPI: http://127.0.0.1:8000/health, /docs

# 9. Browser flow: http://localhost:3000
#    Source → Test connection → Sync metadata → Metadata → hr.employees
#    Semantic → Load example → Validate → Save model
#    Explore → build a chart · Dashboards → New dashboard → Add widget → Save
```

Local dev connection: `postgresql://postgres:postgres@localhost:5433/aibi` — host port 5433 because 5432 is used by another project's container. This `DATABASE_URL` is the **app's own** database. The read-only **source** database is the Acme sample data, loaded by `pnpm db:seed` and exposed to the API as `SOURCE_DATABASE_URL` (never writable).

Separate processes: `pnpm --filter core-api start:dev`, `pnpm --filter web dev`, and `pnpm ai:dev`.

## Web app notes

- The browser calls core-api **directly**; core-api allows the exact `WEB_ORIGIN` (`http://localhost:3000` by default) via CORS (D43). There is no Next.js proxy.
- `NEXT_PUBLIC_API_BASE_URL` is the API **origin only** (`http://localhost:3001`). Generated Swagger paths already include `/api`, so adding the prefix would duplicate it (D44).
- Source credentials never reach the browser. `GET /api/source` returns only the database name; connection tests run server-side.
- The **Semantic** page edits the whole model as JSON. Validate/Save checks every dataset, column, metric expression, metric filter, and join against the latest metadata snapshot; a stale model fails with a readable list of issues.
- The **Explore** page is a form-based chart builder (metric, dimension, optional series, time grain, formats) with a live preview; it never saves. A chart is a ChartSpec — a QuerySpec plus encodings and formats — so the same spec renders on a dashboard.
- **Dashboards** are one versioned document (name, filters, widgets + layout). The canvas saves with the version you loaded and reports a conflict instead of overwriting a newer save. Date-range and categorical filters are part of the document and are applied server-side to every widget that can reach the dimension.
- API types are generated from the live OpenAPI document:

```bash
pnpm --filter web api:types
# core-api builds + writes openapi.json (gitignored), then openapi-typescript
# writes src/lib/api/schema.d.ts (committed — review its diff)
```

## AI service notes

- `apps/ai-service` is a **uv-managed Python 3.14** project. `uv.lock` and `.python-version` are committed; `.venv/` is not. It is deliberately **not** a pnpm workspace package — root `pnpm ai:*` scripts bridge to uv (D58).
- It is internal-only: it binds to `127.0.0.1:8000`, has no CORS, and never receives source-database credentials. It calls core-api's internal endpoints; the browser never calls it directly (D60).
- Since 6.2 it reads the model through `GET /api/internal/context` and runs every question through `POST /api/internal/specs/execute` — the same compiler, guard, and read-only connector as the public query route. Both calls require the shared `INTERNAL_API_TOKEN`; `CoreApiClient` (in `core_api.py`) is the only transport, and its errors are typed (`CoreApiRejected`, `CoreApiUnavailable`, ...).
- `pnpm ai:smoke:core` makes **one real round-trip** against a running core-api (context + "headcount by department"); it skips when the token is unset and fails with the API's own message when core-api is down or has no saved model.
- It exposes `GET /health` (which also reports whether the LLM is configured) and no chat route yet — the graph arrives in 6.3. Interactive FastAPI docs: `http://127.0.0.1:8000/docs`.
- **`llm.py` is the only module allowed to import the provider SDK** (D15/D59). Callers ask for a Pydantic model and get validated data plus token usage; SDK types and exceptions never cross the boundary. `tests/test_import_boundary.py` fails the build if a second file imports `openai`.
- The provider is **OpenRouter** through the OpenAI SDK (`LLM_BASE_URL` override). Structured output is portable: the JSON Schema is inlined in the prompt, the model is asked for `json_object`, and Pydantic validates the reply. A provider that rejects `response_format` is retried once without it.
- `pnpm ai:smoke` makes **one real call** to prove your key/model work; it prints "skipped" when `LLM_API_KEY`/`LLM_MODEL` are unset. Only `LLM_MODEL` is required in addition to the key — no default slug is baked in, because catalogue names change.

## Tests

| Command                           | What it covers                                             |
| --------------------------------- | ---------------------------------------------------------- |
| `pnpm --filter core-api test`     | API unit tests (Vitest)                                    |
| `pnpm --filter core-api test:e2e` | API HTTP/database tests (needs Docker Postgres)            |
| `pnpm --filter web test`          | Web unit/components (Vitest + Testing Library + jsdom)     |
| `pnpm --filter web typecheck`     | Web TypeScript (`tsc --noEmit`)                            |
| `pnpm --filter web e2e`           | Playwright happy paths against real core-api + seeded Acme |
| `pnpm ai:test`                    | ai-service unit tests (pytest + Starlette TestClient)      |
| `pnpm ai:smoke`                   | One real LLM call (needs a key; skips when unconfigured)   |
| `pnpm ai:smoke:core`              | One real core-api round-trip (needs both services up)      |
| `pnpm ai:lint`                    | ai-service lint + format check (ruff)                      |
| `pnpm test`                       | All unit tests: core-api + web + ai-service                |
| `pnpm lint`                       | Workspace lint: oxlint, ESLint, ruff                       |

Playwright starts core-api and web automatically, but needs Docker Postgres running, `pnpm db:seed` already run, and `apps/core-api/.env` present. The e2e mutates the dev app database (sync creates a run/snapshot; the semantic and dashboard tests create and remove their own model/dashboards), so it runs with one worker. Install the browser once with `pnpm --filter web exec playwright install chromium`.

## Main API endpoints

| Method | Path                           | Purpose                                           |
| ------ | ------------------------------ | ------------------------------------------------- |
| GET    | `/api/health`                  | Liveness                                          |
| GET    | `/api/source`                  | Safe source status + latest sync attempt          |
| POST   | `/api/source/test`             | Connect + audit the read-only role                |
| POST   | `/api/source/sync`             | Introspect and replace the metadata snapshot      |
| GET    | `/api/metadata`                | Stored metadata tree + relation graph             |
| GET    | `/api/semantic/model`          | Saved semantic model (`null` before first save)   |
| PUT    | `/api/semantic/model`          | Validate and replace the semantic model           |
| DELETE | `/api/semantic/model`          | Delete the saved semantic model                   |
| POST   | `/api/semantic/model/validate` | Validate without saving                           |
| GET    | `/api/semantic/example`        | The Acme HR + sales example model                 |
| POST   | `/api/query/execute`           | Compile and execute a QuerySpec                   |
| POST   | `/api/charts/execute`          | Execute up to 12 charts (one batch per dashboard) |
| GET    | `/api/dashboards`              | List dashboards                                   |
| POST   | `/api/dashboards`              | Create an empty dashboard                         |
| GET    | `/api/dashboards/{id}`         | One dashboard document (widgets + filters)        |
| PUT    | `/api/dashboards/{id}`         | Replace with `expectedVersion` (409 when stale)   |
| DELETE | `/api/dashboards/{id}`         | Delete a dashboard                                |

Full request/response shapes: `http://localhost:3001/api/docs`.

### ai-service (internal, `:8000`)

| Method | Path      | Purpose                       |
| ------ | --------- | ----------------------------- |
| GET    | `/health` | Liveness + whether the LLM is configured |

OpenAPI for this service: `http://127.0.0.1:8000/docs`.

## Repo layout

```
apps/web          Next.js frontend            (Phases 3–5)
apps/core-api     NestJS backend              (Phases 1–5)
apps/ai-service   Python/FastAPI; LangGraph   (Phase 6, 6.1 in progress)
sample-data/      Acme HR + sales seed SQL    (Phase 2)
docs/             Plan + decision log
```
