import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, supportMacros, user, withPlatform as asOps, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Macro loaders, helpers and actions against the migrated test database as `tracksite_ops`: two operators
 * (support, admin), one global macro and one personal macro of the admin. The platform access layer is
 * replaced by a double that enforces the minimum role and the permission the way `requirePlatform` does;
 * Next's cache is stubbed. Asserts the scope rules end to end, the audit rows (without bodies) and the
 * usage counter.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, ctx: null as unknown as PlatformContext }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({}) }));
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

import { deleteMacroAction, saveMacroAction } from "@/server/ops/actions/support-macros";
import { agentOf, applyMacro, listMacroOptions, listMacros, loadMacro, loadMacroForUse, recordMacroUsage } from "./macros";

const t = testDb();
const stamp = Date.now();
const prefix = `IT ${stamp} `;
let supportId = "";
let adminId = "";
let globalId = "";
let adminPersonalId = "";

const ctxFor = (id: string, role: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN", name: string): PlatformContext => ({
  user: { id, name, email: `${name.toLowerCase().replace(/\s+/g, "-")}-${stamp}@example.test`, emailVerified: true, platformRole: role, locale: "en", twoFactorEnabled: true },
  platformRole: role,
  actor: { kind: "platform", userId: id, email: `${id}@example.test`, platformRole: role },
  requestId: `req-${stamp}`,
});
const asSupport = () => (holder.ctx = ctxFor(supportId, "PLATFORM_SUPPORT", "Sam Support"));
const asAdmin = () => (holder.ctx = ctxFor(adminId, "PLATFORM_ADMIN", "Ada Admin"));

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const auditRows = (targetId: string) => t.db.select().from(auditLog).where(and(eq(auditLog.targetType, "support_macro"), eq(auditLog.targetId, targetId)));

beforeAll(async () => {
  holder.db = t.db;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Sam Support", email: `macro-support-${stamp}@example.test`, platformRole: "PLATFORM_SUPPORT" },
      { name: "Ada Admin", email: `macro-admin-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
    ])
    .returning({ id: user.id, name: user.name });
  supportId = users.find((u) => u.name === "Sam Support")!.id;
  adminId = users.find((u) => u.name === "Ada Admin")!.id;
  const macros = await asOps(t.db, (tx) =>
    tx
      .insert(supportMacros)
      .values([
        { name: `${prefix}Acknowledge`, category: "general", bodyText: "Hello {requester_name}, ticket #{ticket_number} is with {agent_name}.", actions: { status: "open", assign_to_self: true }, scope: "global", ownerUserId: null },
        { name: `${prefix}Ada's own`, category: null, bodyText: "Personal text", actions: {}, scope: "personal", ownerUserId: adminId },
      ])
      .returning({ id: supportMacros.id, name: supportMacros.name }),
  );
  globalId = macros.find((m) => m.name.endsWith("Acknowledge"))!.id;
  adminPersonalId = macros.find((m) => m.name.endsWith("own"))!.id;
  asSupport();
});

afterAll(async () => {
  await asOps(t.db, (tx) => tx.delete(supportMacros).where(like(supportMacros.name, `${prefix}%`)));
  await t.db.delete(user).where(inArray(user.id, [supportId, adminId].filter(Boolean)));
  await t.close();
});

describe("macro visibility (tracksite_ops)", () => {
  it("shows global macros to everyone and personal macros to their owner only", async () => {
    asSupport();
    const mine = await listMacros(holder.ctx);
    const ids = mine.map((m) => m.id);
    expect(ids).toContain(globalId);
    expect(ids).not.toContain(adminPersonalId);
    expect(mine.find((m) => m.id === globalId)!.editable).toBe(false);
    expect(await loadMacro(holder.ctx, adminPersonalId)).toBeNull();
    expect(await loadMacro(holder.ctx, "not-a-uuid")).toBeNull();

    asAdmin();
    const admins = await listMacros(holder.ctx);
    expect(admins.find((m) => m.id === globalId)!.editable).toBe(true);
    expect(admins.find((m) => m.id === adminPersonalId)!.editable).toBe(true);
  });

  it("offers picker options and loads a macro for use with the scope check", async () => {
    asSupport();
    await asOps(t.db, async (tx) => {
      const options = await listMacroOptions(tx, agentOf(holder.ctx));
      expect(options.map((o) => o.id)).toContain(globalId);
      expect(options.map((o) => o.id)).not.toContain(adminPersonalId);
      expect(options.find((o) => o.id === globalId)!.actions).toEqual({ status: "open", assign_to_self: true });
      expect(await loadMacroForUse(tx, adminPersonalId, agentOf(holder.ctx))).toBeNull();
      const row = (await loadMacroForUse(tx, globalId, agentOf(holder.ctx)))!;
      expect(row.name).toBe(`${prefix}Acknowledge`);
    });
  });
});

