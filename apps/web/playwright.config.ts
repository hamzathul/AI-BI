import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the real API and the seeded Acme source database.
 *
 * Prerequisites: Docker Postgres up, `pnpm db:seed` run, and core-api `.env`
 * present. The web app talks to core-api directly over CORS (D43).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter core-api start:dev",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000/source",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
