import "server-only";
import { eq } from "drizzle-orm";
import { isUuid, newUlid, redactDeep } from "@track-site/core";
import { auditLog, session, twoFactor, user, type Tx } from "@track-site/db";
import { env } from "@/env";
import { isLocale } from "@/i18n/routing";
import { logger } from "@/server/db";
import { sendMail } from "@/server/mail";
import { getMailCopy, renderMail, type TwoFactorResetRole } from "@/server/mail/templates";

/**
 * Two-factor reset by an administrator (docs/17 §"Two-factor reset", docs/03 §B8). One transactional
 * routine for both consoles: a platform admin resets other platform users and — as a support tool —
 * customer accounts (Track Operations → Platform users), an organisation's OWNER / ADMIN resets members of
 * their own organisation (Team & Access). The routine
 *
 * - refuses the actor's own account and accounts without any two-factor state,
 * - deletes the better-auth `two_factor` rows of the account (TOTP secret and backup codes; the plugin
 *   keeps them in its own table, the flag lives on `user.two_factor_enabled`),
 * - sets `twoFactorEnabled = false`, deletes every stored `session` row (forced sign-out everywhere),
 * - writes the audit entry — actor, target user id, reason, ticket reference, organisation id, counts;
 *   never a secret or a backup code — through the caller's writer (`auditPlatform`, `recordAudit`) or,
 *   without one, a direct insert with the given actor,
 *
 * and returns what changed so the caller can notify the person (`sendTwoFactorResetMail`) after the
 * transaction committed. The caller owns the transaction (`withPlatform` / `withOrg`), the access checks
 * (platform role, organisation permission, owner rule) and the UI confirmation.
 */

export const TWO_FACTOR_RESET_ACTIONS = {
  /** by a platform admin in Track Operations (audit actor kind `platform`) */
  platform: "platform.two_factor.reset",
  /** by an owner or admin of the organisation in Team & Access (audit actor kind `user`, category "team") */
  member: "member.two_factor.reset",
} as const;
export type TwoFactorResetAction = (typeof TWO_FACTOR_RESET_ACTIONS)[keyof typeof TWO_FACTOR_RESET_ACTIONS];

export const TWO_FACTOR_RESET_REASON_MIN = 5;
export const TWO_FACTOR_RESET_REASON_MAX = 500;
export const TWO_FACTOR_RESET_TICKET_MAX = 100;
/** ticket references are short identifiers (`SUP-1234`, `#4711`, `INC 2026-09-08/3`), as in the other operator modules */
export const TWO_FACTOR_RESET_TICKET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _#:./-]{0,99}$/;

/**
 * Who resets: a platform operator (`kind: "platform"`, `PlatformActor`) or an organisation member
 * (`kind: "user"`, `UserActor`). The whole object is stored redacted in `audit_log.actor`; only these two
 * fields are read here.
 */
export interface TwoFactorResetActor {
  kind: string;
  userId: string;
}

/** The audit entry of a reset — the shape `auditPlatform` takes; `recordAudit` needs the actor and organisation added. */
export interface TwoFactorResetAuditEntry {
  action: TwoFactorResetAction;
  organizationId: string | null;
  targetType: "user";
  targetId: string;
  diff: { twoFactorEnabled: { before: boolean; after: false } };
  metadata: {
    module: "security";
    reason: string;
    ticketRef: string | null;
    /** `two_factor` rows deleted (secret and backup codes) */
    secretsRemoved: number;
    /** stored sessions deleted (forced sign-out) */
    sessionsRevoked: number;
    forcedSignOut: true;
  };
}

export interface TwoFactorResetInput {
  targetUserId: string;
  actor: TwoFactorResetActor;
  action: TwoFactorResetAction;
  reason: string;
  ticketRef?: string | null;
  /** the organisation the reset concerns: always for a member reset, the ticket's organisation for a support reset of a customer account */
  organizationId?: string | null;
  requestId?: string | null;
  /**
   * Writes the audit row inside the transaction and returns its id. Track Operations passes
   * `(entry) => auditPlatform(ctx, entry, tx)`, Team & Access `recordAudit`; without a writer the row
   * is inserted directly with `actor` and `requestId`.
   */
  writeAudit?: (entry: TwoFactorResetAuditEntry) => Promise<string>;
}

export type TwoFactorResetRefusal = "self" | "not_found" | "not_enabled";

export interface TwoFactorResetChange {
  user: { id: string; name: string; email: string; locale: string };
  /** `user.two_factor_enabled` before the reset */
  wasEnabled: boolean;
  secretsRemoved: number;
  sessionsRevoked: number;
  auditId: string;
}

export type TwoFactorResetOutcome = { ok: true; change: TwoFactorResetChange } | { ok: false; reason: TwoFactorResetRefusal };

