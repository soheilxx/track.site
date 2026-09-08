import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the helpers under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));

import {
  CONFIRMED_STATUSES,
  TICKET_CSV_COLUMNS,
  TICKET_TRANSITIONS,
  applyTags,
  canTicketTransition,
  csvCell,
  likePattern,
  slaState,
  ticketNumberOf,
  ticketPriorityChange,
  ticketStatusChange,
  ticketsCsv,
  type TicketRow,
} from "./tickets";
import { applyPolicyOnPriorityChange, computeDueDates, transitionStatus, type SlaPolicyLike } from "./sla";
import {
  DEFAULT_VIEWS,
  DEFAULT_VIEW_KEYS,
  EMPTY_VIEW_FILTERS,
  OPEN_TICKET_STATUSES,
  canManageView,
  defaultView,
  normalizeTags,
  parseIsoDate,
  parseTicketFilters,
  savedViewFrom,
  ticketQueryString,
  ticketsFiltered,
  viewFiltersFrom,
  viewFiltersOf,
  viewHref,
} from "./views";

import { SUPPORT_TICKET_CHANNELS, SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES } from "@track-site/db";
import { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from "@/components/ops/support/list/constants";

describe("client constants", () => {
  it("mirror the database enumerations (no drift between bundles)", () => {
    expect([...TICKET_STATUSES]).toEqual([...SUPPORT_TICKET_STATUSES]);
    expect([...TICKET_PRIORITIES]).toEqual([...SUPPORT_TICKET_PRIORITIES]);
    expect([...TICKET_CHANNELS]).toEqual([...SUPPORT_TICKET_CHANNELS]);
  });
});

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-09-08T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("slaState", () => {
  const base = { firstResponseDueAt: null, resolutionDueAt: null, firstRespondedAt: null, resolvedAt: null, pausedAt: null, breachedFirstResponse: false, breachedResolution: false };

  it("reads no policy, the running clock, pauses and breaches from real timestamps only", () => {
    expect(slaState(base, NOW)).toEqual({ state: "none", phase: null, dueAt: null });
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-08T14:00:00Z", resolutionDueAt: "2026-09-10T12:00:00Z" }, NOW)).toEqual({ state: "on_track", phase: "first_response", dueAt: "2026-09-08T14:00:00.000Z" });
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-08T11:00:00Z" }, NOW)).toMatchObject({ state: "breached", phase: "first_response" });
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-08T11:00:00Z", pausedAt: "2026-09-08T10:00:00Z" }, NOW)).toMatchObject({ state: "paused", phase: "first_response" });
    // answered: the resolution clock takes over
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-08T11:00:00Z", firstRespondedAt: "2026-09-08T10:30:00Z", resolutionDueAt: "2026-09-10T12:00:00Z" }, NOW)).toEqual({ state: "on_track", phase: "resolution", dueAt: "2026-09-10T12:00:00.000Z" });
    // both clocks done → met, even when the due times are in the past
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-01T11:00:00Z", firstRespondedAt: "2026-09-01T10:00:00Z", resolutionDueAt: "2026-09-02T12:00:00Z", resolvedAt: "2026-09-02T10:00:00Z" }, NOW)).toEqual({ state: "met", phase: null, dueAt: null });
    // only a first-response target, answered → met
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-08T11:00:00Z", firstRespondedAt: "2026-09-08T10:00:00Z" }, NOW)).toMatchObject({ state: "met" });
  });

  it("lets the worker's breach flags win over the live comparison", () => {
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-09T11:00:00Z", breachedFirstResponse: true }, NOW)).toEqual({ state: "breached", phase: "first_response", dueAt: "2026-09-09T11:00:00.000Z" });
    expect(slaState({ ...base, firstRespondedAt: "2026-09-08T10:00:00Z", resolutionDueAt: "2026-09-12T11:00:00Z", breachedResolution: true }, NOW)).toMatchObject({ state: "breached", phase: "resolution" });
    // a breach that was already answered still shows as breached (the flag is a fact of the past)
    expect(slaState({ ...base, firstResponseDueAt: "2026-09-08T09:00:00Z", firstRespondedAt: "2026-09-08T10:00:00Z", breachedFirstResponse: true }, NOW)).toMatchObject({ state: "breached", phase: "first_response" });
    expect(slaState({ ...base, firstResponseDueAt: "not a date" }, NOW)).toEqual({ state: "none", phase: null, dueAt: null });
  });
});

describe("workflow transitions", () => {
  it("allows the documented transitions only and never a self-transition", () => {
    expect(canTicketTransition("new", "open")).toBe(true);
    expect(canTicketTransition("open", "solved")).toBe(true);
    expect(canTicketTransition("solved", "closed")).toBe(true);
    expect(canTicketTransition("closed", "open")).toBe(true);
    expect(canTicketTransition("closed", "solved")).toBe(false);
    expect(canTicketTransition("spam", "solved")).toBe(false);
    expect(canTicketTransition("new", "closed")).toBe(false);
    for (const [from, targets] of Object.entries(TICKET_TRANSITIONS)) expect(targets, from).not.toContain(from);
    expect(CONFIRMED_STATUSES).toEqual(["solved", "closed", "spam"]);
  });
});

// Mon–Fri 09:00–18:00 Europe/Berlin (the seeded default) in September 2026 (CEST = UTC+2), as in sla.test.ts
const POLICY: SlaPolicyLike = {
  id: "a0000000-0000-4000-8000-000000000501",
  priorities: {
    urgent: { first_response_minutes: 60, resolution_minutes: 480 },
    high: { first_response_minutes: 240, resolution_minutes: 1440 },
    normal: { first_response_minutes: 480, resolution_minutes: 4320 },
    low: { first_response_minutes: 1440, resolution_minutes: 10080 },
  },
  businessHours: { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } },
};
const FRI_17 = at("2026-09-11T15:00:00.000Z"); // Friday 17:00 CEST
const NEXT_MON_10 = at("2026-09-14T08:00:00.000Z"); // Monday 10:00 CEST
/** An open, unanswered normal ticket whose clocks run (the columns `lockTickets` reads, minus identity). */
const row = {
  status: "open" as const,
  priority: "normal" as const,
  pausedAt: null,
  pauseTotalMs: 0,
  firstResponseDueAt: at("2026-09-14T13:00:00.000Z"), // Monday 15:00 CEST
  resolutionDueAt: at("2026-09-16T13:00:00.000Z"), // Wednesday 15:00 CEST
  firstRespondedAt: null,
  resolvedAt: null,
  closedAt: null,
  breachedFirstResponse: false,
  breachedResolution: false,
  reopenCount: 0,
  createdAt: at("2026-09-14T05:00:00.000Z"), // Monday 07:00 CEST, before the business day
};

