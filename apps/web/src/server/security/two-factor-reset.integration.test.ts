import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { AppError, can, type Permission } from "@track-site/core";
import { auditLog, member, organization, session, twoFactor, user, withPlatform as asOps, withTenant, type Db, type Tx } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";
import type { OrgContext } from "@/server/session";

/**
 * Runs the two-factor reset against the migrated test database: the routine itself as `tracksite_ops`
 * (platform path) and as `tracksite_app` under RLS (tenant path), then the two server actions with the
 * access layers replaced by minimal doubles (same transaction helpers, same audit shape) and the mail
 * transport stubbed. Asserts that a reset clears the plugin's `two_factor` rows (secret and backup codes),
 * switches the flag off and deletes the sessions; that the admin's own account, unknown accounts and
 * accounts without two-factor are refused without a write; that the audit row carries actor, target,
 * reason, ticket and organisation but never a secret; and that the affected person is mailed in their
 * language with the resetting role.
 */
const holder = vi.hoisted(() => ({
  db: null as unknown as Db,
  operator: null as PlatformContext | null,
  org: null as OrgContext | null,
  mailOk: true,
  mails: [] as Array<{ to: string; subject: string; text: string }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/env", () => ({ env: () => ({ HOST_MARKETING: "https://www.track.site", HOST_APP: "https://www.track.site/app" }) }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/auth", () => ({ auth: () => ({ api: {} }) }));
vi.mock("@/server/team", () => ({}));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (mail: { to: string; subject: string; text: string }) => {
    holder.mails.push(mail);
    return holder.mailOk ? { ok: true, transport: "file", id: "outbox" } : { ok: false, transport: "smtp", error: "connection refused" };
  }),
}));
vi.mock("@/server/ops/break-glass", () => ({ eligibleAdminIds: async () => [] }));
vi.mock("@/server/ops/platform", async () => {
  const { auditLog: audit, withPlatform: ops } = await import("@track-site/db");
  const { newUlid, redactDeep } = await import("@track-site/core");
  class PlatformAccessError extends Error {}
  return {
    PlatformAccessError,
    opsRequiresTwoFactor: () => false,
    requirePlatform: async () => {
      if (!holder.operator) throw new PlatformAccessError("no operator");
      return holder.operator;
    },
    withPlatform: (_ctx: unknown, fn: (tx: Tx) => Promise<unknown>) => ops(holder.db, fn),
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
      if (tx) await tx.insert(audit).values(values);
      else await ops(holder.db, (t) => t.insert(audit).values(values));
      return id;
    },
  };
});
vi.mock("@/server/session", async () => {
  const { withTenant: tenant } = await import("@track-site/db");
  const { AppError: Err, can: allowed } = await import("@track-site/core");
  return {
    requireOrgContext: async (permission?: Permission) => {
      const ctx = holder.org;
      if (!ctx) throw new Err("UNAUTHORIZED", "no session");
      if (permission && !allowed(ctx.role, permission)) throw new Err("FORBIDDEN", `Missing permission ${permission}`);
      return ctx;
    },
    assertOrgWritable: (ctx: OrgContext, what = "mutation") => {
      if (ctx.readOnly) throw new Err("FORBIDDEN", `Read-only support access: ${what} refused`);
    },
    withOrg: (ctx: OrgContext, fn: (tx: Tx) => Promise<unknown>) => tenant(holder.db, ctx.organization.id, fn),
  };
});

import { resetMemberTwoFactorAction } from "@/server/actions/team";
import { resetTwoFactorAction } from "@/server/ops/actions/users";
import { TWO_FACTOR_RESET_ACTIONS, resetTwoFactor } from "./two-factor-reset";

const t = testDb();
holder.db = t.db;
const STAMP = Date.now();
const mail = (who: string) => `${who}-${STAMP}@tfr-int.test`;
const SECRET = `JBSWY3DPEHPK3PXP${STAMP}`;
const BACKUP = `backup-${STAMP}-0001,backup-${STAMP}-0002`;
const initial = { ok: false, error: null, notice: null };

