import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/db", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, db: () => null }));

import { auditLog, member, organization, supportAttachments, supportEvents, supportInboundEvents, supportMessages, supportSettings, supportSlaPolicies, supportTickets, user, withPlatform } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import { createDrizzleDeliveryStore } from "./delivery";
import { DO_NOT_EMAIL_TAG, INBOUND_EVENT_STALE_MS, InboundAlreadyStoredError, createDrizzleInboundStore, type CreateTicketInput, type StoredMessageInput } from "./inbound-handler";

/**
 * The Drizzle stores of the inbound and delivery handlers against the migrated test database as
 * `tracksite_worker`: ledger semantics, requester → organisation matching, SLA policy selection, ticket
 * creation with message / attachment / note / events, append with a ticket patch, sender flags, the
 * acknowledgement row and its delivery update, and the complaint flag with its audit row.
 */
const t = testDb();
const stamp = Date.now();
const NOW = new Date("2026-09-08T10:00:00.000Z");
const inbound = createDrizzleInboundStore(t.db);
const delivery = createDrizzleDeliveryStore(t.db);
let orgId = "";
let userId = "";
let policyId = "";
const requester = `ada-${stamp}@example.test`;
const ticketIds: string[] = [];
/** the singleton settings row as other integration files expect it (each claims it); restored in afterAll */
let previousSettings: typeof supportSettings.$inferSelect | null = null;
const SETTINGS = { inboundDomain: "support.track.site", fromName: "Track Support", fromAddress: "support@track.site", autoReplyEnabled: true };

const message = (overrides: Partial<StoredMessageInput> = {}): StoredMessageInput => ({
  fromEmail: requester,
  toEmails: ["support@support.track.site"],
  ccEmails: [`Ops-${stamp}@example.test`.toLowerCase()],
  subject: "Pixel fires twice",
  textBody: "Hello, the pixel fires twice.",
  htmlBody: "<p>Hello, the pixel fires <b>twice</b>.</p>",
  messageId: `m-${stamp}@mail.example.test`,
  inReplyTo: null,
  references: [],
  providerMessageId: `em-${stamp}`,
  createdAt: NOW,
  ...overrides,
});

beforeAll(async () => {
  const [org] = await t.db.insert(organization).values({ name: `Support T3 ${stamp}`, slug: `support-t3-${stamp}` }).returning({ id: organization.id });
  orgId = org!.id;
  const [u] = await t.db.insert(user).values({ name: "Ada Lovelace", email: requester.toUpperCase(), locale: "de" }).returning({ id: user.id });
  userId = u!.id;
  await t.db.insert(member).values({ organizationId: orgId, userId, role: "OWNER" });
  await withPlatform(t.db, async (tx) => {
    const [stored] = await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
    previousSettings = stored ?? null;
    await tx.insert(supportSettings).values({ id: 1, ...SETTINGS }).onConflictDoUpdate({ target: supportSettings.id, set: SETTINGS });
    const [existing] = await tx.select({ id: supportSlaPolicies.id }).from(supportSlaPolicies).where(eq(supportSlaPolicies.isDefault, true)).limit(1);
    if (existing) policyId = existing.id;
    else {
      const [policy] = await tx
        .insert(supportSlaPolicies)
        .values({ name: "t3 default", isDefault: true, priorities: { normal: { first_response_minutes: 60, resolution_minutes: 120 } }, businessHours: { timezone: "Europe/Berlin", days: {} } })
        .returning({ id: supportSlaPolicies.id });
      policyId = policy!.id;
    }
  });
});

