import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema/index.ts";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export const DB_ROLES = {
  /** control plane: RLS enforced, tenant from app.organization_id */
  app: "tracksite_app",
  /** data plane: bypasses RLS, only ever acts with server-resolved site context */
  worker: "tracksite_worker",
} as const;

export function createPool(connectionString: string, options: Partial<PoolConfig> = {}): Pool {
  return new Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    ...options,
  });
}

export function createDb(pool: Pool): Db {
  return drizzle({ client: pool, schema });
}

/**
 * Run `fn` inside a transaction as the RLS-enforced application role scoped to one organization.
 * The organization id must come from the authenticated session, never from user input.
 */
export async function withTenant<T>(db: Db, organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("invalid organization id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE tracksite_app`);
    await tx.execute(sql`SELECT set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}

/** Data-plane transactions (collector/worker) that legitimately span tenants. */
export async function withWorker<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE tracksite_worker`);
    return fn(tx);
  });
}

/**
 * Platform-level access (no tenant scope). Callers must have recorded a break-glass or
 * platform-admin audit entry; this helper never checks that by itself.
 */
export async function withPlatform<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE tracksite_worker`);
    return fn(tx);
  });
}

/** PostgreSQL SQLSTATE of an error, unwrapping drizzle's query error wrapper (`cause`). */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgErrorConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const c = (current as { constraint?: unknown }).constraint;
    if (typeof c === "string") return c;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

export function isRlsViolation(error: unknown): boolean {
  return pgErrorCode(error) === "42501";
}

export { schema };
