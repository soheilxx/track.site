import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { AppError, HOUR, MINUTE, newUlid, redactDeep, type Permission, type PlatformRole } from "@track-site/core";
import { auditLog, breakGlassAccess, member, organization, user, type DbOrTx } from "@track-site/db";
import { BREAK_GLASS_DURATIONS, BREAK_GLASS_MAX_MINUTES, BREAK_GLASS_MIN_MINUTES, BREAK_GLASS_REASON_MAX, BREAK_GLASS_REASON_MIN, BREAK_GLASS_TICKET_MAX, BREAK_GLASS_TICKET_PATTERN, type BreakGlassDuration } from "@/components/ops/break-glass/constants";
import { env } from "@/env";
import { intlLocale } from "@/lib/format";
import { db, logger } from "@/server/db";
import { sendMail } from "@/server/mail";
import { getMailCopy, renderMail } from "@/server/mail/templates";
import { opsRequiresTwoFactor, withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Break-glass access (docs/17 §4, docs/03 §B8): time-boxed, justified, approved and audited read-only access
 * of one platform operator to one organisation.
 *
 * - The pure helpers (`breakGlassState`, `approvalVerdict`, `revokeKindFor`, `isReadPermission`, …) carry the
 *   rules and are unit-tested; the queries are thin.
 * - The tenant-side helpers (`hasActiveGrant`, `resolveSupportAccess`, `auditSupportView`) are what
 *   `getOrgContext` / `requireOrgContext` in `session.ts` use to open a tenant's dashboard read-only for an
 *   operator without membership. They read `break_glass_access` through the application's own connection
 *   (the table is revoked from `tracksite_app`, so it is never reachable through a tenant transaction).
 * - The console loaders (`loadBreakGlassOverview`, `otherAdminExists`) need a `PlatformContext`.
 * - `notifyOwners` mails the organisation's owners on approval and on revocation (templates ×6).
 */

export { BREAK_GLASS_DURATIONS, BREAK_GLASS_MAX_MINUTES, BREAK_GLASS_MIN_MINUTES, BREAK_GLASS_REASON_MAX, BREAK_GLASS_REASON_MIN, BREAK_GLASS_TICKET_MAX, BREAK_GLASS_TICKET_PATTERN, type BreakGlassDuration };
/** a request nobody approved within a day is stale and can no longer be approved */
export const BREAK_GLASS_REQUEST_TTL_MS = 24 * HOUR;
/** the organisation an operator chose to open under a grant; only a hint — the grant itself is verified on every request */
export const SUPPORT_ORG_COOKIE = "track_support_org";
export const BREAK_GLASS_TARGET = "break_glass_access";
/** the console page every action revalidates */
export const BREAK_GLASS_PATH = "/ops/break-glass";

const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type BreakGlassState = "pending" | "stale" | "withdrawn" | "active" | "revoked" | "expired";

export interface BreakGlassTimestamps {
  approvedAt: Date | null;
  revokedAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
}

/**
 * State of a row at `now`. A revoked row is `revoked` when it had been approved and `withdrawn` otherwise
 * (withdrawn by the requester or declined by an admin — the audit log tells which); an unapproved request is
 * `pending` for one day and `stale` afterwards; an approved grant is `active` until `ends_at` and `expired` then.
 */
export function breakGlassState(row: BreakGlassTimestamps, now: Date): BreakGlassState {
  if (row.revokedAt) return row.approvedAt ? "revoked" : "withdrawn";
  if (!row.approvedAt) return now.getTime() - row.createdAt.getTime() < BREAK_GLASS_REQUEST_TTL_MS ? "pending" : "stale";
  return now.getTime() < row.endsAt.getTime() ? "active" : "expired";
}

/** The requested window in minutes (`ends_at − starts_at`; approval resets both to the approval time). */
export function requestedMinutes(row: { startsAt: Date; endsAt: Date }): number {
  return Math.max(1, Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / MINUTE));
}

export function remainingMs(endsAt: Date, now: Date): number {
  return Math.max(0, endsAt.getTime() - now.getTime());
}