function form(fields: Record<string, string | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v);
  return fd;
}

function platformCtx(id: string, email: string): PlatformContext {
  return {
    user: { id, email, name: email, emailVerified: true, platformRole: "PLATFORM_ADMIN", locale: "en", twoFactorEnabled: true },
    platformRole: "PLATFORM_ADMIN",
    actor: { kind: "platform", userId: id, email, platformRole: "PLATFORM_ADMIN" },
    requestId: `req-tfr-${id.slice(0, 8)}`,
  } as PlatformContext;
}

function orgCtx(userId: string, email: string, role: OrgContext["role"], organizationId: string, readOnly = false): OrgContext {
  return {
    user: { id: userId, email, name: email, emailVerified: true, platformRole: "NONE", locale: "en", twoFactorEnabled: true },
    organization: { id: organizationId, name: "Reset org", slug: `tfr-int-${STAMP}`, suspendedAt: null },
    role,
    readOnly,
    tenant: { organizationId, actor: { kind: "user", userId, role, platformRole: "NONE" }, requestId: `req-team-${userId.slice(0, 8)}` },
  };
}

interface Person {
  id: string;
  email: string;
}
const people: Record<string, Person> = {};
let org1 = "";
let org2 = "";
const memberIds: Record<string, string> = {};

async function insertUser(name: string, opts: { platformRole?: string; locale?: string; twoFactor?: boolean; sessions?: number } = {}): Promise<Person> {
  const email = mail(name);
  const [row] = await t.db
    .insert(user)
    .values({ name, email, emailVerified: true, platformRole: opts.platformRole ?? "NONE", locale: opts.locale ?? "en", twoFactorEnabled: opts.twoFactor ?? false })
    .returning({ id: user.id });
  const id = row!.id;
  if (opts.twoFactor) await t.db.insert(twoFactor).values({ userId: id, secret: SECRET, backupCodes: BACKUP, verified: true });
  for (let i = 0; i < (opts.sessions ?? 0); i++) {
    const now = new Date();
    await t.db.insert(session).values({ userId: id, token: `tok-${id.slice(0, 8)}-${i}-${STAMP}`, expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now });
  }
  return (people[name] = { id, email });
}

const twoFactorRows = async (userId: string) => t.db.select({ id: twoFactor.id, secret: twoFactor.secret }).from(twoFactor).where(eq(twoFactor.userId, userId));
const sessionsOf = async (userId: string) => (await t.db.select({ id: session.id }).from(session).where(eq(session.userId, userId))).length;
const flagOf = async (userId: string) => (await t.db.select({ f: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)))[0]!.f;
const auditRowsOf = async (userId: string, action: string) => t.db.select().from(auditLog).where(and(eq(auditLog.targetId, userId), eq(auditLog.action, action)));

