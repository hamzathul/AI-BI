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
| `DATABASE_URL` | **yes** | — | App's own PostgreSQL database (Prisma) |
| `SOURCE_DATABASE_URL` | **yes** | — | Read-only source database (Acme sample; load with `pnpm db:seed`) |

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

## How a request flows

1. `main.ts` boots Nest (`NestFactory.create(AppModule)`) and calls `configureApp(app)`.
2. `configureApp()` sets the `/api` global prefix, attaches the request logger,
   installs the global exception filter, and mounts Swagger at `/api/docs`.
3. `AppModule` loads `ConfigModule` (global, Zod-validated env), `PrismaModule`
   (app database), and `HealthModule`.
4. A request is routed to a controller, which delegates to a service.
5. Every response is logged once by the middleware (`finish` event). Every error
   exits through `AllExceptionsFilter`: `HttpException`s keep their status and
   message; anything else becomes a generic 500 and is logged with its stack.

## Commands

```bash
pnpm --filter core-api start:dev    # http://localhost:3001 (watch mode)
pnpm --filter core-api build
pnpm --filter core-api test         # unit tests (Vitest)
pnpm --filter core-api test:e2e     # e2e tests (Vitest + supertest)
pnpm --filter core-api lint         # oxlint
pnpm --filter core-api prisma:migrate   # create + apply a migration from schema.prisma
pnpm --filter core-api prisma:status    # migration history vs database state
pnpm --filter core-api prisma:studio    # browse the app database
```

The Prisma client is generated into `src/generated/prisma/` on install
(`postinstall`) — gitignored and never edited by hand.

## Tests

```bash
pnpm --filter core-api test        # unit (Vitest), no external services
pnpm --filter core-api test:e2e    # HTTP contract (Vitest + supertest)
pnpm --filter core-api test:cov    # coverage report
```

Unit tests cover pure logic (env validation, filter, middleware, service,
controller delegation). E2E tests boot the real app (`AppModule` +
`configureApp`) and cover the HTTP contract — health, Swagger, the error
envelope, request logging — plus an app-database round-trip (create, read,
update, delete a `SyncRun`) against the Docker Postgres.

Coverage is a guide, not a gate: the text reporter only lists files that still
have uncovered lines, and e2e-only glue such as `main.ts` and `configure-app.ts`
reports 0% here because unit tests never boot the app.

From step 2.1c onward, e2e tests also need the local Docker Postgres.

## Endpoints

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok", "uptime": 12, "timestamp": "..." }` |
| GET | `/api/source` | Safe source status: configured flag, database name, last sync — never host or credentials |
| GET | `/api/docs` | Swagger UI (from controller/DTO decorators) |
| GET | `/api/docs-json` | Generated OpenAPI document |

All routes live under the `/api` global prefix (D27). Swagger is generated from
controller and DTO decorators; the document is built lazily on first request.