afterAll(async () => {
  // hand the settings row back the way it was found so the next integration file can claim it
  await withPlatform(t.db, async (tx) => {
    if (previousSettings) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = previousSettings;
      await tx.update(supportSettings).set(rest).where(eq(supportSettings.id, 1));
    } else await tx.delete(supportSettings).where(eq(supportSettings.id, 1));
  });
  if (ticketIds.length) await withPlatform(t.db, (tx) => tx.delete(supportTickets).where(sql`${supportTickets.id} IN ${ticketIds}`));
  await withPlatform(t.db, (tx) => tx.delete(supportInboundEvents).where(sql`${supportInboundEvents.providerEventId} LIKE ${`t3-${stamp}-%`}`));
  // audit_log is append-only by trigger: the rows stay (the integration global setup truncates the test database)
  await withPlatform(t.db, (tx) => tx.delete(supportSlaPolicies).where(and(eq(supportSlaPolicies.id, policyId), eq(supportSlaPolicies.name, "t3 default"))));
  await t.db.delete(user).where(eq(user.id, userId));
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.close();
});

describe("inbound store (tracksite_worker)", () => {
  it("keeps the ledger idempotent: new → in progress → stale retry → processed → duplicate; failed → retry", async () => {
    const id = `t3-${stamp}-ledger`;
    expect(await inbound.beginEvent(id, "resend", NOW)).toBe("new");
    expect(await inbound.beginEvent(id, "resend", new Date(NOW.getTime() + 1000))).toBe("in_progress");
    expect(await inbound.beginEvent(id, "resend", new Date(NOW.getTime() + INBOUND_EVENT_STALE_MS + 1))).toBe("retry");
    await inbound.finishEvent(id, { status: "processed", ticketId: null }, NOW);
    expect(await inbound.beginEvent(id, "resend", NOW)).toBe("duplicate");
    const failing = `t3-${stamp}-failed`;
    await inbound.beginEvent(failing, "resend", NOW);
    await inbound.finishEvent(failing, { status: "failed", error: "boom" }, NOW);
    expect(await inbound.beginEvent(failing, "resend", NOW)).toBe("retry");
    const [row] = await withPlatform(t.db, (tx) => tx.select({ status: supportInboundEvents.status, error: supportInboundEvents.error }).from(supportInboundEvents).where(eq(supportInboundEvents.providerEventId, failing)));
    expect(row).toEqual({ status: "received", error: null });
  });

  it("loads the settings row, resolves the requester's user and single organisation and picks the default policy", async () => {
    const settings = await inbound.loadSettings();
    expect(settings).toMatchObject({ autoReplyEnabled: true, mail: { inboundDomain: "support.track.site", fromAddress: "support@track.site", fromName: "Track Support" } });
    expect(await inbound.resolveRequester(requester)).toEqual({ userId, name: "Ada Lovelace", locale: "de", organizationId: orgId, membershipCount: 1 });
    expect(await inbound.resolveRequester(`nobody-${stamp}@example.test`)).toEqual({ userId: null, name: null, locale: null, organizationId: null, membershipCount: 0 });
    expect((await inbound.selectSlaPolicy(orgId))?.id).toBe(policyId);
    expect((await inbound.selectSlaPolicy(null))?.id).toBe(policyId);
    expect(await inbound.senderFlags(requester)).toEqual({ blocked: false, doNotEmail: false });
  });

  it("creates a ticket with message, attachment, note and events, then finds and appends to it", async () => {
    const content = Buffer.from("PNG");
    const created = await inbound.createTicket({
      requesterEmail: requester.toUpperCase(),
      requesterName: "Ada",
      requesterUserId: userId,
      organizationId: orgId,
      subject: "Pixel fires twice",
      status: "new",
      priority: "normal",
      locale: "de",
      slaPolicyId: policyId,
      firstResponseDueAt: new Date(NOW.getTime() + 3_600_000),
      resolutionDueAt: null,
      message: message(),
      attachments: [{ fileName: "a.png", contentType: "image/png", sizeBytes: 3, sha256: "abc", content }],
      events: [{ kind: "created", actorKind: "customer", payload: { channel: "email" } }],
      systemNote: "1 attachment refused:\n- x.zip (type not allowed)",
    });
    ticketIds.push(created.ticketId);
    expect(created.number).toBeGreaterThanOrEqual(1000);
    expect(await inbound.findTicketByNumber(created.number)).toEqual({ ticketId: created.ticketId });
    // customer-supplied ids match inbound rows — the handler guards those like a plus address
    expect(await inbound.findTicketByMessageIds(["unknown@x", `em-${stamp}`])).toEqual({ ticketId: created.ticketId, direction: "inbound" });
    expect(await inbound.findTicketByMessageIds([`m-${stamp}@mail.example.test`])).toEqual({ ticketId: created.ticketId, direction: "inbound" });
    const ticket = await inbound.getTicket(created.ticketId);
    expect(ticket).toMatchObject({ id: created.ticketId, number: created.number, status: "new", requesterEmail: requester, organizationId: orgId, locale: "de", tags: [], pausedAt: null, pauseTotalMs: 0, reopenCount: 0 });
    expect(ticket!.participants.sort()).toEqual([`ops-${stamp}@example.test`, requester, "support@support.track.site"].sort());
    const rows = await withPlatform(t.db, (tx) => tx.select({ direction: supportMessages.direction, authorKind: supportMessages.authorKind, htmlBody: supportMessages.htmlBody, organizationId: supportMessages.organizationId }).from(supportMessages).where(eq(supportMessages.ticketId, created.ticketId)).orderBy(supportMessages.direction));
    expect(rows).toEqual([
      { direction: "inbound", authorKind: "customer", htmlBody: "<p>Hello, the pixel fires <b>twice</b>.</p>", organizationId: orgId },
      { direction: "note", authorKind: "system", htmlBody: null, organizationId: orgId },
    ]);
    const [attachment] = await withPlatform(t.db, (tx) => tx.select({ fileName: supportAttachments.fileName, content: supportAttachments.content, organizationId: supportAttachments.organizationId, messageId: supportAttachments.messageId }).from(supportAttachments).where(eq(supportAttachments.ticketId, created.ticketId)));
    expect(attachment).toMatchObject({ fileName: "a.png", organizationId: orgId, messageId: created.messageRowId });
    expect(Buffer.from(attachment!.content).toString()).toBe("PNG");
    const events = await withPlatform(t.db, (tx) => tx.select({ kind: supportEvents.kind, payload: supportEvents.payload, actorKind: supportEvents.actorKind }).from(supportEvents).where(eq(supportEvents.ticketId, created.ticketId)));
    expect(events).toEqual([{ kind: "created", actorKind: "customer", payload: { channel: "email", messageId: created.messageRowId } }]);

    // a customer reply that reopens the (meanwhile solved) ticket
    await withPlatform(t.db, (tx) => tx.update(supportTickets).set({ status: "solved", resolvedAt: NOW }).where(eq(supportTickets.id, created.ticketId)));
    const appended = await inbound.appendMessage({
      ticketId: created.ticketId,
      message: message({ messageId: `m2-${stamp}@mail.example.test`, providerMessageId: `em2-${stamp}`, htmlBody: null, createdAt: new Date(NOW.getTime() + 60_000) }),
      attachments: [],
      patch: { lastCustomerMessageAt: new Date(NOW.getTime() + 60_000), status: "open", reopenCount: 1, resolvedAt: null, closedAt: null },
      events: [
        { kind: "reply", actorKind: "customer", payload: { direction: "inbound" } },
        { kind: "reopened", actorKind: "customer", payload: { from: "solved", to: "open" } },
      ],
      systemNote: null,
    });
    const after = await inbound.getTicket(created.ticketId);
    expect(after).toMatchObject({ status: "open", reopenCount: 1 });
    const [row] = await withPlatform(t.db, (tx) => tx.select({ resolvedAt: supportTickets.resolvedAt, lastCustomerMessageAt: supportTickets.lastCustomerMessageAt }).from(supportTickets).where(eq(supportTickets.id, created.ticketId)));
    expect(row).toEqual({ resolvedAt: null, lastCustomerMessageAt: new Date(NOW.getTime() + 60_000) });
    const kinds = await withPlatform(t.db, (tx) => tx.select({ kind: supportEvents.kind, payload: supportEvents.payload }).from(supportEvents).where(eq(supportEvents.ticketId, created.ticketId)).orderBy(supportEvents.createdAt, supportEvents.kind));
    expect(kinds.map((k) => k.kind)).toEqual(["created", "reopened", "reply"]);
    expect(kinds.every((k) => k.payload.messageId === created.messageRowId || k.payload.messageId === appended.messageRowId)).toBe(true);
  });

  it("derives the sender flags from operator decisions: a spam ticket blocks, the do-not-email tag silences", async () => {
    const spammer = `spam-${stamp}@example.test`;
    const created = await inbound.createTicket({ requesterEmail: spammer, requesterName: null, requesterUserId: null, organizationId: null, subject: "buy now", status: "spam", priority: "normal", locale: "en", slaPolicyId: null, firstResponseDueAt: null, resolutionDueAt: null, message: message({ fromEmail: spammer, messageId: null, providerMessageId: `spam-${stamp}` }), attachments: [], events: [], systemNote: null });
    ticketIds.push(created.ticketId);
    // the handler's own spam verdict (a spam ticket without an agent decision) never blocks the address
    expect(await inbound.senderFlags(spammer.toUpperCase())).toEqual({ blocked: false, doNotEmail: false });
    await withPlatform(t.db, (tx) => tx.insert(supportEvents).values({ ticketId: created.ticketId, organizationId: null, actorKind: "agent", kind: "status", payload: { from: "new", to: "spam" }, createdAt: NOW }));
    expect(await inbound.senderFlags(spammer.toUpperCase())).toEqual({ blocked: true, doNotEmail: false });
    await withPlatform(t.db, (tx) => tx.update(supportTickets).set({ tags: ["x", DO_NOT_EMAIL_TAG] }).where(eq(supportTickets.id, created.ticketId)));
    expect(await inbound.senderFlags(spammer)).toEqual({ blocked: true, doNotEmail: true });
  });

  it("stores the acknowledgement before sending, updates its delivery and flags the requester on a complaint", async () => {
    const ticketId = ticketIds[0]!;
    const ack = await inbound.insertOutboundSystemMessage({ ticketId, fromEmail: "support@track.site", toEmails: [requester], subject: "Re: [Track #1] Pixel", textBody: "Hello Ada, thank you.", messageId: `t1.${stamp}@support.track.site`, inReplyTo: `m-${stamp}@mail.example.test`, references: [`m-${stamp}@mail.example.test`], createdAt: NOW });
    const [queued] = await withPlatform(t.db, (tx) => tx.select({ direction: supportMessages.direction, authorKind: supportMessages.authorKind, deliveryStatus: supportMessages.deliveryStatus, organizationId: supportMessages.organizationId }).from(supportMessages).where(eq(supportMessages.id, ack.messageRowId)));
    expect(queued).toEqual({ direction: "outbound", authorKind: "system", deliveryStatus: "queued", organizationId: orgId });
    // base-36 stamp: a 13-digit run in the audit metadata would be scrubbed as a phone number by `recordAudit`
    const emailId = `resend-${stamp.toString(36)}`;
    await inbound.updateDelivery(ack.messageRowId, { deliveryStatus: "sent", providerMessageId: emailId });
    expect(await inbound.findTicketByMessageIds([`t1.${stamp}@support.track.site`])).toEqual({ ticketId, direction: "outbound" });
    // the desk's own id wins over a customer-supplied one among the same ids
    expect(await inbound.findTicketByMessageIds([`m-${stamp}@mail.example.test`, `t1.${stamp}@support.track.site`])).toEqual({ ticketId, direction: "outbound" });
    // the acknowledgement counts towards the sender's cap (case-insensitive address, window by created_at)
    expect(await inbound.countRecentAcknowledgements(requester.toUpperCase(), new Date(NOW.getTime() - 1000))).toBe(1);
    expect(await inbound.countRecentAcknowledgements(requester, new Date(NOW.getTime() + 1))).toBe(0);
    expect(await inbound.countRecentAcknowledgements(`nobody-${stamp}@example.test`, new Date(0))).toBe(0);

    const found = await delivery.findMessageByProviderId(emailId);
    expect(found).toEqual({ messageRowId: ack.messageRowId, ticketId, organizationId: orgId, deliveryStatus: "sent", requesterEmail: requester });
    expect(await delivery.findMessageByProviderId(`em-${stamp}`)).toBeNull(); // inbound messages are never delivery targets
    await delivery.updateDelivery(ack.messageRowId, { deliveryStatus: "complained", deliveryError: "complaint" });
    const context = { ticketId, organizationId: orgId, messageRowId: ack.messageRowId, emailId, providerEventId: `t3-${stamp}-complaint` };
    expect(await delivery.markDoNotEmail(requester, context, NOW)).toEqual({ ticketsTagged: 1 });
    expect(await delivery.markDoNotEmail(requester, context, NOW)).toEqual({ ticketsTagged: 0 });
    expect(await inbound.senderFlags(requester)).toEqual({ blocked: false, doNotEmail: true });
    const [ticket] = await withPlatform(t.db, (tx) => tx.select({ tags: supportTickets.tags }).from(supportTickets).where(eq(supportTickets.id, ticketId)));
    expect(ticket!.tags).toEqual([DO_NOT_EMAIL_TAG]);
    const tagEvents = await withPlatform(t.db, (tx) => tx.select({ actorKind: supportEvents.actorKind, payload: supportEvents.payload }).from(supportEvents).where(and(eq(supportEvents.ticketId, ticketId), eq(supportEvents.kind, "tags"))));
    expect(tagEvents).toEqual([{ actorKind: "system", payload: { added: [DO_NOT_EMAIL_TAG], removed: [], reason: "complaint", messageId: ack.messageRowId } }]);
    const audits = await withPlatform(t.db, (tx) => tx.select({ actor: auditLog.actor, organizationId: auditLog.organizationId, diff: auditLog.diff, metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, "support.requester.do_not_email"), eq(auditLog.targetId, ticketId))));
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ actor: { kind: "system", name: "resend-webhook" }, organizationId: orgId, diff: { tagsAdded: [DO_NOT_EMAIL_TAG], ticketsTagged: 1, reason: "complaint" }, metadata: { emailId } });
    expect(JSON.stringify(audits)).not.toContain("thank you");
  });

  it("finds an already stored inbound mail by its provider id and follows a merge one hop, keeping the merged-away requester entitled", async () => {
    const targetId = ticketIds[0]!;
    const bob = `bob-${stamp}@example.test`;
    const source = await inbound.createTicket({ requesterEmail: bob, requesterName: "Bob", requesterUserId: null, organizationId: null, subject: "Same pixel", status: "new", priority: "normal", locale: "en", slaPolicyId: null, firstResponseDueAt: null, resolutionDueAt: null, message: message({ fromEmail: bob, ccEmails: [], messageId: `m-bob-${stamp}@mail.example.test`, providerMessageId: `em-bob-${stamp}` }), attachments: [], events: [], systemNote: null });
    ticketIds.push(source.ticketId);
    // the retry guard: the mail's own provider id on an inbound row, never an outbound one, never an unknown id
    expect(await inbound.findInboundMessage(`em-bob-${stamp}`)).toEqual({ ticketId: source.ticketId, ticketNumber: source.number, messageRowId: source.messageRowId, status: "new", locale: "en", organizationId: null });
    expect(await inbound.findInboundMessage(`em-${stamp}`)).toMatchObject({ ticketId: targetId, organizationId: orgId });
    expect(await inbound.findInboundMessage(`resend-${stamp}`)).toBeNull();
    expect(await inbound.findInboundMessage("  ")).toBeNull();
    // Bob's ticket is merged into Ada's: a reply to Bob's plus address lands on Ada's ticket, and Bob may send it
    await withPlatform(t.db, (tx) => tx.update(supportTickets).set({ mergedIntoId: targetId, status: "closed", closedAt: NOW }).where(eq(supportTickets.id, source.ticketId)));
    const followed = await inbound.getTicket(source.ticketId);
    expect(followed).toMatchObject({ id: targetId, requesterEmail: requester });
    expect(followed!.participants).toEqual(expect.arrayContaining([bob, requester, `ops-${stamp}@example.test`, "support@support.track.site"]));
    const direct = await inbound.getTicket(targetId);
    expect(direct!.participants).not.toContain(bob);
  });

  it("serialises concurrent deliveries of one mail: the loser of the advisory lock finds the winner's row and throws InboundAlreadyStoredError", async () => {
    const carol = `carol-${stamp}@example.test`;
    const input = (providerMessageId: string, messageId: string): CreateTicketInput => ({ requesterEmail: carol, requesterName: "Carol", requesterUserId: null, organizationId: null, subject: "Race", status: "new", priority: "normal", locale: "en", slaPolicyId: null, firstResponseDueAt: null, resolutionDueAt: null, message: message({ fromEmail: carol, ccEmails: [], messageId, providerMessageId }), attachments: [], events: [], systemNote: null });
    // two transactions for the same email_id at once (two webhook ids): exactly one ticket
    const results = await Promise.allSettled([inbound.createTicket(input(`em-race-${stamp}`, `m-race-1-${stamp}@mail.example.test`)), inbound.createTicket(input(`em-race-${stamp}`, `m-race-2-${stamp}@mail.example.test`))]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ ticketId: string; number: number; messageRowId: string }> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const winner = fulfilled[0]!.value;
    ticketIds.push(winner.ticketId);
    expect(rejected[0]!.reason).toBeInstanceOf(InboundAlreadyStoredError);
    expect((rejected[0]!.reason as InboundAlreadyStoredError).match).toEqual({ ticketId: winner.ticketId, ticketNumber: winner.number, messageRowId: winner.messageRowId, status: "new", locale: "en", organizationId: null });
    const tickets = await withPlatform(t.db, (tx) => tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.requesterEmail, carol)));
    expect(tickets).toHaveLength(1);
    // a later delivery of the same mail (a reply this time) is refused the same way and leaves no row behind
    await expect(inbound.appendMessage({ ticketId: winner.ticketId, message: message({ fromEmail: carol, ccEmails: [], messageId: `m-race-3-${stamp}@mail.example.test`, providerMessageId: `em-race-${stamp}` }), attachments: [], patch: { lastCustomerMessageAt: NOW }, events: [], systemNote: null })).rejects.toBeInstanceOf(InboundAlreadyStoredError);
    const rows = await withPlatform(t.db, (tx) => tx.select({ id: supportMessages.id }).from(supportMessages).where(eq(supportMessages.ticketId, winner.ticketId)));
    expect(rows).toHaveLength(1);
    // a different mail appends as usual; a mail without a provider id is never locked
    await expect(inbound.appendMessage({ ticketId: winner.ticketId, message: message({ fromEmail: carol, ccEmails: [], messageId: `m-race-4-${stamp}@mail.example.test`, providerMessageId: `em-race-4-${stamp}` }), attachments: [], patch: { lastCustomerMessageAt: NOW }, events: [], systemNote: null })).resolves.toMatchObject({ messageRowId: expect.any(String) });
    await expect(inbound.appendMessage({ ticketId: winner.ticketId, message: message({ fromEmail: carol, ccEmails: [], messageId: null, providerMessageId: null }), attachments: [], patch: { lastCustomerMessageAt: NOW }, events: [], systemNote: null })).resolves.toMatchObject({ messageRowId: expect.any(String) });
  });
});
