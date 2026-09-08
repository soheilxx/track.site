import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLog, member, organization, session, user } from "@track-site/db";
import { testDb } from "@track-site/db/testing";

/**
 * Runs the Platform users loaders and actions against the migrated test database as `tracksite_ops`:
 * two admins and two customers, sessions, one organisation membership. Exercises the four-eyes flow
 * (propose → a different admin applies → forced sign-out), the refusal when the only other eligible admin
 * is the affected account (`needsThirdAdmin`), the single-admin fallback (self-approved with ticket, only
 * once no other eligible admin exists), withdraw / decline, the session revocation and the read-only
 * directory and detail loaders — the real SQL, with the access layer stubbed to a chosen operator.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/ops/break-glass", async () => {
  const { and, eq } = await import("drizzle-orm");
  const { user } = await import("@track-site/db");
  return {
    eligibleAdminIds: async (tx: { select: Tx["select"] }) => {
      const rows = await tx.select({ id: user.id }).from(user).where(and(eq(user.platformRole, "PLATFORM_ADMIN"), eq(user.emailVerified, true)));
      return rows.map((r: { id: string }) => r.id);
    },
  };
});
vi.mock("@/server/ops/platform", async () => {
  const { withPlatform: withOpsRole, auditLog } = await import("@track-site/db");
  const { testDb: open } = await import("@track-site/db/testing");
  const { newUlid, redactDeep } = await import("@track-site/core");
  const handle = open();
  (globalThis as { __opsUsersPool?: typeof handle }).__opsUsersPool = handle;
  let current: PlatformContext | null = null;
  class PlatformAccessError extends Error {}
  return {
    PlatformAccessError,
    withPlatform: (_ctx: unknown, fn: (tx: Tx) => Promise<unknown>) => withOpsRole(handle.db, fn),
    opsRequiresTwoFactor: () => false,
    requirePlatform: async () => {
      if (!current) throw new PlatformAccessError("no operator");
      return current;
    },
    auditPlatform: async (ctx: PlatformContext, entry: { action: string; organizationId?: string | null; targetType: string; targetId?: string | null; diff?: Record<string, unknown> | null; metadata?: Record<string, unknown> }, tx?: Tx) => {
      const id = newUlid();
      const values = {
        id,
        organizationId: entry.organizationId ?? null,
        actor: redactDeep({ ...ctx.actor }) as unknown as Record<string, unknown>,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        diff: entry.diff ? redactDeep(entry.diff) : null,
        metadata: redactDeep({ ...(entry.metadata ?? {}), platformRole: ctx.platformRole }),
        ipHash: null,
        requestId: ctx.requestId,
      };
      if (tx) await tx.insert(auditLog).values(values);
      else await withOpsRole(handle.db, (t) => t.insert(auditLog).values(values));
      return id;
    },
    __setOperator: (ctx: PlatformContext | null) => {
      current = ctx;
    },
  };
});

import type { Tx } from "@track-site/db";
import * as platformMock from "@/server/ops/platform";
import { approveRoleRequestAction, declineRoleRequestAction, proposeRoleChangeAction, revokeSessionsAction } from "./actions/users";
import type { PlatformContext } from "./platform";
import { ROLE_ACTIONS, loadPlatformUsers, loadUserDetail, loadUserDirectory, parseUserFilters } from "./users";

const t = testDb();
const STAMP = Date.now();
const mail = (who: string) => `${who}-${STAMP}@users-int.test`;
const actAs = (ctx: PlatformContext | null) => (platformMock as unknown as { __setOperator: (c: PlatformContext | null) => void }).__setOperator(ctx);

function ctxFor(id: string, email: string, platformRole: "PLATFORM_ADMIN" | "PLATFORM_SUPPORT"): PlatformContext {
  return {
    user: { id, email, name: email, emailVerified: true, platformRole, locale: "en", twoFactorEnabled: true },
    platformRole,
    actor: { kind: "platform", userId: id, email, platformRole },
    requestId: `req-users-${id.slice(0, 8)}`,
  } as PlatformContext;
}

function form(fields: Record<string, string | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v);
  return fd;
}
const initial = { ok: false, error: null, notice: null };

let adminA = "";
let adminB = "";
let customerC = "";
let customerD = "";
let orgId = "";
let ctxA: PlatformContext;
let ctxB: PlatformContext;

async function addSession(userId: string, hoursAhead = 24): Promise<void> {
  const now = new Date();
  await t.db.insert(session).values({ userId, token: `tok-${userId.slice(0, 8)}-${Math.random().toString(36).slice(2)}`, expiresAt: new Date(now.getTime() + hoursAhead * 3_600_000), createdAt: now, updatedAt: now });
}
const sessionsOf = async (userId: string) => (await t.db.select({ id: session.id }).from(session).where(eq(session.userId, userId))).length;
const roleOf = async (userId: string) => (await t.db.select({ role: user.platformRole }).from(user).where(eq(user.id, userId)))[0]!.role;

beforeAll(async () => {
  const insert = async (name: string, email: string, platformRole: string, emailVerified = true) => (await t.db.insert(user).values({ name, email, emailVerified, platformRole }).returning({ id: user.id }))[0]!.id;
  adminA = await insert("Admin A", mail("admin-a"), "PLATFORM_ADMIN");
  adminB = await insert("Admin B", mail("admin-b"), "PLATFORM_ADMIN");
  customerC = await insert("Customer C", mail("customer-c"), "NONE");
  customerD = await insert("Customer D", mail("customer-d"), "NONE");
  ctxA = ctxFor(adminA, mail("admin-a"), "PLATFORM_ADMIN");
  ctxB = ctxFor(adminB, mail("admin-b"), "PLATFORM_ADMIN");
  const [org] = await t.db.insert(organization).values({ name: "Users org", slug: `users-int-${STAMP}` }).returning({ id: organization.id });
  orgId = org!.id;
  await t.db.insert(member).values({ organizationId: orgId, userId: customerC, role: "OWNER" });
  await addSession(customerC);
  await addSession(customerC);
  await addSession(adminA);
});

afterAll(async () => {
  await t.close();
  await (globalThis as { __opsUsersPool?: { close: () => Promise<void> } }).__opsUsersPool?.close();
});

describe("platform users (integration)", () => {
  it("lists operators with sessions and knows a second admin exists", async () => {
    const overview = await loadPlatformUsers(ctxA);
    const a = overview.operators.find((o) => o.id === adminA);
    expect(a).toMatchObject({ platformRole: "PLATFORM_ADMIN", eligible: true, memberships: 0, viewer: { isSelf: true, changeMode: null, changeRefusal: "self" } });
    expect(a!.sessions.active).toBe(1);
    expect(a!.sessions.lastSignInAt).not.toBeNull();
    const b = overview.operators.find((o) => o.id === adminB);
    // A and B are the only eligible admins: B cannot approve a change to their own role, and A may not self-approve it
    expect(b!.viewer).toEqual({ isSelf: false, changeMode: null, changeRefusal: "needsThirdAdmin" });
    expect(overview.operators.some((o) => o.id === customerC)).toBe(false);
    expect(overview.otherAdminExists).toBe(true);
    expect(overview.requests).toEqual([]);
  });

  let requestId = "";

  it("files a four-eyes request for a customer and refuses a duplicate", async () => {
    actAs(ctxA);
    const first = await proposeRoleChangeAction(initial, form({ userId: customerC, role: "PLATFORM_SUPPORT", reason: "joins the support rota", confirm: "role" }));
    expect(first).toMatchObject({ ok: true, notice: "proposed" });
    requestId = first.requestId!;
    expect(requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(await roleOf(customerC)).toBe("NONE");
    const dup = await proposeRoleChangeAction(initial, form({ email: mail("customer-c").toUpperCase(), role: "PLATFORM_ADMIN", reason: "again", confirm: "role" }));
    expect(dup).toMatchObject({ ok: false, error: "duplicate" });
    const overview = await loadPlatformUsers(ctxA);
    expect(overview.requests).toHaveLength(1);
    expect(overview.requests[0]).toMatchObject({ id: requestId, state: "pending", fromRole: "NONE", toRole: "PLATFORM_SUPPORT", viewer: { isProposer: true, approve: { ok: false, reason: "fourEyes" }, decline: "withdraw" } });
    const asB = await loadPlatformUsers(ctxB);
    expect(asB.requests[0]!.viewer).toMatchObject({ isProposer: false, approve: { ok: true }, decline: "decline" });
  });

  it("refuses the proposer and lets the second admin apply it with a forced sign-out", async () => {
    actAs(ctxA);
    expect(await approveRoleRequestAction(initial, form({ requestId, confirm: "approve" }))).toMatchObject({ ok: false, error: "fourEyes" });
    expect(await approveRoleRequestAction(initial, form({ requestId }))).toMatchObject({ ok: false, error: "confirm_required" });
    actAs(ctxB);
    const applied = await approveRoleRequestAction(initial, form({ requestId, confirm: "approve" }));
    expect(applied).toMatchObject({ ok: true, notice: "approved", sessionsRevoked: 2, requestId });
    expect(await roleOf(customerC)).toBe("PLATFORM_SUPPORT");
    expect(await sessionsOf(customerC)).toBe(0);
    const [entry] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, ROLE_ACTIONS.set), eq(auditLog.targetId, customerC)));
    expect(entry!.diff).toEqual({ platformRole: { before: "NONE", after: "PLATFORM_SUPPORT" } });
    expect(entry!.metadata).toMatchObject({ requestId, proposedBy: adminA, approvedBy: adminB, selfApproved: false, sessionsRevoked: 2, forcedSignOut: true });
    expect(entry!.actor).toMatchObject({ kind: "platform", userId: adminB });
    // decided: no longer pending, a second approval is refused
    expect(await approveRoleRequestAction(initial, form({ requestId, confirm: "approve" }))).toMatchObject({ ok: false, error: "notPending" });
    const overview = await loadPlatformUsers(ctxB);
    expect(overview.requests).toEqual([]);
    expect(overview.operators.find((o) => o.id === customerC)).toMatchObject({ platformRole: "PLATFORM_SUPPORT", sessions: { active: 0 } });
    expect(overview.history[0]).toMatchObject({ action: ROLE_ACTIONS.set, before: "NONE", after: "PLATFORM_SUPPORT", selfApproved: false, requestId, sessionsRevoked: 2, target: { id: customerC } });
  });

  it("withdraws and declines requests", async () => {
    actAs(ctxA);
    const filed = await proposeRoleChangeAction(initial, form({ userId: customerD, role: "PLATFORM_SUPPORT", reason: "trial run", confirm: "role" }));
    expect(filed.ok).toBe(true);
    const withdrawn = await declineRoleRequestAction(initial, form({ requestId: filed.requestId!, confirm: "decline" }));
    expect(withdrawn).toMatchObject({ ok: true, notice: "withdrawn" });
    expect(await declineRoleRequestAction(initial, form({ requestId: filed.requestId!, confirm: "decline" }))).toMatchObject({ ok: false, error: "notPending" });
    const again = await proposeRoleChangeAction(initial, form({ userId: customerD, role: "PLATFORM_SUPPORT", reason: "trial run, second attempt", confirm: "role" }));
    expect(again.ok).toBe(true);
    actAs(ctxB);
    const declined = await declineRoleRequestAction(initial, form({ requestId: again.requestId!, reason: "not yet", confirm: "decline" }));
    expect(declined).toMatchObject({ ok: true, notice: "declined" });
    expect(await roleOf(customerD)).toBe("NONE");
    const actions = (await t.db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, customerD))).map((r) => r.action).sort();
    expect(actions).toEqual([ROLE_ACTIONS.decline, ROLE_ACTIONS.propose, ROLE_ACTIONS.propose, ROLE_ACTIONS.withdraw]);
  });

  it("refuses the actor's own account and a change to the only other eligible admin, and applies the single-admin fallback self-approved with a ticket", async () => {
    actAs(ctxA);
    expect(await proposeRoleChangeAction(initial, form({ userId: adminA, role: "NONE", reason: "stepping down", confirm: "role" }))).toMatchObject({ ok: false, error: "self" });
    await addSession(adminB);
    // A and B are the only eligible admins: B cannot approve their own demotion, and A may not self-approve it (ticket or not)
    expect(await proposeRoleChangeAction(initial, form({ userId: adminB, role: "PLATFORM_SUPPORT", reason: "moves to support", ticketRef: "OPS-4710", confirm: "role" }))).toMatchObject({ ok: false, error: "needsThirdAdmin" });
    expect(await roleOf(adminB)).toBe("PLATFORM_ADMIN");
    expect(await sessionsOf(adminB)).toBe(1);
    expect(await t.db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, ROLE_ACTIONS.set), eq(auditLog.targetId, adminB)))).toEqual([]);
    // B loses eligibility (the stubbed eligibility is admin + verified e-mail; production also requires two-factor):
    // A is now the only eligible admin → fallback, ticket required; removing the role from an unverified account is allowed
    await t.db.update(user).set({ emailVerified: false }).where(eq(user.id, adminB));
    const noTicket = await proposeRoleChangeAction(initial, form({ userId: adminB, role: "NONE", reason: "left the company", confirm: "role" }));
    expect(noTicket).toMatchObject({ ok: false, error: "ticketRequired", fieldErrors: { ticketRef: "required" } });
    const applied = await proposeRoleChangeAction(initial, form({ userId: adminB, role: "NONE", reason: "left the company", ticketRef: "OPS-4711", confirm: "role" }));
    expect(applied).toMatchObject({ ok: true, notice: "applied", sessionsRevoked: 1 });
    expect(await roleOf(adminB)).toBe("NONE");
    expect(await sessionsOf(adminB)).toBe(0);
    const [entry] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, ROLE_ACTIONS.set), eq(auditLog.targetId, adminB)));
    expect(entry!.metadata).toMatchObject({ selfApproved: true, ticketRef: "OPS-4711", proposedBy: adminA, approvedBy: adminA, requestId: null });
    // A is now the last admin: nobody may file a demotion (own account), and the overview says so
    const overview = await loadPlatformUsers(ctxA);
    expect(overview).toMatchObject({ adminCount: 1, eligibleAdminCount: 1, otherAdminExists: false });
    expect(overview.operators.find((o) => o.id === adminA)!.viewer.changeRefusal).toBe("self");
  });

  it("revokes an operator's sessions and leaves customers alone", async () => {
    actAs(ctxA);
    await addSession(customerC);
    const revoked = await revokeSessionsAction(initial, form({ userId: customerC, reason: "lost laptop", confirm: "revoke" }));
    expect(revoked).toMatchObject({ ok: true, notice: "sessionsRevoked", sessionsRevoked: 1 });
    expect(await sessionsOf(customerC)).toBe(0);
    expect(await revokeSessionsAction(initial, form({ userId: customerD, reason: "lost laptop", confirm: "revoke" }))).toMatchObject({ ok: false, error: "notOperator" });
    expect(await revokeSessionsAction(initial, form({ userId: customerC, reason: "x", confirm: "revoke" }))).toMatchObject({ ok: false, error: "invalid" });
  });

  it("serves the read-only directory and the account detail", async () => {
    const page = await loadUserDirectory(ctxA, parseUserFilters({ q: `-${STAMP}@users-int`, sort: "email", dir: "asc" }));
    expect(page.total).toBe(4);
    expect(page.rows.map((r) => r.email)).toEqual([mail("admin-a"), mail("admin-b"), mail("customer-c"), mail("customer-d")]);
    const c = page.rows.find((r) => r.id === customerC)!;
    expect(c.memberships).toEqual([{ id: orgId, name: "Users org", slug: `users-int-${STAMP}`, role: "OWNER" }]);
    expect(c.platformRole).toBe("PLATFORM_SUPPORT");
    // B lost the platform role in the fallback test above and now counts as a customer account
    const customersOnly = await loadUserDirectory(ctxA, parseUserFilters({ q: `-${STAMP}@users-int`, kind: "customers", sort: "email" }));
    expect(customersOnly.rows.map((r) => r.id)).toEqual([adminB, customerD]);
    const bySignIn = await loadUserDirectory(ctxA, parseUserFilters({ q: `-${STAMP}@users-int`, sort: "signin" }));
    expect(bySignIn.rows[0]!.id).toBe(adminA);
    expect(bySignIn.rows.at(-1)!.sessions.lastSignInAt).toBeNull();

    const detail = await loadUserDetail(ctxA, customerC);
    expect(detail!.user).toMatchObject({ id: customerC, platformRole: "PLATFORM_SUPPORT", twoFactor: false, twoFactorVerified: null, passkeys: 0 });
    expect(detail!.memberships).toHaveLength(1);
    expect(detail!.memberships[0]!.organization).toMatchObject({ id: orgId, suspendedAt: null });
    expect(detail!.sessions).toMatchObject({ active: 0, expired: 0, rows: [], truncated: false });
    expect(detail!.audit.map((e) => e.action)).toEqual([ROLE_ACTIONS.sessionsRevoke, ROLE_ACTIONS.set, ROLE_ACTIONS.propose]);
    expect(detail!.viewer).toMatchObject({ isSelf: false, changeMode: "self", canRevokeSessions: true });
    expect(await loadUserDetail(ctxA, "not-a-uuid")).toBeNull();
    expect(await loadUserDetail(ctxA, "00000000-0000-4000-8000-000000000000")).toBeNull();
    const customer = await loadUserDetail(ctxA, customerD);
    expect(customer!.viewer.canRevokeSessions).toBe(false);
  });
});
