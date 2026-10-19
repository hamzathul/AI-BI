import { defineConfig, env } from 'prisma/config';

// Node 24 loads `.env` natively — no dotenv dependency needed. Prisma commands
// run with `apps/core-api` as cwd, so this reads `apps/core-api/.env`.
try {
  process.loadEnvFile();
} catch {
  // No .env yet. `env()` below then fails with
  // "Environment variable not found: DATABASE_URL", which is the clearer error.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // App database only (D30) — the source database is never migrated.
    url: env('DATABASE_URL'),
  },
});
