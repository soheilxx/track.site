import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("./session", () => ({ withOrg: vi.fn() }));
vi.mock("./entitlements", () => ({ planLimits: vi.fn() }));

import { ORG_ROLES, PERMISSIONS, ROLE_PERMISSIONS } from "@track-site/core";
import {
  APPROVER_ROLE_OPTIONS,
  DEFAULT_APPROVAL_POLICY,
  approvalPolicyFromForm,
  auditActorView,
  auditCategory,
  auditQueryString,
  canApprove,
  canDecideRequest,
  diffApprovalPolicy,
  effectiveAuditWindow,
  effectiveRequestStatus,
  flattenDiff,
  isRelaxing,
  normalizeApprovalPolicy,
  parseAuditFilters,
  permissionGroups,
  roleMatrix,
  seatUsage,
  teamEntitlementsFor,
} from "./team";

describe("roles and permissions", () => {
  it("groups every permission by area with the grants of the role", () => {
    const groups = permissionGroups("READ_ONLY");
    const listed = groups.flatMap((g) => g.permissions.map((p) => p.permission));
    expect(listed.sort()).toEqual([...PERMISSIONS].sort());
    expect(groups.find((g) => g.area === "events")!.permissions).toEqual([
      { permission: "events.read", granted: true },
      { permission: "events.export", granted: false },
    ]);
    expect(permissionGroups("OWNER").every((g) => g.granted === g.permissions.length)).toBe(true);
  });
  it("builds the role matrix from the enforced permission table", () => {
    const matrix = roleMatrix();
    expect(matrix).toHaveLength(PERMISSIONS.length);
    for (const row of matrix) for (const role of ORG_ROLES) expect(row.roles[role]).toBe(ROLE_PERMISSIONS[role].has(row.permission));
    expect(matrix.find((r) => r.permission === "billing.manage")!.roles).toMatchObject({ BILLING: true, ANALYST: false, DEVELOPER: false });
  });
});

describe("approval policy", () => {
  it("normalizes stored JSON: unknown keys drop out, OWNER always approves", () => {
    expect(normalizeApprovalPolicy(null)).toEqual(DEFAULT_APPROVAL_POLICY);
    expect(normalizeApprovalPolicy({ fourEyes: { config_publish: true, bogus: true, kill_switch: "yes" }, approverRoles: ["ADMIN", "ANALYST", "nope"], updatedAt: "2026-09-04T00:00:00.000Z", updatedBy: "u1" })).toEqual({
      fourEyes: { config_publish: true },
      approverRoles: ["OWNER", "ADMIN"],
      updatedAt: "2026-09-04T00:00:00.000Z",
      updatedBy: "u1",
    });
    expect(APPROVER_ROLE_OPTIONS).not.toContain("READ_ONLY");
  });
  it("reads the editor form", () => {
    const checked = new Set(["fourEyes.config_publish", "fourEyes.member_role_change", "approver.DEVELOPER", "approver.ANALYST"]);
    expect(approvalPolicyFromForm((name) => checked.has(name))).toEqual({ fourEyes: { config_publish: true, member_role_change: true }, approverRoles: ["OWNER", "DEVELOPER"] });
  });
  it("diffs policies and flags relaxing changes", () => {
    const before = normalizeApprovalPolicy({ fourEyes: { config_publish: true, kill_switch: true }, approverRoles: ["OWNER", "ADMIN"] });
    const after = normalizeApprovalPolicy({ fourEyes: { config_publish: true, consent_publish: true }, approverRoles: ["OWNER", "DEVELOPER"] });
    const changes = diffApprovalPolicy(before, after);
    expect(changes).toEqual([
      { kind: "required", changeType: "consent_publish" },
      { kind: "relaxed", changeType: "kill_switch" },
      { kind: "approverRemoved", role: "ADMIN" },
      { kind: "approverAdded", role: "DEVELOPER" },
    ]);
    expect(isRelaxing(changes)).toBe(true);
    expect(isRelaxing(diffApprovalPolicy(DEFAULT_APPROVAL_POLICY, normalizeApprovalPolicy({ fourEyes: { config_publish: true } })))).toBe(false);
    expect(diffApprovalPolicy(before, before)).toEqual([]);
  });
  it("never lets the requester approve and honours approver roles", () => {
    const policy = normalizeApprovalPolicy({ approverRoles: ["ADMIN"] });
    expect(canApprove(policy, { userId: "u1", role: "OWNER" }, "u1")).toBe(false);
    expect(canApprove(policy, { userId: "u2", role: "OWNER" }, "u1")).toBe(true);
    expect(canApprove(policy, { userId: "u2", role: "ADMIN" }, "u1")).toBe(true);
    expect(canApprove(policy, { userId: "u2", role: "DEVELOPER" }, "u1")).toBe(false);
  });
  it("requires the plan, approver rights and the change's own permission to decide", () => {
    const policy = normalizeApprovalPolicy({ fourEyes: { member_role_change: true, config_publish: true }, approverRoles: ["DEVELOPER"] });
    const pro = { fourEyes: true };
    expect(canDecideRequest(policy, pro, { userId: "u2", role: "DEVELOPER" }, { changeType: "member_role_change", requestedBy: "u1" })).toBe(false);
    expect(canDecideRequest(policy, pro, { userId: "u2", role: "DEVELOPER" }, { changeType: "config_publish", requestedBy: "u1" })).toBe(true);
    expect(canDecideRequest(policy, pro, { userId: "u2", role: "ADMIN" }, { changeType: "member_role_change", requestedBy: "u1" })).toBe(false);
    expect(canDecideRequest(policy, pro, { userId: "u2", role: "OWNER" }, { changeType: "member_role_change", requestedBy: "u1" })).toBe(true);
    expect(canDecideRequest(policy, { fourEyes: false }, { userId: "u2", role: "OWNER" }, { changeType: "member_role_change", requestedBy: "u1" })).toBe(false);
  });
  it("expires pending requests on read only", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    expect(effectiveRequestStatus("pending", new Date("2026-09-05T00:00:00Z"), now)).toBe("pending");
    expect(effectiveRequestStatus("pending", new Date("2026-09-04T11:59:59Z"), now)).toBe("expired");
    expect(effectiveRequestStatus("applied", new Date("2026-09-01T00:00:00Z"), now)).toBe("applied");
  });
});

