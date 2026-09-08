import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  // tsconfig keeps `jsx: "preserve"` for Next; tests that render components need the automatic runtime.
  // Vitest 4 transforms with oxc (an `esbuild.jsx` setting would be ignored with a warning).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.integration.test.ts"],
    environment: "node",
    // the catalogue-heavy content tests (i18n namespace parity across every locale, the knowledge base loader)
    // read and parse many files per test and exceed Vitest's 5 s default on slower machines
    testTimeout: 30_000,
    // next-intl's navigation imports `next/navigation` without an extension; Node's ESM loader cannot
    // resolve that for an externalized package, Vite's resolver can — so the package is transformed inline
    server: { deps: { inline: ["next-intl"] } },
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
