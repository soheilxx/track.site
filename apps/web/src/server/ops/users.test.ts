import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("./platform", () => ({ withPlatform: vi.fn(), auditPlatform: vi.fn(), opsRequiresTwoFactor: () => true }));
vi.mock("./break-glass", () => ({ eligibleAdminIds: vi.fn() }));

import {
  ROLE_REQUEST_TTL_MS,
  approvalVerdict,
  approverCandidates,
  flattenMetadata,
  isPlatformRole,
  isUserFiltered,
  otherEligibleAdminExists,
  parseRoleRequest,
  parseUserFilters,
  requestState,
  roleChangeVerdict,
  sessionState,
  userQueryString,
  wouldRemoveLastAdmin,
} from "./users";

const A = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11"; // admin, the actor
const B = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e22"; // another admin
const C = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e33"; // the affected account
const NOW = new Date("2026-09-08T12:00:00Z");

describe("directory filters", () => {
  it("parses URL filters defensively", () => {
    expect(parseUserFilters({})).toEqual({ q: null, kind: "all", twoFactor: "all", sort: "created", dir: "desc", page: 1 });
    expect(parseUserFilters({ q: "  ada ", kind: "operators", twoFactor: "off", sort: "name", dir: "desc", page: "2" })).toEqual({ q: "ada", kind: "operators", twoFactor: "off", sort: "name", dir: "desc", page: 2 });
    expect(parseUserFilters({ kind: "bots", twoFactor: "maybe", sort: "bogus", dir: "sideways", page: "-1" })).toEqual({ q: null, kind: "all", twoFactor: "all", sort: "created", dir: "desc", page: 1 });
    expect(parseUserFilters({ q: "x".repeat(100) }).q).toHaveLength(64);
    expect(parseUserFilters({ sort: "email" }).dir).toBe("asc");
    expect(parseUserFilters({ sort: "signin" }).dir).toBe("desc");
  });
  it("round-trips filters through the query string", () => {
    const filters = parseUserFilters({ q: "acme", kind: "customers", twoFactor: "on", sort: "name", page: "3" });
    expect(userQueryString(filters)).toBe("?q=acme&kind=customers&twoFactor=on&sort=name&page=3");
    expect(userQueryString(filters, 1)).toBe("?q=acme&kind=customers&twoFactor=on&sort=name");
    expect(parseUserFilters(Object.fromEntries(new URLSearchParams(userQueryString(filters))))).toEqual(filters);
    expect(userQueryString(parseUserFilters({}))).toBe("");
    expect(userQueryString(parseUserFilters({ sort: "name", dir: "desc" }))).toBe("?sort=name&dir=desc");
  });
  it("knows when a filter is active", () => {
    expect(isUserFiltered(parseUserFilters({}))).toBe(false);
    expect(isUserFiltered(parseUserFilters({ sort: "name", page: "2" }))).toBe(false);
    expect(isUserFiltered(parseUserFilters({ kind: "operators" }))).toBe(true);
    expect(isUserFiltered(parseUserFilters({ twoFactor: "off" }))).toBe(true);
    expect(isUserFiltered(parseUserFilters({ q: "a" }))).toBe(true);
  });
});

