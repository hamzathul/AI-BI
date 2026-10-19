# core-api

NestJS backend for AI BI. See the root [`README.md`](../../README.md) and
[`docs/PLAN.md`](../../docs/PLAN.md) for the project context.

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
