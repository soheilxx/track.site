import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, organization, supportAttachments, supportEvents, supportMacros, supportMessages, supportPresence, supportSettings, supportSlaPolicies, supportTickets, user, withPlatform as asOps, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Ticket detail against the migrated test database as `tracksite_ops`: an organisation, two operators and
 * a customer account, an SLA policy, one global and one personal macro, a ticket with an inbound message.
 * The platform access layer is a minimal double (same transaction helper, same audit shape); the ticket
 * mail transport is stubbed. Asserts the loader's shape, the compose / finalize flow (mail, threading,
 * first response, take-over, macro actions, attachments on a queued message), the workflow actions with
 * their events and audit rows (never bodies), merge, presence and the attachment gate.
 */
const holder = vi.hoisted(() => ({
  db: null as unknown as Db,
  ctx: null as unknown as PlatformContext,
  mails: [] as Array<{ to: string; subject: string; text: string; html?: string; replyTo?: string; messageId?: string; inReplyTo?: string; attachments?: Array<{ filename: string; content: Buffer | string }> }>,
  failNext: false,
  /** a slow transport, so two concurrent sends really overlap */
  delayMs: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (mail: (typeof holder.mails)[number]) => {
    if (holder.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, holder.delayMs));
    holder.mails.push(mail);
    if (holder.failNext) {
      holder.failNext = false;
      return { ok: false, transport: "smtp", error: "smtp down" };
    }
    return { ok: true, transport: "file", id: "outbox" };
  }),
}));
vi.mock("@/server/ops/platform", async () => {
  const { auditLog: audit, withPlatform: ops } = await import("@track-site/db");
  const { newUlid } = await import("@track-site/core");
  class PlatformAccessError extends Error {}
  return {
    PlatformAccessError,
    requirePlatform: async () => holder.ctx,
    withPlatform: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => ops(holder.db, fn as never),
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

import { newUlid } from "@track-site/core";
import { assignTicketAction, composeTicketMessageAction, finalizeTicketMessageAction, mergeTicketAction, presenceHeartbeatAction, presenceLeaveAction, setTicketPriorityAction, setTicketStatusAction, setTicketTagsAction } from "@/server/ops/actions/support-ticket";
import { assertMessageAttachable, loadAttachmentForDownload, loadTicketDetail } from "./ticket";

const t = testDb();
const stamp = Date.now();
let orgId = "";
let operatorId = "";
let secondOperatorId = "";
let customerId = "";
let policyId = "";
let ticketId = "";
let otherTicketId = "";
/** a ticket created ten days ago, still `new`: the reopen / priority arithmetic must not lean on its age */
let oldTicketId = "";
/** an audit row of another operator on the organisation: invisible to a support agent's sidebar */
let foreignAuditId = "";
/** a ticket of another organisation: never a merge partner (the link would be customer-visible on both sides) */
let foreignOrgId = "";
let foreignTicketId = "";

beforeAll(async () => {
  holder.db = t.db;
  const orgs = await t.db
    .insert(organization)
    .values([
      { name: `Ticket Test ${stamp}`, slug: `ticket-test-${stamp}` },
      { name: `Ticket Foreign ${stamp}`, slug: `ticket-foreign-${stamp}` },
    ])
    .returning({ id: organization.id, slug: organization.slug });
  orgId = orgs.find((o) => o.slug === `ticket-test-${stamp}`)!.id;
  foreignOrgId = orgs.find((o) => o.slug === `ticket-foreign-${stamp}`)!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Marco Rossi", email: `ticket-op-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Second Operator", email: `ticket-op2-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
      { name: "Ada Customer", email: `ticket-customer-${stamp}@example.test`, platformRole: "NONE" },
    ])
    .returning({ id: user.id, name: user.name });
  operatorId = users.find((u) => u.name === "Marco Rossi")!.id;
  secondOperatorId = users.find((u) => u.name === "Second Operator")!.id;
  customerId = users.find((u) => u.name === "Ada Customer")!.id;
  holder.ctx = {
    user: { id: operatorId, name: "Marco Rossi", email: `ticket-op-${stamp}@example.test`, emailVerified: true, platformRole: "PLATFORM_SUPPORT", locale: "en", twoFactorEnabled: true },
    platformRole: "PLATFORM_SUPPORT",
    actor: { kind: "platform", userId: operatorId, email: `ticket-op-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
    requestId: `req-${stamp}`,
  };
  await asOps(t.db, async (tx) => {
    // the integration global setup truncates seeds: a 24/7 policy and the settings row stand in for the migration's rows
    const [existing] = await tx.select({ id: supportSlaPolicies.id }).from(supportSlaPolicies).where(eq(supportSlaPolicies.isDefault, true)).limit(1);
    if (existing) policyId = existing.id;
    else {
      const [policy] = await tx
        .insert(supportSlaPolicies)
        .values({ name: "test 24/7", isDefault: true, priorities: { normal: { first_response_minutes: 60, resolution_minutes: 240 }, urgent: { first_response_minutes: 15, resolution_minutes: 60 } }, businessHours: { timezone: "UTC", days: {} }, escalation: { warning_percent: 80 } })
        .returning({ id: supportSlaPolicies.id });
      policyId = policy!.id;
    }
    await tx.insert(supportSettings).values({ id: 1, inboundDomain: "support.test.local", fromName: "Track Support", fromAddress: "support@test.local", signatureText: "Track team" }).onConflictDoNothing();
    await tx.insert(supportMacros).values([
      { name: "Acknowledge", bodyText: "Hi {{requester.first_name}}, ticket {{ticket.number}}.", scope: "global", ownerUserId: null, actions: { status: "open", tags_add: ["acknowledged"], assign_to_self: true } },
      { name: "Someone else's", bodyText: "private", scope: "personal", ownerUserId: secondOperatorId, actions: {} },
    ]);
    const created = new Date(Date.now() - 30 * 60_000);
    const longAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000);
    const tickets = await tx
      .insert(supportTickets)
      .values([
        { organizationId: orgId, requesterUserId: customerId, requesterEmail: `ticket-customer-${stamp}@example.test`, requesterName: "Ada Customer", subject: "Pixel does not fire", channel: "email", status: "new", priority: "normal", slaPolicyId: policyId, firstResponseDueAt: new Date(created.getTime() + 60 * 60_000), resolutionDueAt: new Date(created.getTime() + 240 * 60_000), lastCustomerMessageAt: created, locale: "de", createdAt: created, tags: ["tracking"] },
        { organizationId: orgId, requesterEmail: `ticket-customer-${stamp}@example.test`, subject: "Duplicate report", channel: "form", status: "open" },
        { organizationId: orgId, requesterEmail: `ticket-customer-${stamp}@example.test`, subject: "Old question", channel: "email", status: "new", priority: "normal", slaPolicyId: policyId, firstResponseDueAt: new Date(longAgo.getTime() + 60 * 60_000), resolutionDueAt: new Date(longAgo.getTime() + 240 * 60_000), lastCustomerMessageAt: longAgo, createdAt: longAgo },
        { organizationId: foreignOrgId, requesterEmail: `ticket-foreign-${stamp}@example.test`, subject: "Foreign tenant", channel: "form", status: "open" },
      ])
      .returning({ id: supportTickets.id, subject: supportTickets.subject });
    ticketId = tickets.find((r) => r.subject === "Pixel does not fire")!.id;
    otherTicketId = tickets.find((r) => r.subject === "Duplicate report")!.id;
    oldTicketId = tickets.find((r) => r.subject === "Old question")!.id;
    foreignTicketId = tickets.find((r) => r.subject === "Foreign tenant")!.id;
    foreignAuditId = newUlid();
    await tx.insert(auditLog).values({ id: foreignAuditId, organizationId: orgId, actor: { kind: "platform", userId: secondOperatorId }, action: "platform.organization.note", targetType: "organization", targetId: orgId, diff: null, metadata: {}, requestId: `req-foreign-${stamp}` });
    await tx.insert(supportMessages).values({
      ticketId,
      organizationId: orgId,
      direction: "inbound",
      authorKind: "customer",
      fromEmail: `ticket-customer-${stamp}@example.test`,
      textBody: "Hallo, unser Pixel feuert nicht.",
      htmlBody: "<p>Hallo, unser Pixel <b>feuert</b> nicht.</p>",
      messageId: `customer-${stamp}@example.test`,
      createdAt: created,
    });
    await tx.insert(supportEvents).values({ ticketId, organizationId: orgId, actorKind: "customer", kind: "created", payload: { channel: "email" }, createdAt: created });
    await tx.insert(supportPresence).values({ ticketId, userId: secondOperatorId, mode: "typing", lastSeenAt: new Date() });
  });
});

afterAll(async () => {
  await asOps(t.db, async (tx) => {
    await tx.delete(supportTickets).where(inArray(supportTickets.id, [ticketId, otherTicketId, oldTicketId, foreignTicketId].filter(Boolean)));
    await tx.delete(supportMacros).where(inArray(supportMacros.name, ["Acknowledge", "Someone else's"]));
  });
  await t.db.delete(organization).where(inArray(organization.id, [orgId, foreignOrgId].filter(Boolean)));
  await t.db.delete(user).where(inArray(user.id, [operatorId, secondOperatorId, customerId].filter(Boolean)));
  await t.close();
});

const audits = (action: string, target = ticketId) => t.db.select().from(auditLog).where(and(eq(auditLog.targetId, target), eq(auditLog.action, action)));
const events = (kind: string, target = ticketId) => t.db.select().from(supportEvents).where(and(eq(supportEvents.ticketId, target), eq(supportEvents.kind, kind as never)));

describe("loadTicketDetail (test database, tracksite_ops)", () => {
  it("loads the ticket, the sanitised conversation, the SLA clocks, presence, operators, usable macros and the requester sidebar", async () => {
    const detail = await loadTicketDetail(holder.ctx, ticketId);
    expect(detail).not.toBeNull();
    expect(detail!.ticket).toMatchObject({ subject: "Pixel does not fire", status: "new", priority: "normal", channel: "email", tags: ["tracking"], organizationId: orgId, requesterName: "Ada Customer", assignee: null, mergedInto: null });
    const messages = detail!.timeline.filter((i) => i.type === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type === "message" && messages[0]!.message.htmlBody).toBe("<p>Hallo, unser Pixel <b>feuert</b> nicht.</p>");
    expect(detail!.timeline[0]!.type).toBe("event");
    expect(detail!.sla.policy?.id).toBe(policyId);
    expect(detail!.sla.firstResponse.state).toBe("on_track");
    expect(detail!.sla.resolution.state).toBe("on_track");
    expect(detail!.presence).toEqual([expect.objectContaining({ userId: secondOperatorId, name: "Second Operator", mode: "typing" })]);
    expect(detail!.operators.find((o) => o.id === secondOperatorId)).toMatchObject({ online: true, self: false });
    expect(detail!.operators.find((o) => o.id === operatorId)).toMatchObject({ self: true });
    expect(detail!.operators.map((o) => o.id)).not.toContain(customerId);
    expect(detail!.macros.map((m) => m.name)).toEqual(["Acknowledge"]);
    expect(detail!.requester.organization).toMatchObject({ id: orgId, name: `Ticket Test ${stamp}` });
    expect(detail!.requester.subscriptionStatus).toBe("none");
    expect(detail!.requester.recentTickets.map((r) => r.id)).toEqual([otherTicketId, oldTicketId]);
    // a support agent's audit permission covers their own actions only: another operator's entry stays out
    expect(detail!.requester.recentAuditScope).toBe("own");
    expect(detail!.requester.recentAudit).toEqual([]);
    const asAdmin = await loadTicketDetail({ ...holder.ctx, platformRole: "PLATFORM_ADMIN" }, ticketId);
    expect(asAdmin!.requester.recentAuditScope).toBe("organisation");
    expect(asAdmin!.requester.recentAudit.map((a) => a.id)).toContain(foreignAuditId);
    expect(detail!.mail.fromAddress).toBe("support@test.local");
    expect(await loadTicketDetail(holder.ctx, "not-a-uuid")).toBeNull();
    expect(await loadTicketDetail(holder.ctx, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("compose and deliver", () => {
  it("stores a note without mail, visible in the console only", async () => {
    const result = await composeTicketMessageAction({ ticketId, mode: "note", body: "Customer is on **trial**." });
    expect(result).toMatchObject({ ok: true, error: null, pendingUpload: false, sent: false });
    const [note] = await t.db.select().from(supportMessages).where(eq(supportMessages.id, result.messageId!));
    expect(note).toMatchObject({ direction: "note", authorKind: "agent", authorUserId: operatorId, deliveryStatus: "na", textBody: "Customer is on trial.", htmlBody: "<p>Customer is on <strong>trial</strong>.</p>" });
    expect(holder.mails).toHaveLength(0);
    expect(await events("note")).toHaveLength(1);
    const [audit] = await audits("platform.support_ticket.note");
    expect(audit!.diff).toMatchObject({ bodyLength: 25, attachments: 0 });
    expect(JSON.stringify(audit!.diff)).not.toContain("trial");
  });

  it("refuses a macro that is not the operator's, an unknown ticket and a forbidden status", async () => {
    const [foreign] = await t.db.select({ id: supportMacros.id }).from(supportMacros).where(eq(supportMacros.name, "Someone else's"));
    expect(await composeTicketMessageAction({ ticketId, mode: "reply", body: "x", macroId: foreign!.id })).toMatchObject({ ok: false, error: "invalid_macro" });
    expect(await composeTicketMessageAction({ ticketId: "00000000-0000-4000-8000-000000000000", mode: "reply", body: "x" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await composeTicketMessageAction({ ticketId, mode: "reply", body: "" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await composeTicketMessageAction({ ticketId, mode: "reply", body: "x", attachments: [{ fileName: "a.exe", contentType: "application/x-msdownload", sizeBytes: 10 }] })).toMatchObject({ ok: false, error: "invalid", fieldErrors: { attachments: "type_not_allowed" } });
  });

  it("sends a reply with threading, applies the macro actions, stamps the first response and takes the ticket over", async () => {
    const [macro] = await t.db.select({ id: supportMacros.id }).from(supportMacros).where(eq(supportMacros.name, "Acknowledge"));
    const result = await composeTicketMessageAction({ ticketId, mode: "reply", body: "Hi Ada, ticket 1000.\n\nWe are on it: [docs](https://track.site/docs)", macroId: macro!.id, applyMacroActions: true });
    expect(result).toMatchObject({ ok: true, error: null, pendingUpload: false, sent: true, transport: "file" });
    const mail = holder.mails.at(-1)!;
    expect(mail.to).toContain(`ticket-customer-${stamp}@example.test`);
    expect(mail.replyTo).toMatch(/^support\+t\d+@support\.test\.local$/);
    expect(mail.subject).toMatch(/^Re: \[Track #\d+\] Pixel does not fire$/);
    expect(mail.inReplyTo).toBe(`<customer-${stamp}@example.test>`);
    expect(mail.text).toContain("We are on it: docs (https://track.site/docs)");
    expect(mail.text).toContain("Marco Rossi");
    expect(mail.html).toContain('<a href="https://track.site/docs"');
    const [message] = await t.db.select().from(supportMessages).where(eq(supportMessages.id, result.messageId!));
    expect(message).toMatchObject({ direction: "outbound", deliveryStatus: "sent", macroId: macro!.id, inReplyTo: `customer-${stamp}@example.test` });
    expect(message!.messageId).toMatch(/^t\d+\.[0-9a-z]+@support\.test\.local$/);
    expect(mail.messageId).toBe(`<${message!.messageId}>`);
    const [ticket] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(ticket).toMatchObject({ status: "open", assigneeUserId: operatorId, breachedFirstResponse: false });
    expect(ticket!.firstRespondedAt).not.toBeNull();
    expect(ticket!.lastAgentMessageAt).not.toBeNull();
    expect(ticket!.tags).toEqual(["tracking", "acknowledged"]);
    const [macroRow] = await t.db.select({ usageCount: supportMacros.usageCount }).from(supportMacros).where(eq(supportMacros.id, macro!.id));
    expect(macroRow!.usageCount).toBe(1);
    expect(await events("reply")).toHaveLength(1);
    expect(await events("status")).toHaveLength(1);
    expect(await events("tags")).toHaveLength(1);
    expect(await events("assignee")).toHaveLength(1);
    const [reply] = await audits("platform.support_ticket.reply");
    expect(reply!.diff).toMatchObject({ firstResponse: true, statusFrom: "new", statusTo: "open", assigneeTo: operatorId, tagsAdded: ["acknowledged"], macroId: macro!.id });
    expect(reply!.organizationId).toBe(orgId);
    expect(JSON.stringify(reply!.diff)).not.toContain("We are on it");
    const [send] = await audits("platform.support_ticket.send");
    expect(send!.diff).toMatchObject({ ok: true, transport: "file", messageId: result.messageId });
  });

  it("keeps a reply with pending attachments queued, gates uploads to the author, sends it with the files and records a transport failure honestly", async () => {
    const queued = await composeTicketMessageAction({ ticketId, mode: "reply", body: "Screenshot attached.", attachments: [{ fileName: "shot.png", contentType: "image/png", sizeBytes: 12 }] });
    expect(queued).toMatchObject({ ok: true, pendingUpload: true, sent: false });
    const [row] = await t.db.select().from(supportMessages).where(eq(supportMessages.id, queued.messageId!));
    expect(row!.deliveryStatus).toBe("queued");
    await asOps(t.db, async (tx) => {
      const gate = await assertMessageAttachable(tx, queued.messageId!, operatorId, new Date(), 5);
      expect(gate.ok).toBe(true);
      expect(await assertMessageAttachable(tx, queued.messageId!, secondOperatorId, new Date(), 5)).toEqual({ ok: false, reason: "not_author" });
      expect(await assertMessageAttachable(tx, queued.messageId!, operatorId, new Date(), 0)).toEqual({ ok: false, reason: "too_many" });
      await tx.insert(supportAttachments).values({ messageId: queued.messageId!, ticketId, organizationId: orgId, fileName: "shot.png", contentType: "image/png", sizeBytes: 12, sha256: "x".repeat(64), content: Buffer.from("PNG-bytes-xx") });
    });
    holder.failNext = true;
    const failed = await finalizeTicketMessageAction({ messageId: queued.messageId! });
    expect(failed).toMatchObject({ ok: false, error: "mail_failed", sent: false, transport: "smtp" });
    const [afterFail] = await t.db.select().from(supportMessages).where(eq(supportMessages.id, queued.messageId!));
    expect(afterFail).toMatchObject({ deliveryStatus: "failed", deliveryError: "smtp down" });
    const retried = await finalizeTicketMessageAction({ messageId: queued.messageId! });
    expect(retried).toMatchObject({ ok: true, sent: true, transport: "file" });
    const mail = holder.mails.at(-1)!;
    expect(mail.attachments?.map((a) => a.filename)).toEqual(["shot.png"]);
    expect(await finalizeTicketMessageAction({ messageId: queued.messageId! })).toMatchObject({ ok: false, error: "unchanged" });
    const detail = await loadTicketDetail(holder.ctx, ticketId);
    const withFile = detail!.timeline.find((i) => i.type === "message" && i.message.id === queued.messageId);
    expect(withFile && withFile.type === "message" ? withFile.message.attachments : []).toEqual([expect.objectContaining({ fileName: "shot.png", sizeBytes: 12, scanned: false })]);
    const [attachment] = await t.db.select({ id: supportAttachments.id }).from(supportAttachments).where(eq(supportAttachments.messageId, queued.messageId!));
    const download = await loadAttachmentForDownload(holder.ctx, attachment!.id);
    expect(download).toMatchObject({ ticketId, organizationId: orgId, direction: "outbound", fileName: "shot.png" });
    expect(download!.content.toString()).toBe("PNG-bytes-xx");
    expect(await loadAttachmentForDownload(holder.ctx, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("takes a new ticket into work on the first reply and mails the customer once when two sends overlap", async () => {
    const queued = await composeTicketMessageAction({ ticketId: oldTicketId, mode: "reply", body: "Looking into it.", attachments: [{ fileName: "log.txt", contentType: "text/plain", sizeBytes: 5 }] });
    expect(queued).toMatchObject({ ok: true, pendingUpload: true, sent: false });
    const [opened] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, oldTicketId));
    expect(opened).toMatchObject({ status: "open", assigneeUserId: operatorId });
    const [statusEvent] = await events("status", oldTicketId);
    expect(statusEvent!.payload).toMatchObject({ from: "new", to: "open", reason: "agent_reply" });
    await asOps(t.db, (tx) => tx.insert(supportAttachments).values({ messageId: queued.messageId!, ticketId: oldTicketId, organizationId: orgId, fileName: "log.txt", contentType: "text/plain", sizeBytes: 5, sha256: "y".repeat(64), content: Buffer.from("hello") }));
    const before = holder.mails.length;
    // two operators click "send now" at the same time while the transport is slow: the row claim lets one through
    holder.delayMs = 150;
    const [first, second] = await Promise.all([finalizeTicketMessageAction({ messageId: queued.messageId! }), finalizeTicketMessageAction({ messageId: queued.messageId! })]);
    holder.delayMs = 0;
    const outcomes = [first, second].map((r) => `${r.ok}:${r.error ?? "sent"}`).sort();
    expect(outcomes).toEqual(["false:unchanged", "true:sent"]);
    expect(holder.mails.length).toBe(before + 1);
    const [sent] = await t.db.select().from(supportMessages).where(eq(supportMessages.id, queued.messageId!));
    expect(sent!.deliveryStatus).toBe("sent");
    expect(await audits("platform.support_ticket.send", oldTicketId)).toHaveLength(1);
  });
});

describe("workflow actions", () => {
  it("pauses the SLA clock on pending and books the pause on leaving, with events and audit rows", async () => {
    expect(await setTicketStatusAction({ ticketId, status: "open" })).toEqual({ ok: false, error: "unchanged" });
    expect(await setTicketStatusAction({ ticketId, status: "closed" })).toEqual({ ok: false, error: "confirmation_required" });
    expect(await setTicketStatusAction({ ticketId, status: "pending" })).toEqual({ ok: true, error: null });
    const [pending] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(pending!.pausedAt).not.toBeNull();
    const dueBefore = pending!.resolutionDueAt!.getTime();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await setTicketStatusAction({ ticketId, status: "open" })).toEqual({ ok: true, error: null });
    const [open] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(open!.pausedAt).toBeNull();
    expect(open!.pauseTotalMs).toBeGreaterThan(0);
    expect(open!.resolutionDueAt!.getTime()).toBe(dueBefore + open!.pauseTotalMs);
    const detail = await loadTicketDetail(holder.ctx, ticketId);
    expect(detail!.sla.pauseTotalMs).toBe(open!.pauseTotalMs);
    expect((await audits("platform.support_ticket.status")).length).toBeGreaterThanOrEqual(2);
  });

  it("solves, reopens with a fresh resolution clock and counts the reopen", async () => {
    expect(await setTicketStatusAction({ ticketId, status: "solved" })).toEqual({ ok: true, error: null });
    const [solved] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(solved!.resolvedAt).not.toBeNull();
    expect(await setTicketStatusAction({ ticketId, status: "open" })).toEqual({ ok: true, error: null });
    const [reopened] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(reopened).toMatchObject({ status: "open", reopenCount: 1, resolvedAt: null });
    expect(reopened!.resolutionDueAt!.getTime()).toBeGreaterThan(Date.now() + 230 * 60_000);
    expect(await events("reopened")).toHaveLength(1);
    expect(await audits("platform.support_ticket.reopen")).toHaveLength(1);
    const detail = await loadTicketDetail(holder.ctx, ticketId);
    expect(detail!.sla.resolutionRestartedAt).not.toBeNull();
    expect(detail!.sla.resolution.state).toBe("on_track");
    // the sidebar lists the caller's own actions on the organisation now — and still not the other operator's
    expect(detail!.requester.recentAudit.length).toBeGreaterThan(0);
    expect(detail!.requester.recentAudit.map((a) => a.id)).not.toContain(foreignAuditId);
  });

  it("measures a reopened ticket from the reopening even when it was created days ago", async () => {
    expect(await setTicketStatusAction({ ticketId: oldTicketId, status: "solved" })).toEqual({ ok: true, error: null });
    expect(await setTicketStatusAction({ ticketId: oldTicketId, status: "open" })).toEqual({ ok: true, error: null });
    const detail = await loadTicketDetail(holder.ctx, oldTicketId);
    // 240 minutes from the reopening: a quarter of an hour in, the clock is on track — not "due soon" because of the ten days before
    expect(detail!.sla.resolution).toMatchObject({ state: "on_track", breachedFlag: false });
    expect(detail!.sla.resolutionRestartedAt).not.toBeNull();
    expect(Date.parse(detail!.sla.resolutionRestartedAt!)).toBeGreaterThan(Date.now() - 60_000);
    // a priority change on the reopened ticket recomputes from the reopening, never from the creation ten days ago
    expect(await setTicketPriorityAction({ ticketId: oldTicketId, priority: "urgent" })).toEqual({ ok: true, error: null });
    const [urgent] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, oldTicketId));
    expect(urgent!.resolutionDueAt!.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(urgent!.resolutionDueAt!.getTime()).toBeLessThan(Date.now() + 65 * 60_000);
    expect((await loadTicketDetail(holder.ctx, oldTicketId))!.sla.resolution.state).toBe("on_track");
  });

  it("recomputes the resolution clock on a priority change and normalises tags", async () => {
    expect(await setTicketPriorityAction({ ticketId, priority: "normal" })).toEqual({ ok: false, error: "unchanged" });
    expect(await setTicketPriorityAction({ ticketId, priority: "urgent" })).toEqual({ ok: true, error: null });
    const [urgent] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(urgent!.priority).toBe("urgent");
    // urgent: 60 minutes from the reopening a moment ago (the ticket was reopened in the previous test) → about an hour from now
    expect(urgent!.resolutionDueAt!.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(urgent!.resolutionDueAt!.getTime()).toBeLessThan(Date.now() + 65 * 60_000);
    expect(await events("priority")).toHaveLength(1);
    expect(await setTicketTagsAction({ ticketId, tags: ["Tracking", "acknowledged", " Consent Mode "] })).toEqual({ ok: true, error: null });
    const [tagged] = await t.db.select({ tags: supportTickets.tags }).from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(tagged!.tags).toEqual(["tracking", "acknowledged", "consent-mode"]);
    expect(await setTicketTagsAction({ ticketId, tags: ["tracking", "acknowledged", "consent-mode"] })).toEqual({ ok: false, error: "unchanged" });
    const [audit] = await audits("platform.support_ticket.tags");
    expect(audit!.diff).toMatchObject({ tagsAdded: ["consent-mode"], tagsRemoved: [] });
  });

  it("assigns platform operators only", async () => {
    expect(await assignTicketAction({ ticketId, assigneeUserId: customerId })).toEqual({ ok: false, error: "invalid_assignee" });
    expect(await assignTicketAction({ ticketId, assigneeUserId: secondOperatorId })).toEqual({ ok: true, error: null });
    expect(await assignTicketAction({ ticketId, assigneeUserId: secondOperatorId })).toEqual({ ok: false, error: "unchanged" });
    expect(await assignTicketAction({ ticketId, assigneeUserId: null })).toEqual({ ok: true, error: null });
    expect((await audits("platform.support_ticket.assign")).length).toBe(2);
  });

  it("records presence heartbeats and returns the other operators", async () => {
    const beat = await presenceHeartbeatAction({ ticketId, mode: "viewing" });
    expect(beat.ok).toBe(true);
    expect(beat.others.map((o) => o.userId)).toEqual([secondOperatorId]);
    const rows = await asOps(t.db, (tx) => tx.select().from(supportPresence).where(and(eq(supportPresence.ticketId, ticketId), eq(supportPresence.userId, operatorId))));
    expect(rows).toHaveLength(1);
    expect(await presenceLeaveAction({ ticketId })).toEqual({ ok: true, error: null });
    const gone = await asOps(t.db, (tx) => tx.select().from(supportPresence).where(and(eq(supportPresence.ticketId, ticketId), eq(supportPresence.userId, operatorId))));
    expect(gone).toHaveLength(0);
    expect(await audits("platform.support_ticket.presence")).toHaveLength(0);
  });

  it("merges into another ticket by number, closes the source and links both timelines", async () => {
    const [target] = await t.db.select({ number: supportTickets.number }).from(supportTickets).where(eq(supportTickets.id, ticketId));
    const [source] = await t.db.select({ number: supportTickets.number }).from(supportTickets).where(eq(supportTickets.id, otherTicketId));
    expect(await mergeTicketAction({ ticketId: otherTicketId, targetNumber: target!.number })).toEqual({ ok: false, error: "confirmation_required" });
    expect(await mergeTicketAction({ ticketId: otherTicketId, targetNumber: source!.number, confirmed: true })).toEqual({ ok: false, error: "invalid_target" });
    expect(await mergeTicketAction({ ticketId: otherTicketId, targetNumber: 999_999_999, confirmed: true })).toEqual({ ok: false, error: "invalid_target" });
    // never across tenants, in either direction: the link would be visible to both customers
    expect(await mergeTicketAction({ ticketId: foreignTicketId, targetNumber: target!.number, confirmed: true })).toEqual({ ok: false, error: "invalid_target" });
    const [foreign] = await t.db.select({ number: supportTickets.number }).from(supportTickets).where(eq(supportTickets.id, foreignTicketId));
    expect(await mergeTicketAction({ ticketId: otherTicketId, targetNumber: foreign!.number, confirmed: true })).toEqual({ ok: false, error: "invalid_target" });
    expect(await events("merged", foreignTicketId)).toHaveLength(0);
    expect(await mergeTicketAction({ ticketId: otherTicketId, targetNumber: target!.number, confirmed: true })).toMatchObject({ ok: true, error: null, targetId: ticketId });
    const [merged] = await t.db.select().from(supportTickets).where(eq(supportTickets.id, otherTicketId));
    // closed, but never "resolved": the target answers the request, so the reports do not count the source
    expect(merged).toMatchObject({ status: "closed", mergedIntoId: ticketId, resolvedAt: null });
    expect(merged!.closedAt).not.toBeNull();
    const [closing] = await events("status", otherTicketId);
    expect(closing!.payload).toMatchObject({ from: "open", to: "closed", reason: "merged" });
    expect(await events("merged", otherTicketId)).toHaveLength(1);
    expect(await events("merged", ticketId)).toHaveLength(1);
    expect(await audits("platform.support_ticket.merge", otherTicketId)).toHaveLength(1);
    expect(await audits("platform.support_ticket.merge_target", ticketId)).toHaveLength(1);
    expect(await composeTicketMessageAction({ ticketId: otherTicketId, mode: "reply", body: "after merge" })).toMatchObject({ ok: false, error: "invalid_state" });
    // a merged ticket stays closed: no reopen (the target carries the request), the link is never left dangling
    expect(await setTicketStatusAction({ ticketId: otherTicketId, status: "open" })).toEqual({ ok: false, error: "invalid_state" });
    const [still] = await t.db.select({ status: supportTickets.status, mergedIntoId: supportTickets.mergedIntoId }).from(supportTickets).where(eq(supportTickets.id, otherTicketId));
    expect(still).toEqual({ status: "closed", mergedIntoId: ticketId });
    const detail = await loadTicketDetail(holder.ctx, ticketId);
    expect(detail!.ticket.mergedFrom).toEqual([expect.objectContaining({ id: otherTicketId })]);
    const sourceDetail = await loadTicketDetail(holder.ctx, otherTicketId);
    expect(sourceDetail!.ticket.mergedInto).toMatchObject({ id: ticketId, number: target!.number });
  });
});
