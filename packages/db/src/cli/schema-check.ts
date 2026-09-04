import { config as loadDotenv } from "dotenv";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import path from "node:path";
import { createPool } from "../client.ts";
import * as schema from "../schema/index.ts";

/**
 * Schema ↔ migrations parity: every table and column the drizzle schema declares must exist in the
 * connected database (which is expected to be migrated from zero by the journal), and no public table
 * of the database may be unknown to the schema (event partitions and the drizzle bookkeeping schema
 * excepted). Fails with a list of differences; used after `migrate` against a fresh `*_test` database.
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL (or DATABASE_URL) is required");
  process.exit(1);
}

const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));
const pool = createPool(url, { max: 1 });
const problems: string[] = [];
try {
  const dbColumns = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`,
  );
  const byTable = new Map<string, Set<string>>();
  for (const row of dbColumns.rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
    byTable.get(row.table_name)!.add(row.column_name);
  }
  const known = new Set<string>();
  for (const table of tables) {
    const name = getTableName(table);
    known.add(name);
    const columns = byTable.get(name);
    if (!columns) {
      problems.push(`table missing in database: ${name}`);
      continue;
    }
    for (const column of Object.values(getTableColumns(table))) {
      if (!columns.has(column.name)) problems.push(`column missing in database: ${name}.${column.name}`);
    }
  }
  const isPartition = (name: string) => /^events_(\d{6}|default)$/.test(name);
  for (const name of byTable.keys()) {
    if (known.has(name) || isPartition(name)) continue;
    problems.push(`table unknown to the schema: ${name}`);
  }
  // Tenant tables = tables with organization_id that the dashboard role may read; each needs RLS and a policy.
  // Infrastructure tables (queue, outbox, stripe events …) are revoked from tracksite_app and stay out.
  const rls = await pool.query<{ tablename: string; rls: boolean; policies: number }>(
    `SELECT c.relname AS tablename, c.relrowsecurity AS rls,
            (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       AND EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'organization_id')
       AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = 'tracksite_app')
       AND has_table_privilege('tracksite_app', c.oid, 'SELECT')`,
  );
  // Baseline tables (0000) that carry an organization_id but are global by design: tombstones are the
  // cross-tenant "never recycle a tracking id" lookup, contact requests come from the public forms.
  const globalByDesign = new Set(["tracking_id_tombstones", "contact_requests"]);
  for (const row of rls.rows) {
    if (isPartition(row.tablename) || globalByDesign.has(row.tablename)) continue;
    if (!row.rls) problems.push(`tenant table without row level security: ${row.tablename}`);
    else if (row.policies === 0) problems.push(`tenant table without a policy: ${row.tablename}`);
  }
} catch (e) {
  console.error("schema check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await pool.end();
}
if (problems.length) {
  console.error(`schema drift (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.error(`schema in sync (${tables.length} tables)`);
