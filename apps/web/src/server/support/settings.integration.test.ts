import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, supportInboundEvents, supportPresence, supportSettings, supportTickets, user, withPlatform as asOps, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Desk settings against the migrated test database as `tracksite_ops`: the singleton row (missing → defaults,
 * saved → stored), the admin-only action with its audit row (signature as lengths only), the online-agent
 * count from `support_presence` and the round-robin pick. Platform access is a double that enforces role and
 * permission; Next's cache and the mail transport are stubbed.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, ctx: null as unknown as PlatformContext }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
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
    auditPlatform: async (ctx: { user: { id: string }; requestId: string }, entry: Record<string, unknown>, tx?: { insert: typeof holder.db.insert }) => {
      const id = newUlid();
      await (tx ?? holder.db).insert(audit).values({
        id,
        organizationId: null,
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

import { updateSupportSettingsAction } from "@/server/ops/actions/support-settings";
import { INBOUND_LEDGER_STALE_MS, SETTINGS_ROW_ID, chooseRoundRobinAssignee, countAgentsOnline, listAgentsOnline, loadInboundLedger, loadSupportSettings, resolveAutoAssignee } from "./settings";

const t = testDb();
const stamp = Date.now();
const ledgerPrefix = `t5-ledger-${stamp}`;
let adminId = "";
let busyId = "";
let idleId = "";
let awayId = "";
let ticketIds: string[] = [];

const ctxFor = (id: string, role: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN"): PlatformContext => ({
  user: { id, name: "Operator", email: `${id}@example.test`, emailVerified: true, platformRole: role, locale: "en", twoFactorEnabled: true },
  platformRole: role,
  actor: { kind: "platform", userId: id, email: `${id}@example.test`, platformRole: role },
  requestId: `req-${stamp}`,
});

const base: Record<string, string> = {
  fromName: "Track Support",
  fromAddress: "support@track.site",
  inboundDomain: "support.track.site",
  signatureText: "",
  autoAssignStrategy: "none",
  csatEnabled: "on",
  timezone: "Europe/Berlin",
  day_mon_enabled: "on",
  day_mon_start: "09:00",
  day_mon_end: "18:00",
};
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const initial = { ok: false, error: null, notice: null } as const;

beforeAll(async () => {
  holder.db = t.db;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Ada Admin", email: `settings-admin-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
      { name: "Busy Agent", email: `settings-busy-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Idle Agent", email: `settings-idle-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Away Agent", email: `settings-away-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
    ])
    .returning({ id: user.id, name: user.name });
  const id = (name: string) => users.find((u) => u.name === name)!.id;
  adminId = id("Ada Admin");
  busyId = id("Busy Agent");
  idleId = id("Idle Agent");
  awayId = id("Away Agent");
  holder.ctx = ctxFor(adminId, "PLATFORM_ADMIN");
  await asOps(t.db, async (tx) => {
    await tx.delete(supportSettings).where(eq(supportSettings.id, SETTINGS_ROW_ID));
    const tickets = await tx
      .insert(supportTickets)
      .values([
        { requesterEmail: `r1-${stamp}@example.test`, subject: "one", channel: "email", status: "open", assigneeUserId: busyId },
        { requesterEmail: `r2-${stamp}@example.test`, subject: "two", channel: "email", status: "pending", assigneeUserId: busyId },
        { requesterEmail: `r3-${stamp}@example.test`, subject: "three", channel: "form", status: "solved", assigneeUserId: idleId },
      ])
      .returning({ id: supportTickets.id });
    ticketIds = tickets.map((r) => r.id);
    const now = new Date();
    await tx.insert(supportPresence).values([
      { ticketId: ticketIds[0]!, userId: busyId, lastSeenAt: now, mode: "viewing" },
      { ticketId: ticketIds[0]!, userId: idleId, lastSeenAt: new Date(now.getTime() - 2 * 60_000), mode: "viewing" },
      { ticketId: ticketIds[1]!, userId: idleId, lastSeenAt: now, mode: "typing" },
      { ticketId: ticketIds[2]!, userId: awayId, lastSeenAt: new Date(now.getTime() - 25 * 60_000), mode: "viewing" },
    ]);
    await tx.insert(supportInboundEvents).values([
      { providerEventId: `${ledgerPrefix}-processed`, provider: "resend", receivedAt: new Date(now.getTime() - 5 * 60_000), processedAt: new Date(now.getTime() - 4 * 60_000), status: "processed", ticketId: ticketIds[0]! },
      { providerEventId: `${ledgerPrefix}-failed`, provider: "resend", receivedAt: new Date(now.getTime() - 3 * 60_000), processedAt: new Date(now.getTime() - 3 * 60_000), status: "failed", error: "receiving API\n 500   Internal Server Error" },
      { providerEventId: `${ledgerPrefix}-ignored`, provider: "resend", receivedAt: new Date(now.getTime() - 2 * 60_000), processedAt: new Date(now.getTime() - 2 * 60_000), status: "ignored", error: "not for the ledger" },
      { providerEventId: `${ledgerPrefix}-stale`, provider: "resend", receivedAt: new Date(now.getTime() - INBOUND_LEDGER_STALE_MS - 60_000), status: "received" },
      { providerEventId: `${ledgerPrefix}-fresh`, provider: "resend", receivedAt: new Date(now.getTime() - 30_000), status: "received" },
      { providerEventId: `${ledgerPrefix}-old`, provider: "resend", receivedAt: new Date(now.getTime() - 40 * 86_400_000), processedAt: new Date(now.getTime() - 40 * 86_400_000), status: "failed", error: "outside the window" },
    ]);
  });
});

afterAll(async () => {
  await asOps(t.db, async (tx) => {
    await tx.delete(supportInboundEvents).where(sql`${supportInboundEvents.providerEventId} LIKE ${`${ledgerPrefix}-%`}`);
    if (ticketIds.length) await tx.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
    await tx.delete(supportSettings).where(eq(supportSettings.id, SETTINGS_ROW_ID));
  });
  await t.db.delete(user).where(inArray(user.id, [adminId, busyId, idleId, awayId].filter(Boolean)));
  await t.close();
});

describe("settings row", () => {
  it("reports the schema defaults while no row exists", async () => {
    const view = await loadSupportSettings(holder.ctx);
    expect(view.stored).toBe(false);
    expect(view).toMatchObject({ fromName: "Track Support", fromAddress: "support@track.site", inboundDomain: "support.track.site", autoReplyEnabled: false, autoAssignStrategy: "none", csatEnabled: true });
    expect(view.effective.inboundDomain).toBe("support.track.site");
    expect(view.envOverrides).toEqual({ inboundDomain: false, fromAddress: false });
  });

  it("is admin-only", async () => {
    holder.ctx = ctxFor(busyId, "PLATFORM_SUPPORT");
    expect(await updateSupportSettingsAction(initial, form(base))).toMatchObject({ ok: false, error: "forbidden" });
    holder.ctx = ctxFor(adminId, "PLATFORM_ADMIN");
  });

  it("validates the fields", async () => {
    const result = await updateSupportSettingsAction(initial, form({ ...base, fromAddress: "not-an-address", inboundDomain: "https://x.example", timezone: "Nowhere/Land", day_tue_enabled: "on", day_tue_start: "18:00", day_tue_end: "09:00" }));
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(result.fieldErrors).toEqual({ fromAddress: "email", inboundDomain: "hostname", timezone: "timezone", day_tue: "window" });
    expect(await t.db.select().from(auditLog).where(eq(auditLog.targetType, "support_settings"))).toHaveLength(0);
  });

  it("creates the row on first save, audits the field changes without the signature, and refuses unchanged saves", async () => {
    const saved = await updateSupportSettingsAction(initial, form({ ...base, fromName: "Help Desk", signatureText: "Kind regards\r\nThe team  ", autoReplyEnabled: "on", autoAssignStrategy: "round_robin", inboundDomain: "Help.Example.COM" }));
    expect(saved).toMatchObject({ ok: true, notice: "settingsSaved" });
    const view = await loadSupportSettings(holder.ctx);
    expect(view.stored).toBe(true);
    expect(view).toMatchObject({ fromName: "Help Desk", inboundDomain: "help.example.com", signatureText: "Kind regards\nThe team", autoReplyEnabled: true, autoAssignStrategy: "round_robin", csatEnabled: true });
    expect(view.businessHours).toEqual({ timezone: "Europe/Berlin", days: { mon: [[540, 1080]] } });
    const rows = await t.db.select().from(auditLog).where(and(eq(auditLog.targetType, "support_settings"), eq(auditLog.targetId, String(SETTINGS_ROW_ID))));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("platform.support_settings.update");
    expect(rows[0]!.metadata).toMatchObject({ created: true });
    expect(rows[0]!.diff).toMatchObject({ fromName: { before: "Track Support", after: "Help Desk" }, signatureText: { changed: true, lengthBefore: 0, lengthAfter: 21 }, autoReplyEnabled: { before: false, after: true } });
    expect(JSON.stringify(rows[0]!.diff)).not.toContain("Kind regards");

    const again = await updateSupportSettingsAction(initial, form({ ...base, fromName: "Help Desk", signatureText: "Kind regards\nThe team", autoReplyEnabled: "on", autoAssignStrategy: "round_robin", inboundDomain: "help.example.com" }));
    expect(again).toMatchObject({ ok: false, error: "unchanged" });
    expect(await t.db.select().from(auditLog).where(eq(auditLog.targetType, "support_settings"))).toHaveLength(1);
  });
});

describe("agents online and round robin", () => {
  it("counts operators seen within the window and picks the least loaded one", async () => {
    await asOps(t.db, async (tx) => {
      const online = await listAgentsOnline(tx);
      const ids = online.map((a) => a.userId);
      expect(ids).toContain(busyId);
      expect(ids).toContain(idleId);
      expect(ids).not.toContain(awayId);
      const pick = await chooseRoundRobinAssignee(tx);
      expect(pick).toMatchObject({ userId: idleId, name: "Idle Agent", openTickets: 0 });
      expect(pick!.candidates).toBeGreaterThanOrEqual(2);
      expect(await chooseRoundRobinAssignee(tx, { exclude: [idleId] })).toMatchObject({ userId: busyId, openTickets: 2 });
      expect(await chooseRoundRobinAssignee(tx, { exclude: [idleId, busyId] })).toBeNull();
      expect(await resolveAutoAssignee(tx, { autoAssignStrategy: "none" })).toBeNull();
      expect((await resolveAutoAssignee(tx, { autoAssignStrategy: "round_robin" }))?.userId).toBe(idleId);
    });
    expect(await countAgentsOnline(holder.ctx)).toBeGreaterThanOrEqual(2);
  });
});

describe("inbound ledger", () => {
  it("lists the latest deliveries with ticket numbers, shortened errors and stale flags, and counts the window", async () => {
    const ledger = await loadInboundLedger(holder.ctx, { limit: 50, windowDays: 7 });
    const mine = ledger.entries.filter((e) => e.providerEventId.startsWith(ledgerPrefix));
    expect(mine.map((e) => e.providerEventId.slice(ledgerPrefix.length + 1))).toEqual(["fresh", "ignored", "failed", "processed", "stale", "old"]);
    const byKey = Object.fromEntries(mine.map((e) => [e.providerEventId.slice(ledgerPrefix.length + 1), e]));
    expect(byKey.processed).toMatchObject({ status: "processed", ticketId: ticketIds[0], error: null, stale: false });
    expect(typeof byKey.processed!.ticketNumber).toBe("number");
    expect(byKey.failed).toMatchObject({ status: "failed", ticketId: null, ticketNumber: null, error: "receiving API 500 Internal Server Error", stale: false });
    expect(byKey.ignored).toMatchObject({ status: "ignored", error: null });
    expect(byKey.stale).toMatchObject({ status: "received", stale: true, processedAt: null });
    expect(byKey.fresh).toMatchObject({ status: "received", stale: false });
    expect(ledger.counts.processed).toBeGreaterThanOrEqual(1);
    expect(ledger.counts.failed).toBeGreaterThanOrEqual(1);
    expect(ledger.counts.ignored).toBeGreaterThanOrEqual(1);
    expect(ledger.counts.received).toBeGreaterThanOrEqual(2);
    expect(ledger.windowTotal).toBe(Object.values(ledger.counts).reduce((a, b) => a + b, 0));
    expect(ledger).toMatchObject({ windowDays: 7, limit: 50 });

    const narrow = await loadInboundLedger(holder.ctx, { limit: 2, windowDays: 1 });
    expect(narrow.entries).toHaveLength(2);
    expect(narrow.limit).toBe(2);
    const wide = await loadInboundLedger(holder.ctx, { limit: 50, windowDays: 60 });
    expect(wide.counts.failed).toBeGreaterThanOrEqual(ledger.counts.failed + 1);
  });
});
