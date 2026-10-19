# AI BI — Agentic Analytics (single-company)

An AI-powered analytics app: connect a PostgreSQL database, let the app introspect it, define light business semantics (metrics & dimensions), then ask questions in chat and build dashboards from validated, safely-compiled queries.

- **Domain-agnostic**: built to handle HR, sales, operations — any tabular data.
- **IR-first**: the AI produces a structured query spec; the backend compiles and validates the SQL. The model never decides what is safe to run.
- **Single-company**: no multi-tenancy by design.

## Documentation

| Doc | What it is |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | **Master plan** — phases, steps, progress tracking. Start here. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log (what, why, when to revisit) |
| [`AGENTS.md`](AGENTS.md) | How we (human + AI) work in this repo |
| [`architecture-review.md`](architecture-review.md) | Background architecture review & strategy (Oct 2026) |

## Toolchain

Verified on the dev machine 2026-10-18 (step 0.1). Run these — all must respond:

| Tool | Expected | Verify |
|---|---|---|
| Node.js | 24.22.x (LTS) | `node -v` |
| pnpm | 11.18.x | `pnpm -v` |
| Git | 2.51.x | `git --version` |
| Docker CLI + Compose | 29.x / v5.x | `docker --version`, `docker compose version` |
| Docker daemon running | — | `docker ps` |

Notes:
- Node versions are managed with **nvm-windows** (D23): `nvm list` shows what's installed, `nvm use 24.22.0` activates one. On some Windows setups switching needs an admin terminal (symlink rule) — if `nvm use` refuses, reopen the terminal as Administrator.
- pnpm is an npm-global install (D24); its exact version is pinned in `package.json` (`packageManager`) since the workspace skeleton landed.

## Quickstart

Phase 0 is complete (toolchain, workspace, local Postgres) and Phase 1 has started (the core API). The web app arrives in Phase 3.

```bash
# 1. Verify tools — see "Toolchain" above
# 2. Start local Postgres 18 (container aibi-postgres)
docker compose up -d

# 3. Create local env files (gitignored; .env.example is the template)
cp apps/core-api/.env.example apps/core-api/.env

# 4. Install the workspace
pnpm install

# 5. Sanity-check the database
docker exec aibi-postgres psql -U postgres -d aibi -c "SELECT version();"

# 6. Run the API (second terminal)
pnpm --filter core-api start:dev
curl http://localhost:3001/api/health
```

Local dev connection: `postgresql://postgres:postgres@localhost:5433/aibi` — host port 5433 because 5432 is used by another project's container.

> Next: `pnpm --filter web dev` (Phase 3).

## Repo layout (target)

```
apps/web          Next.js frontend            (Phase 3)
apps/core-api     NestJS backend              (Phase 1)
apps/ai-service   Python/FastAPI + LangGraph  (Phase 6)
sample-data/      Acme HR + sales seed SQL    (Phase 2)
docs/             Plan + decision log
```
