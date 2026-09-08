"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { MemoryRateLimiter, type Actor, type PlatformRole } from "@track-site/core";
import { account, recordAudit, user } from "@track-site/db";
import { authErrorKey, parseTotpUri, type TwoFactorErrorKey } from "@/components/app/settings/security/two-factor";
import { auth } from "@/server/auth";
import { db, logger } from "@/server/db";
import { getOrgContext, getSession, withOrg, type OrgContext, type SessionUser } from "@/server/session";

/**
 * Self-service two-factor authentication of the signed-in account (`/app/settings/security`). Every
 * state change runs here, on the server, through better-auth's API with the request headers —
 * `enableTwoFactor` → `verifyTOTP` (enrolment), `disableTwoFactor`, `generateBackupCodes` — and the
 * audit row is written in the same code path, only after the stored account state confirms that the
 * change happened. The client never claims a change: it receives the otpauth URI and the backup codes
 * once (nothing is logged) and a result; the session cookie better-auth rotates on `verifyTOTP` and
 * `disableTwoFactor` reaches the browser through the `nextCookies` plugin.
 *
 * Guards, in this order: session, a budget of six calls per minute per account (better-auth's own
 * `/two-factor/*` limit applies to HTTP calls only, not to `auth().api`), the stored state (an
 * enrolment on an enabled account or a disable on a disabled one is refused as `state`, so a repeated
 * call can never add a second row), and the credential account (`noPassword` when the account has no
 * password to confirm — passkey- or OAuth-only accounts; a password reset creates the credential
 * account, which is what the message says).
 *
 * Rows: action `user.two_factor.enabled` / `user.two_factor.disabled` /
 * `user.two_factor.backup_codes_regenerated`, target type `user`, target id = the account, diff
 * `{ twoFactorEnabled }` — never the secret, the URI or a code. A member writes into the active
 * organisation's audit log (tenant transaction, session actor); an account without a writable
 * organisation context (a platform operator who is no member, a read-only break-glass session) writes
 * without organisation as the platform actor, so `/ops/audit` lists it. The organisation context is
 * resolved before better-auth rotates the session, so the row carries the actor of the session that
 * made the change.
 */
export interface TwoFactorActionState {
  ok: boolean;
  error: TwoFactorErrorKey | null;
  /** the change happened but the audit row could not be written (the page says so) */
  auditFailed: boolean;
}

export interface TwoFactorEnrolmentState extends TwoFactorActionState {
  /** otpauth URI of the new, still unverified secret (rendered as QR code and manual key, shown once) */
  totpUri: string | null;
  backupCodes: string[];
}

export interface BackupCodesState extends TwoFactorActionState {
  backupCodes: string[];
}

type AuditKind = "enabled" | "disabled" | "backup_codes_regenerated";

const ACTION: Record<AuditKind, string> = {
  enabled: "user.two_factor.enabled",
  disabled: "user.two_factor.disabled",
  backup_codes_regenerated: "user.two_factor.backup_codes_regenerated",
};

/** Six calls per minute per account, every action counted (password and code attempts included). */
const LIMIT = 6;
const WINDOW_MS = 60_000;
const limiter = new MemoryRateLimiter();

const passwordSchema = z.object({ password: z.string().max(128) });
const codeSchema = z.object({ code: z.string().max(16) });

interface Caller {
  user: SessionUser;
  /** stored `user.two_factor_enabled` (not the cookie cache) */
  enabled: boolean;
  /** a credential account with a password exists, so a password can be confirmed */
  hasPassword: boolean;
  /** resolved before the change: the actor and organisation of the session that makes it */
  ctx: OrgContext | null;
}

type Refusal = { ok: false; error: TwoFactorErrorKey };

const refuse = (error: TwoFactorErrorKey): Refusal => ({ ok: false, error });

/**
 * Session, rate budget and the stored state of the account — the guards every action shares. The
 * organisation context is resolved only for actions that write a row (`audits`): resolving it for a
 * break-glass session records a support view, which the enrolment's first step should not add.
 */