/** The refusal an actor gets before anything is read: never the actor's own account, never an invalid id. */
export function twoFactorResetPrecheck(actorUserId: string, targetUserId: string): TwoFactorResetRefusal | null {
  if (!isUuid(targetUserId)) return "not_found";
  if (actorUserId === targetUserId) return "self";
  return null;
}

/**
 * Performs the reset inside `tx` (the caller's transaction) and returns what changed. The target row is
 * locked (`FOR UPDATE`) so two administrators cannot reset the same account concurrently. Refused —
 * without any write — for the actor's own account, an unknown account, and an account that neither has
 * two-factor enabled nor a `two_factor` row (nothing to reset: a stuck enrolment still counts).
 */
export async function resetTwoFactor(input: TwoFactorResetInput, tx: Tx): Promise<TwoFactorResetOutcome> {
  const refusal = twoFactorResetPrecheck(input.actor.userId, input.targetUserId);
  if (refusal) return { ok: false, reason: refusal };
  const [target] = await tx
    .select({ id: user.id, name: user.name, email: user.email, locale: user.locale, twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, input.targetUserId))
    .for("update")
    .limit(1);
  if (!target) return { ok: false, reason: "not_found" };
  const wasEnabled = Boolean(target.twoFactorEnabled);
  // only the ids are read: the secret and the backup codes never leave the database through this module
  const rows = await tx.select({ id: twoFactor.id }).from(twoFactor).where(eq(twoFactor.userId, target.id));
  if (!wasEnabled && rows.length === 0) return { ok: false, reason: "not_enabled" };

  const removed = await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id)).returning({ id: twoFactor.id });
  await tx.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, target.id));
  const revoked = await tx.delete(session).where(eq(session.userId, target.id)).returning({ id: session.id });

  const entry: TwoFactorResetAuditEntry = {
    action: input.action,
    organizationId: input.organizationId ?? null,
    targetType: "user",
    targetId: target.id,
    diff: { twoFactorEnabled: { before: wasEnabled, after: false } },
    metadata: {
      module: "security",
      reason: input.reason,
      ticketRef: input.ticketRef ?? null,
      secretsRemoved: removed.length,
      sessionsRevoked: revoked.length,
      forcedSignOut: true,
    },
  };
  const auditId = input.writeAudit ? await input.writeAudit(entry) : await insertAuditRow(tx, input, entry);
  return {
    ok: true,
    change: {
      user: { id: target.id, name: target.name, email: target.email, locale: target.locale },
      wasEnabled,
      secretsRemoved: removed.length,
      sessionsRevoked: revoked.length,
      auditId,
    },
  };
}

/** Default audit writer: the same redacted, append-only row the console and the tenant helpers write. */
async function insertAuditRow(tx: Tx, input: TwoFactorResetInput, entry: TwoFactorResetAuditEntry): Promise<string> {
  const id = newUlid();
  await tx.insert(auditLog).values({
    id,
    organizationId: entry.organizationId,
    actor: redactDeep({ ...input.actor }) as Record<string, unknown>,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    diff: redactDeep(entry.diff) as unknown as Record<string, unknown>,
    metadata: redactDeep({ ...entry.metadata }) as unknown as Record<string, unknown>,
    ipHash: null,
    requestId: input.requestId ?? null,
  });
  return id;
}

// ---- notification ----------------------------------------------------------------------------------------

/** Contact page of the marketing site in the recipient's language — where to turn if the reset was not requested. */
export function twoFactorResetSupportLink(locale: string | null | undefined): string {
  const lang = isLocale(locale) ? locale : "en";
  return `${env().HOST_MARKETING.replace(/\/+$/, "")}/${lang}/contact`;
}

/**
 * Tells the affected person, in their stored language, that an administrator reset their two-factor
 * authentication and whom to contact if that was not requested. Sent after the transaction committed;
 * a transport failure is logged without the address and reported as `false` so the UI can say that the
 * person has to be informed another way — the reset itself stands.
 */
export async function sendTwoFactorResetMail(recipient: { email: string; locale: string }, actorRole: TwoFactorResetRole): Promise<boolean> {
  const copy = getMailCopy(recipient.locale).twoFactorReset;
  const mail = renderMail(copy, { actorRole: copy.roles[actorRole], product: "Track", supportLink: twoFactorResetSupportLink(recipient.locale) });
  const result = await sendMail({ to: recipient.email, ...mail }).catch((e: unknown) => ({ ok: false as const, transport: "none" as const, error: e instanceof Error ? e.message : String(e) }));
  if (result.ok) return true;
  logger.warn({ transport: result.transport, error: result.error, actorRole }, "two-factor reset notification failed");
  return false;
}
