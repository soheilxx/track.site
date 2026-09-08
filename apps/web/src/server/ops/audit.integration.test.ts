import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, organization, user, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Runs the audit explorer loaders against the migrated test database as `tracksite_ops`: a throwaway
 * organisation, one operator and one plain member, six audit rows of every kind (operator actions with and
 * without a break-glass grant, a member change whose diff carries an e-mail, a platform-wide system entry,
 * an entry of an organisation that no longer exists). Asserts filters, ordering, hydration, redaction and
 * the export. Audit rows are append-only (trigger), so they stay until the next global truncate.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, ctx: null as unknown as PlatformContext }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/session", () => ({ withOrg: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/entitlements", () => ({ planLimits: vi.fn() }));
vi.mock("@/server/ops/platform", async () => {
  const { withPlatform: asOps } = await import("@track-site/db");
  class PlatformAccessError extends Error {}
  return {
    PlatformAccessError,
    requirePlatform: async () => holder.ctx,
    withPlatform: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => asOps(holder.db, fn as never),
    auditPlatform: vi.fn(),
    activeBreakGlass: vi.fn(),
  };
});

import { loadOpsAuditExport, loadOpsAuditPage, opsAuditCsv, parseOpsAuditFilters } from "./audit";

const t = testDb();
const stamp = Date.now();
const slug = `ops-audit-${stamp}`;
const GONE_ORG = "5b1f0c3e-7a2d-4e8f-9c1b-2d3e4f5a6b7c";
const MEMBER_EMAIL = `ops-audit-member-${stamp}@example.test`;
let orgId = "";
let operatorId = "";
let memberId = "";
const ids = { suspend: "", view: "", approve: "", member: "", role: "", gone: "" };

beforeAll(async () => {
  holder.db = t.db;
  const [org] = await t.db.insert(organization).values({ name: `Ops Audit Test ${stamp}`, slug }).returning({ id: organization.id });
  orgId = org!.id;
  const users = await t.db
    .insert(user)
    .values([
      { name: "Otto Operator", email: `ops-audit-op-${stamp}@example.test`, platformRole: "PLATFORM_ADMIN" },
      { name: "Plain Member", email: MEMBER_EMAIL, platformRole: "NONE" },
    ])
    .returning({ id: user.id, name: user.name });
  operatorId = users.find((u) => u.name === "Otto Operator")!.id;
  memberId = users.find((u) => u.name === "Plain Member")!.id;
  holder.ctx = {
    user: { id: operatorId, name: "Otto Operator", email: `ops-audit-op-${stamp}@example.test`, emailVerified: true, platformRole: "PLATFORM_ADMIN", locale: "en", twoFactorEnabled: true },
    platformRole: "PLATFORM_ADMIN",
    actor: { kind: "platform", userId: operatorId, email: "[redacted:email]", platformRole: "PLATFORM_ADMIN" },
    requestId: `req-${stamp}`,
  };
  const at = (n: number) => new Date(stamp - 60_000 + n * 1000);
  const platformActor = { kind: "platform", userId: operatorId, email: "[redacted:email]", platformRole: "PLATFORM_ADMIN" };
  const rows = [
    { key: "member", createdAt: at(1), organizationId: orgId, actor: { kind: "user", userId: memberId, role: "OWNER" }, action: "member.role.update", targetType: "member", targetId: memberId, diff: { before: { role: "EDITOR", email: MEMBER_EMAIL }, after: { role: "OWNER" } }, metadata: {} },
    { key: "suspend", createdAt: at(2), organizationId: orgId, actor: platformActor, action: "platform.organization.suspend", targetType: "organization", targetId: orgId, diff: { before: { suspendedAt: null }, after: { suspendedAt: at(2).toISOString() } }, metadata: { reason: "abuse", platformRole: "PLATFORM_ADMIN" } },
    { key: "approve", createdAt: at(3), organizationId: orgId, actor: platformActor, action: "ops.break_glass.approve", targetType: "break_glass_access", targetId: `grant-${stamp}`, diff: null, metadata: { platformRole: "PLATFORM_ADMIN" } },
    { key: "view", createdAt: at(4), organizationId: orgId, actor: platformActor, action: "platform.organization.view", targetType: "organization", targetId: orgId, diff: null, metadata: { breakGlassId: `grant-${stamp}`, module: "organisations", platformRole: "PLATFORM_ADMIN" } },
    { key: "role", createdAt: at(5), organizationId: null, actor: { kind: "system", name: "cli:ops-grant" }, action: "platform.role.set", targetType: "user", targetId: operatorId, diff: { before: { platformRole: "NONE" }, after: { platformRole: "PLATFORM_ADMIN" } }, metadata: { stamp } },
    { key: "gone", createdAt: at(6), organizationId: GONE_ORG, actor: { kind: "source_key", sourceKeyId: `sk-${stamp}` }, action: "site.create", targetType: "site", targetId: `site-${stamp}`, diff: null, metadata: { stamp } },
  ] as const;
  for (const r of rows) {
    const id = `01J9AUDIT${String(stamp).slice(-8)}${r.key.toUpperCase().padEnd(9, "X")}`;
    ids[r.key] = id;
    await t.db.insert(auditLog).values({ id, organizationId: r.organizationId, actor: r.actor as Record<string, unknown>, action: r.action, targetType: r.targetType, targetId: r.targetId, diff: r.diff as Record<string, unknown> | null, metadata: r.metadata as Record<string, unknown>, requestId: `req-${r.key}-${stamp}`, createdAt: r.createdAt });
  }
});