describe("ticketStatusChange", () => {
  it("is the SLA engine's transition plus the queue's bookkeeping — the same patch the ticket page applies", () => {
    for (const to of ["pending", "solved", "spam"] as const) {
      const change = ticketStatusChange(POLICY, row, to, FRI_17);
      expect(change.set, to).toEqual(transitionStatus(POLICY, row, to, FRI_17));
      expect(change.events, to).toEqual(["status"]);
      expect(change.reopened, to).toBe(false);
    }
    // the current status again: nothing to write, nothing to record
    expect(ticketStatusChange(POLICY, row, "open", FRI_17)).toEqual({ set: {}, events: [], reopened: false, pauseEndedMs: 0 });
  });

  it("pauses on pending and shifts the running clocks by the business minutes of the pause, never by the wall clock", () => {
    expect(ticketStatusChange(POLICY, row, "pending", FRI_17).set).toEqual({ status: "pending", pausedAt: FRI_17 });
    const paused = { ...row, status: "pending" as const, pausedAt: FRI_17, pauseTotalMs: 60_000 };
    const resumed = ticketStatusChange(POLICY, paused, "open", NEXT_MON_10);
    // Friday 17–18 and Monday 09–10 are two business hours; the wall clock saw 65 hours
    expect(resumed.set).toEqual({
      status: "open",
      pausedAt: null,
      pauseTotalMs: 60_000 + 65 * 3_600_000,
      firstResponseDueAt: at("2026-09-14T15:00:00.000Z"),
      resolutionDueAt: at("2026-09-16T15:00:00.000Z"),
    });
    expect(resumed.pauseEndedMs).toBe(65 * 3_600_000);
    expect(resumed.events).toEqual(["status"]);
    // an answered first-response clock is not shifted any more
    const answered = ticketStatusChange(POLICY, { ...paused, firstRespondedAt: at("2026-09-11T14:00:00.000Z") }, "open", NEXT_MON_10);
    expect(answered.set.firstResponseDueAt).toBeUndefined();
    expect(answered.set.resolutionDueAt).toEqual(at("2026-09-16T15:00:00.000Z"));
    // without a policy (no SLA) the engine falls back to the wall clock
    expect(ticketStatusChange(null, paused, "open", NEXT_MON_10).set.firstResponseDueAt).toEqual(at("2026-09-17T06:00:00.000Z"));
  });

  it("stamps solving and closing, flags a late resolution and restarts the resolution clock on a reopening", () => {
    const solved = ticketStatusChange(POLICY, row, "solved", FRI_17);
    expect(solved.set).toEqual({ status: "solved", resolvedAt: FRI_17, breachedResolution: false });
    expect(solved.reopened).toBe(false);
    expect(ticketStatusChange(POLICY, row, "solved", at("2026-09-17T08:00:00.000Z")).set.breachedResolution).toBe(true);
    const solvedRow = { ...row, status: "solved" as const, resolvedAt: FRI_17 };
    const closed = ticketStatusChange(POLICY, solvedRow, "closed", NEXT_MON_10);
    expect(closed.set).toEqual({ status: "closed", closedAt: NEXT_MON_10 });
    expect(closed.reopened).toBe(false);
    // reopening: stamps cleared, counted, both clocks recomputed from the reopening (first response still open here)
    const reopened = ticketStatusChange(POLICY, { ...solvedRow, status: "closed" as const, closedAt: NEXT_MON_10, reopenCount: 1 }, "open", NEXT_MON_10);
    const due = computeDueDates(POLICY, "normal", NEXT_MON_10);
    expect(due.resolutionDueAt).not.toBeNull();
    expect(reopened).toEqual({
      set: {
        status: "open",
        resolvedAt: null,
        closedAt: null,
        pausedAt: null,
        resolutionDueAt: due.resolutionDueAt,
        breachedResolution: false,
        firstResponseDueAt: due.firstResponseDueAt,
        breachedFirstResponse: false,
        reopenCount: 2,
      },
      events: ["status", "reopened"],
      reopened: true,
      pauseEndedMs: 0,
    });
    // without a policy the reopened ticket has no due times (never a guess); an answered first response stays
    const noPolicy = ticketStatusChange(null, { ...solvedRow, firstRespondedAt: FRI_17 }, "open", NEXT_MON_10);
    expect(noPolicy.set).toMatchObject({ resolutionDueAt: null, reopenCount: 1 });
    expect(noPolicy.set.firstResponseDueAt).toBeUndefined();
    // spam → new is not a reopening
    expect(ticketStatusChange(POLICY, { ...row, status: "spam" as const }, "new", FRI_17)).toEqual({ set: { status: "new" }, events: ["status"], reopened: false, pauseEndedMs: 0 });
  });
});

