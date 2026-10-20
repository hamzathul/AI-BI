# apps/web

Next.js 16 App Router frontend for AI BI. Phase 3 covers the source overview,
test/sync actions, and the metadata browser.

## Run

From the repo root:

```bash
pnpm dev                # both web (:3000) and core-api (:3001)
pnpm --filter web dev   # web only
```

`/` redirects to `/source`.

## API client

- `src/lib/api/schema.d.ts` is generated from core-api Swagger and **committed**.
- `src/lib/api/client.ts` wraps `openapi-fetch` and normalizes every failure to
  one `ApiError`.
- `NEXT_PUBLIC_API_BASE_URL` is the origin only (`http://localhost:3001`);
  paths already include `/api`.

Regenerate types after an API contract change:

```bash
pnpm --filter web api:types
```

## Tests

```bash
pnpm --filter web test       # Vitest + Testing Library
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web e2e        # Playwright; needs Docker Postgres + pnpm db:seed
```

See the root [`README.md`](../../README.md) and [`docs/PLAN.md`](../../docs/PLAN.md)
for prerequisites and the full walkthrough.
