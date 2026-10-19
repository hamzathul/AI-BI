# Decisions Log

Every meaningful decision gets an entry: what, why, and when to revisit. Status values: **settled** (hard to change later, intentional), **provisional** (we may refine as we learn), **revisit** (explicitly deferred to a trigger).

| # | Date | Decision | Status | Rationale / Trigger to revisit |
|---|---|---|---|---|
| D1 | 2026-10-18 | **Single-company deployment** — no orgs, workspaces, or tenants | settled | User requirement: one company connects their DB(s). Removes tenant isolation from every layer; big simplification. |
| D2 | 2026-10-18 | **Connections are unscoped but plural** — app supports multiple DB connections, owned by the one company | settled | Zero extra cost now; covers HR DB + sales DB scenarios. |
| D3 | 2026-10-18 | **Domain-agnostic product** — sample data mixes HR + sales; never assume finance | settled | User note. Semantic layer is generic metrics/dimensions; evals include both domains. |
| D4 | 2026-10-18 | **One monorepo** (`apps/*`, `packages/*`), pnpm workspaces | settled | Atomic changes across web/api/ai; split later only for team reasons. |
| D5 | 2026-10-18 | **Stack**: NestJS 12 core-api, Next.js 16.2 web, PostgreSQL 18, Prisma, ECharts, Tailwind + shadcn/ui, TanStack Query, RHF + Zod | settled | Verified current versions Oct 18 2026. |
| D6 | 2026-10-18 | **Node 24 LTS** (not 26 yet) | provisional | Node 26 becomes Active LTS Oct 28 2026; switch after tooling settles. |
| D7 | 2026-10-18 | **ECharts over Recharts** — for customization ceiling (custom series, canvas perf, chart breadth); themed to design tokens | settled | User priority: heavy future customization. Recharts stays a possible secondary renderer (registry design allows it). |
| D8 | 2026-10-18 | **Persisted chart specs are renderer-agnostic** — never store ECharts options | settled | Renderer swaps must be compile-target changes, not data migrations. Non-negotiable. |
| D9 | 2026-10-18 | **IR-first**: AI outputs QuerySpec; core-api compiles to SQL (TypeScript for Postgres MVP) | provisional | Compile location revisited at connector #2 — likely SQLGlot/Python then. Never raw SQL from the LLM in the primary path. |
| D10 | 2026-10-18 | **Connector contract is async-first** (submit/cancel semantics modeled even though Postgres is fast) | settled | Retrofitting async for Snowflake/BigQuery later would be a rewrite. |
| D11 | 2026-10-18 | **Read-only DB credentials** from day one; sample DB gets `acme_reader` role | settled | The real security boundary lives in the customer's database. |
| D12 | 2026-10-18 | **Credentials encrypted at rest** in app DB (AES-256-GCM, key from env); secret manager later | provisional | Fine for single-company MVP; move to a managed secret store before any real deployment. |
| D13 | 2026-10-18 | **Metadata stored normalized in app Postgres**; full sync first, incremental later; lexical retrieval v0 | settled | Embeddings/vector search deferred until lexical demonstrably fails. |
| D14 | 2026-10-18 | **Thin owned semantic layer** (datasets/dimensions/metrics/joins in app DB) — no Cube/dbt as foundation | settled | The semantic representation *is* AI quality; integrations (import/export) can come later. |
| D15 | 2026-10-18 | **No LangChain framework**; LangGraph yes (Phase 6); LLM SDK confined to `llm.py` | settled | One-file boundary: swapping providers must touch one file. |
| D16 | 2026-10-18 | **AI service is stateless**; core-api is the single writer of all domain data | settled | Avoids split-brain state; AI service never sees credentials or warehouses. |
| D17 | 2026-10-18 | **Results transport: JSON + row caps (10k) for MVP**; Arrow deferred | provisional | Revisit when result sizes or cross-service performance demand it. |
| D18 | 2026-10-18 | **No Redis / queues / Turborepo / K8s** until a concrete need appears | settled | Minimal infra; Docker Postgres only at start. |
| D19 | 2026-10-18 | **Tests in every step**: Jest+supertest (api), Vitest (web units), Playwright (e2e), pytest (ai) | settled | Definition of done for steps includes green tests. |
| D20 | 2026-10-18 | **Working agreement**: tiny steps → explain → build → user reviews code → test → commit → tick plan | settled | User is learning; code review is part of the loop. See AGENTS.md. |
| D21 | 2026-10-18 | **Dashboard updates via typed patch ops** + optimistic concurrency (version/409) | settled | Deterministic apply; LLM only *proposes* patches; trivial ops (rename) never touch the LLM. |
| D22 | 2026-10-18 | **API contract = OpenAPI generated from NestJS** → `openapi-typescript` consumers | settled | One source of truth; no hand-written duplicated types. |
| D23 | 2026-10-18 | **Node version management via nvm-windows** (not a system-wide MSI) | provisional | Already installed on the dev machine and working; switching Node versions is one command (matters for the planned Node 26 move, D6). Avoids two Node installs fighting over PATH. Revisit if tooling clashes with the shared symlink. |
| D24 | 2026-10-18 | **pnpm via npm-global install** — not `corepack enable`; exact version to be pinned in `package.json` (`packageManager`) at workspace setup (step 0.4) | provisional | Plan wording was "corepack enable"; pnpm 11.18.0 was already installed and working, and corepack is being phased out of Node distributions. Revisit at Node 26 switch. |
| D25 | 2026-10-18 | **Local Postgres 18 in Docker on host port 5433** — container `aibi-postgres`, named-volume persistence mounted at PG18's `/var/lib/postgresql`; dev-only credentials inline in `docker-compose.yml` | provisional | Port 5432 is taken by another project's container on this machine; 5433 lets both coexist. PG18 changed the image's data-dir layout — mounting the old `/var/lib/postgresql/data` path fails. Revisit if that other container disappears. |
| D26 | 2026-10-19 | **core-api tooling follows Nest 12 scaffold defaults: ESM + Vitest + oxlint** (instead of CommonJS + Jest + ESLint) | provisional | Nest 12's CLI generates ESM-first with Vitest and oxlint; keeps one JS test runner with the planned web app (Vitest). Supersedes the Jest mentions for core-api in D19 and PLAN §4–§5. Revisit if Prisma/ESM integration in step 1.4 causes friction. |
| D27 | 2026-10-19 | **All core-api routes live under the `/api` global prefix** — health at `/api/health`, Swagger later at `/api/docs` | settled | Stable API contract before the web client exists. Prefix is applied by a shared `configureApp()` used by both `main.ts` and e2e tests, so tests can't drift from production. |