describe("four eyes: filing a role change", () => {
  const target = { id: C, platformRole: "NONE" as const, emailVerified: true };
  it("files a request when another eligible admin exists", () => {
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: true, mode: "proposal" });
  });
  it("falls back to a self-approved change with a ticket when the actor is the only eligible admin", () => {
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "PLATFORM_SUPPORT", adminIds: [A], eligibleAdminIds: [A], ticketRef: null })).toEqual({ ok: false, reason: "ticketRequired" });
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "PLATFORM_SUPPORT", adminIds: [A], eligibleAdminIds: [A], ticketRef: "   " })).toEqual({ ok: false, reason: "ticketRequired" });
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "PLATFORM_SUPPORT", adminIds: [A], eligibleAdminIds: [A], ticketRef: "OPS-1" })).toEqual({ ok: true, mode: "self" });
    // a second admin without two-factor / verification is not eligible: still the single-admin fallback
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B], eligibleAdminIds: [A], ticketRef: "OPS-1" })).toEqual({ ok: true, mode: "self" });
  });
  it("never counts the affected admin as the second pair of eyes", () => {
    const adminTarget = { id: B, platformRole: "PLATFORM_ADMIN" as const, emailVerified: true };
    expect(approverCandidates([A, B], A, B)).toEqual([]);
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B, C], eligibleAdminIds: [A, B, C], ticketRef: null })).toEqual({ ok: true, mode: "proposal" });
    // C is an admin without eligibility (no two-factor / unverified): still no second pair of eyes for B's change
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B, C], eligibleAdminIds: [A, B], ticketRef: "OPS-2" })).toEqual({ ok: false, reason: "needsThirdAdmin" });
  });
  it("reserves the single-admin fallback for the case that no other eligible admin exists at all", () => {
    const adminTarget = { id: B, platformRole: "PLATFORM_ADMIN" as const, emailVerified: true };
    expect(otherEligibleAdminExists([A, B], A)).toBe(true);
    expect(otherEligibleAdminExists([A], A)).toBe(false);
    expect(otherEligibleAdminExists([B], A)).toBe(true);
    // exactly two eligible admins: A may not demote or remove B self-approved, ticket or not — a third admin is needed
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: "OPS-2" })).toEqual({ ok: false, reason: "needsThirdAdmin" });
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "NONE", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: false, reason: "needsThirdAdmin" });
    // the actor is not eligible themselves and the only eligible admin is the affected account: same refusal
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "NONE", adminIds: [A, B], eligibleAdminIds: [B], ticketRef: "OPS-2" })).toEqual({ ok: false, reason: "needsThirdAdmin" });
    // B is an admin but not eligible (no two-factor / unverified e-mail): A is the only eligible admin → fallback
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B], eligibleAdminIds: [A], ticketRef: null })).toEqual({ ok: false, reason: "ticketRequired" });
    expect(roleChangeVerdict({ actorId: A, target: adminTarget, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B], eligibleAdminIds: [A], ticketRef: "OPS-2" })).toEqual({ ok: true, mode: "self" });
    // the refusal is about admins only: with B eligible, a change to a third account is a regular request
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "PLATFORM_ADMIN", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: true, mode: "proposal" });
  });
  it("refuses the actor's own account, unchanged roles, unverified accounts and the last admin", () => {
    expect(roleChangeVerdict({ actorId: A, target: { id: A, platformRole: "PLATFORM_ADMIN", emailVerified: true }, nextRole: "NONE", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: false, reason: "self" });
    expect(roleChangeVerdict({ actorId: A, target, nextRole: "NONE", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: false, reason: "unchanged" });
    expect(roleChangeVerdict({ actorId: A, target: { ...target, emailVerified: false }, nextRole: "PLATFORM_SUPPORT", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: false, reason: "emailNotVerified" });
    // removing a role from an unverified account is fine
    expect(roleChangeVerdict({ actorId: A, target: { id: C, platformRole: "PLATFORM_SUPPORT", emailVerified: false }, nextRole: "NONE", adminIds: [A, B], eligibleAdminIds: [A, B], ticketRef: null })).toEqual({ ok: true, mode: "proposal" });
    expect(wouldRemoveLastAdmin({ id: B, platformRole: "PLATFORM_ADMIN" }, "PLATFORM_SUPPORT", [B])).toBe(true);
    expect(wouldRemoveLastAdmin({ id: B, platformRole: "PLATFORM_ADMIN" }, "PLATFORM_SUPPORT", [A, B])).toBe(false);
    expect(wouldRemoveLastAdmin({ id: B, platformRole: "PLATFORM_SUPPORT" }, "NONE", [B])).toBe(false);
    expect(roleChangeVerdict({ actorId: A, target: { id: B, platformRole: "PLATFORM_ADMIN", emailVerified: true }, nextRole: "NONE", adminIds: [B], eligibleAdminIds: [B], ticketRef: "OPS-3" })).toEqual({ ok: false, reason: "lastAdmin" });
  });
});

describe("four eyes: deciding a request", () => {
  const request = { proposedBy: A, targetId: C, fromRole: "NONE" as const, toRole: "PLATFORM_SUPPORT" as const, createdAt: new Date(NOW.getTime() - 60_000) };
  const target = { platformRole: "NONE" as const, emailVerified: true };
  it("lets a different admin apply a pending request", () => {
    expect(approvalVerdict({ approverId: B, request, target, adminIds: [A, B], now: NOW })).toEqual({ ok: true });
  });
  it("refuses the proposer, the affected account, stale and expired requests", () => {
    expect(approvalVerdict({ approverId: A, request, target, adminIds: [A, B], now: NOW })).toEqual({ ok: false, reason: "fourEyes" });
    expect(approvalVerdict({ approverId: C, request, target, adminIds: [A, B], now: NOW })).toEqual({ ok: false, reason: "self" });
    expect(approvalVerdict({ approverId: B, request, target: { ...target, platformRole: "PLATFORM_ADMIN" }, adminIds: [A, B], now: NOW })).toEqual({ ok: false, reason: "stale" });
    expect(approvalVerdict({ approverId: B, request: { ...request, createdAt: new Date(NOW.getTime() - ROLE_REQUEST_TTL_MS) }, target, adminIds: [A, B], now: NOW })).toEqual({ ok: false, reason: "expired" });
  });
  it("re-checks the last-admin and verification rules at decision time", () => {
    const demotion = { proposedBy: A, targetId: B, fromRole: "PLATFORM_ADMIN" as const, toRole: "NONE" as const, createdAt: request.createdAt };
    expect(approvalVerdict({ approverId: C, request: demotion, target: { platformRole: "PLATFORM_ADMIN", emailVerified: true }, adminIds: [B], now: NOW })).toEqual({ ok: false, reason: "lastAdmin" });
    expect(approvalVerdict({ approverId: C, request: demotion, target: { platformRole: "PLATFORM_ADMIN", emailVerified: true }, adminIds: [A, B], now: NOW })).toEqual({ ok: true });
    expect(approvalVerdict({ approverId: B, request, target: { platformRole: "NONE", emailVerified: false }, adminIds: [A, B], now: NOW })).toEqual({ ok: false, reason: "emailNotVerified" });
  });
  it("derives the request state", () => {
    expect(requestState(request, "NONE", NOW)).toBe("pending");
    expect(requestState(request, "PLATFORM_SUPPORT", NOW)).toBe("stale");
    expect(requestState({ ...request, createdAt: new Date(NOW.getTime() - ROLE_REQUEST_TTL_MS - 1) }, "NONE", NOW)).toBe("expired");
  });
});

describe("audit-log request rows", () => {
  it("parses a propose row and rejects malformed ones", () => {
    const row = { id: "01J6ZK9ZK8N4Q3Y6B9X2P7R5T1", targetId: C, metadata: { fromRole: "NONE", toRole: "PLATFORM_ADMIN", reason: "new hire", ticketRef: "OPS-9", proposedBy: A }, createdAt: NOW };
    expect(parseRoleRequest(row)).toEqual({ id: row.id, targetId: C, fromRole: "NONE", toRole: "PLATFORM_ADMIN", reason: "new hire", ticketRef: "OPS-9", proposedBy: A, createdAt: NOW });
    expect(parseRoleRequest({ ...row, metadata: { ...row.metadata, toRole: "ROOT" } })).toBeNull();
    expect(parseRoleRequest({ ...row, targetId: null })).toBeNull();
    expect(parseRoleRequest({ ...row, metadata: { ...row.metadata, proposedBy: "cli" } })).toBeNull();
    expect(parseRoleRequest({ ...row, metadata: { ...row.metadata, reason: undefined, ticketRef: null } })).toMatchObject({ reason: "", ticketRef: null });
  });
  it("flattens metadata into display rows", () => {
    expect(flattenMetadata({ module: "users", nested: { selfApproved: true, ticketRef: null }, list: [1, 2] })).toEqual([
      { path: "module", value: "users" },
      { path: "nested.selfApproved", value: "true" },
      { path: "nested.ticketRef", value: "—" },
      { path: "list", value: "1, 2" },
    ]);
    expect(flattenMetadata(null)).toEqual([]);
  });
});

describe("misc", () => {
  it("recognises platform roles and session states", () => {
    expect(isPlatformRole("PLATFORM_ADMIN")).toBe(true);
    expect(isPlatformRole("OWNER")).toBe(false);
    expect(sessionState(new Date(NOW.getTime() + 1), NOW)).toBe("active");
    expect(sessionState(NOW.toISOString(), NOW)).toBe("expired");
  });
});
