import type { Pool } from "pg";
import { createDb, createPool, type Db } from "./client.ts";

/** Test helper: pool + db against TEST_DATABASE_URL (globalSetup guarantees migrations + `_test`). */
export function testDb(): { pool: Pool; db: Db; close: () => Promise<void> } {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:localdev@127.0.0.1:54330/tracksite_test";
  const pool = createPool(url, { max: 4 });
  const db = createDb(pool);
  return { pool, db, close: () => pool.end() };
}
