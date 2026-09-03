import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against a running web server (default http://localhost:3000, override with E2E_BASE_URL).
 * The dashboard tests sign in with the seeded demo user (`pnpm db:seed` with SEED_DEMO=true).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