describe("entitlements and seats", () => {
  it("derives the governance gates from the tariff catalogue", () => {
    const starter = teamEntitlementsFor("starter", { teamMembers: 2 }, "none");
    expect(starter).toMatchObject({ planName: "Starter", approvals: false, fourEyes: false, fullAuditLog: false, fineGrainedRoles: false, teamMembers: 2, auditWindowDays: 90 });
    const pro = teamEntitlementsFor("pro", { teamMembers: null }, "active");
    expect(pro).toMatchObject({ planName: "Pro", approvals: true, fourEyes: true, fullAuditLog: true, fineGrainedRoles: true, teamMembers: null, auditWindowDays: null });
    expect(teamEntitlementsFor("enterprise", { teamMembers: null }, "active").fullAuditLog).toBe(true);
    expect(teamEntitlementsFor("legacy", { teamMembers: 3 }, "active")).toMatchObject({ planName: "legacy", approvals: false, auditWindowDays: 90, teamMembers: 3 });
  });
  it("counts pending invitations against the seats", () => {
    expect(seatUsage(1, 0, 2)).toEqual({ members: 1, pending: 0, cap: 2, remaining: 1, reached: false });
    expect(seatUsage(1, 1, 2)).toEqual({ members: 1, pending: 1, cap: 2, remaining: 0, reached: true });
    expect(seatUsage(3, 0, 2).remaining).toBe(0);
    expect(seatUsage(40, 5, null)).toEqual({ members: 40, pending: 5, cap: null, remaining: null, reached: false });
  });
});

