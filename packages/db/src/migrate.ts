import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, createPool } from "./client.ts";

export const MIGRATIONS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** Apply all pending SQL migrations (owner connection, unpooled URL preferred). */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = createPool(connectionString, { max: 1 });
  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: "drizzle" });
  } finally {
    await pool.end();
  }
}
