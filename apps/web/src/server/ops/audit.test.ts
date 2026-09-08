import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("@/server/session", () => ({ withOrg: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/entitlements", () => ({ planLimits: vi.fn() }));
vi.mock("./platform", () => ({ withPlatform: vi.fn(), auditPlatform: vi.fn(), activeBreakGlass: vi.fn() }));

import { flattenDiff } from "@/server/team";
import {
  OPS_AUDIT_CSV_COLUMNS,
  OPS_AUDIT_RETENTION_DAYS,
  diffCell,
  isOpsAuditFiltered,
  opsAuditCategory,
  opsAuditCsv,
  opsAuditFilterSummary,
  opsAuditQueryString,
  opsAuditWhere,
  parseOpsAuditFilters,
  type OpsAuditExplorerEntry,
} from "./audit";

const ORG = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11";
const USER = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e22";

describe("explorer filters", () => {
  it("parses URL filters defensively", () => {
    expect(parseOpsAuditFilters({})).toEqual({ q: null, actor: null, platformOnly: false, action: null, organization: null, targetType: null, scope: "all", from: null, to: null, page: 1 });
    const parsed = parseOpsAuditFilters({ q: "  suspend ", actor: USER, platform: "1", action: "Platform.Organization", organization: "Acme-Demo", target: "organization", scope: "break_glass", from: "2026-09-01", to: "2026-09-08", page: "3" });
    expect(parsed).toEqual({
      q: "suspend",
      actor: USER,
      platformOnly: true,
      action: "platform.organization",
      organization: "acme-demo",
      targetType: "organization",
      scope: "break_glass",
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-08T23:59:59.999Z"),
      page: 3,
    });
    expect(parseOpsAuditFilters({ actor: "platform" }).actor).toBe("platform");
    expect(parseOpsAuditFilters({ actor: "root" }).actor).toBeNull();
    expect(parseOpsAuditFilters({ organization: ORG }).organization).toBe(ORG);
    // invalid values fall back instead of failing the page
    expect(parseOpsAuditFilters({ action: "drop table;", organization: "not a slug!", target: "Organization", scope: "everything", from: "yesterday", to: "2026-13-45", page: "-4", platform: "0" })).toEqual({
      q: null,
      actor: null,
      platformOnly: false,
      action: null,
      organization: null,
      targetType: null,
      scope: "all",
      from: null,
      to: null,
      page: 1,
    });
    expect(parseOpsAuditFilters({ q: "x".repeat(100) }).q).toHaveLength(64);
    expect(parseOpsAuditFilters({ page: "999999" }).page).toBe(10_000);
    expect(parseOpsAuditFilters({ platform: ["on"] }).platformOnly).toBe(true);
  });
  it("round-trips filters through the query string", () => {
    const filters = parseOpsAuditFilters({ q: "acme", actor: "platform", platform: "1", action: "platform.organization", organization: "acme-demo", target: "organization", scope: "platform_wide", from: "2026-09-01", to: "2026-09-08", page: "2" });
    expect(opsAuditQueryString(filters)).toBe("?q=acme&actor=platform&platform=1&action=platform.organization&organization=acme-demo&target=organization&scope=platform_wide&from=2026-09-01&to=2026-09-08&page=2");
    expect(opsAuditQueryString(filters, 1)).not.toContain("page=");
    expect(parseOpsAuditFilters(Object.fromEntries(new URLSearchParams(opsAuditQueryString(filters))))).toEqual(filters);
    expect(opsAuditQueryString(parseOpsAuditFilters({}))).toBe("");
  });
  it("knows when a filter is active", () => {
    expect(isOpsAuditFiltered(parseOpsAuditFilters({}))).toBe(false);
    expect(isOpsAuditFiltered(parseOpsAuditFilters({ page: "2" }))).toBe(false);
    expect(isOpsAuditFiltered(parseOpsAuditFilters({ platform: "1" }))).toBe(true);
    expect(isOpsAuditFiltered(parseOpsAuditFilters({ scope: "break_glass" }))).toBe(true);
    expect(isOpsAuditFiltered(parseOpsAuditFilters({ from: "2026-09-01" }))).toBe(true);
  });
  it("summarises the filters for the export's audit entry without dates as objects", () => {
    const filters = parseOpsAuditFilters({ q: "acme", from: "2026-09-01", platform: "1" });
    expect(opsAuditFilterSummary(filters)).toEqual({ q: "acme", actor: null, platformOnly: true, action: null, organization: null, targetType: null, scope: "all", from: "2026-09-01T00:00:00.000Z", to: null });
  });
  it("builds a WHERE only when something is filtered", () => {
    expect(opsAuditWhere(parseOpsAuditFilters({}), { kind: "any" })).toBeUndefined();
    expect(opsAuditWhere(parseOpsAuditFilters({ platform: "1", scope: "break_glass", action: "ops.break_glass", q: "acme", actor: USER, target: "organization", from: "2026-09-01", to: "2026-09-08" }), { kind: "organization", id: ORG, name: "Acme", slug: "acme" })).toBeDefined();
    expect(opsAuditWhere(parseOpsAuditFilters({}), { kind: "unknown", input: "nope" })).toBeDefined();
  });
});

describe("categories and retention", () => {
  it("files operator and console actions under platform, the rest as the Team module does", () => {
    expect(opsAuditCategory("platform.organization.suspend")).toBe("platform");
    expect(opsAuditCategory("ops.break_glass.approve")).toBe("platform");
    expect(opsAuditCategory("platform.role.set")).toBe("platform");
    expect(opsAuditCategory("member.role.update")).toBe("team");
    expect(opsAuditCategory("destination.create")).toBe("destinations");
    expect(opsAuditCategory("something.else")).toBe("other");
  });
  it("takes the retention window from the database defaults", () => {
    expect(OPS_AUDIT_RETENTION_DAYS).toBe(730);
  });
});

function entry(overrides: Partial<OpsAuditExplorerEntry> = {}): OpsAuditExplorerEntry {
  return {
    id: "01J9AUDITENTRY0000000000001",
    action: "platform.organization.suspend",
    category: "platform",
    targetType: "organization",
    targetId: ORG,
    actor: { kind: "platform", userId: USER, name: "Otto Operator", role: "PLATFORM_ADMIN", detail: null },
    diff: [
      { path: "before.suspendedAt", value: "null" },
      { path: "after.suspendedAt", value: "2026-09-08T10:00:00.000Z" },
    ],
    diffTruncated: false,
    metadata: [
      { path: "reason", value: "abuse, ticket 4711" },
      { path: "platformRole", value: "PLATFORM_ADMIN" },
    ],
    requestId: "01J9REQUEST00000000000000001",
    createdAt: "2026-09-08T10:00:00.000Z",
    organization: { id: ORG, name: "Acme, Demo", slug: "acme-demo" },
    ...overrides,
  };
}

describe("csv export", () => {
  it("joins the flattened rows as path=value pairs without line breaks", () => {
    expect(diffCell([])).toBe("");
    expect(diffCell([{ path: "a.b", value: "1" }, { path: "c", value: "two\nlines" }])).toBe("a.b=1; c=two lines");
  });
  it("writes redacted key lists and metadata columns only", () => {
    const csv = opsAuditCsv([entry(), entry({ id: "01J9AUDITENTRY0000000000002", action: "platform.role.set", organization: null, actor: { kind: "system", userId: null, name: null, role: null, detail: "cli:ops-grant" }, diff: [], metadata: [], requestId: null })]);
    const [header, first, second, tail] = csv.split("\r\n");
    expect(header).toBe(OPS_AUDIT_CSV_COLUMNS.join(","));
    expect(header).not.toMatch(/email|ip_hash|payload/);
    expect(first).toBe(
      `01J9AUDITENTRY0000000000001,2026-09-08T10:00:00.000Z,${ORG},acme-demo,platform,${USER},Otto Operator,PLATFORM_ADMIN,,platform.organization.suspend,platform,organization,${ORG},01J9REQUEST00000000000000001,before.suspendedAt=null; after.suspendedAt=2026-09-08T10:00:00.000Z,false,"reason=abuse, ticket 4711; platformRole=PLATFORM_ADMIN"`,
    );
    expect(second).toBe("01J9AUDITENTRY0000000000002,2026-09-08T10:00:00.000Z,,,system,,,,cli:ops-grant,platform.role.set,platform,organization,0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11,,,false,");
    expect(tail).toBe("");
  });
  it("never carries personal data or secrets: the shared flattening redacts before the cell is built", () => {
    const flattened = flattenDiff({ after: { email: "ada@example.com", token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl" } });
    const csv = opsAuditCsv([entry({ diff: flattened.rows })]);
    expect(csv).not.toContain("ada@example.com");
    expect(csv).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(csv).toContain("[redacted:");
  });
});