async function caller(options: { audits: boolean }): Promise<{ ok: true; caller: Caller } | Refusal> {
  const s = await getSession();
  if (!s) return refuse("session");
  const budget = await limiter.hit(`two-factor:${s.user.id}`, LIMIT, WINDOW_MS);
  if (!budget.allowed) return refuse("rateLimited");
  const [enabled, hasPassword, ctx] = await Promise.all([storedEnabled(s.user.id), hasCredentialPassword(s.user.id), options.audits ? getOrgContext() : null]);
  return { ok: true, caller: { user: s.user, enabled, hasPassword, ctx } };
}

async function storedEnabled(userId: string): Promise<boolean> {
  const [row] = await db().select({ enabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(row?.enabled);
}

async function hasCredentialPassword(userId: string): Promise<boolean> {
  const rows = await db()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential"), isNotNull(account.password)))
    .limit(1);
  return rows.length > 0;
}

/** Message key of a failed better-auth call; expected refusals are logged without the password or code. */
function refusalOf(e: unknown, action: string): Refusal {
  const err = e as { statusCode?: unknown; body?: { code?: unknown } } | null;
  const status = typeof err?.statusCode === "number" ? err.statusCode : undefined;
  const code = typeof err?.body?.code === "string" ? err.body.code : undefined;
  if (status !== undefined || code !== undefined) {
    const key = authErrorKey({ code, status });
    if (key === "generic") logger.error({ action, status, code }, "two-factor: better-auth call failed");
    else logger.info({ action, code: code ?? null }, "two-factor: better-auth call refused");
    return refuse(key);
  }
  logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "two-factor: better-auth call failed");
  return refuse("generic");
}

/** Writes the audit row of a confirmed change; false when the insert failed (the change stands). */
async function writeAudit(c: Caller, kind: AuditKind, enabledNow: boolean): Promise<boolean> {
  const entry = { action: ACTION[kind], targetType: "user", targetId: c.user.id, diff: { twoFactorEnabled: enabledNow } };
  try {
    if (c.ctx && !c.ctx.readOnly) {
      const ctx = c.ctx;
      await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, requestId: ctx.tenant.requestId, ...entry }));
    } else {
      // no tenant to write into: the platform operator's own enrolment (docs/17 §3) or a read-only support session
      const platformRole: PlatformRole = c.user.platformRole;
      const actor =
        platformRole !== "NONE"
          ? { kind: "platform", userId: c.user.id, email: c.user.email, platformRole }
          : { kind: "user", userId: c.user.id, role: "READ_ONLY", platformRole };
      await recordAudit(db(), { organizationId: null, actor: actor as unknown as Actor, requestId: c.ctx?.tenant.requestId ?? null, ...entry });
    }
    return true;
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), kind }, "two-factor audit entry failed");
    return false;
  }
}

/**
 * Step 1 of the enrolment: confirms the password and lets better-auth create the (unverified) secret
 * and the backup codes. Nothing changes for sign-ins yet, so no audit row — the account switches to
 * two-factor in `confirmTwoFactorEnrolment`. Refused as `state` when two-factor is already enabled
 * (better-auth would silently replace the live secret).
 */
export async function startTwoFactorEnrolment(input: { password: string }): Promise<TwoFactorEnrolmentState> {
  const empty = { auditFailed: false, totpUri: null, backupCodes: [] };
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", ...empty };
  if (!parsed.data.password) return { ok: false, error: "password", ...empty };
  const c = await caller({ audits: false });
  if (!c.ok) return { ...c, ...empty };
  if (c.caller.enabled) return { ok: false, error: "state", ...empty };
  if (!c.caller.hasPassword) return { ok: false, error: "noPassword", ...empty };
  let result: { method: string; totpURI?: string; backupCodes?: string[] };
  try {
    result = (await auth().api.enableTwoFactor({ body: { password: parsed.data.password, method: "totp" }, headers: await headers() })) as typeof result;
  } catch (e) {
    return { ...refusalOf(e, "enable"), ...empty };
  }
  const totpUri = result.method === "totp" && typeof result.totpURI === "string" ? result.totpURI : null;
  if (!totpUri || !parseTotpUri(totpUri)) {
    logger.error({ method: result.method }, "two-factor: enable returned no usable otpauth URI");
    return { ok: false, error: "generic", ...empty };
  }
  const backupCodes = Array.isArray(result.backupCodes) ? result.backupCodes.filter((code): code is string => typeof code === "string") : [];
  return { ok: true, error: null, auditFailed: false, totpUri, backupCodes };
}

