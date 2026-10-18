# AGENTS.md — How AI agents work in this repo

> Read this file first, then `docs/PLAN.md` (the master plan + current status). Decisions live in `docs/DECISIONS.md`. Background strategy: `architecture-review.md`.

## What this project is

A single-company AI analytics app: connect a PostgreSQL database (more connectors later), introspect it, define light business semantics (metrics/dimensions — domain-agnostic: HR, sales, ops, anything), then answer questions in chat and build dashboards from validated queries. One repo, monorepo layout, no multi-tenancy.

## Who the user is

A developer **new to NestJS and several of these technologies**, learning as we build. Optimize every interaction for their learning and review, not just delivery:

- Explain *why* before *what*. Plain language over jargon. Short code, readable over clever.
- They review the code after each step. Surface the files changed and what to look at.
- If a step grows beyond ~1-3 files or ~a session, split it and say so.

## Working agreement (mandatory)

1. **One step at a time** from `docs/PLAN.md`. Never run ahead multiple steps.
2. Each step: explain plan → build minimally → run tests → summarize for review → commit (only after user is okay) → tick the checkbox in PLAN.md → append to the Progress log.
3. **Tests are part of done.** No red tests, no "later".
4. New decision? Append to `docs/DECISIONS.md` with date + status. New library? That's a decision — log it.
5. Commit style: conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Small commits per step.
6. Don't introduce infra (Redis, queues, K8s, Turborepo) without a logged decision + user agreement.

## Non-negotiable boundaries

- **The LLM never emits raw SQL as a primary path** — it emits a QuerySpec; the backend compiles/validates. (D9)
- **Credentials**: encrypted at rest, never returned by APIs, never logged, never in the web app or ai-service. (D11/D12)
- **Chart specs are renderer-agnostic** — no ECharts options persisted. (D8)
- **core-api is the single writer** of domain data; ai-service is stateless. (D16)
- Read-only database credentials for every connector. (D11)

## Stack snapshot (details in PLAN.md §5)

- Runtime: Node 24 LTS, pnpm workspaces, Docker (Postgres 18)
- `apps/core-api`: NestJS 12 + Prisma + Jest/supertest, Swagger at `/api/docs`
- `apps/web`: Next.js 16.2 App Router + Tailwind + shadcn/ui + TanStack Query + RHF/Zod + ECharts (themed)
- `apps/ai-service` (Phase 6): Python + uv + FastAPI + Pydantic v2 + LangGraph; LLM SDK only in `llm.py`
- `sample-data/`: Acme HR + sales seed for the practice database

## Commands

```bash
# Available today
nvm use 24.22.0                    # activate the project's Node (see README §Toolchain)
pnpm install                       # workspace install
docker compose up -d               # local Postgres 18 (container aibi-postgres, host port 5433)

# Arrives with the apps (Phases 1–3)
pnpm --filter core-api start:dev   # api on :3001
pnpm --filter core-api test        # api unit tests
pnpm --filter web dev              # web on :3000
```

## Current status

Tracked at the top of `docs/PLAN.md`. Keep it accurate — it's the handoff between sessions.
