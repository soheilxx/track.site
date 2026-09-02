import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPool } from "../client.ts";
import { MIGRATIONS_FOLDER } from "../migrate.ts";

/**
 * Fails when the database has migrations pending or unknown (drift between repo and DB).
 * Used by CI (`pnpm db:check`) against the test database after `db:migrate`.
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

interface Journal {
  entries: Array<{ idx: number; tag: string; when: number }>;
}

const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as Journal;
const pool = createPool(url, { max: 1 });
try {
  const res = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
  );
  const applied = res.rows.map((r) => Number(r.created_at));
  const expected = journal.entries.map((e) => e.when);
  const pending = expected.filter((w) => !applied.includes(w));
  const unknown = applied.filter((w) => !expected.includes(w));
  if (pending.length || unknown.length) {
    console.error(`migration drift: pending=${pending.length} unknown=${unknown.length}`);
    process.exit(1);
  }
  console.error(`migrations in sync (${applied.length})`);
} catch (e) {
  console.error("migration check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await pool.end();
}
