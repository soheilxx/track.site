import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "./client.ts";
import { organization } from "./schema/auth.ts";
import { contactRequests } from "./schema/platform.ts";
import { supportAttachments, supportEvents, supportMacros, supportMessages, supportSettings, supportSlaPolicies, supportTickets } from "./schema/support.ts";
import { testDb } from "./testing.ts";

/**
 * Tenant visibility of the support desk tables (migration 0015, docs/18 §3): a tenant sees its own tickets
 * but never internal notes, note attachments, agent-only events, other organisations' tickets or the
 * operator-only tables; writes are limited to customer inbound messages and the ticket row.
 */
const t = testDb();
let orgA = "";
let orgB = "";
let ticketA = "";
let ticketB = "";
let ticketNone = "";
let noteId = "";
let inboundId = "";
let policyId = "";
let macroId = "";

const isDenied = (e: unknown) => {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: string }).code;
    if (code === "42501") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
};

beforeAll(async () => {
  const rows = await t.db
    .insert(organization)
    .values([
      { name: "Support A", slug: `support-a-${Date.now()}` },
      { name: "Support B", slug: `support-b-${Date.now()}` },
    ])
    .returning({ id: organization.id });
  orgA = rows[0]!.id;
  orgB = rows[1]!.id;
  // the integration global setup truncates every table (seeds included): fixtures stand in for the migration's rows
  await withPlatform(t.db, async (tx) => {
    const [existingDefault] = await tx.select({ id: supportSlaPolicies.id }).from(supportSlaPolicies).where(eq(supportSlaPolicies.isDefault, true)).limit(1);
    if (existingDefault) policyId = existingDefault.id;
    else {
      const [policy] = await tx.insert(supportSlaPolicies).values({ name: "test default", isDefault: true }).returning({ id: supportSlaPolicies.id });
      policyId = policy!.id;
    }
    const [macro] = await tx.insert(supportMacros).values({ name: "test global", bodyText: "hello", scope: "global", ownerUserId: null }).returning({ id: supportMacros.id });
    macroId = macro!.id;
    await tx.insert(supportSettings).values({ id: 1 }).onConflictDoNothing();
  });
  // operators (tracksite_ops) create tickets for A, B and an unknown sender
  await withPlatform(t.db, async (tx) => {
    const inserted = await tx
      .insert(supportTickets)
      .values([
        { organizationId: orgA, requesterEmail: "a@example.test", subject: "A", channel: "email" },
        { organizationId: orgB, requesterEmail: "b@example.test", subject: "B", channel: "form" },
        { organizationId: null, requesterEmail: "nobody@example.test", subject: "?", channel: "email" },
      ])
      .returning({ id: supportTickets.id, number: supportTickets.number });
    ticketA = inserted[0]!.id;
    ticketB = inserted[1]!.id;
    ticketNone = inserted[2]!.id;
    expect(inserted.map((r) => r.number)).toEqual([...inserted.map((r) => r.number)].sort((x, y) => x - y));
    expect(inserted[0]!.number).toBeGreaterThanOrEqual(1000);
    const messages = await tx
      .insert(supportMessages)
      .values([
        { ticketId: ticketA, organizationId: orgA, direction: "inbound", authorKind: "customer", textBody: "hello", messageId: "in1@example.test" },
        { ticketId: ticketA, organizationId: orgA, direction: "outbound", authorKind: "agent", textBody: "answer", messageId: "t1.abc@support.track.site" },
        { ticketId: ticketA, organizationId: orgA, direction: "note", authorKind: "agent", textBody: "internal: customer is on trial" },
      ])
      .returning({ id: supportMessages.id, direction: supportMessages.direction });
    inboundId = messages.find((m) => m.direction === "inbound")!.id;
    noteId = messages.find((m) => m.direction === "note")!.id;
    await tx.insert(supportAttachments).values([
      { messageId: inboundId, ticketId: ticketA, organizationId: orgA, fileName: "a.png", contentType: "image/png", sizeBytes: 3, sha256: "x", content: Buffer.from("abc") },
      { messageId: noteId, ticketId: ticketA, organizationId: orgA, fileName: "secret.pdf", contentType: "application/pdf", sizeBytes: 3, sha256: "y", content: Buffer.from("pdf") },
    ]);
    await tx.insert(supportEvents).values([
      { ticketId: ticketA, organizationId: orgA, actorKind: "system", kind: "created", payload: {} },
      { ticketId: ticketA, organizationId: orgA, actorKind: "agent", kind: "assignee", payload: { to: "someone" } },
      { ticketId: ticketA, organizationId: orgA, actorKind: "agent", kind: "note", payload: { messageId: noteId } },
      { ticketId: ticketA, organizationId: orgA, actorKind: "system", kind: "sla_breach", payload: { which: "first_response" } },
    ]);
  });
});

