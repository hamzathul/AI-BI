# AGENTS.md — How AI agents work in this repo

> Read this file first, then `docs/PLAN.md` (the master plan + current status). Decisions live in `docs/DECISIONS.md`. Background strategy: `architecture-review.md`.

## What this project is

A single-company AI analytics app: connect a PostgreSQL source database configured at deploy time (more connectors later), introspect it, define light business semantics (metrics/dimensions — domain-agnostic: HR, sales, ops, anything), then answer questions in chat and build dashboards from validated queries. One repo, monorepo layout, no multi-tenancy.

## Who the user is

A developer **new to NestJS and several of these technologies**, learning as we build. Optimize every interaction for their learning and review, not just delivery:

- Explain *why* before *what*. Plain language over jargon. Short code, readable over clever.
- They review the code after each step. Surface the files changed and what to look at.
- If a step grows beyond ~1-3 files or ~a session, split it and say so.
- **They commit, always.** After reviewing, the user stages and commits themselves — the agent never runs `git add`/`git commit`. A finished step ends with a handover: files changed, what to review, and a ready-to-run commit command.

## Working agreement (mandatory)

1. **One step at a time** from `docs/PLAN.md`. Never run ahead multiple steps.
2. Each step: explain plan → build minimally → run tests → update PLAN.md (tick + progress log, included in the review bundle) → summarize for review → **the user reviews, stages, and commits themselves** — the agent never runs `git add`/`git commit`.
3. **Tests are part of done.** No red tests, no "later".
4. New decision? Append to `docs/DECISIONS.md` with date + status. New library? That's a decision — log it.
5. Commit style: conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Small commits per step.
6. Don't introduce infra (Redis, queues, K8s, Turborepo) without a logged decision + user agreement.

## Non-negotiable boundaries

- **The LLM never emits raw SQL as a primary path** — it emits a QuerySpec; the backend compiles/validates. (D9)
- **Source credentials**: read-only, live only in env (`SOURCE_DATABASE_URL`), never returned by APIs, never logged, never in the web app or ai-service. If we ever store credentials in the app DB, encrypt at rest. (D11/D30; D12 revisit)
- **Chart specs are renderer-agnostic** — no ECharts options persisted. (D8)
- **core-api is the single writer** of domain data; ai-service is stateless. (D16)
- Read-only database credentials for every connector. (D11)

## Stack snapshot (details in PLAN.md §5)

- Runtime: Node 24 LTS, pnpm workspaces, Docker (Postgres 18)
- `apps/core-api`: NestJS 12 (ESM) + Prisma 7.10.1 + Vitest/supertest, Swagger at `/api/docs`
- `apps/web`: Next.js 16.4 App Router + Tailwind 4 + shadcn/ui + TanStack Query v5 + `openapi-fetch` generated client + sonner + ECharts 6/react-grid-layout (RHF/Zod when forms need it)
- `apps/ai-service` (Phase 6): Python 3.14 (uv-managed) + uv 0.11 + FastAPI + Pydantic v2; LangGraph arrives in 6.3; LLM SDK only in `llm.py`
- `sample-data/`: Acme HR + sales seed for the practice database

## Commands

```bash
# Available today
nvm use 24.22.0                    # activate the project's Node (see README §Toolchain)
cp apps/core-api/.env.example apps/core-api/.env  # one-time local config (gitignored)
pnpm install                       # workspace install
docker compose up -d               # local Postgres 18 (container aibi-postgres, host port 5433)
pnpm db:seed                       # load Acme source DB (destructive, dev-only)
pnpm db:seed:semantic              # sync metadata + save the Acme semantic model
pnpm dev                           # web :3000 + api :3001
pnpm ai:install                    # uv sync: create .venv, install Python deps
pnpm ai:dev                        # ai-service only (:8000; GET /health, docs at /docs)
pnpm ai:test                       # ai-service unit tests (pytest)
pnpm ai:lint                       # ruff check + format check
pnpm ai:format                     # ruff format
pnpm --filter core-api start:dev   # api only (:3001; GET /api/health, docs at /api/docs)
pnpm --filter core-api test        # api unit tests (Vitest)
pnpm --filter core-api test:e2e    # api e2e tests (Vitest + supertest)
pnpm --filter web dev              # web only (:3000; `/` redirects to `/source`)
pnpm --filter web test             # web unit tests (Vitest + Testing Library)
pnpm --filter web typecheck        # tsc --noEmit
pnpm --filter web e2e              # Playwright (needs Docker Postgres + seeded Acme source)
pnpm --filter web api:types        # export OpenAPI then regenerate committed `schema.d.ts`
pnpm test                          # all unit tests: core-api + web + ai-service
pnpm lint                          # all linters: oxlint + ESLint + ruff
```

Web env: `NEXT_PUBLIC_API_BASE_URL` is the API **origin** (`http://localhost:3001`) — Swagger paths already include `/api`. core-api allows it via `WEB_ORIGIN`.

## Current status

Tracked at the top of `docs/PLAN.md`. Keep it accurate — it's the handoff between sessions.