afterAll(async () => {
  await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.db.delete(user).where(inArray(user.id, [operatorId, memberId].filter(Boolean)));
  await t.close();
});

describe("audit explorer loaders (test database, tracksite_ops)", () => {
  it("lists an organisation's entries newest first with names, organisation and redacted diffs", async () => {
    const page = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: slug }));
    expect(page.total).toBe(4);
    expect(page.entries.map((e) => e.id)).toEqual([ids.view, ids.approve, ids.suspend, ids.member]);
    expect(page.organization).toEqual({ kind: "organization", id: orgId, name: `Ops Audit Test ${stamp}`, slug });
    const suspend = page.entries.find((e) => e.id === ids.suspend)!;
    expect(suspend.actor).toMatchObject({ kind: "platform", userId: operatorId, name: "Otto Operator", role: "PLATFORM_ADMIN" });
    expect(suspend.category).toBe("platform");
    expect(suspend.organization).toEqual({ id: orgId, name: `Ops Audit Test ${stamp}`, slug });
    expect(suspend.metadata).toContainEqual({ path: "reason", value: "abuse" });
    const member = page.entries.find((e) => e.id === ids.member)!;
    expect(member.actor).toMatchObject({ kind: "user", name: "Plain Member", role: "OWNER" });
    expect(member.category).toBe("team");
    expect(JSON.stringify(member.diff)).not.toContain(MEMBER_EMAIL);
    expect(member.diff).toContainEqual({ path: "before.email", value: "[redacted:email]" });
    expect(page.operators.some((o) => o.id === operatorId)).toBe(true);
    expect(page.operators.some((o) => o.id === memberId)).toBe(false);
    expect(page.targetTypes).toContain("organization");
    expect(page.retentionDays).toBe(730);
  });

  it("honours platform-only, scope, actor, action prefix, target type, free text and dates", async () => {
    const platformOnly = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, platform: "1" }));
    expect(platformOnly.entries.map((e) => e.id)).toEqual([ids.view, ids.approve, ids.suspend]);
    const trail = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, scope: "break_glass" }));
    expect(trail.entries.map((e) => e.id)).toEqual([ids.view, ids.approve]);
    const platformWide = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ scope: "platform_wide", action: "platform.role", q: `req-role-${stamp}` }));
    expect(platformWide.entries.map((e) => e.id)).toEqual([ids.role]);
    expect(platformWide.entries[0]!.organization).toBeNull();
    expect(platformWide.entries[0]!.actor).toMatchObject({ kind: "system", detail: "cli:ops-grant" });
    const byMember = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ actor: memberId }));
    expect(byMember.entries.map((e) => e.id)).toEqual([ids.member]);
    expect(byMember.actorFallback).toEqual({ id: memberId, name: "Plain Member" });
    const byKind = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, actor: "user" }));
    expect(byKind.entries.map((e) => e.id)).toEqual([ids.member]);
    const prefix = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, action: "platform.organization" }));
    expect(prefix.entries.map((e) => e.id)).toEqual([ids.view, ids.suspend]);
    const exact = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, action: "ops.break_glass.approve" }));
    expect(exact.entries.map((e) => e.id)).toEqual([ids.approve]);
    const target = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, target: "break_glass_access" }));
    expect(target.entries.map((e) => e.id)).toEqual([ids.approve]);
    const text = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ q: `grant-${stamp}` }));
    expect(text.entries.map((e) => e.id)).toEqual([ids.approve]);
    const wildcard = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, q: "%" }));
    expect(wildcard.total).toBe(0);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const future = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: orgId, from: tomorrow }));
    expect(future.total).toBe(0);
    expect(future.page).toBe(1);
  });

  it("keeps entries of organisations that no longer exist and reports unknown slugs honestly", async () => {
    const gone = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: GONE_ORG, q: `site-${stamp}` }));
    expect(gone.organization).toEqual({ kind: "organization", id: GONE_ORG, name: null, slug: null });
    expect(gone.entries.map((e) => e.id)).toEqual([ids.gone]);
    expect(gone.entries[0]!.organization).toEqual({ id: GONE_ORG, name: null, slug: null });
    expect(gone.entries[0]!.actor).toMatchObject({ kind: "source_key", detail: `sk-${stamp}` });
    const unknown = await loadOpsAuditPage(holder.ctx, parseOpsAuditFilters({ organization: "no-such-org-slug" }));
    expect(unknown.organization).toEqual({ kind: "unknown", input: "no-such-org-slug" });
    expect(unknown.total).toBe(0);
    expect(unknown.entries).toEqual([]);
  });

  it("exports the same rows as redacted key lists", async () => {
    const result = await loadOpsAuditExport(holder.ctx, parseOpsAuditFilters({ organization: slug }));
    expect(result.total).toBe(4);
    expect(result.truncated).toBe(false);
    const csv = opsAuditCsv(result.entries);
    expect(csv.split("\r\n")).toHaveLength(6);
    expect(csv).toContain("platform.organization.suspend");
    expect(csv).toContain("breakGlassId=");
    expect(csv).toContain("[redacted:email]");
    expect(csv).not.toContain(MEMBER_EMAIL);
    expect(csv).not.toContain("@example.test");
  });
});
