import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, organization, supportAgentSettings, supportEvents, supportSettings, supportTeamMembers, supportTeams, supportTickets, user, withPlatform as asOps, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Teams against the migrated test database as `tracksite_ops` (docs/18 §"Agent-created tickets and teams"):
 * the admin-only actions with their audit rows (create, rename, members, default, archive / restore), the
 * loaders (summaries, members, badges, the agent's default team), the queue's team filter through the
 * additive hook of `tickets.ts`, and the team-aware round robin (`chooseRoundRobinAssignee` /
 * `autoAssignNewTicket` draw from the online members of the ticket's team only). Platform access is a double
 * that enforces role and permission; Next's cache is stubbed.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, ctx: null as unknown as PlatformContext }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/db", () => ({ db: () => holder.db, logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/ops/platform", async () => {
  const { auditLog: audit, withPlatform: ops } = await import("@track-site/db");
  const { hasPlatformPermission, newUlid } = await import("@track-site/core");
  class PlatformAccessError extends Error {}
  const rank = { PLATFORM_SUPPORT: 1, PLATFORM_ADMIN: 2 } as const;
  return {
    PlatformAccessError,
    requirePlatform: async (minRole: keyof typeof rank = "PLATFORM_SUPPORT", permission?: Parameters<typeof hasPlatformPermission>[1]) => {
      if (rank[holder.ctx.platformRole] < rank[minRole]) throw new PlatformAccessError("insufficient_role");
      if (permission && !hasPlatformPermission(holder.ctx.platformRole, permission)) throw new PlatformAccessError("insufficient_role");
      return holder.ctx;
    },
    withPlatform: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => ops(holder.db, fn as never),
    platformCan: (ctx: { platformRole: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN" }, permission: Parameters<typeof hasPlatformPermission>[1]) => hasPlatformPermission(ctx.platformRole, permission),
    auditPlatform: async (ctx: { user: { id: string }; requestId: string }, entry: Record<string, unknown>, tx?: { insert: typeof holder.db.insert }) => {
      const id = newUlid();
      await (tx ?? holder.db).insert(audit).values({
        id,
        organizationId: (entry.organizationId as string | null | undefined) ?? null,
        actor: { kind: "platform", userId: ctx.user.id },
        action: entry.action as string,
        targetType: entry.targetType as string,
        targetId: (entry.targetId as string | null | undefined) ?? null,
        diff: (entry.diff as Record<string, unknown> | null | undefined) ?? null,
        metadata: (entry.metadata as Record<string, unknown> | undefined) ?? {},
        requestId: ctx.requestId,
      });
      return id;
    },
  };
});

import { addTeamMemberAction, archiveTeamAction, removeTeamMemberAction, saveTeamAction, setDefaultTeamAction } from "@/server/ops/actions/support-teams";
import { autoAssignNewTicket, chooseRoundRobinAssignee } from "./auto-assign";
import { defaultTeamForAgent, getDefaultTeam, listTeamOptions, listTeams, loadTeam, loadUserTeams, teamMemberIds } from "./teams";
import { loadTickets } from "./tickets";
import { EMPTY_VIEW_FILTERS, type TicketFilters } from "./views";

const t = testDb();
const stamp = Date.now();
let orgId = "";
let adminId = "";
let leadId = "";
let memberId = "";
let outsiderId = "";
let customerId = "";
let defaultTeamId = "";
let createdDefaultTeam = false;
let escalationsId = "";
const ticketIds: string[] = [];
/** the settings singleton as it was before this file (other files seed it with `onConflictDoNothing`): restored or removed afterwards */
let previousSettings: typeof supportSettings.$inferSelect | null = null;
const initial = { ok: false, error: null, notice: null } as const;

const ctxFor = (id: string, role: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN"): PlatformContext => ({
  user: { id, name: "Operator", email: `${id}@example.test`, emailVerified: true, platformRole: role, locale: "en", twoFactorEnabled: true },
  platformRole: role,
  actor: { kind: "platform", userId: id, email: `${id}@example.test`, platformRole: role },
  requestId: `req-${stamp}`,
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const baseFilters: TicketFilters = { ...EMPTY_VIEW_FILTERS, view: null, q: null, sort: "updated_desc", page: 1 };

async function newTicket(input: { teamId: string | null; subject: string }): Promise<string> {
  const [row] = await asOps(t.db, (tx) => tx.insert(supportTickets).values({ organizationId: orgId, requesterEmail: `req-${stamp}-${ticketIds.length}@example.test`, subject: input.subject, channel: "email", status: "new", teamId: input.teamId }).returning({ id: supportTickets.id }));
  ticketIds.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db.insert(organization).values({ name: `Teams Org ${stamp}`, slug: `teams-org-${stamp}` }).returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Ada Admin", email: `teams-admin-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
      { name: "Lea Lead", email: `teams-lead-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Max Member", email: `teams-member-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Otto Outsider", email: `teams-outsider-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Cara Customer", email: `teams-customer-${stamp}@example.test`, platformRole: "NONE" },
    ])
    .returning({ id: user.id, name: user.name });
  const id = (name: string) => users.find((u) => u.name === name)!.id;
  adminId = id("Ada Admin");
  leadId = id("Lea Lead");
  memberId = id("Max Member");
  outsiderId = id("Otto Outsider");
  customerId = id("Cara Customer");
  holder.ctx = ctxFor(adminId, "PLATFORM_ADMIN");
  // the test database is truncated after the migration ran, so the seeded default team is recreated here
  await asOps(t.db, async (tx) => {
    const [existing] = await tx.select({ id: supportTeams.id }).from(supportTeams).where(eq(supportTeams.isDefault, true)).limit(1);
    if (existing) defaultTeamId = existing.id;
    else {
      const [row] = await tx.insert(supportTeams).values({ slug: `support-${stamp}`, name: "Support", isDefault: true }).returning({ id: supportTeams.id });
      defaultTeamId = row!.id;
      createdDefaultTeam = true;
    }
    previousSettings = (await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1))[0] ?? null;
    await tx.insert(supportSettings).values({ id: 1, autoAssignStrategy: "round_robin" }).onConflictDoUpdate({ target: supportSettings.id, set: { autoAssignStrategy: "round_robin" } });
    // everyone but the customer polled the console a moment ago (online)
    const now = new Date();
    await tx.insert(supportAgentSettings).values([leadId, memberId, outsiderId].map((userId) => ({ userId, lastSeenAt: now })));
  });
});

