import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, organization, supportEvents, supportPresence, supportSlaPolicies, supportTickets, supportViews, user, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Runs the queue loaders and the bulk / view actions against the migrated test database as `tracksite_ops`:
 * a throwaway organisation, two operators, seven tickets in every workflow state (one without organisation
 * and without SLA policy), a fresh and a stale presence row and one personal view per operator. The platform
 * access layer is replaced by a minimal double (same transaction helper, same audit shape); Next's cache and
 * redirect are stubbed. Asserts the live counts of the default views, the filters (search, tags, plan,
 * organisation, SLA state, relative and absolute date ranges), presence, the export, and that every bulk
 * action leaves a timeline event and an audit row per ticket with the rules re-applied per ticket — status
 * and priority changes through the SLA engine with a policy row the test owns.
 */
const holder = vi.hoisted(() => ({
  db: null as unknown as Db,
  ctx: null as unknown as PlatformContext,
}));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/server/ops/platform", async () => {
  const { auditLog: audit, withPlatform: asOps } = await import("@track-site/db");
  const { newUlid } = await import("@track-site/core");
  class PlatformAccessError extends Error {}
  return {
    PlatformAccessError,
    requirePlatform: async () => holder.ctx,
    withPlatform: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => asOps(holder.db, fn as never),
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

import { bulkAssignTicketsAction, bulkMergeTicketsAction, bulkPriorityTicketsAction, bulkStatusTicketsAction, bulkTagTicketsAction, deleteSupportViewAction, exportTicketsAction, saveSupportViewAction } from "../ops/actions/support-tickets";
import { loadSupportNavBadge, loadSupportOperators, loadTickets, loadViewCounts } from "./tickets";
import { getSavedView, loadSavedViews, parseTicketFilters, resolveViewBase } from "./views";

const t = testDb();
const stamp = Date.now();
const NOW = new Date("2026-09-08T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

let orgId = "";
let opId = "";
let op2Id = "";
const tickets: Record<string, { id: string; number: number }> = {};
let myViewId = "";
let otherViewId = "";

const ctxFor = (userId: string, role: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN"): PlatformContext =>
  ({
    user: { id: userId, email: `${userId}@example.test`, name: "Ops", emailVerified: true, platformRole: role, locale: "en", twoFactorEnabled: true },
    platformRole: role,
    actor: { kind: "platform", userId, email: `${userId}@example.test`, platformRole: role },
    requestId: `req-${stamp}`,
  }) as PlatformContext;

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db
    .insert(organization)
    .values({ name: `Queue Test Org ${stamp}`, slug: `queue-test-${stamp}` })
    .returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Queue Tester", email: `queue-op-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Second Operator", email: `queue-op2-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
    ])
    .returning({ id: user.id });
  opId = users[0]!.id;
  op2Id = users[1]!.id;
  holder.ctx = ctxFor(opId, "PLATFORM_SUPPORT");
  const rows = await t.db
    .insert(supportTickets)
    .values([
      // t1: new, unassigned, urgent, first response overdue (live breach), tagged
      { organizationId: orgId, requesterEmail: `alice-${stamp}@example.test`, requesterName: "Alice Roe", subject: `Invoice missing ${stamp}`, status: "new", priority: "urgent", channel: "email", tags: ["billing", "vip"], firstResponseDueAt: hours(-1), resolutionDueAt: days(2), createdAt: hours(-3), updatedAt: hours(-1) },
      // t2: open, mine, on track
      { organizationId: orgId, requesterEmail: `bob-${stamp}@example.test`, requesterName: "Bob Roe", subject: `Pixel not firing ${stamp}`, status: "open", priority: "normal", channel: "dashboard", assigneeUserId: opId, firstResponseDueAt: hours(4), resolutionDueAt: days(3), createdAt: hours(-2), updatedAt: hours(-2) },
      // t3: pending, paused clock, assigned to the second operator
      { organizationId: orgId, requesterEmail: `carol-${stamp}@example.test`, subject: `Consent banner ${stamp}`, status: "pending", priority: "high", channel: "form", assigneeUserId: op2Id, firstResponseDueAt: hours(-2), firstRespondedAt: hours(-3), resolutionDueAt: hours(-1), pausedAt: hours(-2), createdAt: days(-1), updatedAt: hours(-2) },
      // t4: solved two days ago (in the 7-day window)
      { organizationId: orgId, requesterEmail: `dan-${stamp}@example.test`, subject: `Solved recently ${stamp}`, status: "solved", priority: "low", channel: "email", assigneeUserId: opId, firstResponseDueAt: days(-5), firstRespondedAt: days(-5), resolutionDueAt: days(-1), resolvedAt: days(-2), createdAt: days(-6), updatedAt: days(-2) },
      // t5: spam
      { organizationId: orgId, requesterEmail: `spam-${stamp}@example.test`, subject: `Buy now ${stamp}`, status: "spam", priority: "low", channel: "email", createdAt: days(-1), updatedAt: days(-1) },
      // t6: closed a month ago (outside the window)
      { organizationId: orgId, requesterEmail: `eve-${stamp}@example.test`, subject: `Old closed ${stamp}`, status: "closed", priority: "normal", channel: "api", assigneeUserId: op2Id, resolvedAt: days(-30), closedAt: days(-29), createdAt: days(-40), updatedAt: days(-29) },
      // t7: open, no organisation, no SLA policy, assigned to the second operator
      { organizationId: null, requesterEmail: `stranger-${stamp}@example.test`, subject: `Unknown sender ${stamp}`, status: "open", priority: "normal", channel: "email", assigneeUserId: op2Id, createdAt: hours(-5), updatedAt: hours(-5) },
    ])
    .returning({ id: supportTickets.id, number: supportTickets.number });
  ["t1", "t2", "t3", "t4", "t5", "t6", "t7"].forEach((key, i) => {
    tickets[key] = { id: rows[i]!.id, number: Number(rows[i]!.number) };
  });
  await t.db.insert(supportPresence).values([
    { ticketId: tickets.t1!.id, userId: op2Id, lastSeenAt: new Date(NOW.getTime() - 30_000), mode: "typing" },
    { ticketId: tickets.t2!.id, userId: op2Id, lastSeenAt: new Date(NOW.getTime() - 10 * 60_000), mode: "viewing" },
    { ticketId: tickets.t1!.id, userId: opId, lastSeenAt: NOW, mode: "viewing" },
  ]);
  const views = await t.db
    .insert(supportViews)
    .values([
      { ownerUserId: opId, name: "Urgent only", filters: { priority: ["urgent"] }, sort: "number_asc", position: 1 },
      { ownerUserId: op2Id, name: "Not mine", filters: { status: ["spam"] }, sort: "updated_desc", position: 1 },
    ])
    .returning({ id: supportViews.id });
  myViewId = views[0]!.id;
  otherViewId = views[1]!.id;
});

afterAll(async () => {
  const ids = Object.values(tickets).map((x) => x.id);
  if (ids.length) {
    await t.db.delete(supportEvents).where(inArray(supportEvents.ticketId, ids));
    await t.db.delete(supportTickets).where(inArray(supportTickets.id, ids));
  }
  await t.db.delete(supportViews).where(inArray(supportViews.ownerUserId, [opId, op2Id]));
  // audit_log is append-only (trigger); the integration global setup truncates it before the next run
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.db.delete(user).where(inArray(user.id, [opId, op2Id]));
  await t.close();
});

const numbersOf = (rows: Array<{ number: number }>) => rows.map((r) => r.number).sort((a, b) => a - b);
const n = (key: string) => tickets[key]!.number;

describe("view counts", () => {
  it("counts the default views and the operator's saved views live", async () => {
    const saved = await loadSavedViews(holder.ctx);
    expect(saved.map((v) => v.name)).toEqual(["Urgent only"]);
    const counts = await loadViewCounts(holder.ctx, saved, NOW);
    expect(counts.defaults).toEqual({ unassigned: 1, mine: 1, open: 4, pending: 1, breached: 1, solved_7d: 1, spam: 1 });
    expect(counts.saved).toEqual([{ id: myViewId, count: 1 }]);
    expect(await loadSupportNavBadge(holder.ctx, NOW)).toEqual({ unassigned: 1, mine: 1, breached: 1 });
  });

  it("hides other operators' personal views and resolves the queue base", async () => {
    expect(await getSavedView(holder.ctx, otherViewId)).toBeNull();
    const base = await resolveViewBase(holder.ctx, { view: otherViewId });
    expect(base).toMatchObject({ view: "open", missing: true });
    const own = await resolveViewBase(holder.ctx, { view: myViewId });
    expect(own).toMatchObject({ view: myViewId, sort: "number_asc", filters: { priority: ["urgent"] } });
  });
});

describe("loadTickets", () => {
  const load = async (q: Record<string, string | string[]>) => {
    const base = await resolveViewBase(holder.ctx, q);
    return loadTickets(holder.ctx, parseTicketFilters(q, base), NOW);
  };

  it("lists the open queue with SLA state, plan, assignee and fresh presence of other operators", async () => {
    const page = await load({ view: "open", sort: "priority_desc" });
    expect(page.total).toBe(4);
    expect(page.rows[0]!.number).toBe(n("t1"));
    const t1 = page.rows[0]!;
    expect(t1.sla).toMatchObject({ state: "breached", phase: "first_response" });
    expect(t1.organization?.id).toBe(orgId);
    expect(t1.planId).toBe("starter");
    expect(t1.tags).toEqual(["billing", "vip"]);
    expect(t1.viewers).toEqual([{ id: op2Id, name: "Second Operator", mode: "typing" }]);
    const t2 = page.rows.find((r) => r.number === n("t2"))!;
    expect(t2.assignee?.id).toBe(opId);
    expect(t2.sla.state).toBe("on_track");
    // the stale presence row is not shown
    expect(t2.viewers).toEqual([]);
    const t7 = page.rows.find((r) => r.number === n("t7"))!;
    expect(t7.organization).toBeNull();
    expect(t7.planId).toBeNull();
    expect(t7.sla.state).toBe("none");
  });

  it("applies search, tags, organisation, plan, assignee and SLA filters", async () => {
    expect(numbersOf((await load({ q: `#${n("t3")}`, status: "any" })).rows)).toEqual([n("t3")]);
    expect(numbersOf((await load({ q: "Alice", status: "any" })).rows)).toEqual([n("t1")]);
    expect((await load({ q: `Queue Test Org ${stamp}`, status: "any" })).total).toBe(6);
    expect(numbersOf((await load({ tags: "billing", status: "any" })).rows)).toEqual([n("t1")]);
    expect((await load({ tags: "billing,missing", status: "any" })).total).toBe(0);
    expect((await load({ org: `queue-test-${stamp}`, status: "any" })).total).toBe(6);
    expect((await load({ org: orgId, status: "any" })).total).toBe(6);
    expect((await load({ plan: "starter", status: "any", q: String(stamp) })).total).toBe(6);
    expect((await load({ plan: "growth", status: "any", q: String(stamp) })).total).toBe(0);
    expect(numbersOf((await load({ view: "open", assignee: op2Id })).rows)).toEqual([n("t3"), n("t7")]);
    expect(numbersOf((await load({ sla: "paused", status: "any" })).rows)).toEqual([n("t3")]);
    expect(numbersOf((await load({ sla: "on_track", status: "any", q: String(stamp) })).rows)).toEqual([n("t2")]);
    expect(numbersOf((await load({ sla: "breached", status: "any", q: String(stamp) })).rows)).toEqual([n("t1")]);
    expect(numbersOf((await load({ sla: "none", view: "open" })).rows)).toEqual([n("t7")]);
  });

  it("applies relative and absolute date ranges", async () => {
    expect(numbersOf((await load({ view: "solved_7d" })).rows)).toEqual([n("t4")]);
    expect(numbersOf((await load({ view: "solved_7d", lastDays: "60" })).rows)).toEqual([n("t4"), n("t6")]);
    // the filter form's checkbox lifts the view's date range as a whole
    expect(numbersOf((await load({ view: "solved_7d", dates: "any" })).rows)).toEqual([n("t4"), n("t6")]);
    const from = days(-7).toISOString().slice(0, 10);
    const to = days(-1).toISOString().slice(0, 10);
    expect(numbersOf((await load({ status: "any", dateField: "created", from, to, q: String(stamp) })).rows)).toEqual([n("t3"), n("t4"), n("t5")]);
    expect(numbersOf((await load({ status: "any", dateField: "updated", from: NOW.toISOString().slice(0, 10), q: String(stamp) })).rows)).toEqual([n("t1"), n("t2"), n("t3"), n("t7")]);
  });

  it("exports the filtered queue as metadata CSV and audits it", async () => {
    const result = await exportTicketsAction(`view=open&sort=number_asc&q=${stamp}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toBe(4);
    const lines = result.csv.trim().split("\r\n");
    expect(lines).toHaveLength(5);
    expect(lines[1]!.startsWith(`${n("t1")},${tickets.t1!.id},`)).toBe(true);
    expect(result.csv).not.toContain("alice-");
    const [audit] = await t.db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(and(eq(auditLog.requestId, `req-${stamp}`), eq(auditLog.action, "platform.support_ticket.export")));
    expect(audit?.metadata).toMatchObject({ rows: 4, total: 4, truncated: false, filters: { view: "open", sort: "number_asc" } });
  });
});

describe("bulk actions", () => {
  const eventsOf = async (ticketId: string, kind: string) => t.db.select({ payload: supportEvents.payload }).from(supportEvents).where(and(eq(supportEvents.ticketId, ticketId), eq(supportEvents.kind, kind as never)));
  const auditsOf = async (action: string) => t.db.select({ targetId: auditLog.targetId, organizationId: auditLog.organizationId, diff: auditLog.diff }).from(auditLog).where(and(eq(auditLog.requestId, `req-${stamp}`), eq(auditLog.action, action)));

  it("refuses without confirmation and with a non-operator assignee", async () => {
    expect(await bulkAssignTicketsAction({ ticketIds: [tickets.t1!.id], assigneeUserId: op2Id })).toMatchObject({ ok: false, error: "confirmation_required" });
    expect(await bulkAssignTicketsAction({ ticketIds: [tickets.t1!.id], assigneeUserId: orgId, confirmed: true })).toMatchObject({ ok: false, error: "invalid_assignee" });
    expect(await bulkStatusTicketsAction({ ticketIds: ["nope"], status: "open", confirmed: true })).toMatchObject({ ok: false, error: "invalid" });
  });

  it("assigns, skips unchanged tickets and audits per ticket with the organisation", async () => {
    const result = await bulkAssignTicketsAction({ ticketIds: [tickets.t1!.id, tickets.t3!.id], assigneeUserId: op2Id, confirmed: true });
    expect(result).toEqual({ ok: true, error: null, applied: 1, skipped: 1 });
    const [row] = await t.db.select({ assigneeUserId: supportTickets.assigneeUserId }).from(supportTickets).where(eq(supportTickets.id, tickets.t1!.id));
    expect(row?.assigneeUserId).toBe(op2Id);
    expect(await eventsOf(tickets.t1!.id, "assignee")).toEqual([{ payload: { from: null, to: op2Id, self: false } }]);
    const audits = await auditsOf("platform.support_ticket.assign");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ targetId: tickets.t1!.id, organizationId: orgId, diff: { from: null, to: op2Id, self: false, number: n("t1") } });
  });

  it("moves tickets along the workflow, reopens solved ones and skips impossible transitions", async () => {
    const result = await bulkStatusTicketsAction({ ticketIds: [tickets.t1!.id, tickets.t4!.id, tickets.t6!.id, tickets.t5!.id], status: "open", confirmed: true });
    // t1 new→open, t4 solved→open (reopened), t6 closed→open (reopened), t5 spam→open
    expect(result).toEqual({ ok: true, error: null, applied: 4, skipped: 0 });
    const [t4] = await t.db.select({ status: supportTickets.status, reopenCount: supportTickets.reopenCount, resolvedAt: supportTickets.resolvedAt, resolutionDueAt: supportTickets.resolutionDueAt }).from(supportTickets).where(eq(supportTickets.id, tickets.t4!.id));
    expect(t4).toMatchObject({ status: "open", reopenCount: 1, resolvedAt: null, resolutionDueAt: null });
    expect(await eventsOf(tickets.t4!.id, "reopened")).toHaveLength(1);
    // open → closed is not allowed (solved comes first): nothing applied, counted as skipped
    const refused = await bulkStatusTicketsAction({ ticketIds: [tickets.t5!.id], status: "closed", confirmed: true });
    expect(refused).toMatchObject({ ok: false, error: "nothing_applied", applied: 0, skipped: 1 });
    const [t5] = await t.db.select({ status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.id, tickets.t5!.id));
    expect(t5?.status).toBe("open");
    // pending pauses the clock, leaving it shifts the due times
    await bulkStatusTicketsAction({ ticketIds: [tickets.t2!.id], status: "pending", confirmed: true });
    const [paused] = await t.db.select({ pausedAt: supportTickets.pausedAt }).from(supportTickets).where(eq(supportTickets.id, tickets.t2!.id));
    expect(paused?.pausedAt).not.toBeNull();
    await bulkStatusTicketsAction({ ticketIds: [tickets.t2!.id], status: "open", confirmed: true });
    const [resumed] = await t.db.select({ pausedAt: supportTickets.pausedAt, pauseTotalMs: supportTickets.pauseTotalMs, firstResponseDueAt: supportTickets.firstResponseDueAt }).from(supportTickets).where(eq(supportTickets.id, tickets.t2!.id));
    expect(resumed?.pausedAt).toBeNull();
    expect(Number(resumed?.pauseTotalMs)).toBeGreaterThanOrEqual(0);
    expect(resumed!.firstResponseDueAt!.getTime()).toBeGreaterThanOrEqual(hours(4).getTime());
  });

  it("runs bulk status changes through the SLA engine with the ticket's policy", async () => {
    // the test owns its policy row (Mon–Fri 09:00–18:00 Europe/Berlin like the seed; other suites may touch the seeded default)
    const [policy] = await t.db
      .insert(supportSlaPolicies)
      .values({
        name: `Queue test policy ${stamp}`,
        priorities: { urgent: { first_response_minutes: 60, resolution_minutes: 480 }, normal: { first_response_minutes: 480, resolution_minutes: 4320 } },
        businessHours: { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } },
      })
      .returning({ id: supportSlaPolicies.id });
    try {
      const [created] = await t.db
        .insert(supportTickets)
        .values({ organizationId: orgId, requesterEmail: `frank-${stamp}@example.test`, subject: `Reopen me ${stamp}`, status: "solved", priority: "urgent", channel: "email", slaPolicyId: policy!.id, firstResponseDueAt: days(-3), firstRespondedAt: days(-3), resolutionDueAt: days(-2), resolvedAt: days(-2), createdAt: days(-3), updatedAt: days(-2) })
        .returning({ id: supportTickets.id, number: supportTickets.number });
      // registered for the cleanup in afterAll
      tickets.t8 = { id: created!.id, number: Number(created!.number) };
      const before = Date.now();
      expect(await bulkStatusTicketsAction({ ticketIds: [created!.id], status: "open", confirmed: true })).toEqual({ ok: true, error: null, applied: 1, skipped: 0 });
      const [reopened] = await t.db
        .select({ status: supportTickets.status, reopenCount: supportTickets.reopenCount, resolvedAt: supportTickets.resolvedAt, resolutionDueAt: supportTickets.resolutionDueAt, firstResponseDueAt: supportTickets.firstResponseDueAt, breachedResolution: supportTickets.breachedResolution })
        .from(supportTickets)
        .where(eq(supportTickets.id, created!.id));
      // with a policy the resolution target is recomputed from the reopening — not left to the worker, which skips tickets without one
      expect(reopened).toMatchObject({ status: "open", reopenCount: 1, resolvedAt: null, breachedResolution: false });
      expect(reopened!.resolutionDueAt).not.toBeNull();
      expect(reopened!.resolutionDueAt!.getTime()).toBeGreaterThan(before);
      // the first response was given: its clock is untouched
      expect(reopened!.firstResponseDueAt).toEqual(days(-3));
      expect((await eventsOf(created!.id, "status"))[0]?.payload).toMatchObject({ from: "solved", to: "open", pauseEndedMs: 0 });
      expect(await eventsOf(created!.id, "reopened")).toHaveLength(1);
      // pending → open books the pause; the resolution target moves by the business minutes of the pause (never backwards)
      await bulkStatusTicketsAction({ ticketIds: [created!.id], status: "pending", confirmed: true });
      await bulkStatusTicketsAction({ ticketIds: [created!.id], status: "open", confirmed: true });
      const [resumed] = await t.db.select({ pausedAt: supportTickets.pausedAt, pauseTotalMs: supportTickets.pauseTotalMs, resolutionDueAt: supportTickets.resolutionDueAt }).from(supportTickets).where(eq(supportTickets.id, created!.id));
      expect(resumed?.pausedAt).toBeNull();
      expect(Number(resumed?.pauseTotalMs)).toBeGreaterThanOrEqual(0);
      expect(resumed!.resolutionDueAt!.getTime()).toBeGreaterThanOrEqual(reopened!.resolutionDueAt!.getTime());
      // three status audits for this ticket (reopen, pending, open) — the query carries no order, so the
      // reopening is matched by its content rather than by its position
      const audits = (await auditsOf("platform.support_ticket.status")).filter((a) => a.targetId === created!.id);
      expect(audits).toHaveLength(3);
      expect(audits.map((a) => a.diff)).toEqual(expect.arrayContaining([expect.objectContaining({ from: "solved", to: "open", reopened: true, slaPolicyId: policy!.id, number: n("t8") })]));
    } finally {
      // the ticket's sla_policy_id is ON DELETE SET NULL; the ticket itself is removed in afterAll
      await t.db.delete(supportSlaPolicies).where(eq(supportSlaPolicies.id, policy!.id));
    }
  });

  it("changes priorities and tags with normalisation", async () => {
    // t1 is urgent already (skipped); t2 carries due times but no policy — they cannot be derived for the new priority and are cleared, never guessed
    expect(await bulkPriorityTicketsAction({ ticketIds: [tickets.t1!.id, tickets.t2!.id], priority: "urgent", confirmed: true })).toEqual({ ok: true, error: null, applied: 1, skipped: 1 });
    const [t2] = await t.db.select({ priority: supportTickets.priority, firstResponseDueAt: supportTickets.firstResponseDueAt, resolutionDueAt: supportTickets.resolutionDueAt }).from(supportTickets).where(eq(supportTickets.id, tickets.t2!.id));
    expect(t2).toEqual({ priority: "urgent", firstResponseDueAt: null, resolutionDueAt: null });
    expect(await eventsOf(tickets.t2!.id, "priority")).toEqual([{ payload: { from: "normal", to: "urgent" } }]);
    expect((await auditsOf("platform.support_ticket.priority")).find((a) => a.targetId === tickets.t2!.id)?.diff).toMatchObject({ from: "normal", to: "urgent", slaPolicyId: null, firstResponseDueAt: null, resolutionDueAt: null, number: n("t2") });
    expect(await bulkTagTicketsAction({ ticketIds: [tickets.t1!.id], add: ["Refund", "vip"], remove: ["billing"], confirmed: true })).toEqual({ ok: true, error: null, applied: 1, skipped: 0 });
    const [row] = await t.db.select({ tags: supportTickets.tags }).from(supportTickets).where(eq(supportTickets.id, tickets.t1!.id));
    expect(row?.tags).toEqual(["vip", "refund"]);
    expect(await eventsOf(tickets.t1!.id, "tags")).toEqual([{ payload: { added: ["refund"], removed: ["billing"] } }]);
    expect(await bulkTagTicketsAction({ ticketIds: [tickets.t1!.id], add: [], remove: [], confirmed: true })).toMatchObject({ ok: false, error: "invalid" });
  });

  it("moves the running SLA clocks with a bulk priority change through the engine, like the ticket page", async () => {
    const [policy] = await t.db
      .insert(supportSlaPolicies)
      .values({
        name: `Queue priority policy ${stamp}`,
        priorities: { urgent: { first_response_minutes: 60, resolution_minutes: 480 }, normal: { first_response_minutes: 480, resolution_minutes: 4320 } },
        businessHours: { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } },
      })
      .returning({ id: supportSlaPolicies.id });
    try {
      // an open, unanswered normal ticket: first response due Monday 15:00 CEST, resolution Wednesday 15:00 CEST (September 2026)
      const [created] = await t.db
        .insert(supportTickets)
        .values({ organizationId: orgId, requesterEmail: `grace-${stamp}@example.test`, subject: `Escalate me ${stamp}`, status: "open", priority: "normal", channel: "email", slaPolicyId: policy!.id, firstResponseDueAt: new Date("2026-09-14T13:00:00Z"), resolutionDueAt: new Date("2026-09-16T13:00:00Z"), createdAt: new Date("2026-09-14T05:00:00Z"), updatedAt: new Date("2026-09-14T05:00:00Z") })
        .returning({ id: supportTickets.id, number: supportTickets.number });
      tickets.t9 = { id: created!.id, number: Number(created!.number) };
      expect(await bulkPriorityTicketsAction({ ticketIds: [created!.id], priority: "urgent", confirmed: true })).toEqual({ ok: true, error: null, applied: 1, skipped: 0 });
      const [row] = await t.db
        .select({ priority: supportTickets.priority, firstResponseDueAt: supportTickets.firstResponseDueAt, resolutionDueAt: supportTickets.resolutionDueAt, breachedFirstResponse: supportTickets.breachedFirstResponse, breachedResolution: supportTickets.breachedResolution })
        .from(supportTickets)
        .where(eq(supportTickets.id, created!.id));
      // normal → urgent: 480 → 60 first-response minutes moves the target 420 business minutes earlier (Monday 15:00 → Friday 17:00 CEST,
      // not seven wall-clock hours); 4320 → 480 resolution minutes moves it 64 business hours earlier (Wednesday 15:00 → the Monday before, 14:00 CEST)
      expect(row).toMatchObject({ priority: "urgent", firstResponseDueAt: new Date("2026-09-11T15:00:00Z"), resolutionDueAt: new Date("2026-09-07T12:00:00Z") });
      // the breach flags follow the new due times against the clock of the action
      const wallClock = Date.now();
      expect(row!.breachedFirstResponse).toBe(row!.firstResponseDueAt!.getTime() < wallClock);
      expect(row!.breachedResolution).toBe(row!.resolutionDueAt!.getTime() < wallClock);
      expect(await eventsOf(created!.id, "priority")).toEqual([{ payload: { from: "normal", to: "urgent" } }]);
      const audit = (await auditsOf("platform.support_ticket.priority")).find((a) => a.targetId === created!.id);
      expect(audit).toMatchObject({ organizationId: orgId, diff: { from: "normal", to: "urgent", slaPolicyId: policy!.id, firstResponseDueAt: "2026-09-11T15:00:00.000Z", resolutionDueAt: "2026-09-07T12:00:00.000Z", number: n("t9") } });
      // the same priority again changes nothing
      expect(await bulkPriorityTicketsAction({ ticketIds: [created!.id], priority: "urgent", confirmed: true })).toMatchObject({ ok: false, error: "nothing_applied", applied: 0, skipped: 1 });
    } finally {
      // the ticket's sla_policy_id is ON DELETE SET NULL; the ticket itself is removed in afterAll
      await t.db.delete(supportSlaPolicies).where(eq(supportSlaPolicies.id, policy!.id));
    }
  });

  it("merges tickets into a target, closes the sources and refuses bad targets", async () => {
    expect(await bulkMergeTicketsAction({ ticketIds: [tickets.t2!.id], targetNumber: `#${n("t2")}`, confirmed: true })).toMatchObject({ ok: false, error: "invalid_target" });
    expect(await bulkMergeTicketsAction({ ticketIds: [tickets.t2!.id], targetNumber: 999_999_999, confirmed: true })).toMatchObject({ ok: false, error: "invalid_target" });
    const result = await bulkMergeTicketsAction({ ticketIds: [tickets.t2!.id, tickets.t7!.id], targetNumber: n("t1"), confirmed: true });
    expect(result).toEqual({ ok: true, error: null, applied: 2, skipped: 0 });
    const merged = await t.db.select({ id: supportTickets.id, status: supportTickets.status, mergedIntoId: supportTickets.mergedIntoId, closedAt: supportTickets.closedAt, resolvedAt: supportTickets.resolvedAt, breachedResolution: supportTickets.breachedResolution }).from(supportTickets).where(inArray(supportTickets.id, [tickets.t2!.id, tickets.t7!.id]));
    for (const row of merged) expect(row).toMatchObject({ status: "closed", mergedIntoId: tickets.t1!.id });
    expect(merged.every((r) => r.closedAt != null)).toBe(true);
    // a merge is not a resolution: no `resolved_at`, no late flag (the reports count `resolved_at`)
    expect(merged.every((r) => r.resolvedAt == null && r.breachedResolution === false)).toBe(true);
    // one `merged` event per source on the target, in the shape the ticket timeline reads
    const targetEvents = (await eventsOf(tickets.t1!.id, "merged")).map((e) => e.payload);
    expect(targetEvents).toHaveLength(2);
    expect(targetEvents).toEqual(expect.arrayContaining([{ direction: "from", ticketId: tickets.t2!.id, number: n("t2") }, { direction: "from", ticketId: tickets.t7!.id, number: n("t7") }]));
    expect(await eventsOf(tickets.t2!.id, "merged")).toEqual([{ payload: { direction: "into", ticketId: tickets.t1!.id, number: n("t1"), intoNumber: n("t1") } }]);
    expect((await eventsOf(tickets.t2!.id, "status")).map((e) => e.payload)).toContainEqual(expect.objectContaining({ from: "open", to: "closed", reason: "merged" }));
    // merged tickets are skipped by later status changes
    expect(await bulkStatusTicketsAction({ ticketIds: [tickets.t2!.id], status: "open", confirmed: true })).toMatchObject({ ok: false, error: "nothing_applied", skipped: 1 });
    const audits = await auditsOf("platform.support_ticket.merge");
    expect(audits.map((a) => a.targetId).sort()).toEqual([tickets.t2!.id, tickets.t7!.id].sort());
    // the unknown-sender ticket has no organisation on its audit row, the other one does
    expect(audits.find((a) => a.targetId === tickets.t7!.id)?.organizationId).toBeNull();
    expect(audits.find((a) => a.targetId === tickets.t2!.id)?.organizationId).toBe(orgId);
  });

  it("never merges a ticket into another organisation's ticket", async () => {
    const [otherOrg] = await t.db
      .insert(organization)
      .values({ name: `Queue Other Org ${stamp}`, slug: `queue-other-${stamp}` })
      .returning({ id: organization.id });
    const [foreign] = await t.db
      .insert(supportTickets)
      .values({ organizationId: otherOrg!.id, requesterEmail: `zoe-${stamp}@example.test`, subject: `Other tenant ${stamp}`, status: "open", priority: "normal", channel: "email" })
      .returning({ id: supportTickets.id });
    try {
      expect(await bulkMergeTicketsAction({ ticketIds: [foreign!.id], targetNumber: n("t1"), confirmed: true })).toMatchObject({ ok: false, error: "nothing_applied", applied: 0, skipped: 1 });
      const [row] = await t.db.select({ status: supportTickets.status, mergedIntoId: supportTickets.mergedIntoId }).from(supportTickets).where(eq(supportTickets.id, foreign!.id));
      expect(row).toEqual({ status: "open", mergedIntoId: null });
      expect(await eventsOf(foreign!.id, "merged")).toEqual([]);
      // the two `merged` events of the earlier test (one per source) are all the target has
      expect((await eventsOf(tickets.t1!.id, "merged")).length).toBe(2);
    } finally {
      await t.db.delete(supportTickets).where(eq(supportTickets.id, foreign!.id));
      await t.db.delete(organization).where(eq(organization.id, otherOrg!.id));
    }
  });
});

