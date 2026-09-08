import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { alertEvents, auditLog, contactRequests, dataSubjectRequests, deletionJobs, knowledgeFeedback, organization, user, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Runs the inbox loaders and actions against the migrated test database as `tracksite_ops`: a throwaway
 * organisation, two platform operators, three contact requests (one linked to the organisation), two data
 * subject requests with a failed deletion job, two alert events and knowledge votes. The platform access
 * layer is replaced by a minimal double (same transaction helper, same audit shape); mail and Next's cache
 * are stubbed. Asserts that the loaders read the facts back as aggregates and that every mutation leaves an
 * audit row with actor kind `platform`.
 */
const holder = vi.hoisted(() => ({
  db: null as unknown as Db,
  ctx: null as unknown as PlatformContext,
  mails: [] as Array<{ to: string; subject: string; text: string; replyTo?: string }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({ CONTACT_INBOX_EMAIL: "" }) }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (mail: { to: string; subject: string; text: string; replyTo?: string }) => {
    holder.mails.push(mail);
    return { ok: true, transport: "file", id: "outbox" };
  }),
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

import { assignContactAction, replyContactAction, setContactStatusAction } from "./actions/inbox";
import { loadAlertDigest, loadContactRequest, loadInbox, loadKnowledgeDigest, loadPlatformOperators, loadPrivacyOverview, parseInboxFilters } from "./inbox";

const t = testDb();
const stamp = Date.now();
const company = `Ops Inbox Test ${stamp}`;
let orgId = "";
let operatorId = "";
let secondOperatorId = "";
let memberId = "";
let newId = "";
let progressId = "";
let doneId = "";
const KNOWN_GROUP = "ad-blockers-itp-measurement";
const MISSING_GROUP = "ops-inbox-test-missing";

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db.insert(organization).values({ name: company, slug: `ops-inbox-${stamp}` }).returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Ops Tester", email: `ops-inbox-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Second Operator", email: `ops-inbox-2-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
      { name: "Plain Member", email: `ops-inbox-member-${stamp}@example.test`, platformRole: "NONE" },
    ])
    .returning({ id: user.id, name: user.name });
  operatorId = users.find((u) => u.name === "Ops Tester")!.id;
  secondOperatorId = users.find((u) => u.name === "Second Operator")!.id;
  memberId = users.find((u) => u.name === "Plain Member")!.id;
  holder.ctx = {
    user: { id: operatorId, name: "Ops Tester", email: `ops-inbox-${stamp}@example.test`, emailVerified: true, platformRole: "PLATFORM_SUPPORT", locale: "en", twoFactorEnabled: true },
    platformRole: "PLATFORM_SUPPORT",
    actor: { kind: "platform", userId: operatorId, email: `ops-inbox-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
    requestId: `req-${stamp}`,
  };
  const requests = await t.db
    .insert(contactRequests)
    .values([
      { kind: "support", name: "Anna Neu", email: "anna@example.test", company, message: "Hallo,\n\nunser Pixel feuert nicht.\nDanke!", locale: "de", organizationId: orgId },
      { kind: "demo", name: "Ben Busy", email: "ben@example.test", company, message: "Please show me the server-side setup.", locale: "en", status: "in_progress", assigneeUserId: secondOperatorId },
      { kind: "contact", name: "Cara Closed", email: "cara@example.test", company, message: "Already answered, thanks.", locale: "fr", status: "done", handledAt: new Date(), deliveredAt: new Date() },
    ])
    .returning({ id: contactRequests.id, name: contactRequests.name });
  newId = requests.find((r) => r.name === "Anna Neu")!.id;
  progressId = requests.find((r) => r.name === "Ben Busy")!.id;
  doneId = requests.find((r) => r.name === "Cara Closed")!.id;

  const day = 86_400_000;
  const dsars = await t.db
    .insert(dataSubjectRequests)
    .values([
      { organizationId: orgId, kind: "export", subject: { emailHash: "hash-a" }, dueAt: new Date(Date.now() - 2 * day) },
      { organizationId: orgId, kind: "delete", subject: { emailHash: "hash-b" }, dueAt: new Date(Date.now() + 3 * day) },
      { organizationId: orgId, kind: "delete", subject: { emailHash: "hash-c" }, dueAt: new Date(Date.now() + 20 * day), status: "completed", completedAt: new Date() },
    ])
    .returning({ id: dataSubjectRequests.id, kind: dataSubjectRequests.kind });
  await t.db.insert(deletionJobs).values({ organizationId: orgId, dsarId: dsars.find((d) => d.kind === "delete")!.id, store: "events", status: "failed" });

  await t.db.insert(alertEvents).values([
    { organizationId: orgId, kind: "event_drop", subjectKey: `site:${orgId}`, severity: "critical", title: "Event drop" },
    { organizationId: orgId, kind: "event_drop", subjectKey: `site:${orgId}`, severity: "warning", title: "Event drop", resolvedAt: new Date() },
    { organizationId: orgId, kind: "queue_lag", subjectKey: `integration:${orgId}`, severity: "info", title: "Queue lag", triggeredAt: new Date(Date.now() - 10 * day) },
  ]);

  await t.db.insert(knowledgeFeedback).values([
    { translationGroupId: KNOWN_GROUP, locale: "en", helpful: true },
    { translationGroupId: KNOWN_GROUP, locale: "de", helpful: false },
    { translationGroupId: KNOWN_GROUP, locale: "de", helpful: false },
    { translationGroupId: MISSING_GROUP, locale: "en", helpful: true },
  ]);
});