beforeAll(async () => {
  await insertUser("admin-a", { platformRole: "PLATFORM_ADMIN", twoFactor: true, sessions: 1 });
  await insertUser("admin-b", { platformRole: "PLATFORM_ADMIN", twoFactor: true, sessions: 2 });
  await insertUser("support-c", { platformRole: "PLATFORM_SUPPORT", twoFactor: true, sessions: 1 });
  await insertUser("customer-c", { locale: "de", twoFactor: true, sessions: 2 });
  await insertUser("customer-d", { twoFactor: false });
  await insertUser("owner-f", { twoFactor: true, sessions: 1 });
  await insertUser("admin-g", { locale: "fr", twoFactor: true, sessions: 1 });
  await insertUser("member-e", { twoFactor: true, sessions: 3 });
  await insertUser("member-h", { twoFactor: true, sessions: 1 });
  await insertUser("member-i", { twoFactor: true, sessions: 1 });
  await insertUser("developer-j", { twoFactor: true });
  const orgs = await t.db
    .insert(organization)
    .values([
      { name: "Reset org", slug: `tfr-int-${STAMP}` },
      { name: "Other org", slug: `tfr-int-other-${STAMP}` },
    ])
    .returning({ id: organization.id });
  org1 = orgs[0]!.id;
  org2 = orgs[1]!.id;
  const add = async (name: string, organizationId: string, role: string) => {
    const [row] = await t.db.insert(member).values({ organizationId, userId: people[name]!.id, role }).returning({ id: member.id });
    memberIds[`${name}@${organizationId}`] = row!.id;
  };
  await add("owner-f", org1, "OWNER");
  await add("admin-g", org1, "ADMIN");
  await add("member-e", org1, "DEVELOPER");
  await add("member-h", org1, "ANALYST");
  await add("member-i", org1, "READ_ONLY");
  await add("developer-j", org1, "DEVELOPER");
  await add("customer-c", org1, "ADMIN");
  await add("customer-c", org2, "OWNER");
  // a Track operator who is also a member: tenant roles never reset a platform account
  await add("support-c", org1, "DEVELOPER");
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  holder.mailOk = true;
  holder.mails.length = 0;
  holder.operator = null;
  holder.org = null;
});

describe("resetTwoFactor (routine)", () => {
  it("clears the secret, the backup codes and the sessions and writes an audit row without secrets", async () => {
    const actor = people["admin-a"]!;
    const target = people["admin-b"]!;
    expect(await twoFactorRows(target.id)).toHaveLength(1);
    const platformActor = { kind: "platform", userId: actor.id, email: actor.email, platformRole: "PLATFORM_ADMIN" };
    const outcome = await asOps(t.db, (tx) => resetTwoFactor({ targetUserId: target.id, actor: platformActor, action: TWO_FACTOR_RESET_ACTIONS.platform, reason: "lost the authenticator", ticketRef: "OPS-4711", requestId: "req-routine" }, tx));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.change).toMatchObject({ user: { id: target.id, email: target.email, locale: "en" }, wasEnabled: true, secretsRemoved: 1, sessionsRevoked: 2 });
    expect(await twoFactorRows(target.id)).toEqual([]);
    expect(await flagOf(target.id)).toBe(false);
    expect(await sessionsOf(target.id)).toBe(0);
    const rows = await auditRowsOf(target.id, TWO_FACTOR_RESET_ACTIONS.platform);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(outcome.change.auditId);
    expect(row.organizationId).toBeNull();
    expect(row.targetType).toBe("user");
    expect(row.requestId).toBe("req-routine");
    expect(row.actor).toMatchObject({ kind: "platform", userId: actor.id });
    expect(row.diff).toEqual({ twoFactorEnabled: { before: true, after: false } });
    expect(row.metadata).toMatchObject({ module: "security", reason: "lost the authenticator", ticketRef: "OPS-4711", secretsRemoved: 1, sessionsRevoked: 2, forcedSignOut: true });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(`backup-${STAMP}`);
  });

  it("refuses the actor's own account, unknown accounts and accounts without two-factor — without a write", async () => {
    const a = people["admin-a"]!;
    const actor = { kind: "platform", userId: a.id };
    const before = await twoFactorRows(a.id);
    expect(await asOps(t.db, (tx) => resetTwoFactor({ targetUserId: a.id, actor, action: TWO_FACTOR_RESET_ACTIONS.platform, reason: "myself" }, tx))).toEqual({ ok: false, reason: "self" });
    expect(await twoFactorRows(a.id)).toEqual(before);
    expect(await flagOf(a.id)).toBe(true);
    expect(await sessionsOf(a.id)).toBe(1);
    expect(await auditRowsOf(a.id, TWO_FACTOR_RESET_ACTIONS.platform)).toEqual([]);
    expect(await asOps(t.db, (tx) => resetTwoFactor({ targetUserId: "00000000-0000-4000-8000-000000000000", actor, action: TWO_FACTOR_RESET_ACTIONS.platform, reason: "nobody" }, tx))).toEqual({ ok: false, reason: "not_found" });
    expect(await asOps(t.db, (tx) => resetTwoFactor({ targetUserId: "not-a-uuid", actor, action: TWO_FACTOR_RESET_ACTIONS.platform, reason: "nobody" }, tx))).toEqual({ ok: false, reason: "not_found" });
    const d = people["customer-d"]!;
    expect(await asOps(t.db, (tx) => resetTwoFactor({ targetUserId: d.id, actor, action: TWO_FACTOR_RESET_ACTIONS.platform, reason: "nothing there" }, tx))).toEqual({ ok: false, reason: "not_enabled" });
    expect(await auditRowsOf(d.id, TWO_FACTOR_RESET_ACTIONS.platform)).toEqual([]);
  });

  it("runs as tracksite_app under RLS for the tenant path and records the organisation", async () => {
    const owner = people["owner-f"]!;
    const target = people["member-h"]!;
    const userActor = { kind: "user", userId: owner.id, role: "OWNER", platformRole: "NONE" };
    const outcome = await withTenant(t.db, org1, (tx) => resetTwoFactor({ targetUserId: target.id, actor: userActor, action: TWO_FACTOR_RESET_ACTIONS.member, reason: "phone stolen", organizationId: org1 }, tx));
    expect(outcome).toMatchObject({ ok: true, change: { secretsRemoved: 1, sessionsRevoked: 1 } });
    expect(await twoFactorRows(target.id)).toEqual([]);
    expect(await flagOf(target.id)).toBe(false);
    const [row] = await auditRowsOf(target.id, TWO_FACTOR_RESET_ACTIONS.member);
    expect(row).toMatchObject({ organizationId: org1, targetType: "user", actor: { kind: "user", userId: owner.id, role: "OWNER" } });
    expect(JSON.stringify(row)).not.toContain(SECRET);
  });
});

