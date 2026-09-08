import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, organization, supportAgentSettings, supportEvents, supportSettings, supportTickets, user, withPlatform as asOps, withWorker as asWorker, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";

/**
 * Round-robin auto-assignment against the migrated test database: `autoAssignNewTicket` as `tracksite_worker`
 * (the inbound store's role) and `autoAssignTicketAfterCommit` on the application connection (the portal's
 * path). A pick must write three things in one transaction — `assignee_user_id`, the `assignee` event and the
 * `support.ticket.auto_assign` audit row (system actor, the ticket's organisation, ids and the pool only, the
 * source path in the metadata) — and every no-op (strategy `none`, nobody online, spam, already assigned)
 * must write nothing at all. The settings singleton is claimed and handed back like the other desk files.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, warnings: [] as unknown[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/db", () => ({
  db: () => holder.db,
  logger: { warn: vi.fn((...args: unknown[]) => holder.warnings.push(args)), error: vi.fn(), info: vi.fn() },
}));

import { AUTO_ASSIGN_ACTOR, AUTO_ASSIGN_AUDIT_ACTION, autoAssignNewTicket, autoAssignTicketAfterCommit } from "./auto-assign";

const t = testDb();
const stamp = Date.now();
let orgId = "";
let agentId = "";
let awayId = "";
let previousSettings: typeof supportSettings.$inferSelect | null = null;
const ticketIds: string[] = [];

/** the agent's name sorts first among idle operators other files may have left online, so the pick is deterministic */
const AGENT_NAME = "Aaron Auto";

async function setStrategy(strategy: "none" | "round_robin"): Promise<void> {
  await asOps(t.db, (tx) => tx.insert(supportSettings).values({ id: 1, autoAssignStrategy: strategy }).onConflictDoUpdate({ target: supportSettings.id, set: { autoAssignStrategy: strategy } }));
}

async function newTicket(input: { status?: "new" | "spam"; assigneeUserId?: string | null } = {}): Promise<string> {
  const [row] = await asOps(t.db, (tx) =>
    tx
      .insert(supportTickets)
      .values({ organizationId: orgId, requesterEmail: `req-auto-${stamp}-${ticketIds.length}@example.test`, subject: "Pixel fires twice", channel: "email", status: input.status ?? "new", assigneeUserId: input.assigneeUserId ?? null })
      .returning({ id: supportTickets.id }),
  );
  ticketIds.push(row!.id);
  return row!.id;
}

const rowsOf = (ticketId: string) =>
  asOps(t.db, async (tx) => {
    const [ticket] = await tx.select({ assigneeUserId: supportTickets.assigneeUserId, number: supportTickets.number }).from(supportTickets).where(eq(supportTickets.id, ticketId));
    const events = await tx.select({ kind: supportEvents.kind, actorKind: supportEvents.actorKind, actorUserId: supportEvents.actorUserId, payload: supportEvents.payload, organizationId: supportEvents.organizationId }).from(supportEvents).where(eq(supportEvents.ticketId, ticketId));
    const audits = await tx
      .select({ id: auditLog.id, actor: auditLog.actor, action: auditLog.action, targetType: auditLog.targetType, organizationId: auditLog.organizationId, diff: auditLog.diff, metadata: auditLog.metadata, requestId: auditLog.requestId })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, "support_ticket"), eq(auditLog.targetId, ticketId)));
    return { ticket: ticket!, events, audits };
  });

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db.insert(organization).values({ name: `Auto Assign ${stamp}`, slug: `auto-assign-${stamp}` }).returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: AGENT_NAME, email: `aaron-auto-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Zoe Away", email: `zoe-auto-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
    ])
    .returning({ id: user.id, name: user.name });
  agentId = users.find((u) => u.name === AGENT_NAME)!.id;
  awayId = users.find((u) => u.name === "Zoe Away")!.id;
  const now = new Date();
  // Aaron polled the console a moment ago (online); Zoe was last seen an hour ago (away)
  await t.db.insert(supportAgentSettings).values([
    { userId: agentId, lastSeenAt: now },
    { userId: awayId, lastSeenAt: new Date(now.getTime() - 3_600_000) },
  ]);
  await asOps(t.db, async (tx) => {
    const [stored] = await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
    previousSettings = stored ?? null;
  });
});

afterAll(async () => {
  await asOps(t.db, async (tx) => {
    if (previousSettings) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = previousSettings;
      await tx.insert(supportSettings).values({ id: 1, ...rest }).onConflictDoUpdate({ target: supportSettings.id, set: rest });
    } else await tx.delete(supportSettings).where(eq(supportSettings.id, 1));
    if (ticketIds.length) await tx.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
  });
  // support_agent_settings cascades from the user; audit_log is append-only by trigger and stays
  await t.db.delete(user).where(inArray(user.id, [agentId, awayId]));
  await t.close();
});