describe("audit log", () => {
  it("categorizes actions by prefix", () => {
    expect(auditCategory("member.invite")).toBe("team");
    expect(auditCategory("approval_request.reject")).toBe("team");
    expect(auditCategory("org.approval_policy")).toBe("organization");
    expect(auditCategory("consent_policy.publish")).toBe("consent");
    expect(auditCategory("config.rollback")).toBe("config");
    expect(auditCategory("integration.disconnect")).toBe("destinations");
    expect(auditCategory("credential.store")).toBe("credentials");
    expect(auditCategory("dsar.create")).toBe("privacy");
    expect(auditCategory("billing.checkout_started")).toBe("billing");
    expect(auditCategory("test_lab.run")).toBe("other");
    expect(auditCategory("publish_config_version")).toBe("other");
  });
  it("parses URL filters defensively", () => {
    expect(parseAuditFilters({})).toEqual({ category: "all", actor: null, targetType: null, q: null, from: null, to: null, page: 1 });
    const parsed = parseAuditFilters({ category: "consent", actor: "system", target: "consent_policy", q: "  publish ", from: "2026-08-01", to: "2026-08-31", page: "3" });
    expect(parsed).toMatchObject({ category: "consent", actor: "system", targetType: "consent_policy", q: "publish", page: 3 });
    expect(parsed.from!.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(parsed.to!.toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(parseAuditFilters({ category: "nope", actor: "bob", target: "Drop Table", from: "2026-13-99", page: "-4" })).toEqual({ category: "all", actor: null, targetType: null, q: null, from: null, to: null, page: 1 });
    expect(parseAuditFilters({ actor: "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11", page: "999999" })).toMatchObject({ actor: "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11", page: 10_000 });
  });
  it("round-trips filters through the query string", () => {
    const filters = parseAuditFilters({ category: "team", actor: "agent", q: "role", from: "2026-08-01", page: "2" });
    expect(auditQueryString(filters)).toBe("?category=team&actor=agent&q=role&from=2026-08-01&page=2");
    expect(auditQueryString(filters, 1)).toBe("?category=team&actor=agent&q=role&from=2026-08-01");
    expect(parseAuditFilters(Object.fromEntries(new URLSearchParams(auditQueryString(filters))))).toEqual(filters);
    expect(auditQueryString(parseAuditFilters({}))).toBe("");
  });
  it("flattens diffs to rows and redacts values", () => {
    const { rows, truncated } = flattenDiff({ role: "ADMIN", changes: [{ kind: "relaxed", changeType: "kill_switch" }], tags: ["a", "b"], empty: {}, nested: { note: "contact jane.doe@example.com", n: null } });
    expect(truncated).toBe(false);
    expect(rows).toEqual([
      { path: "role", value: "ADMIN" },
      { path: "changes[0].kind", value: "relaxed" },
      { path: "changes[0].changeType", value: "kill_switch" },
      { path: "tags", value: "a, b" },
      { path: "empty", value: "{}" },
      { path: "nested.note", value: "contact [redacted:email]" },
      { path: "nested.n", value: "null" },
    ]);
    expect(flattenDiff(null).rows).toEqual([]);
    const long = flattenDiff({ text: "x".repeat(500) }).rows[0]!.value;
    expect(long.length).toBeLessThan(200);
    expect(long.endsWith("…")).toBe(true);
    const many = flattenDiff(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i])));
    expect(many.rows).toHaveLength(40);
    expect(many.truncated).toBe(true);
  });
  it("labels actors from the member list without inventing names", () => {
    const names = new Map([["u1", "Ada"]]);
    expect(auditActorView({ kind: "user", userId: "u1", role: "OWNER", platformRole: "NONE" }, names)).toEqual({ kind: "user", userId: "u1", name: "Ada", role: "OWNER", detail: null });
    expect(auditActorView({ kind: "user", userId: "gone", role: "ADMIN" }, names)).toMatchObject({ kind: "user", userId: "gone", name: null });
    expect(auditActorView({ kind: "agent", onBehalfOfUserId: "u1", role: "DEVELOPER", chatSessionId: "s1" }, names)).toEqual({ kind: "agent", userId: "u1", name: "Ada", role: "DEVELOPER", detail: "s1" });
    expect(auditActorView({ kind: "system", name: "worker:usage" }, names)).toEqual({ kind: "system", userId: null, name: null, role: null, detail: "worker:usage" });
    expect(auditActorView(null, names).kind).toBe("unknown");
  });
  it("cuts the range to the plan's window and says so", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const full = effectiveAuditWindow({ from: null, to: null }, { auditWindowDays: null }, now);
    expect(full).toEqual({ from: null, to: null, limitedByPlan: false, windowDays: null });
    const basic = effectiveAuditWindow({ from: null, to: null }, { auditWindowDays: 90 }, now);
    expect(basic.from!.toISOString()).toBe("2026-06-06T12:00:00.000Z");
    expect(basic.limitedByPlan).toBe(true);
    const inside = effectiveAuditWindow({ from: new Date("2026-08-01T00:00:00Z"), to: null }, { auditWindowDays: 90 }, now);
    expect(inside).toMatchObject({ limitedByPlan: false, windowDays: 90 });
    expect(inside.from!.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    const before = effectiveAuditWindow({ from: new Date("2026-01-01T00:00:00Z"), to: null }, { auditWindowDays: 90 }, now);
    expect(before.limitedByPlan).toBe(true);
    expect(before.from!.toISOString()).toBe("2026-06-06T12:00:00.000Z");
  });
});
