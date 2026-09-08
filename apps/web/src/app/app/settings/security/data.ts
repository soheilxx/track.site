import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, user } from "@track-site/db";
import { auth } from "@/server/auth";
import { db, logger } from "@/server/db";
import type { SessionUser } from "@/server/session";

/**
 * Status of the signed-in account's two-factor authentication for `/app/settings/security`. Read from
 * the database (not the session cookie cache, which can lag by up to five minutes after a change):
 * the `user.two_factor_enabled` flag, the time of the newest `user.two_factor.enabled` audit row of
 * this account, and how many backup codes are still unused — the count only; the codes themselves are
 * decrypted inside better-auth's server-only `viewBackupCodes` and never leave this function.
 */
export interface TwoFactorStatus {
  enabled: boolean;
  enabledSince: Date | null;
  backupCodesRemaining: number | null;
}

export async function loadTwoFactorStatus(account: SessionUser): Promise<TwoFactorStatus> {
  const [row] = await db().select({ enabled: user.twoFactorEnabled }).from(user).where(eq(user.id, account.id)).limit(1);
  const enabled = Boolean(row?.enabled ?? account.twoFactorEnabled);
  if (!enabled) return { enabled: false, enabledSince: null, backupCodesRemaining: null };
  const [enabledSince, backupCodesRemaining] = await Promise.all([enabledSinceOf(account.id), remainingBackupCodes(account.id)]);
  return { enabled: true, enabledSince, backupCodesRemaining };
}

async function enabledSinceOf(userId: string): Promise<Date | null> {
  try {
    const rows = await db()
      .select({ createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.action, "user.two_factor.enabled"), eq(auditLog.targetType, "user"), eq(auditLog.targetId, userId)))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    return rows[0]?.createdAt ?? null;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "two-factor audit lookup failed");
    return null;
  }
}

async function remainingBackupCodes(userId: string): Promise<number | null> {
  try {
    const api = auth().api as unknown as { viewBackupCodes: (args: { body: { userId: string } }) => Promise<{ status: boolean; backupCodes: string[] }> };
    const result = await api.viewBackupCodes({ body: { userId } });
    return Array.isArray(result.backupCodes) ? result.backupCodes.length : null;
  } catch {
    // no two-factor row (BACKUP_CODES_NOT_ENABLED) or an undecryptable one: the card says "unknown"
    return null;
  }
}