export function isBreakGlassDuration(value: number): value is BreakGlassDuration {
  return (BREAK_GLASS_DURATIONS as readonly number[]).includes(value);
}

/** Permissions a read-only support session may exercise: exactly the `*.read` permissions of `READ_ONLY`. */
export function isReadPermission(permission: Permission): boolean {
  return permission.endsWith(".read");
}

export type ApprovalVerdict = { ok: true; selfApproved: boolean } | { ok: false; reason: "fourEyes" | "ticketRequired" };

/**
 * Four eyes (docs/17 §4): the approver must differ from the requester whenever another platform admin who
 * could approve exists; the single-admin fallback is self-approval with a mandatory ticket reference.
 */
export function approvalVerdict(input: { approverId: string; requesterId: string; otherAdminExists: boolean; ticketRef: string | null }): ApprovalVerdict {
  if (input.approverId !== input.requesterId) return { ok: true, selfApproved: false };
  if (input.otherAdminExists) return { ok: false, reason: "fourEyes" };
  if (!input.ticketRef?.trim()) return { ok: false, reason: "ticketRequired" };
  return { ok: true, selfApproved: true };
}

export type RevokeKind = "withdraw" | "decline" | "revoke";

/**
 * What the caller may do to end a row: the requester withdraws their own open request, an admin declines any
 * open request; an active grant is revoked by its grantee, its approver or any admin. Null otherwise.
 */
export function revokeKindFor(
  row: { state: BreakGlassState; requesterId: string; approverId: string | null },
  actor: { userId: string; platformRole: PlatformRole },
): RevokeKind | null {
  const admin = actor.platformRole === "PLATFORM_ADMIN";
  if (row.state === "pending" || row.state === "stale") {
    if (row.requesterId === actor.userId) return "withdraw";
    return admin ? "decline" : null;
  }
  if (row.state === "active") {
    if (admin || row.requesterId === actor.userId || row.approverId === actor.userId) return "revoke";
  }
  return null;
}

// ---- tenant side: grants of the signed-in operator -------------------------------------------------------

export interface ActiveGrant {
  id: string;
  organizationId: string;
  platformUserId: string;
  approvedBy: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  ticketRef: string | null;
}

const grantColumns = {
  id: breakGlassAccess.id,
  organizationId: breakGlassAccess.organizationId,
  platformUserId: breakGlassAccess.platformUserId,
  approvedBy: breakGlassAccess.approvedBy,
  startsAt: breakGlassAccess.startsAt,
  endsAt: breakGlassAccess.endsAt,
  reason: breakGlassAccess.reason,
  ticketRef: breakGlassAccess.ticketRef,
};

/** approved, not revoked, database clock inside [starts_at, ends_at) */
const activeNow = () =>
  and(isNotNull(breakGlassAccess.approvedAt), isNull(breakGlassAccess.revokedAt), lte(breakGlassAccess.startsAt, sql`now()`), gt(breakGlassAccess.endsAt, sql`now()`));

