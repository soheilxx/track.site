import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, member, organization, supportEvents, supportMessages, supportSettings, supportSlaPolicies, supportTeams, supportTickets, user, withPlatform as asOps, withTenant, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Agent-created tickets against the migrated test database (docs/18 §"Agent-created tickets and teams"):
 * `createAgentTicketAction` for a member (sent to the customer: `pending`, outbound `queued` → `sent`,
 * Reply-To plus address, both clocks waiting) and for a free address (note only: `open`, no mail, the known
 * account linked); the timeline and the audit rows without bodies or addresses; the requester search;
 * `applyFirstCustomerReply` starting the clocks once; the queue rows carrying `openedBy`, the team and the
 * pending flag. The transport is a stub that records what it was handed.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, ctx: null as unknown as PlatformContext, mails: [] as Array<Record<string, unknown>>, mailOk: true }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (mail: Record<string, unknown>) => {
    holder.mails.push(mail);
    return holder.mailOk ? { ok: true, transport: "file", id: `provider-${holder.mails.length}` } : { ok: false, transport: "none", error: "transport down" };
  }),
}));
vi.mock("@/server/db", () => ({ db: () => holder.db, logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/server/ops/platform", async () => {
  const { auditLog: audit, withPlatform: ops } = await import("@track-site/db");
  const { hasPlatformPermission, newUlid } = await import("@track-site/core");
  class PlatformAccessError extends Error {}
  const rank = { NONE: 0, PLATFORM_SUPPORT: 1, PLATFORM_ADMIN: 2 } as const;
  return {
    PlatformAccessError,
    requirePlatform: async (minRole: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN" = "PLATFORM_SUPPORT", permission?: Parameters<typeof hasPlatformPermission>[1]) => {
      const role = holder.ctx.platformRole as keyof typeof rank;
      if (rank[role] < rank[minRole]) throw new PlatformAccessError("insufficient_role");
      if (permission && !hasPlatformPermission(role, permission)) throw new PlatformAccessError("insufficient_role");
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

import { createAgentTicketAction, searchRequestersAction } from "@/server/ops/actions/support-new";
import { applyFirstCustomerReply, resolveRequester } from "./agent-tickets";
import { insertCustomerReply } from "./portal";
import { loadTickets } from "./tickets";
import { EMPTY_VIEW_FILTERS, type TicketFilters } from "./views";

const t = testDb();
const stamp = Date.now();
let orgId = "";
let agentId = "";
let requesterId = "";
let knownId = "";
let teamId = "";
let policyId = "";
let previousDefaultPolicyId: string | null = null;
const ticketIds: string[] = [];
/** the settings singleton as it was before this file (other files seed it with `onConflictDoNothing`): restored or removed afterwards */
let previousSettings: typeof supportSettings.$inferSelect | null = null;
const initial = { ok: false, error: null } as const;
const AGENT_NAME = "Nina Agent";

const ctxFor = (id: string, role: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN" | "NONE"): PlatformContext =>
  ({
    user: { id, name: AGENT_NAME, email: `agent-${stamp}@example.test`, emailVerified: true, platformRole: role, locale: "de", twoFactorEnabled: true },
    platformRole: role,
    actor: { kind: "platform", userId: id, email: `agent-${stamp}@example.test`, platformRole: role },
    requestId: `req-${stamp}`,
  }) as PlatformContext;

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const baseFilters: TicketFilters = { ...EMPTY_VIEW_FILTERS, view: null, q: null, sort: "updated_desc", page: 1 };

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db.insert(organization).values({ name: `Agent Tickets Org ${stamp}`, slug: `agent-tickets-${stamp}` }).returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: AGENT_NAME, email: `agent-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT", locale: "de" },
      { name: "Rita Requester", email: `rita-${stamp}@example.test`, platformRole: "NONE", locale: "fr" },
      { name: "Kim Known", email: `Kim-${stamp}@Example.test`, platformRole: "NONE", locale: "nl" },
    ])
    .returning({ id: user.id, name: user.name });
  const id = (name: string) => users.find((u) => u.name === name)!.id;
  agentId = id(AGENT_NAME);
  requesterId = id("Rita Requester");
  knownId = id("Kim Known");
  await t.db.insert(member).values([
    { organizationId: orgId, userId: requesterId, role: "ADMIN" },
    { organizationId: orgId, userId: knownId, role: "DEVELOPER" },
  ]);
  holder.ctx = ctxFor(agentId, "PLATFORM_SUPPORT");
  await asOps(t.db, async (tx) => {
    const [team] = await tx.insert(supportTeams).values({ slug: `agent-team-${stamp}`, name: `Agent Team ${stamp}`, isDefault: false }).returning({ id: supportTeams.id });
    teamId = team!.id;
    // the file owns the default policy while it runs (files run one after another): another file's default
    // may carry other targets or business hours, and the due times below are asserted to the minute
    const [existingDefault] = await tx.select({ id: supportSlaPolicies.id }).from(supportSlaPolicies).where(eq(supportSlaPolicies.isDefault, true)).limit(1);
    if (existingDefault) {
      previousDefaultPolicyId = existingDefault.id;
      await tx.update(supportSlaPolicies).set({ isDefault: false }).where(eq(supportSlaPolicies.id, existingDefault.id));
    }
    const [policy] = await tx
      .insert(supportSlaPolicies)
      .values({ name: `Default ${stamp}`, planIds: null, isDefault: true, priorities: { normal: { first_response_minutes: 60, resolution_minutes: 240 }, high: { first_response_minutes: 30, resolution_minutes: 120 } }, businessHours: { timezone: "Europe/Berlin", days: {} } })
      .returning({ id: supportSlaPolicies.id });
    policyId = policy!.id;
    previousSettings = (await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1))[0] ?? null;
    await tx.insert(supportSettings).values({ id: 1, autoAssignStrategy: "none" }).onConflictDoUpdate({ target: supportSettings.id, set: { autoAssignStrategy: "none" } });
  });
});

afterAll(async () => {
  await asOps(t.db, async (tx) => {
    if (ticketIds.length) await tx.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
    await tx.delete(supportTeams).where(eq(supportTeams.id, teamId));
    await tx.delete(supportSlaPolicies).where(eq(supportSlaPolicies.id, policyId));
    if (previousSettings) await tx.update(supportSettings).set({ autoAssignStrategy: previousSettings.autoAssignStrategy }).where(eq(supportSettings.id, 1));
    else await tx.delete(supportSettings).where(eq(supportSettings.id, 1));
    if (previousDefaultPolicyId) await tx.update(supportSlaPolicies).set({ isDefault: true }).where(eq(supportSlaPolicies.id, previousDefaultPolicyId));
  });
  await t.db.delete(member).where(eq(member.organizationId, orgId));
  await t.db.delete(user).where(inArray(user.id, [agentId, requesterId, knownId]));
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.close();
});

const ticketRows = (ticketId: string) =>
  asOps(t.db, async (tx) => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    const messages = await tx.select().from(supportMessages).where(eq(supportMessages.ticketId, ticketId));
    const events = await tx.select({ kind: supportEvents.kind, actorKind: supportEvents.actorKind, actorUserId: supportEvents.actorUserId, payload: supportEvents.payload }).from(supportEvents).where(eq(supportEvents.ticketId, ticketId)).orderBy(supportEvents.createdAt);
    const audits = await tx.select({ action: auditLog.action, organizationId: auditLog.organizationId, diff: auditLog.diff, metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.targetType, "support_ticket"), eq(auditLog.targetId, ticketId)));
    return { ticket: ticket!, messages, events, audits };
  });

describe("requester search and resolution", () => {
  it("finds organisations and members by name, slug and address; refuses a short query and a customer role", async () => {
    const found = await searchRequestersAction(`rita-${stamp}`);
    expect(found.ok).toBe(true);
    expect(found.results.members.map((m) => m.userId)).toEqual([requesterId]);
    expect(found.results.members[0]).toMatchObject({ name: "Rita Requester", locale: "fr", organization: { id: orgId, slug: `agent-tickets-${stamp}` } });
    const byOrg = await searchRequestersAction(`agent-tickets-${stamp}`);
    expect(byOrg.results.organisations.map((o) => o.id)).toEqual([orgId]);
    expect(byOrg.results.members.map((m) => m.userId).sort()).toEqual([requesterId, knownId].sort());
    expect(await searchRequestersAction("r")).toMatchObject({ ok: false, error: "invalid" });
    holder.ctx = ctxFor(agentId, "NONE");
    expect(await searchRequestersAction("rita")).toMatchObject({ ok: false, error: "forbidden" });
    holder.ctx = ctxFor(agentId, "PLATFORM_SUPPORT");
  });

  it("resolves a member, refuses a non-member, and links a known free address (one membership) to its organisation", async () => {
    await asOps(t.db, async (tx) => {
      expect(await resolveRequester(tx, { mode: "member", userId: requesterId, organizationId: orgId })).toMatchObject({ userId: requesterId, email: `rita-${stamp}@example.test`, organizationId: orgId, locale: "fr", membershipCount: 1 });
      expect(await resolveRequester(tx, { mode: "member", userId: agentId, organizationId: orgId })).toBeNull();
      expect(await resolveRequester(tx, { mode: "email", email: `KIM-${stamp}@example.TEST`, name: null })).toMatchObject({ userId: knownId, email: `kim-${stamp}@example.test`, name: "Kim Known", organizationId: orgId, locale: "nl" });
      expect(await resolveRequester(tx, { mode: "email", email: `stranger-${stamp}@example.test`, name: " Sam Stranger " })).toEqual({ userId: null, email: `stranger-${stamp}@example.test`, name: "Sam Stranger", organizationId: null, locale: null, membershipCount: 0 });
    });
  });
});

describe("createAgentTicketAction", () => {
  it("refuses a customer account and validates the form per field", async () => {
    holder.ctx = ctxFor(agentId, "NONE");
    expect(await createAgentTicketAction(initial, form({ subject: "x", body: "y" }))).toMatchObject({ ok: false, error: "forbidden" });
    holder.ctx = ctxFor(agentId, "PLATFORM_SUPPORT");
    const invalid = await createAgentTicketAction(initial, form({ requesterMode: "email", requesterEmail: "nope", subject: "ab", body: "" }));
    expect(invalid).toMatchObject({ ok: false, error: "invalid" });
    expect(invalid.fieldErrors).toMatchObject({ requesterEmail: "email", subject: "required", body: "required" });
    expect(await createAgentTicketAction(initial, form({ requesterMode: "member", subject: "Valid subject", body: "Valid body" }))).toMatchObject({ ok: false, error: "invalid", fieldErrors: { requester: "required" } });
    expect(await createAgentTicketAction(initial, form({ requesterMode: "member", requesterUserId: agentId, requesterOrganizationId: orgId, subject: "Valid subject", body: "Valid body" }))).toMatchObject({ ok: false, error: "invalid_requester" });
    expect(await createAgentTicketAction(initial, form({ requesterMode: "email", requesterEmail: `x-${stamp}@example.test`, subject: "Valid subject", body: "Valid body", teamId: "00000000-0000-4000-8000-0000000000ff" }))).toMatchObject({ ok: false, error: "invalid_team" });
    expect(await asOps(t.db, (tx) => tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.requesterEmail, `x-${stamp}@example.test`)))).toEqual([]);
  });

  it("opens a member's ticket, mails the opening message with the plus address, waits for the customer and keeps the SLA clocks pending", async () => {
    holder.mails = [];
    const result = await createAgentTicketAction(
      initial,
      form({
        requesterMode: "member",
        requesterUserId: requesterId,
        requesterOrganizationId: orgId,
        subject: `Call follow-up ${stamp}`,
        body: "Hello {requester_name}, as discussed on the phone. Ticket {ticket_number} tracks it.\r\n\r\nBest, Nina",
        priority: "high",
        category: "tracking",
        tags: "Phone, VIP, phone",
        teamId,
        assignToMe: "on",
        sendToCustomer: "on",
        locale: "fr",
      }),
    );
    expect(result).toMatchObject({ ok: true, error: null, sent: true, mailFailed: false });
    expect(result.ticketId).toBeTruthy();
    ticketIds.push(result.ticketId!);
    const { ticket, messages, events, audits } = await ticketRows(result.ticketId!);
    expect(ticket).toMatchObject({
      channel: "agent",
      openedBy: "agent",
      status: "pending",
      priority: "high",
      category: "tracking",
      tags: ["phone", "vip"],
      teamId,
      assigneeUserId: agentId,
      requesterUserId: requesterId,
      organizationId: orgId,
      requesterEmail: `rita-${stamp}@example.test`,
      locale: "fr",
      slaPolicyId: policyId,
      slaPendingFirstCustomerReply: true,
      firstResponseDueAt: null,
      resolutionDueAt: null,
      firstRespondedAt: null,
    });
    expect(ticket.pausedAt).not.toBeNull();
    expect(ticket.lastAgentMessageAt).not.toBeNull();
    expect(Number(ticket.number)).toBe(result.number);
    expect(messages).toHaveLength(1);
    const [message] = messages;
    // the stub transport is "file": like the composer's send path, only a Resend id is stored as `provider_message_id` (the delivery webhooks match it)
    expect(message).toMatchObject({ direction: "outbound", authorKind: "agent", authorUserId: agentId, deliveryStatus: "sent", deliveryClaimedAt: null, providerMessageId: null, toEmails: [`rita-${stamp}@example.test`] });
    expect(message!.textBody).toContain(`Ticket ${result.number} tracks it`);
    expect(message!.messageId).toMatch(new RegExp(`^t${result.number}\\.[0-9a-z]+@`));
    expect(message!.htmlBody).toContain("<p>");
    expect(events.map((e) => e.kind)).toEqual(["created", "assignee", "reply"]);
    expect(events[0]!.payload).toMatchObject({ channel: "agent", openedBy: "agent", status: "pending", teamId, sendToCustomer: true, requesterLinked: true, organizationMatched: true, slaPolicyId: policyId, slaPendingFirstCustomerReply: true });
    expect(events[1]!.payload).toMatchObject({ from: null, to: agentId, self: true });
    expect(events[2]!.payload).toMatchObject({ messageId: message!.id, firstResponse: false, opening: true });
    expect(holder.mails).toHaveLength(1);
    // the reply domain is whatever the settings row (or its default) says at this point of the suite — the plus address is the invariant
    expect(holder.mails[0]).toMatchObject({ subject: `Re: [Track #${result.number}] Call follow-up ${stamp}` });
    expect(String(holder.mails[0]!.replyTo)).toMatch(new RegExp(`^support\\+t${result.number}@[a-z0-9.-]+$`));
    expect(String(holder.mails[0]!.to)).toContain(`rita-${stamp}@example.test`);
    // placeholders other than the ticket number are the client's job (the operator sees the substituted text before sending)
    expect(String(holder.mails[0]!.text)).toContain(`Hello {requester_name}, as discussed on the phone. Ticket ${result.number} tracks it.`);
    expect(String(holder.mails[0]!.text)).toContain(AGENT_NAME);
    expect(audits.map((a) => a.action).sort()).toEqual(["platform.support_ticket.create", "platform.support_ticket.send"]);
    const create = audits.find((a) => a.action === "platform.support_ticket.create")!;
    expect(create.organizationId).toBe(orgId);
    expect(create.diff).toMatchObject({ ticketNumber: result.number, channel: "agent", openedBy: "agent", status: "pending", teamId, assigneeUserId: agentId, sendToCustomer: true, slaPendingFirstCustomerReply: true, tags: ["phone", "vip"] });
    expect(create.metadata).toMatchObject({ module: "support", openedBy: "agent" });
    for (const audit of audits) {
      const text = JSON.stringify(audit);
      expect(text).not.toContain("as discussed");
      expect(text).not.toContain(`rita-${stamp}@example.test`);
      expect(text).not.toContain("Rita Requester");
    }
  });

  it("opens a note-only ticket for a free address, links the known account, sends nothing and reports a refused transport honestly", async () => {
    holder.mails = [];
    const result = await createAgentTicketAction(initial, form({ requesterMode: "email", requesterEmail: `kim-${stamp}@example.test`, requesterName: "", subject: `Noticed something ${stamp}`, body: "Internal note only", locale: "nl" }));
    expect(result).toMatchObject({ ok: true, sent: false });
    ticketIds.push(result.ticketId!);
    const { ticket, messages, events } = await ticketRows(result.ticketId!);
    expect(ticket).toMatchObject({ status: "open", openedBy: "agent", pausedAt: null, requesterUserId: knownId, organizationId: orgId, requesterName: "Kim Known", assigneeUserId: null, teamId: null, lastAgentMessageAt: null });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: "note", deliveryStatus: "na", messageId: null, toEmails: [] });
    expect(events.map((e) => e.kind)).toEqual(["created", "note"]);
    expect(holder.mails).toHaveLength(0);

    holder.mailOk = false;
    const failed = await createAgentTicketAction(initial, form({ requesterMode: "email", requesterEmail: `stranger-${stamp}@example.test`, requesterName: "Sam Stranger", subject: `Transport down ${stamp}`, body: "Will fail to send", sendToCustomer: "on" }));
    holder.mailOk = true;
    expect(failed).toMatchObject({ ok: true, sent: false, mailFailed: true });
    ticketIds.push(failed.ticketId!);
    const stranger = await ticketRows(failed.ticketId!);
    expect(stranger.ticket).toMatchObject({ requesterUserId: null, organizationId: null, slaPendingFirstCustomerReply: true, status: "pending" });
    expect(stranger.messages[0]).toMatchObject({ direction: "outbound", deliveryStatus: "failed", deliveryError: "transport down" });
    expect(stranger.audits.find((a) => a.action === "platform.support_ticket.send")!.diff).toMatchObject({ ok: false, error: "transport down", opening: true });
  });

  it("shows the opened-by flag, the team and the pending clocks in the queue", async () => {
    const page = await loadTickets(ctxFor(agentId, "PLATFORM_SUPPORT"), { ...baseFilters, q: String(stamp) });
    const first = page.rows.find((r) => r.id === ticketIds[0])!;
    expect(first).toMatchObject({ openedBy: "agent", channel: "agent", slaPendingFirstCustomerReply: true, team: { id: teamId, slug: `agent-team-${stamp}` } });
    expect(first.sla.state).toBe("none");
    const second = page.rows.find((r) => r.id === ticketIds[1])!;
    expect(second).toMatchObject({ openedBy: "agent", team: null });
  });
});

describe("applyFirstCustomerReply", () => {
  it("starts both clocks from the reply once, resets the breach flags and clears the flag; a second call and other tickets are no-ops", async () => {
    const ticketId = ticketIds[0]!;
    const at = new Date("2026-09-10T08:00:00Z");
    const first = await asOps(t.db, (tx) => applyFirstCustomerReply(tx, ticketId, at));
    expect(first).toMatchObject({ applied: true, policyId });
    // the default policy of the test runs around the clock: high = 30 min / 120 min
    expect(first.firstResponseDueAt?.toISOString()).toBe("2026-09-10T08:30:00.000Z");
    expect(first.resolutionDueAt?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    const [row] = await asOps(t.db, (tx) => tx.select({ pending: supportTickets.slaPendingFirstCustomerReply, first: supportTickets.firstResponseDueAt, resolution: supportTickets.resolutionDueAt, bf: supportTickets.breachedFirstResponse, br: supportTickets.breachedResolution, start: supportTickets.slaClockStartedAt, firstTarget: supportTickets.firstResponseTargetMs, resolutionTarget: supportTickets.resolutionTargetMs }).from(supportTickets).where(eq(supportTickets.id, ticketId)));
    // the persisted clock run (0018) starts at the reply with the booked targets, so the worker and a priority change measure from here
    expect(row).toMatchObject({ pending: false, bf: false, br: false, firstTarget: 30 * 60_000, resolutionTarget: 120 * 60_000 });
    expect(row!.start?.toISOString()).toBe(at.toISOString());
    expect(row!.first?.toISOString()).toBe("2026-09-10T08:30:00.000Z");
    expect(row!.resolution?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    expect(await asOps(t.db, (tx) => applyFirstCustomerReply(tx, ticketId, new Date()))).toMatchObject({ applied: false });
    expect(await asOps(t.db, (tx) => applyFirstCustomerReply(tx, "00000000-0000-4000-8000-0000000000aa", new Date()))).toMatchObject({ applied: false });
    // a ticket whose first response was already stamped keeps that clock untouched
    const noteOnly = ticketIds[1]!;
    await asOps(t.db, (tx) => tx.update(supportTickets).set({ firstRespondedAt: at }).where(eq(supportTickets.id, noteOnly)));
    const second = await asOps(t.db, (tx) => applyFirstCustomerReply(tx, noteOnly, at));
    expect(second).toMatchObject({ applied: true, firstResponseDueAt: null });
    expect(second.resolutionDueAt).not.toBeNull();
    const [note] = await asOps(t.db, (tx) => tx.select({ first: supportTickets.firstResponseDueAt, resolution: supportTickets.resolutionDueAt, pending: supportTickets.slaPendingFirstCustomerReply }).from(supportTickets).where(eq(supportTickets.id, noteOnly)));
    expect(note).toMatchObject({ first: null, pending: false });
    expect(note!.resolution).not.toBeNull();
  });

  it("is wired into the portal reply: a customer answer under the tenant role ends the pause and starts the clocks", async () => {
    holder.mails = [];
    const created = await createAgentTicketAction(initial, form({ requesterMode: "member", requesterUserId: requesterId, requesterOrganizationId: orgId, subject: `Portal reply ${stamp}`, body: "Please confirm the details.", priority: "normal", sendToCustomer: "on", locale: "fr" }));
    expect(created).toMatchObject({ ok: true, sent: true });
    ticketIds.push(created.ticketId!);
    const before = (await ticketRows(created.ticketId!)).ticket;
    expect(before).toMatchObject({ status: "pending", slaPendingFirstCustomerReply: true, firstResponseDueAt: null, resolutionDueAt: null });
    const at = new Date("2026-09-10T09:00:00Z");
    // the customer replies from /app/support: RLS as tracksite_app, which may read policies but not the desk settings
    const reply = await withTenant(t.db, orgId, (tx) => insertCustomerReply(tx, { ticket: { ...before, organizationId: orgId }, author: { userId: requesterId, email: `rita-${stamp}@example.test` }, body: "Confirmed, thanks.", now: at }));
    expect(reply).toMatchObject({ statusFrom: "pending", statusTo: "open", reopened: false });
    const after = (await ticketRows(created.ticketId!)).ticket;
    expect(after).toMatchObject({ status: "open", pausedAt: null, slaPendingFirstCustomerReply: false, firstResponseTargetMs: 60 * 60_000, resolutionTargetMs: 240 * 60_000 });
    // the default policy of the test runs around the clock: normal = 60 min / 240 min, from the reply
    expect(after.firstResponseDueAt?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    expect(after.resolutionDueAt?.toISOString()).toBe("2026-09-10T13:00:00.000Z");
    expect(after.slaClockStartedAt?.toISOString()).toBe(at.toISOString());
  });
});
