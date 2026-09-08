import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, contactRequests, supportAgentSettings, supportEvents, supportSettings, supportTickets, user, withPlatform as asOps, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";

/**
 * The public contact form against the migrated test database: one request creates the ticket (channel
 * `form`), links `contact_requests.ticket_id`, runs the desk's round-robin assignment **before** the creation
 * audit — so the `support.ticket.create` diff carries `autoAssigneeUserId` / `autoAssignCandidates` — and the
 * pick writes its own `support.ticket.auto_assign` row; with strategy `none` the diff says so honestly. No
 * audit row ever carries the message or the sender's address. Next's headers, the session, the transport and
 * the knowledge base are stubbed; the database is the real one on the application connection.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("@/env", () => ({ env: () => ({ AUTH_SECRET: "test-secret" }) }));
vi.mock("@/server/db", () => ({ db: () => holder.db, logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => ({ ok: true, transport: "file", id: "outbox" })) }));
vi.mock("@/server/session", () => ({ getSession: async () => null, isMemberOf: async () => false, withOrg: vi.fn() }));
vi.mock("@/lib/knowledge", () => ({ searchKnowledge: () => [] }));

import { AUTO_ASSIGN_ACTOR, AUTO_ASSIGN_AUDIT_ACTION } from "@/server/support/auto-assign";
import { submitContactAction } from "./contact";

const t = testDb();
const stamp = Date.now();
const MESSAGE = "The pixel fires twice on the checkout page, please have a look.";
let agentId = "";
let previousSettings: typeof supportSettings.$inferSelect | null = null;
const initial = { ok: false, error: null } as const;

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

async function setStrategy(strategy: "none" | "round_robin"): Promise<void> {
  await asOps(t.db, (tx) => tx.insert(supportSettings).values({ id: 1, autoAssignStrategy: strategy, autoReplyEnabled: false }).onConflictDoUpdate({ target: supportSettings.id, set: { autoAssignStrategy: strategy, autoReplyEnabled: false } }));
}

async function submitted(email: string) {
  return asOps(t.db, async (tx) => {
    const [ticket] = await tx.select({ id: supportTickets.id, number: supportTickets.number, channel: supportTickets.channel, status: supportTickets.status, assigneeUserId: supportTickets.assigneeUserId, organizationId: supportTickets.organizationId }).from(supportTickets).where(eq(supportTickets.requesterEmail, email));
    const [request] = await tx.select({ ticketId: contactRequests.ticketId, kind: contactRequests.kind }).from(contactRequests).where(eq(contactRequests.email, email));
    const events = ticket ? await tx.select({ kind: supportEvents.kind, actorKind: supportEvents.actorKind }).from(supportEvents).where(eq(supportEvents.ticketId, ticket.id)).orderBy(supportEvents.createdAt, supportEvents.kind) : [];
    const audits = ticket
      ? await tx.select({ action: auditLog.action, actor: auditLog.actor, organizationId: auditLog.organizationId, diff: auditLog.diff, metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.targetType, "support_ticket"), eq(auditLog.targetId, ticket.id))).orderBy(auditLog.id)
      : [];
    return { ticket, request, events, audits };
  });
}

beforeAll(async () => {
  holder.db = t.db;
  const [agent] = await t.db.insert(user).values({ name: "Aaron Form", email: `aaron-form-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" }).returning({ id: user.id });
  agentId = agent!.id;
  // the agent polled the console a moment ago: online for the round robin
  await t.db.insert(supportAgentSettings).values({ userId: agentId, lastSeenAt: new Date() });
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
    await tx.delete(contactRequests).where(like(contactRequests.email, `grace-form-${stamp}-%`));
    await tx.delete(supportTickets).where(like(supportTickets.requesterEmail, `grace-form-${stamp}-%`));
  });
  await t.db.delete(user).where(inArray(user.id, [agentId]));
  await t.close();
});

describe("submitContactAction", () => {
  it("creates the ticket, assigns it before the creation audit and carries the outcome in the diff", async () => {
    await setStrategy("round_robin");
    const email = `grace-form-${stamp}-rr@example.test`;
    const result = await submitContactAction(initial, form({ kind: "support", name: "Grace Hopper", email, message: MESSAGE, locale: "de" }));
    expect(result).toEqual({ ok: true, error: null });

    const { ticket, request, events, audits } = await submitted(email);
    expect(ticket).toMatchObject({ channel: "form", status: "new", assigneeUserId: agentId, organizationId: null });
    expect(request).toEqual({ ticketId: ticket!.id, kind: "support" });
    expect(events.map((e) => e.kind).sort()).toEqual(["assignee", "created"]);

    expect(audits.map((a) => a.action).sort()).toEqual([AUTO_ASSIGN_AUDIT_ACTION, "support.ticket.create"]);
    const created = audits.find((a) => a.action === "support.ticket.create")!;
    expect(created.actor).toEqual({ kind: "system", name: "contact_form" });
    expect(created.diff).toMatchObject({ number: Number(ticket!.number), channel: "form", kind: "support", locale: "de", bodyLength: MESSAGE.length, signedIn: false, autoAssignStrategy: "round_robin", autoAssigneeUserId: agentId });
    expect((created.diff as { autoAssignCandidates: number }).autoAssignCandidates).toBeGreaterThanOrEqual(1);
    const assigned = audits.find((a) => a.action === AUTO_ASSIGN_AUDIT_ACTION)!;
    expect(assigned).toMatchObject({ actor: AUTO_ASSIGN_ACTOR, organizationId: null, diff: { assigneeFrom: null, assigneeTo: agentId, reason: "round_robin" }, metadata: { module: "support", ticketNumber: Number(ticket!.number), source: "form" } });

    const serialised = JSON.stringify(audits);
    expect(serialised).not.toContain(MESSAGE.slice(0, 20));
    expect(serialised).not.toContain(email);
    expect(serialised).not.toContain("Grace Hopper");
  });

  it("records the null outcome honestly when the desk has no strategy", async () => {
    await setStrategy("none");
    const email = `grace-form-${stamp}-none@example.test`;
    const result = await submitContactAction(initial, form({ kind: "contact", name: "Grace Hopper", email, message: MESSAGE, locale: "en" }));
    expect(result).toEqual({ ok: true, error: null });

    const { ticket, request, events, audits } = await submitted(email);
    expect(ticket).toMatchObject({ channel: "form", status: "new", assigneeUserId: null });
    expect(request?.ticketId).toBe(ticket!.id);
    expect(events.map((e) => e.kind)).toEqual(["created"]);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action).toBe("support.ticket.create");
    expect(audits[0]!.diff).toMatchObject({ kind: "contact", autoAssignStrategy: "none", autoAssigneeUserId: null, autoAssignCandidates: 0 });
  });
});
