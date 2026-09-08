import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("@/server/session", () => ({ withOrg: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/entitlements", () => ({ planLimits: vi.fn() }));
vi.mock("./platform", () => ({ withPlatform: vi.fn(), auditPlatform: vi.fn(), activeBreakGlass: vi.fn() }));

import {
  CSV_COLUMNS,
  actorUserIds,
  csvCell,
  healthTone,
  isFiltered,
  opsActorView,
  organisationQueryString,
  organisationsCsv,
  parseOrganisationFilters,
  pauseAtEvents,
  snapshotFreshness,
  snippetState,
  usageThresholds,
  type OrganisationRow,
} from "./organisations";

describe("directory filters", () => {
  it("parses URL filters defensively", () => {
    expect(parseOrganisationFilters({})).toEqual({ q: null, plan: null, status: null, suspended: "all", sort: "created", dir: "desc", page: 1 });
    const parsed = parseOrganisationFilters({ q: "  acme ", plan: "growth", status: "past_due", suspended: "yes", sort: "events", dir: "asc", page: "3" });
    expect(parsed).toEqual({ q: "acme", plan: "growth", status: "past_due", suspended: "yes", sort: "events", dir: "asc", page: 3 });
    expect(parseOrganisationFilters({ plan: "Drop Table", status: "nope", suspended: "maybe", sort: "bogus", dir: "sideways", page: "-4" })).toEqual({ q: null, plan: null, status: null, suspended: "all", sort: "created", dir: "desc", page: 1 });
    expect(parseOrganisationFilters({ q: "x".repeat(100) }).q).toHaveLength(64);
    expect(parseOrganisationFilters({ page: "999999" }).page).toBe(10_000);
    // every sort has a sensible default direction
    expect(parseOrganisationFilters({ sort: "name" }).dir).toBe("asc");
    expect(parseOrganisationFilters({ sort: "health" }).dir).toBe("asc");
    expect(parseOrganisationFilters({ sort: "activity" }).dir).toBe("desc");
  });
  it("round-trips filters through the query string", () => {
    const filters = parseOrganisationFilters({ q: "acme", plan: "pro", suspended: "no", sort: "members", page: "2" });
    expect(organisationQueryString(filters)).toBe("?q=acme&plan=pro&suspended=no&sort=members&page=2");
    expect(organisationQueryString(filters, 1)).toBe("?q=acme&plan=pro&suspended=no&sort=members");
    expect(parseOrganisationFilters(Object.fromEntries(new URLSearchParams(organisationQueryString(filters))))).toEqual(filters);
    expect(organisationQueryString(parseOrganisationFilters({}))).toBe("");
    // a non-default direction is kept, the default one is dropped
    expect(organisationQueryString(parseOrganisationFilters({ sort: "name", dir: "desc" }))).toBe("?sort=name&dir=desc");
    expect(organisationQueryString(parseOrganisationFilters({ sort: "name", dir: "asc" }))).toBe("?sort=name");
  });
  it("knows when a filter is active", () => {
    expect(isFiltered(parseOrganisationFilters({}))).toBe(false);
    expect(isFiltered(parseOrganisationFilters({ sort: "name", page: "2" }))).toBe(false);
    expect(isFiltered(parseOrganisationFilters({ suspended: "yes" }))).toBe(true);
    expect(isFiltered(parseOrganisationFilters({ q: "a" }))).toBe(true);
  });
});

describe("health, snapshots and snippets", () => {
  it("maps the site health score to the Command Center tones", () => {
    expect(healthTone(null)).toBe("neutral");
    expect(healthTone(100)).toBe("ok");
    expect(healthTone(80)).toBe("ok");
    expect(healthTone(79)).toBe("warn");
    expect(healthTone(50)).toBe("warn");
    expect(healthTone(49)).toBe("bad");
  });
  it("marks snapshots fresh, stale or missing", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    expect(snapshotFreshness(null, now)).toBe("missing");
    expect(snapshotFreshness("not a date", now)).toBe("missing");
    expect(snapshotFreshness(new Date("2026-09-08T11:58:00Z"), now)).toBe("fresh");
    expect(snapshotFreshness("2026-09-08T11:50:00Z", now)).toBe("stale");
  });
  it("derives the snippet state from browser events and the published configuration", () => {
    expect(snippetState({ lastBrowserEventAt: "2026-09-01T00:00:00Z", activeVersion: null })).toBe("verified");
    expect(snippetState({ lastBrowserEventAt: null, activeVersion: 3 })).toBe("pending");
    expect(snippetState({ lastBrowserEventAt: null, activeVersion: null })).toBe("none");
  });
});

describe("usage", () => {
  it("computes the 70 / 90 / 100 % thresholds against the billable count", () => {
    const warned = { 70: new Date("2026-09-05T00:00:00Z"), 90: null, 100: null } as const;
    const states = usageThresholds(1000, 850, { ...warned });
    expect(states).toEqual([
      { pct: 70, events: 700, reached: true, warnedAt: "2026-09-05T00:00:00.000Z" },
      { pct: 90, events: 900, reached: false, warnedAt: null },
      { pct: 100, events: 1000, reached: false, warnedAt: null },
    ]);
    expect(usageThresholds(null, 850, { 70: null, 90: null, 100: null })).toBeNull();
    expect(usageThresholds(0, 850, { 70: null, 90: null, 100: null })).toBeNull();
  });
  it("tells where the pause policy stops processing", () => {
    expect(pauseAtEvents(500_000, "pause")).toBe(600_000);
    expect(pauseAtEvents(500_000, "cost_limit")).toBe(600_000);
    expect(pauseAtEvents(500_000, "allow")).toBeNull();
    expect(pauseAtEvents(null, "pause")).toBeNull();
  });
});

describe("audit actors", () => {
  it("names platform operators from the user table and delegates other kinds", () => {
    const names = new Map([
      ["u1", "Ada"],
      ["op1", "Otto Operator"],
    ]);
    expect(opsActorView({ kind: "platform", userId: "op1", email: "[redacted:email]", platformRole: "PLATFORM_ADMIN" }, names)).toEqual({ kind: "platform", userId: "op1", name: "Otto Operator", role: "PLATFORM_ADMIN", detail: null });
    expect(opsActorView({ kind: "platform", userId: "gone" }, names)).toMatchObject({ kind: "platform", userId: "gone", name: null, role: null });
    expect(opsActorView({ kind: "user", userId: "u1", role: "OWNER" }, names)).toEqual({ kind: "user", userId: "u1", name: "Ada", role: "OWNER", detail: null });
    expect(opsActorView({ kind: "system", name: "worker:usage" }, names)).toMatchObject({ kind: "system", detail: "worker:usage" });
    expect(opsActorView(null, names).kind).toBe("unknown");
  });
  it("collects the user ids to look up, ignoring non-uuids", () => {
    const ids = actorUserIds([
      { kind: "platform", userId: "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11" },
      { kind: "agent", onBehalfOfUserId: "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e22", chatSessionId: "s1" },
      { kind: "user", userId: "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11" },
      { kind: "system", name: "worker" },
      null,
    ]);
    expect(ids.sort()).toEqual(["0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11", "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e22"]);
  });
});

describe("csv export", () => {
  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('Acme, "Inc"')).toBe('"Acme, ""Inc"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });
  it("writes the metadata columns only", () => {
    const row: OrganisationRow = {
      id: "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11",
      name: "Acme, Demo",
      slug: "acme-demo",
      createdAt: "2026-09-03T23:06:01.331Z",
      suspendedAt: null,
      planId: "starter",
      planName: "Starter",
      subscriptionStatus: "none",
      members: 3,
      sites: 1,
      events30d: 0,
      lastActivityAt: "2026-09-08T10:00:00.000Z",
      healthScore: null,
      healthSites: 0,
    };
    const csv = organisationsCsv([row]);
    const [header, line, tail] = csv.split("\r\n");
    expect(header).toBe(CSV_COLUMNS.join(","));
    expect(line).toBe('0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11,"Acme, Demo",acme-demo,2026-09-03T23:06:01.331Z,starter,none,,3,1,0,2026-09-08T10:00:00.000Z,');
    expect(tail).toBe("");
    expect(header).not.toMatch(/email|stripe|token/);
  });
});