describe("saved views", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
    return fd;
  };

  it("creates a personal view from the editor form, redirects to its queue and audits it", async () => {
    const fd = form({ name: "Breached urgent", scope: "personal", sort: "sla_due_asc", status: ["new", "open"], priority: ["urgent"], sla: "breached", tags: "VIP, refund", lastDays: "30" });
    await expect(saveSupportViewAction({ ok: false, error: null }, fd)).rejects.toBeInstanceOf(RedirectSignal);
    const views = await loadSavedViews(holder.ctx);
    const created = views.find((v) => v.name === "Breached urgent")!;
    expect(created).toMatchObject({ scope: "personal", ownerUserId: opId, sort: "sla_due_asc", filters: { status: ["new", "open"], priority: ["urgent"], sla: "breached", tags: ["vip", "refund"], lastDays: 30 } });
    expect(created.position).toBe(2);
    // a support operator cannot create shared views; invalid input reports the field
    expect(await saveSupportViewAction({ ok: false, error: null }, form({ name: "Team", scope: "shared", sort: "updated_desc" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await saveSupportViewAction({ ok: false, error: null }, form({ name: "", scope: "personal", sort: "updated_desc" }))).toMatchObject({ ok: false, error: "invalid", fieldErrors: { name: "invalid" } });
    // editing another operator's personal view is not found; deleting the own one works
    expect(await saveSupportViewAction({ ok: false, error: null }, form({ id: otherViewId, name: "Hijack", scope: "personal", sort: "updated_desc" }))).toMatchObject({ ok: false, error: "not_found" });
    expect(await deleteSupportViewAction({ ok: false, error: null }, form({ id: created.id }))).toMatchObject({ ok: false, error: "confirmation_required" });
    await expect(deleteSupportViewAction({ ok: false, error: null }, form({ id: created.id, confirm: "true" }))).rejects.toBeInstanceOf(RedirectSignal);
    expect((await loadSavedViews(holder.ctx)).map((v) => v.name)).toEqual(["Urgent only"]);
  });

  it("lets an admin create and edit shared views", async () => {
    holder.ctx = ctxFor(op2Id, "PLATFORM_ADMIN");
    try {
      await expect(saveSupportViewAction({ ok: false, error: null }, form({ name: "Team queue", scope: "shared", sort: "updated_desc", channel: ["email"] }))).rejects.toBeInstanceOf(RedirectSignal);
      const shared = (await loadSavedViews(holder.ctx)).find((v) => v.name === "Team queue")!;
      expect(shared).toMatchObject({ scope: "shared", ownerUserId: null, filters: { channel: ["email"] } });
      await expect(saveSupportViewAction({ ok: false, error: null }, form({ id: shared.id, name: "Team queue 2", scope: "shared", sort: "number_desc" }))).rejects.toBeInstanceOf(RedirectSignal);
      expect((await getSavedView(holder.ctx, shared.id))?.name).toBe("Team queue 2");
      // the support operator sees the shared view but cannot delete it
      holder.ctx = ctxFor(opId, "PLATFORM_SUPPORT");
      expect((await loadSavedViews(holder.ctx)).map((v) => v.name).sort()).toEqual(["Team queue 2", "Urgent only"]);
      expect(await deleteSupportViewAction({ ok: false, error: null }, form({ id: shared.id, confirm: "true" }))).toMatchObject({ ok: false, error: "forbidden" });
      holder.ctx = ctxFor(op2Id, "PLATFORM_ADMIN");
      await expect(deleteSupportViewAction({ ok: false, error: null }, form({ id: shared.id, confirm: "true" }))).rejects.toBeInstanceOf(RedirectSignal);
    } finally {
      holder.ctx = ctxFor(opId, "PLATFORM_SUPPORT");
    }
  });

  it("lists operators for the assignee filter", async () => {
    const operators = await loadSupportOperators(holder.ctx);
    expect(operators.map((o) => o.id)).toEqual(expect.arrayContaining([opId, op2Id]));
    expect(operators.every((o) => o.platformRole === "PLATFORM_SUPPORT" || o.platformRole === "PLATFORM_ADMIN")).toBe(true);
  });
});