afterAll(async () => {
  await withPlatform(t.db, (tx) => tx.delete(supportTickets).where(sql`${supportTickets.id} IN (${ticketA}, ${ticketB}, ${ticketNone})`));
  await withPlatform(t.db, (tx) => tx.delete(supportMacros).where(eq(supportMacros.id, macroId)));
  await withPlatform(t.db, (tx) => tx.delete(supportSlaPolicies).where(sql`${supportSlaPolicies.id} = ${policyId} AND ${supportSlaPolicies.name} = 'test default'`));
  await t.db.delete(organization).where(sql`${organization.id} IN (${orgA}, ${orgB})`);
  await t.close();
});

describe("support desk RLS", () => {
  it("shows a tenant only its own tickets, never unassigned ones", async () => {
    const seenByA = await withTenant(t.db, orgA, (tx) => tx.select({ id: supportTickets.id }).from(supportTickets));
    expect(seenByA.map((r) => r.id)).toEqual([ticketA]);
    const stolen = await withTenant(t.db, orgA, (tx) => tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, ticketB)));
    expect(stolen).toHaveLength(0);
    const orphan = await withTenant(t.db, orgB, (tx) => tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, ticketNone)));
    expect(orphan).toHaveLength(0);
  });

  it("hides internal notes, note attachments and agent-only events from the tenant", async () => {
    const messages = await withTenant(t.db, orgA, (tx) => tx.select({ direction: supportMessages.direction }).from(supportMessages).where(eq(supportMessages.ticketId, ticketA)));
    expect(messages.map((m) => m.direction).sort()).toEqual(["inbound", "outbound"]);
    const attachments = await withTenant(t.db, orgA, (tx) => tx.select({ fileName: supportAttachments.fileName }).from(supportAttachments));
    expect(attachments.map((a) => a.fileName)).toEqual(["a.png"]);
    const events = await withTenant(t.db, orgA, (tx) => tx.select({ kind: supportEvents.kind }).from(supportEvents).where(eq(supportEvents.ticketId, ticketA)));
    expect(events.map((e) => e.kind)).toEqual(["created"]);
    // operators see everything
    const all = await withPlatform(t.db, (tx) => tx.select({ direction: supportMessages.direction }).from(supportMessages).where(eq(supportMessages.ticketId, ticketA)));
    expect(all).toHaveLength(3);
  });

  it("lets a tenant add a customer reply to its own ticket but nothing else", async () => {
    const [reply] = await withTenant(t.db, orgA, (tx) =>
      tx.insert(supportMessages).values({ ticketId: ticketA, organizationId: orgA, direction: "inbound", authorKind: "customer", textBody: "more" }).returning({ id: supportMessages.id }),
    );
    expect(reply?.id).toBeTruthy();
    await expect(withTenant(t.db, orgA, (tx) => tx.insert(supportMessages).values({ ticketId: ticketA, organizationId: orgA, direction: "note", authorKind: "customer", textBody: "x" }))).rejects.toThrow();
    await expect(withTenant(t.db, orgA, (tx) => tx.insert(supportMessages).values({ ticketId: ticketA, organizationId: orgA, direction: "outbound", authorKind: "agent", textBody: "x" }))).rejects.toThrow();
    await expect(withTenant(t.db, orgA, (tx) => tx.insert(supportMessages).values({ ticketId: ticketB, organizationId: orgB, direction: "inbound", authorKind: "customer", textBody: "x" }))).rejects.toThrow();
    await expect(withTenant(t.db, orgA, (tx) => tx.update(supportMessages).set({ textBody: "edited" }).where(eq(supportMessages.id, inboundId)))).rejects.toSatisfy(isDenied);
    await expect(withTenant(t.db, orgA, (tx) => tx.delete(supportMessages).where(eq(supportMessages.id, inboundId)))).rejects.toSatisfy(isDenied);
  });

  it("lets a tenant update but not delete its ticket, and never touch another organisation's", async () => {
    const updated = await withTenant(t.db, orgA, (tx) => tx.update(supportTickets).set({ satisfaction: { score: 5, answered_at: new Date().toISOString() } }).where(eq(supportTickets.id, ticketA)).returning({ id: supportTickets.id }));
    expect(updated).toHaveLength(1);
    const foreign = await withTenant(t.db, orgA, (tx) => tx.update(supportTickets).set({ subject: "hacked" }).where(eq(supportTickets.id, ticketB)).returning({ id: supportTickets.id }));
    expect(foreign).toHaveLength(0);
    await expect(withTenant(t.db, orgA, (tx) => tx.delete(supportTickets).where(eq(supportTickets.id, ticketA)))).rejects.toSatisfy(isDenied);
    await expect(withTenant(t.db, orgA, (tx) => tx.insert(supportTickets).values({ organizationId: orgB, requesterEmail: "x@example.test", subject: "x", channel: "dashboard" }))).rejects.toThrow();
  });

  it("keeps macros and settings operator-only and SLA policies read-only", async () => {
    await expect(withTenant(t.db, orgA, (tx) => tx.select({ id: supportMacros.id }).from(supportMacros))).rejects.toSatisfy(isDenied);
    await expect(withTenant(t.db, orgA, (tx) => tx.select({ id: supportSettings.id }).from(supportSettings))).rejects.toSatisfy(isDenied);
    const policies = await withTenant(t.db, orgA, (tx) => tx.select({ isDefault: supportSlaPolicies.isDefault }).from(supportSlaPolicies));
    expect(policies.some((p) => p.isDefault)).toBe(true);
    await expect(withTenant(t.db, orgA, (tx) => tx.update(supportSlaPolicies).set({ name: "x" }))).rejects.toSatisfy(isDenied);
    const globals = await withPlatform(t.db, (tx) => tx.select({ id: supportMacros.id }).from(supportMacros).where(eq(supportMacros.scope, "global")));
    expect(globals.map((m) => m.id)).toContain(macroId);
  });

  it("enforces the settings singleton, one default policy and the macro scope rule", async () => {
    await expect(withPlatform(t.db, (tx) => tx.insert(supportSettings).values({ id: 2 }))).rejects.toThrow();
    await expect(withPlatform(t.db, (tx) => tx.insert(supportSlaPolicies).values({ name: "second default", isDefault: true }))).rejects.toThrow();
    await expect(withPlatform(t.db, (tx) => tx.insert(supportMacros).values({ name: "bad", bodyText: "x", scope: "global", ownerUserId: orgA }))).rejects.toThrow();
    await expect(withPlatform(t.db, (tx) => tx.insert(supportMacros).values({ name: "bad", bodyText: "x", scope: "personal", ownerUserId: null }))).rejects.toThrow();
  });

  it("links contact requests to tickets and clears the link when the ticket goes", async () => {
    const [request] = await withPlatform(t.db, (tx) =>
      tx.insert(contactRequests).values({ kind: "support", name: "N", email: "n@example.test", message: "help me please", ticketId: ticketNone }).returning({ id: contactRequests.id }),
    );
    await withPlatform(t.db, (tx) => tx.delete(supportTickets).where(eq(supportTickets.id, ticketNone)));
    const [after] = await withPlatform(t.db, (tx) => tx.select({ ticketId: contactRequests.ticketId }).from(contactRequests).where(eq(contactRequests.id, request!.id)));
    expect(after?.ticketId).toBeNull();
    await withPlatform(t.db, (tx) => tx.delete(contactRequests).where(eq(contactRequests.id, request!.id)));
  });
});
