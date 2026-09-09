import { describe, expect, it, vi } from "vitest";
import { SUPPORT_TEAM_ROLES } from "@track-site/db";

vi.mock("server-only", () => ({}));

import { TEAM_ROLES, TEAM_SLUG_PATTERN, auditFieldsOf, parseTeamFilter, resolveTeamSlug, slugifyTeamName, teamAuditDiff, teamFilterWhere, teamQueryValue } from "./teams";

/**
 * Pure helpers of the teams slice (docs/18 §"Agent-created tickets and teams"): the client-safe mirror of the
 * role enumeration, slug derivation, the queue's team filter model and the audit diff.
 */
describe("teams — constants and slugs", () => {
  it("mirrors the database enumeration", () => {
    expect([...TEAM_ROLES]).toEqual([...SUPPORT_TEAM_ROLES]);
  });

  it("derives a slug from a name (lower-case, hyphens, no diacritics) and refuses unusable names", () => {
    expect(slugifyTeamName("Customer Success")).toBe("customer-success");
    expect(slugifyTeamName("  Équipe Ventes / EMEA  ")).toBe("equipe-ventes-emea");
    expect(slugifyTeamName("---")).toBeNull();
    expect(slugifyTeamName("")).toBeNull();
    const long = slugifyTeamName("a".repeat(80));
    expect(long).toHaveLength(40);
    expect(TEAM_SLUG_PATTERN.test(long!)).toBe(true);
  });

  it("prefers an explicit slug and validates it", () => {
    expect(resolveTeamSlug("Sales", "  Sales-EU ")).toBe("sales-eu");
    expect(resolveTeamSlug("Sales", "bad slug!")).toBeNull();
    expect(resolveTeamSlug("Sales EU", "")).toBe("sales-eu");
    expect(resolveTeamSlug("", null)).toBeNull();
  });
});

describe("teams — queue filter model", () => {
  it("parses the team parameter: any, none, id, slug; anything else is any", () => {
    expect(parseTeamFilter(undefined)).toBe("any");
    expect(parseTeamFilter("")).toBe("any");
    expect(parseTeamFilter("any")).toBe("any");
    expect(parseTeamFilter("none")).toBe("none");
    expect(parseTeamFilter("Sales")).toBe("sales");
    expect(parseTeamFilter(["support", "sales"])).toBe("support");
    expect(parseTeamFilter("00000000-0000-4000-8000-000000000171")).toBe("00000000-0000-4000-8000-000000000171");
    expect(parseTeamFilter("not a slug!")).toBe("any");
  });

  it("writes only a real filter into the query string", () => {
    expect(teamQueryValue("any")).toBeNull();
    expect(teamQueryValue(null)).toBeNull();
    expect(teamQueryValue("none")).toBe("none");
    expect(teamQueryValue("sales")).toBe("sales");
  });

  it("builds a predicate for every filter but any", () => {
    expect(teamFilterWhere("any")).toBeNull();
    expect(teamFilterWhere(undefined)).toBeNull();
    expect(teamFilterWhere("none")).not.toBeNull();
    expect(teamFilterWhere("sales")).not.toBeNull();
    expect(teamFilterWhere("00000000-0000-4000-8000-000000000171")).not.toBeNull();
  });
});

describe("teams — audit diff", () => {
  const row = { slug: "sales", name: "Sales", description: "", isDefault: false, archivedAt: null };

  it("lists every field on creation and only the changed ones on an update", () => {
    const before = auditFieldsOf(row);
    expect(teamAuditDiff(null, before)).toEqual({ slug: "sales", name: "Sales", description: "", isDefault: false, archivedAt: null });
    expect(teamAuditDiff(before, { ...before, name: "Sales EMEA", archivedAt: "2026-09-09T10:00:00.000Z" })).toEqual({
      name: { before: "Sales", after: "Sales EMEA" },
      archivedAt: { before: null, after: "2026-09-09T10:00:00.000Z" },
    });
    expect(teamAuditDiff(before, before)).toEqual({});
  });

  it("renders the archive instant as ISO", () => {
    expect(auditFieldsOf({ ...row, archivedAt: new Date("2026-09-09T10:00:00Z") }).archivedAt).toBe("2026-09-09T10:00:00.000Z");
  });
});