/**
 * Step 2 of the enrolment: the six-digit code. On success better-auth marks the secret verified,
 * switches the account to two-factor and rotates the session; the `enabled` row is written right
 * after the stored flag confirms the switch. A wrong code leaves everything as it was — no row.
 */
export async function confirmTwoFactorEnrolment(input: { code: string }): Promise<TwoFactorActionState> {
  const parsed = codeSchema.safeParse(input);
  const digits = parsed.success ? parsed.data.code.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(digits)) return { ok: false, error: "code", auditFailed: false };
  const c = await caller({ audits: true });
  if (!c.ok) return { ...c, auditFailed: false };
  if (c.caller.enabled) return { ok: false, error: "state", auditFailed: false };
  try {
    await auth().api.verifyTOTP({ body: { code: digits }, headers: await headers() });
  } catch (e) {
    return { ...refusalOf(e, "verify"), auditFailed: false };
  }
  // the code was right; the row is written only for the switch better-auth actually made
  if (!(await storedEnabled(c.caller.user.id))) {
    logger.warn({ userId: c.caller.user.id }, "two-factor: code verified but the account did not switch to two-factor");
    return { ok: false, error: "generic", auditFailed: false };
  }
  const audited = await writeAudit(c.caller, "enabled", true);
  revalidatePath("/app/settings/security");
  return { ok: true, error: null, auditFailed: !audited };
}

/** Password-confirmed disable: better-auth deletes the secret and the codes, forgets trusted devices and rotates the session. */
export async function disableTwoFactor(input: { password: string }): Promise<TwoFactorActionState> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", auditFailed: false };
  if (!parsed.data.password) return { ok: false, error: "password", auditFailed: false };
  const c = await caller({ audits: true });
  if (!c.ok) return { ...c, auditFailed: false };
  if (!c.caller.enabled) return { ok: false, error: "state", auditFailed: false };
  if (!c.caller.hasPassword) return { ok: false, error: "noPassword", auditFailed: false };
  try {
    await auth().api.disableTwoFactor({ body: { password: parsed.data.password }, headers: await headers() });
  } catch (e) {
    return { ...refusalOf(e, "disable"), auditFailed: false };
  }
  if (await storedEnabled(c.caller.user.id)) {
    logger.warn({ userId: c.caller.user.id }, "two-factor: disable answered ok but the account is still enabled");
    return { ok: false, error: "generic", auditFailed: false };
  }
  const audited = await writeAudit(c.caller, "disabled", false);
  revalidatePath("/app/settings/security");
  return { ok: true, error: null, auditFailed: !audited };
}

/** Password-confirmed new backup codes: the previous ones stop working, the new ten are returned once. */
export async function regenerateBackupCodes(input: { password: string }): Promise<BackupCodesState> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", auditFailed: false, backupCodes: [] };
  if (!parsed.data.password) return { ok: false, error: "password", auditFailed: false, backupCodes: [] };
  const c = await caller({ audits: true });
  if (!c.ok) return { ...c, auditFailed: false, backupCodes: [] };
  if (!c.caller.enabled) return { ok: false, error: "notEnabled", auditFailed: false, backupCodes: [] };
  if (!c.caller.hasPassword) return { ok: false, error: "noPassword", auditFailed: false, backupCodes: [] };
  let result: { status?: boolean; backupCodes?: unknown };
  try {
    result = (await auth().api.generateBackupCodes({ body: { password: parsed.data.password }, headers: await headers() })) as typeof result;
  } catch (e) {
    return { ...refusalOf(e, "generate-backup-codes"), auditFailed: false, backupCodes: [] };
  }
  const backupCodes = Array.isArray(result.backupCodes) ? result.backupCodes.filter((code): code is string => typeof code === "string" && code.length > 0) : [];
  if (backupCodes.length === 0) {
    logger.error({ status: result.status ?? null }, "two-factor: generate-backup-codes returned no codes");
    return { ok: false, error: "generic", auditFailed: false, backupCodes: [] };
  }
  const audited = await writeAudit(c.caller, "backup_codes_regenerated", true);
  revalidatePath("/app/settings/security");
  return { ok: true, error: null, auditFailed: !audited, backupCodes };
}
