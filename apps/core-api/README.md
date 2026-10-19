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
| `DATABASE_URL` | **yes** | — | App's own PostgreSQL database (Prisma). The read-only source DB (`SOURCE_DATABASE_URL`) arrives in step 2.1a |

Validated by Zod at boot in `src/config/env.validation.ts` (D28). A missing or
invalid value stops the app with a clear message instead of failing later.

## Errors & logging

Every failure returns the same shape (D29):

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Cannot GET /api/unknown",
  "path": "/api/unknown",
  "timestamp": "2026-10-19T15:07:33.019Z"
}
```

Unhandled errors become a generic `500`; details are logged server-side, never
returned to the client. Each request logs one line once the response finishes
(`log` for 2xx/3xx, `warn` for 4xx, `error` for 5xx):

```
[RequestLogger] GET /api/health 200 3ms
[RequestLogger] GET /api/unknown 404 2ms
```

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
| GET | `/api/docs` | Swagger UI (from controller/DTO decorators) |
| GET | `/api/docs-json` | Generated OpenAPI document |

All routes live under the `/api` global prefix (D27). Swagger is generated from
controller and DTO decorators; the document is built lazily on first request.
