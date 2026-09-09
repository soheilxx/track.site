import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * The content-heavy tests read and parse many files per test — the i18n namespace parity across every locale,
 * the knowledge base loader and search, the marketing render smoke — and exceed Vitest's default on slower
 * machines; they run as their own project with a 120 s budget (docs/18 §"Hardening"). Everything else keeps
 * the 30 s budget. Both projects share the root settings below (`extends: true`).
 */
export const CONTENT_HEAVY_TESTS = ["src/i18n/namespaces.test.ts", "src/lib/knowledge*.test.{ts,tsx}", "src/components/marketing/render-smoke.test.{ts,tsx}"];
export const CONTENT_HEAVY_TIMEOUT_MS = 120_000;

const INTEGRATION_TESTS = ["src/**/*.integration.test.ts"];

export default defineConfig({
  // tsconfig keeps `jsx: "preserve"` for Next; tests that render components need the automatic runtime.
  // Vitest 4 transforms with oxc (an `esbuild.jsx` setting would be ignored with a warning).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: INTEGRATION_TESTS,
    environment: "node",
    testTimeout: 30_000,
    // next-intl's navigation imports `next/navigation` without an extension; Node's ESM loader cannot
    // resolve that for an externalized package, Vite's resolver can — so the package is transformed inline
    server: { deps: { inline: ["next-intl"] } },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.{ts,tsx}"], exclude: [...INTEGRATION_TESTS, ...CONTENT_HEAVY_TESTS] },
      },
      {
        extends: true,
        test: { name: "content", include: CONTENT_HEAVY_TESTS, exclude: INTEGRATION_TESTS, testTimeout: CONTENT_HEAVY_TIMEOUT_MS },
      },
    ],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
