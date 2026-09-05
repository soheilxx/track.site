import { existsSync } from "node:fs";
import { defineConfig, devices, firefox, webkit, type PlaywrightTestProject } from "@playwright/test";
import { AUTH_FILE } from "./e2e/auth-file";

/**
 * End-to-end smoke tests against a running web server (default http://localhost:3000, override with E2E_BASE_URL).
 * The `setup` project signs in once with the seeded demo user (`pnpm db:seed` with SEED_DEMO=true) and stores the
 * session; the dashboard specs start from that stored session (better-auth allows 3 sign-ins per 10 s).
 *
 * Optional engines (cross-browser matrix, docs/qa/2026-09-05/followup/browsers): the `firefox` and `webkit`
 * projects exist only when Playwright's registry has the engine installed (`playwright install firefox webkit`);
 * without the engine they are skipped silently instead of failing the run. `E2E_ENGINES` (comma-separated,
 * default `firefox,webkit`) restricts which of them are defined, e.g. `E2E_ENGINES=webkit` on a machine whose
 * Firefox binary cannot start. Visual baselines are Chromium-only, so both ignore visual.spec.ts.
 */
function engineInstalled(engine: { executablePath(): string }): boolean {
  try {
    return existsSync(engine.executablePath());
  } catch {
    return false;
  }
}

const OPTIONAL_ENGINES = (process.env.E2E_ENGINES ?? "firefox,webkit").split(",").map((name) => name.trim());
const optionalEngineProjects: PlaywrightTestProject[] = [
  { name: "firefox", engine: firefox, device: devices["Desktop Firefox"] },
  { name: "webkit", engine: webkit, device: devices["Desktop Safari"] },
]
  .filter(({ name, engine }) => OPTIONAL_ENGINES.includes(name) && engineInstalled(engine))
  .map(({ name, device }) => ({ name, use: { ...device, storageState: AUTH_FILE }, dependencies: ["setup"], testIgnore: /visual\.spec\.ts$/ }));

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
  // Visual regression baselines (e2e/visual.spec.ts): one file per snapshot name, project and platform under e2e/__screenshots__ (see e2e/README.md).
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{projectName}-{platform}{ext}",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE }, dependencies: ["setup"], testIgnore: /visual\.spec\.ts$/ },
    {
      name: "visual",
      testMatch: /visual\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE, deviceScaleFactor: 1, timezoneId: "Europe/Berlin", contextOptions: { reducedMotion: "reduce" } },
      dependencies: ["setup"],
    },
    ...optionalEngineProjects,
  ],
});