describe("ticketPriorityChange", () => {
  const FRI_16 = at("2026-09-11T14:00:00.000Z"); // Friday 16:00 CEST

  it("is the SLA engine's priority change plus the priority — the same patch the ticket page applies", () => {
    const change = ticketPriorityChange(POLICY, row, "urgent", FRI_16);
    expect(change.changed).toBe(true);
    expect(change.set).toEqual({ ...applyPolicyOnPriorityChange(POLICY, row, "urgent", FRI_16), priority: "urgent" });
    // normal → urgent: the first-response target shrinks by 420 business minutes (Monday 15:00 → Friday 17:00 CEST,
    // not seven wall-clock hours), the resolution target by 3 840 (Wednesday 15:00 → the Monday before, 14:00 CEST)
    expect(change.set.firstResponseDueAt).toEqual(at("2026-09-11T15:00:00.000Z"));
    expect(change.set.resolutionDueAt).toEqual(at("2026-09-07T12:00:00.000Z"));
    // the breach flags follow the new due times: the shorter resolution target is overdue at once, the first response is not yet
    expect(change.set.breachedFirstResponse).toBe(false);
    expect(change.set.breachedResolution).toBe(true);
    // the other way round the targets grow; an answered first-response clock is left alone
    const relaxed = ticketPriorityChange(POLICY, { ...row, firstRespondedAt: FRI_17 }, "low", FRI_16);
    expect(relaxed.set.firstResponseDueAt).toBeUndefined();
    expect(relaxed.set.resolutionDueAt!.getTime()).toBeGreaterThan(row.resolutionDueAt.getTime());
    expect(relaxed.set).toMatchObject({ priority: "low", breachedResolution: false });
    // the current priority again: nothing to write, nothing to record
    expect(ticketPriorityChange(POLICY, row, "normal", FRI_16)).toEqual({ set: {}, changed: false });
  });

  it("clears the running due times of a ticket without policy instead of guessing, and keeps finished clocks", () => {
    expect(ticketPriorityChange(null, row, "urgent", FRI_16).set).toEqual({ priority: "urgent", firstResponseDueAt: null, resolutionDueAt: null });
    const answered = ticketPriorityChange(null, { ...row, firstRespondedAt: FRI_17, resolvedAt: FRI_17 }, "high", FRI_16);
    expect(answered.set).toEqual({ priority: "high" });
    // nothing to clear when there never were due times
    expect(ticketPriorityChange(undefined, { ...row, firstResponseDueAt: null, resolutionDueAt: null }, "low", FRI_16).set).toEqual({ priority: "low" });
  });
});