/** The operator's active grant for one organisation (null: aggregates and metadata only). */
export async function activeGrantFor(userId: string, organizationId: string): Promise<ActiveGrant | null> {
  if (!isUuid(userId) || !isUuid(organizationId)) return null;
  const rows = await db()
    .select(grantColumns)
    .from(breakGlassAccess)
    .where(and(eq(breakGlassAccess.organizationId, organizationId), eq(breakGlassAccess.platformUserId, userId), activeNow()))
    .orderBy(desc(breakGlassAccess.endsAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Enforcement entry point: whether `userId` currently holds an approved, unrevoked, unexpired grant for the organisation. */
export async function hasActiveGrant(userId: string, organizationId: string): Promise<boolean> {
  return (await activeGrantFor(userId, organizationId)) !== null;
}

/** The operator's most recently ending active grant, for an operator without any membership and without a chosen organisation. */
export async function latestActiveGrantOf(userId: string): Promise<ActiveGrant | null> {
  if (!isUuid(userId)) return null;
  const rows = await db()
    .select(grantColumns)
    .from(breakGlassAccess)
    .where(and(eq(breakGlassAccess.platformUserId, userId), activeNow()))
    .orderBy(desc(breakGlassAccess.approvedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Active grants on one organisation — what the organisation's own members are shown (id and end only, never the operator's identity). */
export async function activeGrantsForOrganization(organizationId: string): Promise<Array<{ id: string; endsAt: Date }>> {
  if (!isUuid(organizationId)) return [];
  return db()
    .select({ id: breakGlassAccess.id, endsAt: breakGlassAccess.endsAt })
    .from(breakGlassAccess)
    .where(and(eq(breakGlassAccess.organizationId, organizationId), activeNow()))
    .orderBy(desc(breakGlassAccess.endsAt))
    .limit(10);
}

export interface SupportAccess {
  grant: ActiveGrant;
  organization: { id: string; name: string; slug: string; suspendedAt: Date | null };
}

/** Audit actor of a read-only support session in the tenant dashboard (stored redacted in `audit_log.actor`). */
export interface SupportActor {
  kind: "platform";
  userId: string;
  email: string;
  platformRole: PlatformRole;
  grantId: string;
  readOnly: true;
}

const resolveSupportAccessCached = cache(async (userId: string, wanted: string | null, memberKey: string): Promise<SupportAccess | null> => {
  const memberOrgIds = memberKey ? memberKey.split(",") : [];
  let grant: ActiveGrant | null = null;
  // the chosen organisation wins, but only where the operator is no member (members use their membership)
  if (wanted && isUuid(wanted) && !memberOrgIds.includes(wanted)) grant = await activeGrantFor(userId, wanted);
  if (!grant && memberOrgIds.length === 0) grant = await latestActiveGrantOf(userId);
  if (!grant) return null;
  const [org] = await db()
    .select({ id: organization.id, name: organization.name, slug: organization.slug, suspendedAt: organization.suspendedAt })
    .from(organization)
    .where(eq(organization.id, grant.organizationId))
    .limit(1);
  return org ? { grant, organization: { ...org, suspendedAt: org.suspendedAt ?? null } } : null;
});

/**
 * Read-only support access for the current request: the organisation the operator chose (cookie set by the
 * console's "open dashboard" action) when they are no member of it and hold an active grant — or, for an
 * operator without any membership, their latest active grant. Null for everyone else; deduplicated per request.
 */
export async function resolveSupportAccess(userAccess: { id: string; platformRole: PlatformRole }, memberOrgIds: readonly string[]): Promise<SupportAccess | null> {
  if (userAccess.platformRole === "NONE") return null;
  const wanted = (await cookies()).get(SUPPORT_ORG_COOKIE)?.value ?? null;
  return resolveSupportAccessCached(userAccess.id, wanted, [...memberOrgIds].sort().join(","));
}

/** Best-effort request path: Next's internal invoke header, the platform's matched route, otherwise unknown (never invented). */
function requestPath(h: Headers): string | null {
  const candidate = h.get("x-invoke-path") ?? h.get("x-matched-path");
  return candidate && candidate.startsWith("/") ? candidate.slice(0, 500) : null;
}

const recordSupportView = cache(async (grantId: string, organizationId: string, actorJson: string, path: string | null): Promise<void> => {
  const actor = JSON.parse(actorJson) as SupportActor;
  await db()
    .insert(auditLog)
    .values({
      id: newUlid(),
      organizationId,
      actor: redactDeep({ ...actor }) as unknown as Record<string, unknown>,
      action: "ops.break_glass.view",
      targetType: BREAK_GLASS_TARGET,
      targetId: grantId,
      diff: null,
      metadata: { breakGlassId: grantId, platformRole: actor.platformRole, path, mode: "read_only" },
      ipHash: null,
      requestId: newUlid(),
    });
});

/**
 * Records one `ops.break_glass.view` audit row per page request under a grant (organisation id, grant id,
 * path). Server-action and prefetch requests are skipped — actions audit themselves, prefetches show nothing.
 * Fails closed: when the audit row cannot be written the page is not rendered.
 */
export async function auditSupportView(access: SupportAccess, actor: SupportActor): Promise<void> {
  const h = await headers();
  if (h.get("next-action")) return;
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) return;
  try {
    await recordSupportView(access.grant.id, access.organization.id, JSON.stringify(actor), requestPath(h));
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), grantId: access.grant.id }, "break-glass view audit failed");
    throw new AppError("INTERNAL_ERROR", "Support access could not be audited", { cause: e });
  }
}

// ---- console side ----------------------------------------------------------------------------------------

/**
 * Whether a platform admin other than `excludeUserId` could approve: verified e-mail and, while the console's
 * step-up rule applies, two-factor enabled — an admin who cannot open the console cannot be the second pair of eyes.
 */
export async function otherAdminExists(tx: DbOrTx, excludeUserId: string): Promise<boolean> {
  return (await eligibleAdminIds(tx)).some((id) => id !== excludeUserId);
}

export async function eligibleAdminIds(tx: DbOrTx): Promise<string[]> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.platformRole, "PLATFORM_ADMIN"), eq(user.emailVerified, true), opsRequiresTwoFactor() ? eq(user.twoFactorEnabled, true) : undefined));
  return rows.map((r) => r.id);
}