describe("autoAssignNewTicket as tracksite_worker (the inbound store's role)", () => {
  it("does nothing while the strategy is none", async () => {
    await setStrategy("none");
    const ticketId = await newTicket();
    const outcome = await asWorker(t.db, (tx) => autoAssignNewTicket(tx, { ticketId, organizationId: orgId, source: "inbound" }));
    expect(outcome).toEqual({ strategy: "none", assigneeUserId: null, candidates: 0, auditId: null });
    const { ticket, events, audits } = await rowsOf(ticketId);
    expect(ticket.assigneeUserId).toBeNull();
    expect(events).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("assigns the online agent and writes the event and the audit row together", async () => {
    await setStrategy("round_robin");
    const ticketId = await newTicket();
    const outcome = await asWorker(t.db, (tx) => autoAssignNewTicket(tx, { ticketId, organizationId: orgId, source: "inbound" }));
    expect(outcome.strategy).toBe("round_robin");
    expect(outcome.assigneeUserId).toBe(agentId);
    expect(outcome.candidates).toBeGreaterThanOrEqual(1);
    expect(outcome.auditId).toEqual(expect.any(String));

    const { ticket, events, audits } = await rowsOf(ticketId);
    expect(ticket.assigneeUserId).toBe(agentId);
    expect(events).toEqual([{ kind: "assignee", actorKind: "system", actorUserId: null, organizationId: orgId, payload: { from: null, to: agentId, self: false, reason: "round_robin", candidates: outcome.candidates, openTickets: 0 } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual({
      id: outcome.auditId,
      actor: AUTO_ASSIGN_ACTOR,
      action: AUTO_ASSIGN_AUDIT_ACTION,
      targetType: "support_ticket",
      organizationId: orgId,
      diff: { assigneeFrom: null, assigneeTo: agentId, reason: "round_robin", strategy: "round_robin", candidates: outcome.candidates, openTickets: 0 },
      metadata: { module: "support", ticketNumber: Number(ticket.number), source: "inbound" },
      requestId: null,
    });
    // ids and the pool only: no subject, no address, no user id of an operator who did not act
    const serialised = JSON.stringify(audits[0]);
    expect(serialised).not.toContain("Pixel fires twice");
    expect(serialised).not.toContain("@example.test");
    expect(serialised).not.toContain(awayId);
  });

  it("never overwrites: a second run on the assigned ticket, a spam ticket and a pre-assigned ticket write nothing", async () => {
    const assigned = ticketIds[ticketIds.length - 1]!;
    const again = await asWorker(t.db, (tx) => autoAssignNewTicket(tx, { ticketId: assigned, organizationId: orgId, source: "inbound" }));
    expect(again).toEqual({ strategy: "round_robin", assigneeUserId: null, candidates: 0, auditId: null });
    const after = await rowsOf(assigned);
    expect(after.ticket.assigneeUserId).toBe(agentId);
    expect(after.events).toHaveLength(1);
    expect(after.audits).toHaveLength(1);

    const spam = await newTicket({ status: "spam" });
    expect(await asWorker(t.db, (tx) => autoAssignNewTicket(tx, { ticketId: spam, organizationId: orgId, source: "inbound" }))).toMatchObject({ assigneeUserId: null, auditId: null });
    expect(await rowsOf(spam)).toMatchObject({ ticket: { assigneeUserId: null }, events: [], audits: [] });

    const manual = await newTicket({ assigneeUserId: awayId });
    expect(await asWorker(t.db, (tx) => autoAssignNewTicket(tx, { ticketId: manual, organizationId: orgId, source: "inbound" }))).toMatchObject({ assigneeUserId: null, auditId: null });
    expect(await rowsOf(manual)).toMatchObject({ ticket: { assigneeUserId: awayId }, events: [], audits: [] });
  });

  it("leaves the ticket unassigned when nobody is online — nothing is guessed, nothing is audited", async () => {
    const ticketId = await newTicket();
    // a clock a year ahead puts every heartbeat outside the online window
    const later = new Date(Date.now() + 365 * 86_400_000);
    const outcome = await asWorker(t.db, (tx) => autoAssignNewTicket(tx, { ticketId, organizationId: orgId, source: "inbound", now: later }));
    expect(outcome).toEqual({ strategy: "round_robin", assigneeUserId: null, candidates: 0, auditId: null });
    expect(await rowsOf(ticketId)).toMatchObject({ ticket: { assigneeUserId: null }, events: [], audits: [] });
  });
});

describe("autoAssignTicketAfterCommit (the portal's path on the application connection)", () => {
  it("assigns after the tenant commit and records the system audit row with the creating request id", async () => {
    await setStrategy("round_robin");
    const ticketId = await newTicket();
    const outcome = await autoAssignTicketAfterCommit({ ticketId, organizationId: orgId, source: "portal", requestId: `req-auto-${stamp}` });
    expect(outcome).toMatchObject({ strategy: "round_robin", assigneeUserId: agentId, auditId: expect.any(String) });
    const { ticket, events, audits } = await rowsOf(ticketId);
    expect(ticket.assigneeUserId).toBe(agentId);
    expect(events.map((e) => e.kind)).toEqual(["assignee"]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: AUTO_ASSIGN_AUDIT_ACTION, actor: AUTO_ASSIGN_ACTOR, organizationId: orgId, requestId: `req-auto-${stamp}`, diff: { assigneeTo: agentId }, metadata: { module: "support", ticketNumber: Number(ticket.number), source: "portal" } });
  });

  it("never throws: a failure leaves the ticket unassigned and logs a warning", async () => {
    holder.warnings.length = 0;
    const outcome = await autoAssignTicketAfterCommit({ ticketId: "not-a-ticket-id", organizationId: orgId, source: "portal" });
    expect(outcome).toBeNull();
    expect(holder.warnings).toHaveLength(1);
    expect(holder.warnings[0]![1]).toBe("support.auto_assign_failed");
    expect(holder.warnings[0]![0]).toMatchObject({ ticketId: "not-a-ticket-id" });
  });
});