afterAll(async () => {
  await asOps(t.db, async (tx) => {
    if (ticketIds.length) await tx.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
    if (escalationsId) await tx.delete(supportTeams).where(eq(supportTeams.id, escalationsId));
    if (createdDefaultTeam) await tx.delete(supportTeams).where(eq(supportTeams.id, defaultTeamId));
    await tx.delete(supportTeamMembers).where(inArray(supportTeamMembers.userId, [leadId, memberId, outsiderId]));
    await tx.delete(supportAgentSettings).where(inArray(supportAgentSettings.userId, [leadId, memberId, outsiderId]));
    if (previousSettings) await tx.update(supportSettings).set({ autoAssignStrategy: previousSettings.autoAssignStrategy }).where(eq(supportSettings.id, 1));
    else await tx.delete(supportSettings).where(eq(supportSettings.id, 1));
  });
  await t.db.delete(user).where(inArray(user.id, [adminId, leadId, memberId, outsiderId, customerId]));
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.close();
});

describe("team management (admin only)", () => {
  it("refuses a support agent and validates the form", async () => {
    holder.ctx = ctxFor(leadId, "PLATFORM_SUPPORT");
    expect(await saveTeamAction(initial, form({ name: "Escalations" }))).toMatchObject({ ok: false, error: "forbidden" });
    holder.ctx = ctxFor(adminId, "PLATFORM_ADMIN");
    const invalid = await saveTeamAction(initial, form({ name: "", slug: "Bad Slug!" }));
    expect(invalid).toMatchObject({ ok: false, error: "invalid" });
    expect(invalid.fieldErrors).toMatchObject({ name: "required" });
  });

  it("creates a team with a derived slug, audits it, refuses a duplicate slug and renames without touching the slug", async () => {
    const created = await saveTeamAction(initial, form({ name: `Escalations ${stamp}`, description: "  Second line\r\n  " }));
    expect(created).toMatchObject({ ok: true, notice: "created" });
    escalationsId = created.id!;
    const [row] = await asOps(t.db, (tx) => tx.select().from(supportTeams).where(eq(supportTeams.id, escalationsId)));
    expect(row).toMatchObject({ slug: `escalations-${stamp}`, name: `Escalations ${stamp}`, description: "Second line", isDefault: false, archivedAt: null });
    const audits = await t.db.select().from(auditLog).where(and(eq(auditLog.targetType, "support_team"), eq(auditLog.targetId, escalationsId)));
    expect(audits.map((a) => a.action)).toEqual(["platform.support_team.create"]);
    expect(audits[0]!.diff).toMatchObject({ slug: `escalations-${stamp}`, name: `Escalations ${stamp}` });

    expect(await saveTeamAction(initial, form({ name: "Other", slug: `escalations-${stamp}` }))).toMatchObject({ ok: false, error: "slug_taken" });
    expect(await saveTeamAction(initial, form({ teamId: escalationsId, name: `Escalations ${stamp}`, description: "Second line" }))).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveTeamAction(initial, form({ teamId: escalationsId, name: `Escalations EMEA ${stamp}`, slug: "ignored-on-rename", description: "Second line" }))).toMatchObject({ ok: true, notice: "updated" });
    const [renamed] = await asOps(t.db, (tx) => tx.select({ slug: supportTeams.slug, name: supportTeams.name }).from(supportTeams).where(eq(supportTeams.id, escalationsId)));
    expect(renamed).toEqual({ slug: `escalations-${stamp}`, name: `Escalations EMEA ${stamp}` });
  });

  it("adds operators with a role, changes the role, refuses non-operators and removes members — each audited", async () => {
    expect(await addTeamMemberAction({ teamId: escalationsId, userId: leadId, role: "lead" })).toMatchObject({ ok: true, notice: "memberAdded" });
    expect(await addTeamMemberAction({ teamId: escalationsId, userId: memberId })).toMatchObject({ ok: true, notice: "memberAdded" });
    expect(await addTeamMemberAction({ teamId: escalationsId, userId: memberId })).toMatchObject({ ok: false, error: "unchanged" });
    expect(await addTeamMemberAction({ teamId: escalationsId, userId: customerId })).toMatchObject({ ok: false, error: "invalid_member" });
    expect(await addTeamMemberAction({ teamId: escalationsId, userId: memberId, role: "lead" })).toMatchObject({ ok: true, notice: "memberUpdated" });
    expect(await addTeamMemberAction({ teamId: escalationsId, userId: memberId, role: "member" })).toMatchObject({ ok: true, notice: "memberUpdated" });
    const detail = await asOps(t.db, (tx) => loadTeam(tx, escalationsId));
    expect(detail!.members.map((m) => [m.userId, m.role])).toEqual([
      [leadId, "lead"],
      [memberId, "member"],
    ]);
    expect(detail!.memberCount).toBe(2);
    const actions = (await t.db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.targetType, "support_team"), eq(auditLog.targetId, escalationsId)))).map((a) => a.action);
    expect(actions.filter((a) => a === "platform.support_team.member_add")).toHaveLength(2);
    expect(actions.filter((a) => a === "platform.support_team.member_update")).toHaveLength(2);
  });

  it("lists teams with counts and badges, and resolves the agent's default team", async () => {
    const teams = await asOps(t.db, listTeams);
    expect(teams[0]!.id).toBe(defaultTeamId);
    expect(teams.find((team) => team.id === escalationsId)).toMatchObject({ memberCount: 2, openTickets: 0, archivedAt: null });
    const badges = await asOps(t.db, (tx) => loadUserTeams(tx, [leadId, memberId, outsiderId]));
    expect(badges.get(leadId)).toEqual([{ id: escalationsId, slug: `escalations-${stamp}`, name: `Escalations EMEA ${stamp}`, role: "lead", archived: false }]);
    expect(badges.get(outsiderId)).toBeUndefined();
    expect((await asOps(t.db, (tx) => defaultTeamForAgent(tx, leadId)))?.id).toBe(escalationsId);
    expect((await asOps(t.db, (tx) => defaultTeamForAgent(tx, outsiderId)))?.id).toBe(defaultTeamId);
    expect((await asOps(t.db, getDefaultTeam))?.id).toBe(defaultTeamId);
    expect(await asOps(t.db, (tx) => teamMemberIds(tx, escalationsId))).toEqual(new Set([leadId, memberId]));
  });
});