export interface BreakGlassPerson {
  id: string;
  name: string;
  email: string;
}

export interface BreakGlassEntry {
  id: string;
  organization: { id: string; name: string; slug: string };
  requester: BreakGlassPerson;
  approver: BreakGlassPerson | null;
  reason: string;
  ticketRef: string | null;
  /** ISO strings: the entries cross the server/client boundary */
  startsAt: string;
  endsAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  customerNotifiedAt: string | null;
  createdAt: string;
  minutes: number;
  state: BreakGlassState;
  selfApproved: boolean;
  /** an eligible admin other than the requester exists (four eyes applies to this request) */
  otherAdminExists: boolean;
  /** what the viewer may do with this entry */
  viewer: { open: boolean; revoke: RevokeKind | null; approve: ApprovalVerdict | null; isRequester: boolean };
}

export interface BreakGlassOverview {
  organisations: Array<{ id: string; name: string; slug: string }>;
  eligibleAdminCount: number;
  /** another eligible admin besides the viewer exists: the viewer's own requests need a second pair of eyes */
  otherAdminExists: boolean;
  requiresTwoFactor: boolean;
  pending: BreakGlassEntry[];
  active: BreakGlassEntry[];
  history: BreakGlassEntry[];
  /** rows were capped: the history shows the most recent entries only */
  truncated: boolean;
  now: string;
}

const HISTORY_LIMIT = 50;
const FETCH_LIMIT = 200;

