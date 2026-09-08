import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  organization,
  supportAgentSettings,
  supportEvents,
  supportMessages,
  supportNotificationSync,
  supportNotifications,
  supportPresence,
  supportTickets,
  user,
  withPlatform as asOps,
  type Db,
  type Tx,
} from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Notification fan-out against the migrated test database as `tracksite_ops`: an organisation, two operators
 * (one with e-mail on assignment switched off), a customer account and two tickets with the timeline rows the
 * other slices write (`assignee`, customer `reply`, `sla_warning`, an internal note with a mention). Asserts the
 * materialised rows, their idempotency, the mail claim honouring the preference, the delivery outcome on the
 * row, the feed shape, read markers scoped to the operator, the online-agent union and the audited preference
 * action. The platform access layer is the usual double; the transport is stubbed.
 */
const holder = vi.hoisted(() => ({
  db: null as unknown as Db,
  ctx: null as unknown as PlatformContext,
  mails: [] as Array<{ to: string; subject: string; text: string }>,
  failNext: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ HOST_MARKETING: "http://localhost:3000" }) }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (mail: (typeof holder.mails)[number]) => {
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

import { markSupportNotificationsReadAction, pollSupportNotificationsAction, updateSupportNotificationPreferencesAction } from "@/server/ops/actions/support-notifications";
import { claimNotificationMails, deliverNotificationMails, listOnlineAgents, loadNotificationFeed, markNotificationsRead, runNotificationFanOut, syncNotifications, touchAgentSeen } from "./notifications";

const t = testDb();
const stamp = Date.now();
let orgId = "";
let adaId = "";
let benId = "";
let customerId = "";
let ticketId = "";
let secondTicketId = "";
const run = <T>(fn: (tx: Tx) => Promise<T>) => asOps(holder.db, fn);

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db.insert(organization).values({ name: `Notify Test ${stamp}`, slug: `notify-${stamp}` }).returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Ada Notify", email: `ada-notify-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT", locale: "de" },
      { name: "Ben Notify", email: `ben-notify-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN", locale: "en" },
      { name: "Grace Customer", email: `grace-notify-${stamp}@example.test`, platformRole: "NONE" },
    ])
    .returning({ id: user.id, name: user.name });
  adaId = users.find((u) => u.name === "Ada Notify")!.id;
  benId = users.find((u) => u.name === "Ben Notify")!.id;
  customerId = users.find((u) => u.name === "Grace Customer")!.id;
  holder.ctx = {
    user: { id: adaId, name: "Ada Notify", email: `ada-notify-${stamp}@example.test`, emailVerified: true, platformRole: "PLATFORM_SUPPORT", locale: "de", twoFactorEnabled: true },
    platformRole: "PLATFORM_SUPPORT",
    actor: { kind: "platform", userId: adaId, email: `ada-notify-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
    requestId: `req-${stamp}`,
  };
  // Ben does not want assignment mails
  await t.db.insert(supportAgentSettings).values({ userId: benId, emailOnAssignment: false, emailOnCustomerReply: true, lastSeenAt: new Date(0) });
  // a fresh cursor so the scan starts from the 24 h look-back
  await t.db.update(supportNotificationSync).set({ eventsThrough: null, messagesThrough: null, ranAt: null }).where(eq(supportNotificationSync.id, 1));

  const tickets = await t.db
    .insert(supportTickets)
    .values([
      { organizationId: orgId, requesterUserId: customerId, requesterEmail: `grace-notify-${stamp}@example.test`, requesterName: "Grace Customer", subject: "Pixel fires twice", channel: "email", status: "open", assigneeUserId: adaId, locale: "de" },
      { organizationId: orgId, requesterUserId: customerId, requesterEmail: `grace-notify-${stamp}@example.test`, requesterName: "Grace Customer", subject: "Consent banner", channel: "form", status: "new", assigneeUserId: null },
    ])
    .returning({ id: supportTickets.id, subject: supportTickets.subject });
  ticketId = tickets.find((r) => r.subject === "Pixel fires twice")!.id;
  secondTicketId = tickets.find((r) => r.subject === "Consent banner")!.id;
  const now = Date.now();
  await t.db.insert(supportEvents).values([
    // Ben assigned the first ticket to Ada → assignment for Ada (mailed)
    { ticketId, organizationId: orgId, actorKind: "agent", actorUserId: benId, kind: "assignee", payload: { from: null, to: adaId, self: false }, createdAt: new Date(now - 60_000) },
    // Ada assigned the second ticket to Ben → assignment for Ben (preference off → skipped)
    { ticketId: secondTicketId, organizationId: orgId, actorKind: "agent", actorUserId: adaId, kind: "assignee", payload: { from: null, to: benId, self: false }, createdAt: new Date(now - 50_000) },
    // Ada assigned herself elsewhere → nothing
    { ticketId: secondTicketId, organizationId: orgId, actorKind: "agent", actorUserId: adaId, kind: "assignee", payload: { from: benId, to: adaId, self: true }, createdAt: new Date(now - 40_000) },
    // the customer replied on Ada's ticket → customer_reply for Ada (mailed)
    { ticketId, organizationId: orgId, actorKind: "customer", actorUserId: null, kind: "reply", payload: { direction: "inbound", via: "plus_address" }, createdAt: new Date(now - 30_000) },
    // the SLA engine warned → sla_warning for Ada (in-app only)
    { ticketId, organizationId: orgId, actorKind: "system", actorUserId: null, kind: "sla_warning", payload: { clock: "first_response", due_at: new Date(now + 3_600_000).toISOString(), assignee_user_id: adaId }, createdAt: new Date(now - 20_000) },
    // an agent reply and a status change never notify
    { ticketId, organizationId: orgId, actorKind: "agent", actorUserId: adaId, kind: "reply", payload: { direction: "outbound" }, createdAt: new Date(now - 10_000) },
    { ticketId, organizationId: orgId, actorKind: "agent", actorUserId: benId, kind: "status", payload: { from: "new", to: "open" }, createdAt: new Date(now - 9_000) },
  ]);
  await t.db.insert(supportMessages).values([
    // Ben mentions Ada in a note → mention for Ada; his own name in the same note never notifies himself
    { ticketId, organizationId: orgId, direction: "note", authorKind: "agent", authorUserId: benId, textBody: "@Ada Notify can you take this over? — @Ben Notify", createdAt: new Date(now - 8_000) },
    // an inbound message with a name in it is not a note
    { ticketId, organizationId: orgId, direction: "inbound", authorKind: "customer", authorUserId: null, fromEmail: "grace@example.test", textBody: "@Ada Notify please help", createdAt: new Date(now - 7_000) },
  ]);
});