describe("tags", () => {
  it("normalises, deduplicates and caps tags", () => {
    expect(normalizeTags([" Billing ", "billing", "VAT-2026", "bad tag!", "", "x".repeat(40)])).toEqual(["billing", "vat-2026"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
  });

  it("applies additions and removals and reports whether anything changed", () => {
    expect(applyTags(["billing", "vip"], ["Refund"], ["vip"])).toEqual({ tags: ["billing", "refund"], added: ["refund"], removed: ["vip"], changed: true });
    expect(applyTags(["billing"], ["billing"], [])).toEqual({ tags: ["billing"], added: [], removed: [], changed: false });
    expect(applyTags(["billing"], ["vip"], ["vip"]).tags).toEqual(["billing"]);
    const full = applyTags(Array.from({ length: 20 }, (_, i) => `t${i}`), ["extra"], []);
    expect(full.added).toEqual([]);
    expect(full.tags).toHaveLength(20);
  });
});

describe("search helpers", () => {
  it("escapes ILIKE wildcards and recognises ticket numbers", () => {
    expect(likePattern("acme")).toBe("%acme%");
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
    expect(ticketNumberOf("#1234")).toBe(1234);
    expect(ticketNumberOf(" 1234 ")).toBe(1234);
    expect(ticketNumberOf("1234 refund")).toBeNull();
    expect(ticketNumberOf("1".repeat(13))).toBeNull();
  });
});

describe("csv", () => {
  const row: TicketRow = {
    id: ID,
    number: 1000,
    subject: 'Refund, please "now"',
    status: "open",
    priority: "high",
    channel: "email",
    tags: ["billing", "vip"],
    requester: { name: "Jane Roe", email: "jane@example.test" },
    organization: { id: OTHER, name: "Acme", slug: "acme" },
    planId: "starter",
    planName: "Starter",
    assignee: { id: ID, name: "Ops Tester" },
    sla: { state: "on_track", phase: "first_response", dueAt: "2026-09-08T14:00:00.000Z" },
    firstResponseDueAt: "2026-09-08T14:00:00.000Z",
    resolutionDueAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    lastCustomerMessageAt: null,
    lastAgentMessageAt: null,
    mergedIntoId: null,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T11:00:00.000Z",
    viewers: [],
  };

  it("writes metadata columns only, quoted and formula-safe, without requester details", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
    const csv = ticketsCsv([row]);
    const [header, line] = csv.split("\r\n");
    expect(header).toBe(TICKET_CSV_COLUMNS.join(","));
    expect(line).toContain('1000,11111111-1111-4111-8111-111111111111,"Refund, please ""now""",open,high,email');
    expect(line).toContain("billing;vip,on_track");
    expect(csv).not.toContain("jane@example.test");
    expect(csv).not.toContain("Jane Roe");
    expect(TICKET_CSV_COLUMNS).not.toContain("requester_email");
  });
});

describe("views", () => {
  it("ships the seven default views with open-queue semantics", () => {
    expect(DEFAULT_VIEWS.map((v) => v.key)).toEqual([...DEFAULT_VIEW_KEYS]);
    expect(defaultView("unassigned").filters).toMatchObject({ status: OPEN_TICKET_STATUSES, assignee: "unassigned" });
    expect(defaultView("mine").filters.assignee).toBe("me");
    expect(defaultView("breached")).toMatchObject({ filters: { sla: "breached" }, sort: "sla_due_asc" });
    expect(defaultView("solved_7d").filters).toMatchObject({ status: ["solved", "closed"], dateField: "resolved", lastDays: 7 });
    expect(defaultView("spam").filters.status).toEqual(["spam"]);
  });

  it("parses stored filters leniently and salvages valid fields of a broken row", () => {
    expect(viewFiltersFrom(null)).toEqual(EMPTY_VIEW_FILTERS);
    expect(viewFiltersFrom({ status: ["open", "open", "bogus"], tags: ["Billing"], lastDays: 9999, assignee: ID })).toMatchObject({ status: [], tags: [], lastDays: null, assignee: ID });
    expect(viewFiltersFrom({ status: ["open"], plan: "starter" })).toMatchObject({ status: ["open"], plan: "starter" });
    const saved = savedViewFrom({ id: ID, ownerUserId: null, name: "Team", filters: { priority: ["urgent"] }, sort: "nonsense", position: 2, createdAt: at("2026-09-01T00:00:00Z"), updatedAt: at("2026-09-02T00:00:00Z") });
    expect(saved).toMatchObject({ scope: "shared", filters: { priority: ["urgent"] }, sort: "updated_desc", createdAt: "2026-09-01T00:00:00.000Z" });
    expect(viewHref(ID)).toBe(`/ops/support?view=${ID}`);
  });

  it("lets owners manage personal views and admins manage shared ones", () => {
    const support = { user: { id: ID }, platformRole: "PLATFORM_SUPPORT" } as never;
    const admin = { user: { id: OTHER }, platformRole: "PLATFORM_ADMIN" } as never;
    expect(canManageView(support, { scope: "personal", ownerUserId: ID })).toBe(true);
    expect(canManageView(support, { scope: "personal", ownerUserId: OTHER })).toBe(false);
    expect(canManageView(support, { scope: "shared", ownerUserId: null })).toBe(false);
    expect(canManageView(admin, { scope: "shared", ownerUserId: null })).toBe(true);
    expect(canManageView(admin, { scope: "personal", ownerUserId: ID })).toBe(false);
  });
});

describe("parseTicketFilters", () => {
  const open = defaultView("open");
  const base = { filters: open.filters, sort: open.sort, view: "open" };

  it("starts from the view and lets the URL override single values, lists and resets", () => {
    expect(parseTicketFilters({}, base)).toMatchObject({ view: "open", status: OPEN_TICKET_STATUSES, sort: "updated_desc", page: 1, q: null });
    expect(parseTicketFilters({ status: "solved,closed", priority: ["urgent", "high"], assignee: "me", sla: "breached", sort: "priority_desc", page: "3", q: "  refund  " }, base)).toMatchObject({
      status: ["solved", "closed"],
      priority: ["urgent", "high"],
      assignee: "me",
      sla: "breached",
      sort: "priority_desc",
      page: 3,
      q: "refund",
    });
    expect(parseTicketFilters({ status: "any", assignee: "any" }, base)).toMatchObject({ status: [], assignee: "any" });
    // invalid values fall back to the view, never to an empty list
    expect(parseTicketFilters({ status: "bogus", assignee: "someone", sort: "x", page: "-1", lastDays: "400" }, base)).toMatchObject({ status: OPEN_TICKET_STATUSES, assignee: "any", sort: "updated_desc", page: 1, lastDays: null });
    expect(parseTicketFilters({ assignee: "-".repeat(36) }, base).assignee).toBe("any");
    expect(parseTicketFilters({ q: "a".repeat(200) }).q).toHaveLength(80);
    expect(parseTicketFilters({ page: "99999999" }).page).toBe(10_000);
  });

  it("validates organisation, plan, tags and date ranges", () => {
    expect(parseTicketFilters({ org: "acme-demo", plan: "growth", tags: "Billing, VIP", dateField: "created", from: "2026-09-01", to: "2026-09-08" })).toMatchObject({
      organization: "acme-demo",
      plan: "growth",
      tags: ["billing", "vip"],
      dateField: "created",
      from: "2026-09-01",
      to: "2026-09-08",
    });
    expect(parseTicketFilters({ org: "<script>", plan: "Bad Plan", tags: "!!!", dateField: "x", from: "2026-02-30", to: "yesterday" })).toMatchObject({ organization: null, plan: null, tags: [], dateField: "updated", from: null, to: null });
    expect(parseIsoDate("2026-02-29")).toBeUndefined();
    expect(parseIsoDate("2028-02-29")).toBe("2028-02-29");
    expect(parseTicketFilters({ lastDays: "30" }).lastDays).toBe(30);
    expect(parseTicketFilters({ lastDays: "any" }, { filters: { ...EMPTY_VIEW_FILTERS, lastDays: 7 }, sort: "updated_desc", view: null }).lastDays).toBeNull();
    // `dates=any` lifts the view's whole date range at once (the filter form's checkbox); own values still win
    const ranged = { filters: { ...EMPTY_VIEW_FILTERS, from: "2026-09-01", to: "2026-09-07", lastDays: 7 }, sort: "updated_desc" as const, view: null };
    expect(parseTicketFilters({ dates: "any" }, ranged)).toMatchObject({ from: null, to: null, lastDays: null });
    expect(parseTicketFilters({ dates: "any", from: "2026-08-01" }, ranged)).toMatchObject({ from: "2026-08-01", to: null, lastDays: null });
    expect(parseTicketFilters({ dates: "no", from: "" }, ranged)).toMatchObject({ from: "2026-09-01", to: "2026-09-07", lastDays: 7 });
    // the view parameter is kept only when it names a default view or looks like a saved view id
    expect(parseTicketFilters({ view: "mine" }).view).toBe("mine");
    expect(parseTicketFilters({ view: ID }).view).toBe(ID);
    expect(parseTicketFilters({ view: "nope" }).view).toBeNull();
  });
});

describe("ticketQueryString", () => {
  const open = defaultView("open");
  const base = { filters: open.filters, sort: open.sort };

  it("writes only the differences from the view and keeps every filter for page links", () => {
    const plain = parseTicketFilters({}, { ...base, view: "open" });
    expect(ticketQueryString(plain, 1, base)).toBe("?view=open");
    expect(ticketQueryString(plain, 2, base)).toBe("?view=open&page=2");
    const changed = parseTicketFilters({ status: "any", priority: "urgent", q: "a&b", sort: "number_asc", assignee: ID, tags: "vip" }, { ...base, view: "open" });
    const qs = ticketQueryString(changed, 1, base);
    expect(qs).toContain("status=any");
    expect(qs).toContain("priority=urgent");
    expect(qs).toContain("q=a%26b");
    expect(qs).toContain("sort=number_asc");
    expect(qs).toContain(`assignee=${ID}`);
    expect(qs).toContain("tags=vip");
    expect(qs).not.toContain("page=");
    // round trip: parsing the query string again yields the same filters
    const again = parseTicketFilters(Object.fromEntries(new URLSearchParams(qs)), { ...base, view: "open" });
    expect(viewFiltersOf(again)).toEqual(viewFiltersOf(changed));
    expect(again.sort).toBe("number_asc");
  });

  it("reports whether the queue deviates from its view", () => {
    const plain = parseTicketFilters({}, { ...base, view: "open" });
    expect(ticketsFiltered(plain, base)).toBe(false);
    expect(ticketsFiltered({ ...plain, q: "x" }, base)).toBe(true);
    expect(ticketsFiltered({ ...plain, status: [] }, base)).toBe(true);
    expect(ticketsFiltered({ ...plain, lastDays: 3 }, base)).toBe(true);
    expect(ticketQueryString(parseTicketFilters({}))).toBe("");
  });
});
