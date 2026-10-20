# core-api

NestJS backend for AI BI. See the root [`README.md`](../../README.md) and
[`docs/PLAN.md`](../../docs/PLAN.md) for the project context.

## Environment

```bash
cp .env.example .env    # run from apps/core-api/
```

| Variable              | Required | Default       | Purpose                                                           |
| --------------------- | -------- | ------------- | ----------------------------------------------------------------- |
| `NODE_ENV`            | no       | `development` | `development` \| `test` \| `production`                           |
| `PORT`                | no       | `3001`        | HTTP port                                                         |
| `DATABASE_URL`        | **yes**  | —             | App's own PostgreSQL database (Prisma)                            |
| `SOURCE_DATABASE_URL` | **yes**  | —             | Read-only source database (Acme sample; load with `pnpm db:seed`) |

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
returned to the client. Connector failures keep the same envelope and add an
optional `code` (D39):

```json
{
  "statusCode": 502,
  "error": "Bad Gateway",
  "message": "Source database credentials were rejected.",
  "code": "AUTH",
  "path": "/api/source/test",
  "timestamp": "2026-10-20T09:00:00.000Z"
}
```

Mapping: `CONNECTION` / `AUTH` / `PERMISSION` → 502, `TIMEOUT` → 504,
`NOT_FOUND` → 404, `SYNTAX` → 422, `UNSUPPORTED` → 501, `INTERNAL` → 500. The
message is safe to show; the raw driver error stays in server logs.

Each request logs one line once the response finishes
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
   (app database), `ConnectorsModule` (Postgres pool + registry),
   `MetadataModule` (sync + stored metadata), `QueryModule` (guarded reads),
   `HealthModule`, and `SourceModule`.
4. A request is routed to a controller, which delegates to a service.
5. Every response is logged once by the middleware (`finish` event). Every error
   exits through `AllExceptionsFilter`: `HttpException`s keep their status and
   message, `ConnectorError`s use the D39 mapping plus `code`, and anything else
   becomes a generic 500 logged with its stack.

## Source → metadata → query (Phase 2)

With Docker Postgres running and Acme seeded (`pnpm db:seed`), the four
endpoints form one flow:

1. `POST /api/source/test` — connects with `SOURCE_DATABASE_URL` and audits
   privileges; expect `{ serverVersion, database: "acme", readOnly: true, latencyMs }`.
2. `POST /api/source/sync` — introspects schemas, objects, columns, keys, and
   FKs, then replaces the stored snapshot atomically; Acme yields
   `{ schemas: 2, objects: 8, columns: 38, relations: 5 }`. Returns `409` while
   another sync is RUNNING; stale RUNNING rows older than 15 minutes are failed.
3. `GET /api/metadata` — the browsable tree with `syncedAt`, primary keys, and
   the relation graph. Metadata IDs are snapshot-scoped: every sync replaces
   them (D41).
4. `POST /api/query/execute` — one guarded read. Try:

   ```json
   { "sql": "SELECT count(*)::int AS count FROM hr.employees" }
   ```

   Response: `{ columns, rows: [{ "count": 39 }], rowCount: 1, truncated: false, durationMs }`.

The raw-SQL endpoint is a **temporary Phase 2 verification surface** (D9/D42).
The guard allows one `SELECT`/`WITH`, rejects comments and semicolons, caps
results at 10,000 rows (with `truncated`), times out after 15 s, and cancels the
source query when the client disconnects. `numeric`/`bigint` values arrive as
strings (node-postgres precision default), so the web client parses them later.

## Commands

```bash
pnpm --filter core-api start:dev    # http://localhost:3001 (watch mode)
pnpm --filter core-api build
pnpm --filter core-api test         # unit tests (Vitest)
pnpm --filter core-api test:e2e     # e2e tests (Vitest + supertest)
pnpm --filter core-api lint         # oxlint
pnpm --filter core-api format       # Prettier (src + test)
pnpm --filter core-api prisma:migrate   # create + apply a migration from schema.prisma
pnpm --filter core-api prisma:generate  # regenerate the client after schema edits
pnpm --filter core-api prisma:status    # migration history vs database state
pnpm --filter core-api prisma:studio    # browse the app database
```

The app DB migration history lives in `prisma/migrations/` (latest:
`add_metadata_tables`). The Prisma client is generated into
`src/generated/prisma/` on install (`postinstall`) — gitignored and never edited
by hand.

## Tests

```bash
pnpm --filter core-api test        # unit (Vitest), no external services
pnpm --filter core-api test:e2e    # HTTP contract (Vitest + supertest)
pnpm --filter core-api test:cov    # coverage report
```

Unit tests cover pure logic (env validation, filter, middleware, services,
guards, pipes, controller delegation). E2E tests boot the real app (`AppModule`
and `configureApp`) and cover the HTTP contract — health, Swagger, the error
envelope, request logging, source status — plus an app-database round-trip,
live connector checks against Acme (auth, read-only audit, timeout,
cancellation), introspection, the full sync (replace, 409, stale recovery), and
guarded query execution (aggregates, types, row cap, rejected SQL).

Coverage is a guide, not a gate: the text reporter only lists files that still
have uncovered lines, and e2e-only glue such as `main.ts` and `configure-app.ts`
reports 0% here because unit tests never boot the app.

From step 2.1c onward, e2e tests also need the local Docker Postgres:

```bash
docker compose up -d
pnpm db:seed
```

They run sequentially because every test file shares the app database (D41).

## Endpoints

| Method | Path                 | Response                                                                                                 |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`        | `{ "status": "ok", "uptime": 12, "timestamp": "..." }`                                                   |
| GET    | `/api/source`        | Safe source status: configured flag, database name, last sync — never host or credentials                |
| POST   | `/api/source/test`   | Live connection + read-only audit: `{ serverVersion, database, readOnly, latencyMs }`                    |
| POST   | `/api/source/sync`   | Discover and replace metadata; sync run + `{ schemas, objects, columns, relations }` (409 while running) |
| GET    | `/api/metadata`      | Stored snapshot: `{ syncedAt, schemas, relations }`                                                      |
| POST   | `/api/query/execute` | Temporary guarded SQL: `{ columns, rows, rowCount, truncated, durationMs }`                              |
| GET    | `/api/docs`          | Swagger UI (from controller/DTO decorators)                                                              |
| GET    | `/api/docs-json`     | Generated OpenAPI document                                                                               |

All routes live under the `/api` global prefix (D27). Swagger is generated from
controller and DTO decorators; the document is built lazily on first request.
