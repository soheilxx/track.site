import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads `schema/kit.ts` (everything except the partitioned event store, which is
 * created by a hand-written migration). Migrations are plain SQL under ./drizzle.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/kit.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgresql://postgres:localdev@127.0.0.1:54330/tracksite_dev",
  },
  strict: true,
  verbose: true,
});