/** Everything the /ops/break-glass page shows, read as `tracksite_ops`; entries carry the viewer's rights. */
export async function loadBreakGlassOverview(ctx: PlatformContext): Promise<BreakGlassOverview> {
  const approver = alias(user, "approver");
  return withPlatform(ctx, async (tx) => {
    const [rows, organisations, admins] = await Promise.all([
      tx
        .select({
          id: breakGlassAccess.id,
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          requesterId: user.id,
          requesterName: user.name,
          requesterEmail: user.email,
          approverId: approver.id,
          approverName: approver.name,
          approverEmail: approver.email,
          reason: breakGlassAccess.reason,
          ticketRef: breakGlassAccess.ticketRef,
          approvedBy: breakGlassAccess.approvedBy,
          startsAt: breakGlassAccess.startsAt,
          endsAt: breakGlassAccess.endsAt,
          approvedAt: breakGlassAccess.approvedAt,
          revokedAt: breakGlassAccess.revokedAt,
          customerNotifiedAt: breakGlassAccess.customerNotifiedAt,
          createdAt: breakGlassAccess.createdAt,
        })
        .from(breakGlassAccess)
        .innerJoin(organization, eq(organization.id, breakGlassAccess.organizationId))
        .innerJoin(user, eq(user.id, breakGlassAccess.platformUserId))
        .leftJoin(approver, eq(approver.id, breakGlassAccess.approvedBy))
        .orderBy(desc(breakGlassAccess.createdAt))
        .limit(FETCH_LIMIT),
      tx.select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).orderBy(organization.name),
      eligibleAdminIds(tx),
    ]);
    const now = new Date();
    const viewerActor = { userId: ctx.user.id, platformRole: ctx.platformRole };
    const entries: BreakGlassEntry[] = rows.map((r) => {
      const state = breakGlassState(r, now);
      const otherAdmin = admins.some((id) => id !== r.requesterId);
      const revoke = revokeKindFor({ state, requesterId: r.requesterId, approverId: r.approvedBy }, viewerActor);
      const approve = state === "pending" && ctx.platformRole === "PLATFORM_ADMIN" ? approvalVerdict({ approverId: ctx.user.id, requesterId: r.requesterId, otherAdminExists: otherAdmin, ticketRef: r.ticketRef }) : null;
      return {
        id: r.id,
        organization: { id: r.organizationId, name: r.organizationName, slug: r.organizationSlug },
        requester: { id: r.requesterId, name: r.requesterName, email: r.requesterEmail },
        approver: r.approverId ? { id: r.approverId, name: r.approverName ?? "", email: r.approverEmail ?? "" } : null,
        reason: r.reason,
        ticketRef: r.ticketRef,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        approvedAt: r.approvedAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
        customerNotifiedAt: r.customerNotifiedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        minutes: requestedMinutes(r),
        state,
        selfApproved: r.approvedBy != null && r.approvedBy === r.requesterId,
        otherAdminExists: otherAdmin,
        viewer: { open: state === "active" && r.requesterId === ctx.user.id, revoke, approve, isRequester: r.requesterId === ctx.user.id },
      };
    });
    const pending = entries.filter((e) => e.state === "pending");
    const active = entries.filter((e) => e.state === "active");
    const rest = entries.filter((e) => e.state !== "pending" && e.state !== "active");
    return {
      organisations,
      eligibleAdminCount: admins.length,
      otherAdminExists: admins.some((id) => id !== ctx.user.id),
      requiresTwoFactor: opsRequiresTwoFactor(),
      pending,
      active,
      history: rest.slice(0, HISTORY_LIMIT),
      truncated: rows.length >= FETCH_LIMIT || rest.length > HISTORY_LIMIT,
      now: now.toISOString(),
    };
  });
}

// ---- customer notification -------------------------------------------------------------------------------

export interface NotifyResult {
  sent: number;
  failed: number;
}

export interface NotifiableGrant {
  id: string;
  organizationId: string;
  organizationName: string;
  endsAt: Date;
  reason: string;
  ticketRef: string | null;
}

/** "8 Sept 2026, 14:30 UTC" in the recipient's language; UTC so the mail never depends on the server's zone. */
export function formatMailInstant(value: Date, locale: string): string {
  return `${new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value)} UTC`;
}

/** Link to the organisation's audit log in the customer dashboard (`HOST_APP` already carries the `/app` prefix locally). */
export function auditLogUrl(): string {
  return `${env().HOST_APP.replace(/\/+$/, "")}/team/audit`;
}

/**
 * E-mails every owner of the organisation in their own language. Failures are counted and logged without
 * addresses; the caller records `customer_notified_at` only when at least one mail went out.
 */
export async function notifyOwners(kind: "approved" | "revoked", grant: NotifiableGrant): Promise<NotifyResult> {
  const owners = await db()
    .select({ email: user.email, locale: user.locale })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, grant.organizationId), eq(member.role, "OWNER"), ne(user.email, "")));
  const url = auditLogUrl();
  let sent = 0;
  let failed = 0;
  for (const owner of owners) {
    const copy = getMailCopy(owner.locale);
    const mail = renderMail(kind === "approved" ? copy.breakGlassApproved : copy.breakGlassRevoked, {
      organization: grant.organizationName,
      until: formatMailInstant(grant.endsAt, owner.locale),
      reason: grant.reason,
      ticket: grant.ticketRef ?? "–",
      grantId: grant.id,
      url,
    });
    const result = await sendMail({ to: owner.email, ...mail }).catch((e: unknown) => ({ ok: false as const, transport: "none" as const, error: e instanceof Error ? e.message : String(e) }));
    if (result.ok) sent += 1;
    else {
      failed += 1;
      logger.warn({ grantId: grant.id, kind, transport: result.transport, error: result.error }, "break-glass owner notification failed");
    }
  }
  return { sent, failed };
}
