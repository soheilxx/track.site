import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../client.ts";
import { runMigrations } from "../migrate.ts";

/**
 * Vitest globalSetup for integration tests: refuses to run unless the database name ends with
 * `_test`, applies migrations (non-destructive) and truncates all application tables.
 */
export default async function globalSetup(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  loadDotenv({ path: path.resolve(here, "../../../../.env"), quiet: true });
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:localdev@127.0.0.1:54330/tracksite_test";
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Safety stop: TEST_DATABASE_URL must point to a *_test database (got "${dbName}")`);
  }
  process.env.DATABASE_URL = url;
  process.env.TEST_DATABASE_URL = url;
  await runMigrations(url);
  const pool = createPool(url, { max: 1 });
  try {
    const tables = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'events_%'`,
    );
    const names = tables.rows.map((r) => `"${r.tablename}"`);
    if (names.length) {
      await pool.query(`SET session_replication_role = replica`);
      await pool.query(`TRUNCATE ${names.join(", ")} CASCADE`);
    }
  } finally {
    await pool.end();
  }
}