describe("resetTwoFactorAction (Track Operations)", () => {
  it("needs a ticket and the ticket's organisation for a customer account, then resets, audits with the organisation and mails in the person's language", async () => {
    holder.operator = platformCtx(people["admin-a"]!.id, people["admin-a"]!.email);
    const c = people["customer-c"]!;
    expect(await resetTwoFactorAction(initial, form({ userId: c.id, reason: "support ticket", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "ticketRequired", fieldErrors: { ticketRef: "required" } });
    expect(await resetTwoFactorAction(initial, form({ userId: c.id, reason: "support ticket", ticketRef: "SUP-1234", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "organizationRequired", fieldErrors: { organizationId: "required" } });
    const [foreign] = await t.db.insert(organization).values({ name: "Foreign org", slug: `tfr-int-foreign-${STAMP}` }).returning({ id: organization.id });
    expect(await resetTwoFactorAction(initial, form({ userId: c.id, reason: "support ticket", ticketRef: "SUP-1234", organizationId: foreign!.id, confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "notMember", fieldErrors: { organizationId: "invalid" } });
    expect(await resetTwoFactorAction(initial, form({ userId: c.id, reason: "support ticket", ticketRef: "SUP-1234", organizationId: org2 }))).toMatchObject({ ok: false, error: "confirm_required" });
    expect(await twoFactorRows(c.id)).toHaveLength(1);
    expect(holder.mails).toEqual([]);

    const done = await resetTwoFactorAction(initial, form({ userId: c.id, reason: "support ticket", ticketRef: "SUP-1234", organizationId: org2, confirm: "twoFactorReset" }));
    expect(done).toMatchObject({ ok: true, notice: "twoFactorReset", sessionsRevoked: 2, mailed: true });
    expect(await twoFactorRows(c.id)).toEqual([]);
    expect(await flagOf(c.id)).toBe(false);
    expect(await sessionsOf(c.id)).toBe(0);
    const [row] = await auditRowsOf(c.id, TWO_FACTOR_RESET_ACTIONS.platform);
    expect(row).toMatchObject({ organizationId: org2, targetType: "user", actor: { kind: "platform", userId: people["admin-a"]!.id } });
    expect(row!.metadata).toMatchObject({ module: "users", support: true, targetRole: "NONE", reason: "support ticket", ticketRef: "SUP-1234", secretsRemoved: 1, sessionsRevoked: 2, platformRole: "PLATFORM_ADMIN" });
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(holder.mails).toHaveLength(1);
    expect(holder.mails[0]).toMatchObject({ to: c.email, subject: "Deine Zwei-Faktor-Authentifizierung für Track wurde zurückgesetzt" });
    expect(holder.mails[0]!.text).toContain("einem Plattform-Administrator von Track");
    expect(holder.mails[0]!.text).toContain("https://www.track.site/de/contact");
    expect(holder.mails[0]!.text).not.toContain(SECRET);
  });

  it("resets another platform user with a reason alone, refuses the admin's own account and accounts without two-factor", async () => {
    const a = people["admin-a"]!;
    holder.operator = platformCtx(a.id, a.email);
    expect(await resetTwoFactorAction(initial, form({ userId: a.id, reason: "myself please", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "selfTwoFactor" });
    expect(await twoFactorRows(a.id)).toHaveLength(1);
    expect(await resetTwoFactorAction(initial, form({ userId: people["customer-d"]!.id, reason: "nothing to reset", ticketRef: "SUP-1", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "notEnabled" });
    expect(await resetTwoFactorAction(initial, form({ userId: "00000000-0000-4000-8000-000000000000", reason: "nobody here", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "not_found" });
    expect(await resetTwoFactorAction(initial, form({ userId: people["support-c"]!.id, reason: "x", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "invalid" });
    holder.mailOk = false;
    const s = people["support-c"]!;
    const done = await resetTwoFactorAction(initial, form({ userId: s.id, reason: "new phone, no backup codes", confirm: "twoFactorReset" }));
    expect(done).toMatchObject({ ok: true, notice: "twoFactorReset", sessionsRevoked: 1, mailed: false });
    expect(await twoFactorRows(s.id)).toEqual([]);
    expect(await flagOf(s.id)).toBe(false);
    const [row] = await auditRowsOf(s.id, TWO_FACTOR_RESET_ACTIONS.platform);
    expect(row).toMatchObject({ organizationId: null });
    expect(row!.metadata).toMatchObject({ support: false, targetRole: "PLATFORM_SUPPORT", ticketRef: null });
    expect(holder.mails).toHaveLength(1);
    expect(holder.mails[0]!.text).toContain("a Track platform administrator");
  });

  it("is refused without a platform admin", async () => {
    holder.operator = null;
    expect(await resetTwoFactorAction(initial, form({ userId: people["member-e"]!.id, reason: "no operator", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await twoFactorRows(people["member-e"]!.id)).toHaveLength(1);
  });
});

describe("resetMemberTwoFactorAction (Team & Access)", () => {
  it("lets an admin reset a member but not an owner, never themselves, and needs a reason and the confirmation", async () => {
    const g = people["admin-g"]!;
    holder.org = orgCtx(g.id, g.email, "ADMIN", org1);
    const ownerMember = memberIds[`owner-f@${org1}`]!;
    const eMember = memberIds[`member-e@${org1}`]!;
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: ownerMember, reason: "owner locked out", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "ownerOnly" });
    expect(await twoFactorRows(people["owner-f"]!.id)).toHaveLength(1);
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`admin-g@${org1}`]!, reason: "my own account", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "self" });
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: eMember, reason: "ok", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "reasonRequired" });
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: eMember, reason: "lost the phone" }))).toMatchObject({ ok: false, error: "confirmRequired" });
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`customer-c@${org2}`]!, reason: "other organisation", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "notFound" });
    expect(await twoFactorRows(people["member-e"]!.id)).toHaveLength(1);

    const done = await resetMemberTwoFactorAction(initial, form({ memberId: eMember, reason: "lost the phone", confirm: "twoFactorReset" }));
    expect(done).toMatchObject({ ok: true, notice: "twoFactorReset" });
    const e = people["member-e"]!;
    expect(await twoFactorRows(e.id)).toEqual([]);
    expect(await flagOf(e.id)).toBe(false);
    expect(await sessionsOf(e.id)).toBe(0);
    const [row] = await auditRowsOf(e.id, TWO_FACTOR_RESET_ACTIONS.member);
    expect(row).toMatchObject({ organizationId: org1, targetType: "user", requestId: `req-team-${g.id.slice(0, 8)}`, actor: { kind: "user", userId: g.id, role: "ADMIN" } });
    expect(row!.metadata).toMatchObject({ module: "team", memberId: eMember, targetRole: "DEVELOPER", reason: "lost the phone", ticketRef: null, secretsRemoved: 1, sessionsRevoked: 3 });
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(holder.mails).toHaveLength(1);
    expect(holder.mails[0]).toMatchObject({ to: e.email });
    expect(holder.mails[0]!.text).toContain("an administrator of your organisation");
    expect(holder.mails[0]!.text).toContain("https://www.track.site/en/contact");
  });

  it("lets an owner reset an admin and reports a failed notification without undoing the reset", async () => {
    const f = people["owner-f"]!;
    holder.org = orgCtx(f.id, f.email, "OWNER", org1);
    holder.mailOk = false;
    const g = people["admin-g"]!;
    const done = await resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`admin-g@${org1}`]!, reason: "authenticator app reinstalled", confirm: "twoFactorReset" }));
    expect(done).toMatchObject({ ok: true, notice: "twoFactorResetNoMail" });
    expect(await twoFactorRows(g.id)).toEqual([]);
    expect(await flagOf(g.id)).toBe(false);
    expect(holder.mails).toHaveLength(1);
    expect(holder.mails[0]).toMatchObject({ to: g.email, subject: "Votre double authentification pour Track a été réinitialisée" });
    expect(holder.mails[0]!.text).toContain("un propriétaire de votre organisation");
    expect(holder.mails[0]!.text).toContain("https://www.track.site/fr/contact");
    // a member without two-factor: nothing to reset
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`admin-g@${org1}`]!, reason: "again, nothing left", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "twoFactorNotEnabled" });
    // a member with a platform role: even an owner cannot reach a Track operator from tenant scope
    const s = people["support-c"]!;
    expect(await resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`support-c@${org1}`]!, reason: "operator in our org", confirm: "twoFactorReset" }))).toMatchObject({ ok: false, error: "platformAccount" });
    expect(await auditRowsOf(s.id, TWO_FACTOR_RESET_ACTIONS.member)).toEqual([]);
    expect(holder.mails).toHaveLength(1);
  });

  it("is refused for roles without members.security and under a read-only support session", async () => {
    const j = people["developer-j"]!;
    holder.org = orgCtx(j.id, j.email, "DEVELOPER", org1);
    expect(can("DEVELOPER", "members.security")).toBe(false);
    await expect(resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`member-i@${org1}`]!, reason: "developer tries", confirm: "twoFactorReset" }))).rejects.toBeInstanceOf(AppError);
    const f = people["owner-f"]!;
    holder.org = orgCtx(f.id, f.email, "OWNER", org1, true);
    await expect(resetMemberTwoFactorAction(initial, form({ memberId: memberIds[`member-i@${org1}`]!, reason: "read-only support", confirm: "twoFactorReset" }))).rejects.toThrow(/Read-only support access/);
    expect(await twoFactorRows(people["member-i"]!.id)).toHaveLength(1);
    expect(holder.mails).toEqual([]);
  });
});
