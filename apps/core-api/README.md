# core-api

NestJS backend for AI BI. See the root [`README.md`](../../README.md) and
[`docs/PLAN.md`](../../docs/PLAN.md) for the project context.

## Environment

```bash
cp .env.example .env    # run from apps/core-api/
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3001` | HTTP port |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string (app DB now, connector target later) |

Validated by Zod at boot in `src/config/env.validation.ts` (D28). A missing or
invalid value stops the app with a clear message instead of failing later.

## Commands

```bash
pnpm --filter core-api start:dev    # http://localhost:3001 (watch mode)
pnpm --filter core-api build
pnpm --filter core-api test         # unit tests (Vitest)
pnpm --filter core-api test:e2e     # e2e tests (Vitest + supertest)
pnpm --filter core-api lint         # oxlint
```

## Endpoints

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok", "uptime": 12, "timestamp": "..." }` |

All routes live under the `/api` global prefix (D27).