describe("team-aware round robin", () => {
  it("draws from the online members of the ticket's team only", async () => {
    await asOps(t.db, async (tx) => {
      const pick = await chooseRoundRobinAssignee(tx, { teamId: escalationsId });
      expect(pick).not.toBeNull();
      expect([leadId, memberId]).toContain(pick!.userId);
      expect(pick!.candidates).toBe(2);
      // the outsider is online but not a member: excluded from the team pool, part of the open pool
      expect(await chooseRoundRobinAssignee(tx, { teamId: escalationsId, exclude: [leadId, memberId] })).toBeNull();
      const open = await chooseRoundRobinAssignee(tx, { exclude: [leadId, memberId] });
      expect(open?.userId).toBe(outsiderId);
      // a team without online members assigns nobody — never another team's agent
      expect(await chooseRoundRobinAssignee(tx, { teamId: defaultTeamId })).toBeNull();
    });
  });

  it("autoAssignNewTicket records the team in the event and the audit row", async () => {
    const ticketId = await newTicket({ teamId: escalationsId, subject: `Team ticket ${stamp}` });
    const outcome = await asOps(t.db, (tx) => autoAssignNewTicket(tx, { ticketId, organizationId: orgId, source: "agent" }));
    expect(outcome.strategy).toBe("round_robin");
    expect([leadId, memberId]).toContain(outcome.assigneeUserId);
    const events = await asOps(t.db, (tx) => tx.select({ kind: supportEvents.kind, payload: supportEvents.payload }).from(supportEvents).where(eq(supportEvents.ticketId, ticketId)));
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ reason: "round_robin", teamId: escalationsId, candidates: 2 });
    const [audit] = await t.db.select({ diff: auditLog.diff, metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.targetType, "support_ticket"), eq(auditLog.targetId, ticketId)));
    expect(audit!.diff).toMatchObject({ teamId: escalationsId, reason: "round_robin" });
    expect(audit!.metadata).toMatchObject({ source: "agent" });
  });
});