afterAll(async () => {
  // audit_log is append-only (trigger); the global setup truncates it before the next run
  await t.db.delete(supportTickets).where(inArray(supportTickets.id, [ticketId, secondTicketId].filter(Boolean)));
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.db.delete(user).where(inArray(user.id, [adaId, benId, customerId].filter(Boolean)));
  await t.close();
});

describe("fan-out", () => {
  it("materialises one row per recipient and kind, idempotently, without bodies", async () => {
    const first = await run((tx) => syncNotifications(tx));
    expect(first.skipped).toBe(false);
    expect(first.scannedEvents).toBeGreaterThanOrEqual(5);
    expect(first.scannedNotes).toBe(1);
    expect(first.inserted).toBe(5);
    const rows = await t.db.select().from(supportNotifications).where(inArray(supportNotifications.ticketId, [ticketId, secondTicketId]));
    const byKind = (userId: string) => rows.filter((r) => r.userId === userId).map((r) => r.kind).sort();
    expect(byKind(adaId)).toEqual(["assignment", "customer_reply", "mention", "sla_warning"]);
    expect(byKind(benId)).toEqual(["assignment"]);
    for (const r of rows) expect(JSON.stringify(r.payload)).not.toContain("take this over");
    expect(rows.find((r) => r.kind === "mention")!.sourceKind).toBe("message");
    expect(rows.find((r) => r.kind === "sla_warning")!.mailStatus).toBe("none");
    expect(rows.filter((r) => r.kind === "assignment" || r.kind === "customer_reply").every((r) => r.mailStatus === "pending")).toBe(true);

    const second = await run((tx) => syncNotifications(tx));
    expect(second.inserted).toBe(0);
    const [cursor] = await t.db.select().from(supportNotificationSync).where(eq(supportNotificationSync.id, 1));
    expect(cursor!.eventsThrough).not.toBeNull();
    expect(cursor!.ranAt).not.toBeNull();
  });

  it("claims the mails the recipients want, skips by preference and records the transport outcome", async () => {
    const claimed = await run((tx) => claimNotificationMails(tx));
    expect(claimed.map((m) => `${m.kind}:${m.recipient.name}`).sort()).toEqual(["assignment:Ada Notify", "customer_reply:Ada Notify"]);
    expect(claimed.find((m) => m.kind === "assignment")!.actorName).toBe("Ben Notify");
    expect(claimed.every((m) => m.recipient.locale === "de" && m.number >= 1000)).toBe(true);
    const skipped = await t.db.select().from(supportNotifications).where(eq(supportNotifications.userId, benId));
    expect(skipped.map((r) => r.mailStatus)).toEqual(["skipped"]);

    holder.failNext = true;
    const outcome = await deliverNotificationMails(claimed, run);
    expect(outcome).toEqual({ sent: 1, failed: 1 });
    expect(holder.mails).toHaveLength(2);
    expect(holder.mails.every((m) => m.to.includes(`ada-notify-${stamp}@example.test`) && !m.text.includes("take this over"))).toBe(true);
    expect(holder.mails.map((m) => m.subject).sort().join("|")).toMatch(/dir zugewiesen.*Kundenantwort|Kundenantwort.*dir zugewiesen/);
    const after = await t.db.select().from(supportNotifications).where(eq(supportNotifications.userId, adaId));
    expect(after.filter((r) => r.mailStatus === "sent")).toHaveLength(1);
    const failed = after.find((r) => r.mailStatus === "failed");
    expect(failed?.emailError).toBe("smtp down");
    expect(failed?.emailedAt).toBeNull();

    // nothing is pending any more: a second claim is empty
    expect(await run((tx) => claimNotificationMails(tx))).toEqual([]);
  });

  it("feeds the operator their own rows with ticket and actor names, and marks only their rows read", async () => {
    const feed = await run((tx) => loadNotificationFeed(tx, adaId));
    expect(feed.unread).toBe(4);
    expect(feed.items).toHaveLength(4);
    expect(feed.preferences).toEqual({ emailOnAssignment: true, emailOnCustomerReply: true });
    const assignment = feed.items.find((i) => i.kind === "assignment")!;
    expect(assignment.ticket).toMatchObject({ id: ticketId, subject: "Pixel fires twice", status: "open" });
    expect(assignment.actor).toEqual({ id: benId, name: "Ben Notify" });
    expect(assignment.actorKind).toBe("agent");
    expect(feed.items.find((i) => i.kind === "customer_reply")!.actorKind).toBe("customer");
    expect(feed.items.find((i) => i.kind === "sla_warning")!).toMatchObject({ actorKind: "system", payload: { clock: "first_response" } });
    expect(feed.items.find((i) => i.kind === "mention")!.actor?.name).toBe("Ben Notify");
    expect(JSON.stringify(feed)).not.toContain("@example.test");

    const benFeed = await run((tx) => loadNotificationFeed(tx, benId));
    expect(benFeed.items.map((i) => i.kind)).toEqual(["assignment"]);

    // Ada cannot mark Ben's row, and marking twice changes nothing
    const benRow = (await t.db.select({ id: supportNotifications.id }).from(supportNotifications).where(eq(supportNotifications.userId, benId)))[0]!;
    expect(await run((tx) => markNotificationsRead(tx, adaId, [benRow.id]))).toBe(0);
    expect(await run((tx) => markNotificationsRead(tx, adaId, [assignment.id]))).toBe(1);
    expect(await run((tx) => markNotificationsRead(tx, adaId, [assignment.id]))).toBe(0);
    expect((await run((tx) => loadNotificationFeed(tx, adaId))).unread).toBe(3);
    expect(await run((tx) => markNotificationsRead(tx, adaId, "all"))).toBe(3);
    expect((await run((tx) => loadNotificationFeed(tx, benId))).unread).toBe(1);
  });

  it("unites poll heartbeats and ticket presence into the online list (operators only)", async () => {
    const now = new Date();
    expect((await run((tx) => listOnlineAgents(tx, now))).map((a) => a.userId)).not.toContain(adaId);
    await run((tx) => touchAgentSeen(tx, adaId, now));
    await t.db.insert(supportPresence).values({ ticketId, userId: benId, lastSeenAt: new Date(now.getTime() - 60_000), mode: "viewing" });
    await t.db.insert(supportPresence).values({ ticketId, userId: customerId, lastSeenAt: now, mode: "viewing" });
    const online = await run((tx) => listOnlineAgents(tx, now));
    expect(online.map((a) => a.name)).toEqual(["Ada Notify", "Ben Notify"]);
    expect(online.map((a) => a.userId)).not.toContain(customerId);
    // stale on both sources → gone
    expect((await run((tx) => listOnlineAgents(tx, new Date(now.getTime() + 10 * 60_000)))).map((a) => a.userId)).toEqual([]);
  });

  it("runs the full poll through the actions: heartbeat, fan-out, feed, and an audited preference change", async () => {
    const before = holder.mails.length;
    const result = await pollSupportNotificationsAction();
    expect(result.ok).toBe(true);
    expect(result.feed?.items).toHaveLength(4);
    expect(holder.mails).toHaveLength(before);
    const fanOut = await runNotificationFanOut(run);
    expect(fanOut.sync.inserted).toBe(0);
    expect(fanOut.mails).toEqual({ sent: 0, failed: 0 });

    const prefs = await updateSupportNotificationPreferencesAction({ emailOnAssignment: false, emailOnCustomerReply: true });
    expect(prefs).toEqual({ ok: true, error: null, preferences: { emailOnAssignment: false, emailOnCustomerReply: true } });
    const audits = await t.db.select().from(auditLog).where(eq(auditLog.action, "platform.support_notifications.preferences"));
    const mine = audits.filter((a) => a.targetId === adaId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.diff).toEqual({ before: { emailOnAssignment: true, emailOnCustomerReply: true }, after: { emailOnAssignment: false, emailOnCustomerReply: true } });
    // an unchanged save writes no second row
    await updateSupportNotificationPreferencesAction({ emailOnAssignment: false, emailOnCustomerReply: true });
    expect((await t.db.select().from(auditLog).where(eq(auditLog.action, "platform.support_notifications.preferences"))).filter((a) => a.targetId === adaId)).toHaveLength(1);

    expect(await markSupportNotificationsReadAction({ ids: [] })).toEqual({ ok: false, error: "invalid", changed: 0 });
    expect(await markSupportNotificationsReadAction({ all: true })).toEqual({ ok: true, error: null, changed: 0 });
  });
});