afterAll(async () => {
  await t.db.delete(contactRequests).where(eq(contactRequests.company, company));
  await t.db.delete(knowledgeFeedback).where(inArray(knowledgeFeedback.translationGroupId, [KNOWN_GROUP, MISSING_GROUP]));
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.db.delete(user).where(inArray(user.id, [operatorId, secondOperatorId, memberId].filter(Boolean)));
  await t.close();
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("inbox loaders (test database, tracksite_ops)", () => {
  it("lists open requests by default with whole-inbox counts and honours the filters", async () => {
    const open = await loadInbox(holder.ctx, parseInboxFilters({ q: company }));
    expect(open.entries.map((e) => e.id).sort()).toEqual([newId, progressId].sort());
    expect(open.counts.new).toBeGreaterThanOrEqual(1);
    expect(open.counts.done).toBeGreaterThanOrEqual(1);
    const anna = open.entries.find((e) => e.id === newId)!;
    expect(anna).toMatchObject({ kind: "support", status: "new", locale: "de", delivery: "not_sent", assignee: null, preview: "Hallo, unser Pixel feuert nicht. Danke!" });
    expect(anna.organization).toMatchObject({ id: orgId, name: company });
    const ben = open.entries.find((e) => e.id === progressId)!;
    expect(ben.assignee).toEqual({ id: secondOperatorId, name: "Second Operator" });

    const done = await loadInbox(holder.ctx, parseInboxFilters({ q: company, status: "done" }));
    expect(done.entries.map((e) => e.id)).toEqual([doneId]);
    expect(done.entries[0]!.delivery).toBe("delivered");
    const mine = await loadInbox(holder.ctx, parseInboxFilters({ q: company, status: "all", assignee: secondOperatorId }));
    expect(mine.entries.map((e) => e.id)).toEqual([progressId]);
    const unassigned = await loadInbox(holder.ctx, parseInboxFilters({ q: company, status: "all", assignee: "unassigned", kind: "support" }));
    expect(unassigned.entries.map((e) => e.id)).toEqual([newId]);
    const wildcard = await loadInbox(holder.ctx, parseInboxFilters({ q: "%", status: "all" }));
    expect(wildcard.total).toBe(0);
  });

  it("loads the detail with message, organisation and an empty trail; unknown ids are null", async () => {
    const detail = await loadContactRequest(holder.ctx, newId);
    expect(detail).not.toBeNull();
    expect(detail!.message).toContain("unser Pixel feuert nicht");
    expect(detail!.userLinked).toBe(false);
    expect(detail!.trail).toEqual([]);
    expect(detail!.reference).toHaveLength(10);
    expect(await loadContactRequest(holder.ctx, "not-a-uuid")).toBeNull();
    expect(await loadContactRequest(holder.ctx, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("lists platform operators only", async () => {
    const operators = await loadPlatformOperators(holder.ctx);
    const ids = operators.map((o) => o.id);
    expect(ids).toContain(operatorId);
    expect(ids).toContain(secondOperatorId);
    expect(ids).not.toContain(memberId);
  });

  it("counts data subject requests per organisation without exposing subjects", async () => {
    const overview = await loadPrivacyOverview(holder.ctx);
    expect(overview.available).toBe(true);
    const row = overview.organizations.find((o) => o.id === orgId)!;
    expect(row).toMatchObject({ name: company, open: 2, overdue: 1, completed: 1, rejected: 0, total: 3, failedDeletionJobs: 1 });
    expect(new Date(row.nextDueAt!).getTime()).toBeLessThan(Date.now());
    expect(overview.totals.open).toBeGreaterThanOrEqual(2);
    expect(overview.totals.overdue).toBeGreaterThanOrEqual(1);
    expect(overview.totals.dueSoon).toBeGreaterThanOrEqual(1);
    expect(overview.byKind.find((k) => k.kind === "export")!.open).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(overview)).not.toContain("hash-a");
  });

  it("groups alert events of the last seven days by kind and organisation", async () => {
    const digest = await loadAlertDigest(holder.ctx);
    expect(digest.available).toBe(true);
    const row = digest.rows.find((r) => r.organizationId === orgId && r.kind === "event_drop")!;
    expect(row).toMatchObject({ name: company, total: 2, open: 1, critical: 1, warning: 1 });
    expect(digest.rows.find((r) => r.organizationId === orgId && r.kind === "queue_lag")).toBeUndefined();
    expect(digest.byKind.find((k) => k.kind === "event_drop")!.total).toBeGreaterThanOrEqual(2);
    expect(digest.totals.organizations).toBeGreaterThanOrEqual(1);
  });

  it("aggregates knowledge votes per article and resolves the English title where it exists", async () => {
    const digest = await loadKnowledgeDigest(holder.ctx, "en");
    expect(digest.available).toBe(true);
    const known = digest.rows.find((r) => r.translationGroupId === KNOWN_GROUP)!;
    expect(known).toMatchObject({ helpful: 1, notHelpful: 2, total: 3, helpfulShare: 33, locales: 2 });
    expect(known.title).toBeTruthy();
    expect(known.href).toBe(`/en/tracking-knowledge/${KNOWN_GROUP}`);
    const missing = digest.rows.find((r) => r.translationGroupId === MISSING_GROUP)!;
    expect(missing).toMatchObject({ helpful: 1, notHelpful: 0, total: 1, helpfulShare: 100, title: null, href: null });
    expect(digest.rows.indexOf(known)).toBeLessThan(digest.rows.indexOf(missing));
  });
});

describe("inbox actions (test database)", () => {
  it("moves a request along the workflow, requires confirmation for spam and audits every step", async () => {
    expect(await setContactStatusAction({ requestId: progressId, status: "in_progress" })).toEqual({ ok: false, error: "unchanged" });
    expect(await setContactStatusAction({ requestId: doneId, status: "spam", confirmed: true })).toEqual({ ok: false, error: "invalid_transition" });
    expect(await setContactStatusAction({ requestId: progressId, status: "spam" })).toEqual({ ok: false, error: "confirmation_required" });
    expect(await setContactStatusAction({ requestId: progressId, status: "spam", confirmed: true })).toEqual({ ok: true, error: null });
    const [spam] = await t.db.select().from(contactRequests).where(eq(contactRequests.id, progressId));
    expect(spam!.status).toBe("spam");
    expect(spam!.handledAt).not.toBeNull();
    expect(await setContactStatusAction({ requestId: progressId, status: "new" })).toEqual({ ok: true, error: null });
    const [reopened] = await t.db.select().from(contactRequests).where(eq(contactRequests.id, progressId));
    expect(reopened!.handledAt).toBeNull();
    const audits = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetType, "contact_request"), eq(auditLog.targetId, progressId), eq(auditLog.action, "platform.contact_request.status")));
    expect(audits).toHaveLength(2);
    expect(audits[0]!.actor).toMatchObject({ kind: "platform", userId: operatorId });
    expect(audits[0]!.organizationId).toBeNull();
    const detail = await loadContactRequest(holder.ctx, progressId);
    expect(detail!.trail).toHaveLength(2);
    expect(detail!.trail[0]).toMatchObject({ action: "platform.contact_request.status", actorUserId: operatorId, actorName: "Ops Tester" });
  });

  it("assigns only platform operators", async () => {
    expect(await assignContactAction({ requestId: newId, assigneeUserId: memberId })).toEqual({ ok: false, error: "invalid_assignee" });
    expect(await assignContactAction({ requestId: newId, assigneeUserId: secondOperatorId })).toEqual({ ok: true, error: null });
    expect(await assignContactAction({ requestId: newId, assigneeUserId: secondOperatorId })).toEqual({ ok: false, error: "unchanged" });
    expect(await assignContactAction({ requestId: newId, assigneeUserId: null })).toEqual({ ok: true, error: null });
    expect(await assignContactAction({ requestId: "00000000-0000-4000-8000-000000000000", assigneeUserId: null })).toEqual({ ok: false, error: "not_found" });
  });

  it("replies through the requester-language template, takes over the request and audits the send without the body", async () => {
    const initial = { ok: false, error: null, transport: null };
    const invalid = await replyContactAction(initial, form({ requestId: newId, body: "short", confirmed: "true" }));
    expect(invalid).toMatchObject({ ok: false, error: "invalid", fieldErrors: { body: "invalid" } });
    expect(await replyContactAction(initial, form({ requestId: newId, body: "Long enough answer text.", confirmed: "" }))).toMatchObject({ ok: false, error: "confirmation_required" });
    const body = "Danke für die Meldung – wir haben den Pixel-Fehler gefunden und behoben.";
    const sent = await replyContactAction(initial, form({ requestId: newId, body, confirmed: "true" }));
    expect(sent).toEqual({ ok: true, error: null, transport: "file" });
    const mail = holder.mails.at(-1)!;
    expect(mail.to).toBe("anna@example.test");
    expect(mail.subject).toMatch(/^Antwort auf deine Anfrage an Track \[[0-9A-F]{10}\]$/);
    expect(mail.text).toContain("Hallo Anna Neu");
    expect(mail.text).toContain(body);
    expect(mail.text).toContain("Ops Tester");
    const [row] = await t.db.select().from(contactRequests).where(eq(contactRequests.id, newId));
    expect(row!.status).toBe("in_progress");
    expect(row!.assigneeUserId).toBe(operatorId);
    const [audit] = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, newId), eq(auditLog.action, "platform.contact_request.reply")));
    expect(audit!.diff).toMatchObject({ ok: true, transport: "file", locale: "de", bodyLength: body.length, statusFrom: "new", statusTo: "in_progress", assignedToSelf: true });
    expect(JSON.stringify(audit!.diff)).not.toContain("Pixel-Fehler");
    expect(audit!.metadata).toMatchObject({ linkedOrganizationId: orgId });
    // spam requests cannot be answered
    await setContactStatusAction({ requestId: progressId, status: "spam", confirmed: true });
    expect(await replyContactAction(initial, form({ requestId: progressId, body, confirmed: "true" }))).toMatchObject({ ok: false, error: "invalid_transition" });
  });
});
