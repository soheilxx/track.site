import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import de from "../../messages/de/ops-organisations.json";
import type { OrgContext } from "./session";

/**
 * The tenant kill switch at the session layer (docs/17 §4): `requireOrgContext` (pages, server actions)
 * throws the suspension error, `requireApiOrgContext` (route handlers) answers 401/403 instead of
 * redirecting. Session lookup, membership query and break-glass resolution are stubbed; the gate is real.
 */
const USER = { id: "user1", email: "owner@acme.test", name: "Owner", emailVerified: true, platformRole: "NONE", locale: "de", twoFactorEnabled: false };
const MEMBERSHIP = { orgId: "org1", role: "OWNER", name: "Acme", slug: "acme", suspendedAt: null as Date | null };
const GRANT = { id: "grant1", endsAt: new Date("2026-09-08T12:00:00Z") };
const SUPPORT = { grant: GRANT, organization: { id: "org2", name: "Beta", slug: "beta", suspendedAt: null } };
const state: { session: unknown; memberships: Array<typeof MEMBERSHIP>; support: typeof SUPPORT | null } = { session: null, memberships: [], support: null };
const signedIn = (suspendedAt: Date | null) => {
  state.session = { user: USER, session: { activeOrganizationId: "org1" } };
  state.memberships = [{ ...MEMBERSHIP, suspendedAt }];
  state.support = null;
};
/** a platform operator without memberships viewing org2 under an active break-glass grant */
const supportSession = () => {
  state.session = { user: { ...USER, id: "op1", email: "ops@acme.test", platformRole: "PLATFORM_SUPPORT" }, session: { activeOrganizationId: null } };
  state.memberships = [];
  state.support = SUPPORT;
};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("./auth", () => ({ auth: () => ({ api: { getSession: async () => state.session } }) }));
const auditSupportView = vi.fn();
vi.mock("./ops/break-glass", () => ({ resolveSupportAccess: async () => state.support, auditSupportView, isReadPermission: (p: string) => p.endsWith(".read") }));
vi.mock("./db", () => {
  const query = { select: () => query, from: () => query, innerJoin: () => query, where: async () => state.memberships };
  return { db: () => query, logger: { warn: vi.fn() } };
});

const { OrganizationSuspendedError, assertOrgWritable, requireApiOrgContext, requireOrgContext } = await import("./session");

describe("requireApiOrgContext", () => {
  it("answers 401 when signed out, or with the route's own signed-out response", async () => {
    state.session = null;
    const res = await requireApiOrgContext();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect(await (res as Response).json()).toEqual({ ok: false, code: "UNAUTHORIZED" });
    const redirected = await requireApiOrgContext({ signedOut: () => NextResponse.redirect("http://localhost/login") });
    expect((redirected as Response).status).toBe(307);
  });

  it("returns the context of an active organisation", async () => {
    signedIn(null);
    const ctx = (await requireApiOrgContext()) as OrgContext;
    expect(ctx).not.toBeInstanceOf(Response);
    expect(ctx.organization).toEqual({ id: "org1", name: "Acme", slug: "acme", suspendedAt: null });
    expect(ctx.role).toBe("OWNER");
    expect(ctx.tenant.actor).toMatchObject({ kind: "user", userId: "user1", role: "OWNER" });
  });

  it("answers 403 organization_suspended with the localized notice for a suspended organisation", async () => {
    signedIn(new Date("2026-09-08T09:00:00Z"));
    const res = await requireApiOrgContext();
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: false, code: "FORBIDDEN", reason: "organization_suspended", message: de.opsOrganisations.suspended.notice });
  });
});

describe("requireOrgContext", () => {
  it("throws the suspension error (403) instead of handing out a suspended organisation", async () => {
    signedIn(new Date("2026-09-08T09:00:00Z"));
    const err = await requireOrgContext().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrganizationSuspendedError);
    const e = err as InstanceType<typeof OrganizationSuspendedError>;
    expect(e.status).toBe(403);
    expect(e.message).toBe(de.opsOrganisations.suspended.notice);
    expect(e.details).toMatchObject({ reason: "organization_suspended", organizationId: "org1", suspendedAt: "2026-09-08T09:00:00.000Z" });
  });

  it("hands out an active organisation", async () => {
    signedIn(null);
    expect((await requireOrgContext("events.read")).organization.id).toBe("org1");
  });
});

describe("break-glass support session (read-only)", () => {
  it("opens the granted organisation read-only as a platform actor and audits the view", async () => {
    supportSession();
    auditSupportView.mockClear();
    const ctx = await requireOrgContext("events.read");
    expect(ctx.organization.id).toBe("org2");
    expect(ctx.role).toBe("READ_ONLY");
    expect(ctx.readOnly).toBe(true);
    expect(ctx.breakGlass).toEqual({ grantId: "grant1", endsAt: GRANT.endsAt });
    expect(ctx.tenant.actor).toMatchObject({ kind: "platform", userId: "op1", grantId: "grant1", readOnly: true });
    expect(auditSupportView).toHaveBeenCalledTimes(1);
  });

  it("refuses every permission that is not a *.read with reason read_only_support_access", async () => {
    supportSession();
    for (const permission of ["sites.update", "members.invite", "billing.manage", "org.update"] as const) {
      const err = await requireOrgContext(permission).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      const e = err as { code: string; status: number; details: unknown };
      expect(e.code).toBe("FORBIDDEN");
      expect(e.status).toBe(403);
      expect(e.details).toEqual({ reason: "read_only_support_access", grantId: "grant1" });
    }
  });

  it("assertOrgWritable refuses a read-only context and passes a member context", async () => {
    supportSession();
    const readOnly = await requireOrgContext("members.read");
    expect(() => assertOrgWritable(readOnly, "approval_request.decide")).toThrowError(/approval_request.decide refused/);
    signedIn(null);
    const member = await requireOrgContext("members.read");
    expect(() => assertOrgWritable(member)).not.toThrow();
  });
});