describe("queue: team column and filter (additive hook)", () => {
  it("shows the team on the row and filters by slug, id and none", async () => {
    const teamed = ticketIds[0]!;
    const loose = await newTicket({ teamId: null, subject: `Loose ticket ${stamp}` });
    const ctx = ctxFor(adminId, "PLATFORM_ADMIN");
    const all = await loadTickets(ctx, { ...baseFilters, q: String(stamp) });
    const teamedRow = all.rows.find((r) => r.id === teamed)!;
    expect(teamedRow.team).toEqual({ id: escalationsId, name: `Escalations EMEA ${stamp}`, slug: `escalations-${stamp}` });
    expect(teamedRow.openedBy).toBe("customer");
    expect(teamedRow.slaPendingFirstCustomerReply).toBe(false);
    expect(all.rows.find((r) => r.id === loose)!.team).toBeNull();
    const bySlug = await loadTickets(ctx, { ...baseFilters, q: String(stamp), team: `escalations-${stamp}` } as TicketFilters);
    expect(bySlug.rows.map((r) => r.id)).toEqual([teamed]);
    const byId = await loadTickets(ctx, { ...baseFilters, q: String(stamp), team: escalationsId } as TicketFilters);
    expect(byId.rows.map((r) => r.id)).toEqual([teamed]);
    const none = await loadTickets(ctx, { ...baseFilters, q: String(stamp), team: "none" } as TicketFilters);
    expect(none.rows.map((r) => r.id)).toEqual([loose]);
    expect((await loadTickets(ctx, { ...baseFilters, q: String(stamp), team: "any" } as TicketFilters)).total).toBe(2);
  });
});

describe("default flag, archive and restore", () => {
  it("switches the default, refuses to archive it, archives the other team after confirmation and restores it", async () => {
    expect(await setDefaultTeamAction({ teamId: escalationsId })).toMatchObject({ ok: true, notice: "defaultSet" });
    expect((await asOps(t.db, getDefaultTeam))?.id).toBe(escalationsId);
    expect(await setDefaultTeamAction({ teamId: escalationsId })).toMatchObject({ ok: false, error: "unchanged" });
    expect(await archiveTeamAction({ teamId: escalationsId, archived: true, confirmed: true })).toMatchObject({ ok: false, error: "invalid_state" });
    // hand the flag back so the other files keep their default team
    expect(await setDefaultTeamAction({ teamId: defaultTeamId })).toMatchObject({ ok: true, notice: "defaultSet" });
    expect(await archiveTeamAction({ teamId: escalationsId, archived: true })).toMatchObject({ ok: false, error: "confirmation_required" });
    expect(await archiveTeamAction({ teamId: escalationsId, archived: true, confirmed: true })).toMatchObject({ ok: true, notice: "archived" });
    const active = await asOps(t.db, (tx) => listTeamOptions(tx));
    expect(active.map((team) => team.id)).not.toContain(escalationsId);
    const withArchived = await asOps(t.db, (tx) => listTeamOptions(tx, { includeArchived: true }));
    expect(withArchived.map((team) => team.id)).toContain(escalationsId);
    expect(withArchived[withArchived.length - 1]!.id).toBe(escalationsId);
    // an archived team is no default for its members any more
    expect((await asOps(t.db, (tx) => defaultTeamForAgent(tx, leadId)))?.id).toBe(defaultTeamId);
    expect(await setDefaultTeamAction({ teamId: escalationsId })).toMatchObject({ ok: false, error: "invalid_state" });
    expect(await archiveTeamAction({ teamId: escalationsId, archived: false })).toMatchObject({ ok: true, notice: "restored" });
    expect(await removeTeamMemberAction({ teamId: escalationsId, userId: memberId })).toMatchObject({ ok: true, notice: "memberRemoved" });
    expect(await removeTeamMemberAction({ teamId: escalationsId, userId: memberId })).toMatchObject({ ok: false, error: "unchanged" });
    const actions = (await t.db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.targetType, "support_team"), eq(auditLog.targetId, escalationsId)))).map((a) => a.action);
    for (const action of ["platform.support_team.set_default", "platform.support_team.archive", "platform.support_team.restore", "platform.support_team.member_remove"]) expect(actions).toContain(action);
  });
});