describe("macro actions", () => {
  it("creates a personal macro with an audit row that carries no body", async () => {
    asSupport();
    const result = await saveMacroAction({ ok: false, error: null, notice: null }, form({ name: `${prefix}Sam's reply`, category: " Billing ", bodyText: "Hi {requester_name},\r\n\r\nthanks!  ", scope: "personal", actionStatus: "pending", tagsAdd: "Waiting, info" }));
    expect(result).toMatchObject({ ok: true, notice: "created" });
    const [row] = await asOps(t.db, (tx) => tx.select().from(supportMacros).where(eq(supportMacros.id, result.id!)));
    expect(row).toMatchObject({ name: `${prefix}Sam's reply`, category: "Billing", bodyText: "Hi {requester_name},\n\nthanks!", scope: "personal", ownerUserId: supportId, actions: { status: "pending", tags_add: ["waiting", "info"] }, usageCount: 0 });
    const audit = await auditRows(result.id!);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("platform.support_macro.create");
    expect(audit[0]!.diff).toMatchObject({ name: `${prefix}Sam's reply`, scope: "personal", bodyLength: "Hi {requester_name},\n\nthanks!".length });
    expect(JSON.stringify(audit[0]!.diff)).not.toContain("thanks!");
  });

  it("refuses global scope and foreign macros for support operators, validates fields", async () => {
    asSupport();
    expect(await saveMacroAction({ ok: false, error: null, notice: null }, form({ name: `${prefix}Nope`, bodyText: "x", scope: "global" }))).toMatchObject({ ok: false, error: "scope_forbidden", fieldErrors: { scope: "scope" } });
    expect(await saveMacroAction({ ok: false, error: null, notice: null }, form({ macroId: globalId, name: `${prefix}Renamed`, bodyText: "x", scope: "global" }))).toMatchObject({ ok: false, error: "scope_forbidden" });
    expect(await saveMacroAction({ ok: false, error: null, notice: null }, form({ macroId: adminPersonalId, name: `${prefix}Stolen`, bodyText: "x", scope: "personal" }))).toMatchObject({ ok: false, error: "not_found" });
    const invalid = await saveMacroAction({ ok: false, error: null, notice: null }, form({ name: "", bodyText: "   ", scope: "personal", actionStatus: "bogus", tagsAdd: "a", tagsRemove: "a" }));
    expect(invalid).toMatchObject({ ok: false, error: "invalid" });
    expect(invalid.fieldErrors).toMatchObject({ name: "required", bodyText: "required", actionStatus: "invalid", tagsRemove: "overlap" });
    expect(await auditRows(globalId)).toHaveLength(0);
  });

  it("lets an admin update a global macro (field diff, no body) and reports unchanged saves", async () => {
    asAdmin();
    const update = await saveMacroAction({ ok: false, error: null, notice: null }, form({ macroId: globalId, name: `${prefix}Acknowledge receipt`, category: "general", bodyText: "Hello {requester_name}, ticket #{ticket_number} is with {agent_name}.", scope: "global", actionStatus: "open", assignToSelf: "on" }));
    expect(update).toMatchObject({ ok: true, notice: "updated", id: globalId });
    const audit = await auditRows(globalId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("platform.support_macro.update");
    expect(audit[0]!.diff).toEqual({ name: { before: `${prefix}Acknowledge`, after: `${prefix}Acknowledge receipt` } });
    const again = await saveMacroAction({ ok: false, error: null, notice: null }, form({ macroId: globalId, name: `${prefix}Acknowledge receipt`, category: "general", bodyText: "Hello {requester_name}, ticket #{ticket_number} is with {agent_name}.", scope: "global", actionStatus: "open", assignToSelf: "on" }));
    expect(again).toMatchObject({ ok: false, error: "unchanged" });
    expect(await auditRows(globalId)).toHaveLength(1);
  });

  it("applies a macro to a ticket and counts the usage", async () => {
    asSupport();
    await asOps(t.db, async (tx) => {
      const macro = (await loadMacroForUse(tx, globalId, agentOf(holder.ctx)))!;
      const applied = applyMacro(
        { id: "t", number: 1234, subject: "Pixel", requesterName: "Ada", requesterEmail: "ada@example.test", status: "new", priority: "normal", tags: [], assigneeUserId: null },
        macro,
        agentOf(holder.ctx),
      );
      expect(applied.text).toBe("Hello Ada, ticket #1234 is with Sam Support.");
      expect(applied.changes).toEqual({ status: "open", assigneeUserId: supportId });
      await recordMacroUsage(tx, globalId);
      await recordMacroUsage(tx, globalId);
      const [row] = await tx.select({ usageCount: supportMacros.usageCount }).from(supportMacros).where(eq(supportMacros.id, globalId));
      expect(row!.usageCount).toBe(2);
    });
  });

  it("deletes after confirmation, own personal macros only for support operators", async () => {
    asSupport();
    const [own] = await asOps(t.db, (tx) => tx.select({ id: supportMacros.id }).from(supportMacros).where(and(eq(supportMacros.ownerUserId, supportId), like(supportMacros.name, `${prefix}%`))));
    expect(await deleteMacroAction({ macroId: own!.id, confirmed: false })).toMatchObject({ ok: false, error: "confirmation_required" });
    expect(await deleteMacroAction({ macroId: globalId, confirmed: true })).toMatchObject({ ok: false, error: "scope_forbidden" });
    expect(await deleteMacroAction({ macroId: adminPersonalId, confirmed: true })).toMatchObject({ ok: false, error: "not_found" });
    expect(await deleteMacroAction({ macroId: own!.id, confirmed: true })).toMatchObject({ ok: true, notice: "deleted" });
    expect(await asOps(t.db, (tx) => tx.select({ id: supportMacros.id }).from(supportMacros).where(eq(supportMacros.id, own!.id)))).toHaveLength(0);
    const audit = (await auditRows(own!.id)).map((r) => r.action).sort();
    expect(audit).toEqual(["platform.support_macro.create", "platform.support_macro.delete"]);
  });
});
