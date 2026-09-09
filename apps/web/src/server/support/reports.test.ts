import { describe, expect, it, vi } from "vitest";
import {
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
} from "@track-site/db";

// the loader's runtime dependencies are server-only; the reducers under test are pure
vi.mock("server-only", () => ({}));

import {
  REPORT_CHANNELS,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
} from "@/components/ops/support/reports/constants";
import {
  FORMER_AGENTS_ID,
  MIN_P90_SAMPLE,
  REPORT_DEFAULT_DAYS,
  REPORT_MAX_TICKETS,
  REPORT_RANGE_MAX_DAYS,
  REPORT_TOP_LIMIT,
  REPORT_WEEKLY_FROM_DAYS,
  SMALL_SAMPLE_TICKETS,
  agentsView,
  backlogView,
  bucketKey,
  bucketsOf,
  categoriesView,
  csatView,
  csvCell,
  dayKey,
  durationStats,
  median,
  organisationsView,
  parseIsoDay,
  parseReportRange,
  percentile,
  reportQuery,
  satisfactionScoreOf,
  slaOutcome,
  slaView,
  summaryRows,
  supportReportCsv,
  supportReportView,
  tagsView,
  timesView,
  volumeView,
  weekStartUtc,
  type ReportTicket,
  type SupportReportSnapshot,
} from "./reports";

// Tuesday 2026-09-08 12:00 UTC; the current ISO week starts Monday 2026-09-07
const now = new Date("2026-09-08T12:00:00Z");
const hours = (n: number, from: Date = now) => new Date(from.getTime() + n * 3_600_000);
const days = (n: number, from: Date = now) => new Date(from.getTime() + n * 86_400_000);

let seq = 0;
function ticket(over: Partial<ReportTicket> = {}): ReportTicket {
  seq += 1;
  return {
    id: `ticket-${seq}`,
    organizationId: "org-1",
    status: "open",
    priority: "normal",
    channel: "email",
    category: null,
    tags: [],
    assigneeUserId: null,
    createdAt: days(-3),
    firstResponseDueAt: null,
    resolutionDueAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    pausedAt: null,
    breachedFirstResponse: false,
    breachedResolution: false,
    satisfactionScore: null,
    ...over,
  };
}

function snapshot(over: Partial<SupportReportSnapshot> = {}): SupportReportSnapshot {
  const range = parseReportRange({ days: "7" }, now);
  return {
    now,
    range,
    created: [],
    solved: [],
    backlog: [],
    unassignedOpen: 0,
    oldestOpenCreatedAt: null,
    cohort: [],
    cohortTotal: 0,
    firstResponders: [],
    agents: [],
    agentOpen: [],
    agentReplies: [],
    agentSolved: [],
    organisations: [],
    organisationsDistinct: 0,
    withoutOrganisation: 0,
    csatEnabled: true,
    ...over,
  };
}

describe("client-safe constants", () => {
  it("mirror the database enumerations", () => {
    expect([...REPORT_CHANNELS]).toEqual([...SUPPORT_TICKET_CHANNELS]);
    expect([...REPORT_STATUSES]).toEqual([...SUPPORT_TICKET_STATUSES]);
    expect([...REPORT_PRIORITIES]).toEqual([...SUPPORT_TICKET_PRIORITIES]);
  });
});

describe("calendar helpers", () => {
  it("starts ISO weeks on Monday 00:00 UTC and keys buckets", () => {
    expect(dayKey(weekStartUtc(now))).toBe("2026-09-07");
    expect(dayKey(weekStartUtc(new Date("2026-09-06T23:59:59Z")))).toBe("2026-08-31");
    expect(bucketKey(now, "day")).toBe("2026-09-08");
    expect(bucketKey(now, "week")).toBe("2026-09-07");
  });

  it("parses strict ISO days only", () => {
    expect(parseIsoDay("2026-09-08")?.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(parseIsoDay("2026-02-30")).toBeNull();
    expect(parseIsoDay("2026-9-8")).toBeNull();
    expect(parseIsoDay("2026-09-08T00:00:00Z")).toBeNull();
    expect(parseIsoDay("")).toBeNull();
  });
});

describe("parseReportRange", () => {
  it("defaults to the last 30 days ending today, bucketed by day", () => {
    const range = parseReportRange({}, now);
    expect(range).toMatchObject({
      from: "2026-08-10",
      to: "2026-09-08",
      days: REPORT_DEFAULT_DAYS,
      bucket: "day",
      bucketExplicit: false,
      preset: 30,
      fallback: false,
    });
    expect(range.start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("accepts quick ranges and any day count up to the maximum", () => {
    expect(parseReportRange({ days: "7" }, now)).toMatchObject({
      from: "2026-09-02",
      to: "2026-09-08",
      days: 7,
      preset: 7,
      bucket: "day",
    });
    expect(parseReportRange({ days: "90" }, now)).toMatchObject({
      days: 90,
      preset: 90,
      bucket: "week",
    });
    expect(parseReportRange({ days: "45" }, now)).toMatchObject({
      days: 45,
      preset: null,
      bucket: "day",
      fallback: false,
    });
    expect(parseReportRange({ days: String(REPORT_RANGE_MAX_DAYS) }, now)).toMatchObject({
      days: REPORT_RANGE_MAX_DAYS,
      fallback: false,
    });
    expect(parseReportRange({ days: String(REPORT_RANGE_MAX_DAYS + 1) }, now)).toMatchObject({
      days: REPORT_DEFAULT_DAYS,
      fallback: true,
    });
    expect(parseReportRange({ days: "0" }, now)).toMatchObject({ fallback: true });
    expect(parseReportRange({ days: "abc" }, now)).toMatchObject({ fallback: true });
  });

  it("accepts custom windows, recognises a preset-shaped one and refuses invalid ones", () => {
    expect(parseReportRange({ from: "2026-08-01", to: "2026-08-31" }, now)).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-31",
      days: 31,
      preset: null,
      bucket: "day",
      fallback: false,
    });
    expect(parseReportRange({ from: "2026-09-02", to: "2026-09-08" }, now)).toMatchObject({
      preset: 7,
    });
    expect(parseReportRange({ from: "2026-09-01" }, now)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-08",
      days: 8,
      fallback: false,
    });
    expect(parseReportRange({ from: "2026-09-08", to: "2026-09-01" }, now)).toMatchObject({
      fallback: true,
    });
    expect(parseReportRange({ from: "2026-09-01", to: "2026-09-09" }, now)).toMatchObject({
      fallback: true,
    });
    expect(parseReportRange({ to: "2026-09-01" }, now)).toMatchObject({ fallback: true });
    expect(parseReportRange({ from: "2025-01-01", to: "2026-09-08" }, now)).toMatchObject({
      fallback: true,
    });
    expect(parseReportRange({ from: ["2026-09-01", "2026-09-02"] }, now)).toMatchObject({
      from: "2026-09-01",
    });
  });

  it("switches to weekly buckets for long ranges unless the URL says otherwise", () => {
    expect(parseReportRange({ days: String(REPORT_WEEKLY_FROM_DAYS) }, now).bucket).toBe("day");
    expect(parseReportRange({ days: String(REPORT_WEEKLY_FROM_DAYS + 1) }, now).bucket).toBe(
      "week",
    );
    expect(parseReportRange({ days: "7", bucket: "week" }, now)).toMatchObject({
      bucket: "week",
      bucketExplicit: true,
    });
    expect(parseReportRange({ days: "120", bucket: "day" }, now)).toMatchObject({
      bucket: "day",
      bucketExplicit: true,
    });
    expect(parseReportRange({ days: "7", bucket: "month" }, now)).toMatchObject({
      bucket: "day",
      bucketExplicit: false,
    });
  });

  it("round-trips through the query string", () => {
    const preset = parseReportRange({ days: "7" }, now);
    expect(reportQuery(preset)).toBe("?days=7");
    expect(reportQuery(preset, { days: 30 })).toBe("?days=30");
    const custom = parseReportRange({ from: "2026-08-01", to: "2026-08-31", bucket: "week" }, now);
    expect(reportQuery(custom)).toBe("?from=2026-08-01&to=2026-08-31&bucket=week");
    expect(reportQuery(custom, { bucket: null })).toBe("?from=2026-08-01&to=2026-08-31");
    expect(
      parseReportRange(Object.fromEntries(new URLSearchParams(reportQuery(custom))), now),
    ).toMatchObject({ from: "2026-08-01", to: "2026-08-31", bucket: "week" });
  });
});

describe("bucketsOf", () => {
  it("lists every day of the range and marks today as partial", () => {
    const slots = bucketsOf(parseReportRange({ days: "3" }, now), now);
    expect(slots.map((s) => s.key)).toEqual(["2026-09-06", "2026-09-07", "2026-09-08"]);
    expect(slots.map((s) => s.partial)).toEqual([false, false, true]);
  });

  it("lists Monday buckets covering the range and marks the edge weeks partial", () => {
    const slots = bucketsOf(
      parseReportRange({ from: "2026-08-19", to: "2026-09-06", bucket: "week" }, now),
      now,
    );
    expect(slots.map((s) => s.key)).toEqual(["2026-08-17", "2026-08-24", "2026-08-31"]);
    expect(slots.map((s) => s.partial)).toEqual([true, false, false]);
    const running = bucketsOf(
      parseReportRange({ from: "2026-08-31", to: "2026-09-08", bucket: "week" }, now),
      now,
    );
    expect(running.map((s) => [s.key, s.partial])).toEqual([
      ["2026-08-31", false],
      ["2026-09-07", true],
    ]);
  });
});

describe("percentiles", () => {
  it("interpolates like percentile_cont", () => {
    expect(percentile([], 0.9)).toBeNull();
    expect(percentile([5], 0.9)).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9.1);
    expect(percentile([10, 20], 0.25)).toBe(12.5);
  });

  it("withholds the p90 below the minimum sample and never for an empty list", () => {
    const few = durationStats([1000, 2000, 3000], 2);
    expect(few).toMatchObject({
      measured: 3,
      pending: 2,
      medianMs: 2000,
      p90Ms: null,
      p90Withheld: true,
    });
    const none = durationStats([], 4);
    expect(none).toMatchObject({ measured: 0, medianMs: null, p90Ms: null, p90Withheld: false });
    const enough = durationStats(
      Array.from({ length: MIN_P90_SAMPLE }, (_, i) => (i + 1) * 1000),
      0,
    );
    expect(enough.p90Withheld).toBe(false);
    expect(enough.p90Ms).toBe(9100);
  });
});

describe("slaOutcome", () => {
  const nowMs = now.getTime();
  it("classifies from stored instants only", () => {
    expect(slaOutcome(ticket(), "first_response", nowMs)).toBe("no_policy");
    expect(
      slaOutcome(
        ticket({ firstResponseDueAt: hours(-1), firstRespondedAt: hours(-2) }),
        "first_response",
        nowMs,
      ),
    ).toBe("met");
    expect(
      slaOutcome(
        ticket({ firstResponseDueAt: hours(-2), firstRespondedAt: hours(-1) }),
        "first_response",
        nowMs,
      ),
    ).toBe("breached");
    // the worker's flag wins even when the instants look fine
    expect(
      slaOutcome(
        ticket({
          firstResponseDueAt: hours(-1),
          firstRespondedAt: hours(-2),
          breachedFirstResponse: true,
        }),
        "first_response",
        nowMs,
      ),
    ).toBe("breached");
    expect(slaOutcome(ticket({ firstResponseDueAt: hours(2) }), "first_response", nowMs)).toBe(
      "running",
    );
    expect(slaOutcome(ticket({ firstResponseDueAt: hours(-1) }), "first_response", nowMs)).toBe(
      "breached",
    );
    expect(
      slaOutcome(
        ticket({ firstResponseDueAt: hours(-1), pausedAt: hours(-3) }),
        "first_response",
        nowMs,
      ),
    ).toBe("running");
    expect(
      slaOutcome(
        ticket({ firstResponseDueAt: hours(-1), pausedAt: hours(-3), breachedFirstResponse: true }),
        "first_response",
        nowMs,
      ),
    ).toBe("breached");
    expect(
      slaOutcome(
        ticket({ resolutionDueAt: hours(-1), resolvedAt: hours(-3) }),
        "resolution",
        nowMs,
      ),
    ).toBe("met");
    expect(
      slaOutcome(
        ticket({ resolutionDueAt: hours(1), resolvedAt: hours(-3), breachedResolution: true }),
        "resolution",
        nowMs,
      ),
    ).toBe("breached");
  });
});

describe("volumeView", () => {
  it("gap-fills buckets, ignores rows outside the range and unknown channels, and sums the channel mix", () => {
    const view = volumeView(
      snapshot({
        created: [
          { bucket: "2026-09-08", channel: "email", count: 2 },
          { bucket: "2026-09-08", channel: "form", count: 1 },
          { bucket: "2026-09-03", channel: "dashboard", count: 4 },
          { bucket: "2026-08-01", channel: "email", count: 9 },
          { bucket: "2026-09-03", channel: "carrier-pigeon" as never, count: 9 },
        ],
        solved: [
          { bucket: "2026-09-05", count: 3 },
          { bucket: "2026-01-01", count: 7 },
        ],
      }),
    );
    expect(view.buckets).toHaveLength(7);
    expect(view.buckets.map((b) => b.total)).toEqual([0, 4, 0, 0, 0, 0, 3]);
    expect(view.buckets[1]).toMatchObject({
      key: "2026-09-03",
      byChannel: { email: 0, form: 0, dashboard: 4, api: 0, agent: 0 },
      solved: 0,
    });
    expect(view.buckets[3]).toMatchObject({ key: "2026-09-05", solved: 3 });
    expect(view.buckets[6]).toMatchObject({
      key: "2026-09-08",
      byChannel: { email: 2, form: 1, dashboard: 0, api: 0, agent: 0 },
      partial: true,
    });
    expect(view.total).toBe(7);
    expect(view.solved).toBe(3);
    expect(view.perDay).toBe(1);
    expect(view.byChannel.map((c) => [c.channel, c.count, c.share])).toEqual([
      ["email", 2, 2 / 7],
      ["form", 1, 1 / 7],
      ["dashboard", 4, 4 / 7],
      ["api", 0, 0],
      ["agent", 0, 0],
    ]);
    expect(view.any).toBe(true);
    expect(volumeView(snapshot()).any).toBe(false);
    expect(volumeView(snapshot()).byChannel[0]?.share).toBeNull();
  });
});

describe("backlogView", () => {
  it("zero-fills every status in order and sums the open backlog", () => {
    const view = backlogView(
      snapshot({
        backlog: [
          { status: "open", count: 3 },
          { status: "pending", count: 2 },
          { status: "solved", count: 4 },
          { status: "spam", count: 1 },
        ],
        unassignedOpen: 2,
        oldestOpenCreatedAt: days(-10),
      }),
    );
    expect(view.rows.map((r) => r.status)).toEqual([...SUPPORT_TICKET_STATUSES]);
    expect(view.rows.map((r) => r.count)).toEqual([0, 3, 2, 0, 4, 0, 1]);
    expect(view.total).toBe(10);
    expect(view.open).toBe(5);
    expect(view.unassignedOpen).toBe(2);
    expect(view.rows[1]?.share).toBe(0.3);
    expect(view.oldestOpenAgeMs).toBe(10 * 86_400_000);
    expect(view.oldestOpenAt).toBe(days(-10).toISOString());
    expect(backlogView(snapshot())).toMatchObject({
      total: 0,
      open: 0,
      oldestOpenAt: null,
      oldestOpenAgeMs: null,
    });
    expect(backlogView(snapshot()).rows[0]?.share).toBeNull();
  });
});

describe("timesView", () => {
  it("measures wall-clock durations from creation and counts the pending tickets", () => {
    const created = days(-3);
    const cohort = [
      ticket({
        createdAt: created,
        firstRespondedAt: hours(1, created),
        resolvedAt: hours(10, created),
      }),
      ticket({ createdAt: created, firstRespondedAt: hours(3, created) }),
      ticket({ createdAt: created }),
      // clamped: a response instant before creation never yields a negative duration
      ticket({ createdAt: created, firstRespondedAt: hours(-1, created) }),
    ];
    const view = timesView(cohort);
    expect(view.firstResponse).toMatchObject({
      measured: 3,
      pending: 1,
      medianMs: 3_600_000,
      p90Withheld: true,
      p90Ms: null,
    });
    expect(view.resolution).toMatchObject({ measured: 1, pending: 3, medianMs: 36_000_000 });
  });
});

describe("slaView", () => {
  it("counts outcomes per clock overall and by priority", () => {
    const cohort = [
      ticket({
        priority: "urgent",
        firstResponseDueAt: hours(-5),
        firstRespondedAt: hours(-6),
        resolutionDueAt: hours(5),
      }),
      ticket({
        priority: "urgent",
        firstResponseDueAt: hours(-5),
        firstRespondedAt: hours(-4),
        resolutionDueAt: hours(-1),
      }),
      ticket({ priority: "normal", firstResponseDueAt: hours(3), resolutionDueAt: hours(30) }),
      ticket({ priority: "normal" }),
    ];
    const view = slaView(cohort, now);
    expect(view.firstResponse).toEqual({ met: 1, breached: 1, running: 1, noPolicy: 1, rate: 0.5 });
    expect(view.resolution).toEqual({ met: 0, breached: 1, running: 2, noPolicy: 1, rate: 0 });
    expect(view.withPolicy).toBe(3);
    const urgent = view.byPriority.find((p) => p.priority === "urgent")!;
    expect(urgent.tickets).toBe(2);
    expect(urgent.firstResponse).toMatchObject({ met: 1, breached: 1, rate: 0.5 });
    const low = view.byPriority.find((p) => p.priority === "low")!;
    expect(low).toMatchObject({
      tickets: 0,
      firstResponse: { met: 0, breached: 0, running: 0, noPolicy: 0, rate: null },
    });
    expect(view.byPriority.map((p) => p.priority)).toEqual([...SUPPORT_TICKET_PRIORITIES]);
  });
});

describe("agentsView", () => {
  it("builds one row per operator, attributes first responses to their author and folds former operators", () => {
    const created = days(-2);
    const view = agentsView(
      snapshot({
        agents: [
          { id: "u-bea", name: "Bea" },
          { id: "u-al", name: "Al" },
        ],
        agentOpen: [{ userId: "u-al", count: 3 }],
        agentReplies: [
          { userId: "u-al", count: 5 },
          { userId: "u-gone", count: 2 },
        ],
        agentSolved: [{ userId: "u-bea", count: 4 }],
        firstResponders: [
          {
            ticketId: "t1",
            authorUserId: "u-al",
            ticketCreatedAt: created,
            respondedAt: hours(1, created),
          },
          {
            ticketId: "t2",
            authorUserId: "u-al",
            ticketCreatedAt: created,
            respondedAt: hours(3, created),
          },
          {
            ticketId: "t3",
            authorUserId: "u-gone",
            ticketCreatedAt: created,
            respondedAt: hours(6, created),
          },
          {
            ticketId: "t4",
            authorUserId: null,
            ticketCreatedAt: created,
            respondedAt: hours(6, created),
          },
        ],
        unassignedOpen: 7,
      }),
    );
    expect(view.rows.map((r) => r.id)).toEqual(["u-al", "u-bea", FORMER_AGENTS_ID]);
    expect(view.rows[0]).toEqual({
      id: "u-al",
      name: "Al",
      open: 3,
      replies: 5,
      firstResponses: 2,
      medianFirstResponseMs: 7_200_000,
      solved: 0,
    });
    expect(view.rows[1]).toEqual({
      id: "u-bea",
      name: "Bea",
      open: 0,
      replies: 0,
      firstResponses: 0,
      medianFirstResponseMs: null,
      solved: 4,
    });
    expect(view.rows[2]).toEqual({
      id: FORMER_AGENTS_ID,
      name: null,
      open: 0,
      replies: 2,
      firstResponses: 1,
      medianFirstResponseMs: 21_600_000,
      solved: 0,
    });
    expect(view.unassignedOpen).toBe(7);
    expect(view.any).toBe(true);
    expect(agentsView(snapshot({ agents: [{ id: "u", name: "U" }] })).any).toBe(false);
  });
});

describe("csatView", () => {
  it("averages stored scores, distributes 1–5 and rates answers against solved tickets", () => {
    const cohort = [
      ticket({ status: "solved", satisfactionScore: 5 }),
      ticket({ status: "closed", satisfactionScore: 4 }),
      ticket({ status: "solved", satisfactionScore: 5 }),
      ticket({ status: "solved" }),
      ticket({ status: "open" }),
      ticket({ status: "solved", satisfactionScore: 9 }),
    ];
    const view = csatView(cohort, false);
    expect(view).toMatchObject({
      enabled: false,
      responses: 3,
      solvedTickets: 5,
      responseRate: 0.6,
    });
    expect(view.average).toBeCloseTo(14 / 3, 10);
    expect(view.distribution.map((d) => [d.score, d.count])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 1],
      [5, 2],
    ]);
    expect(view.distribution[4]?.share).toBeCloseTo(2 / 3, 10);
    expect(csatView([], true)).toMatchObject({ responses: 0, average: null, responseRate: null });
    expect(satisfactionScoreOf({ score: 3, answered_at: "" })).toBe(3);
    expect(satisfactionScoreOf({ score: 2.5 as never, answered_at: "" })).toBeNull();
    expect(satisfactionScoreOf(null)).toBeNull();
  });
});

describe("categoriesView / tagsView", () => {
  it("ranks by count then name, counts the uncategorised and caps the list", () => {
    const cohort = [
      ticket({ category: "billing", tags: ["vat", "invoice"] }),
      ticket({ category: "billing ", tags: ["vat", "vat "] }),
      ticket({ category: "access", tags: [] }),
      ticket({ category: "", tags: ["", "invoice"] }),
      ticket({ category: null }),
    ];
    const categories = categoriesView(cohort);
    expect(categories.rows.map((r) => [r.key, r.count])).toEqual([
      ["billing", 2],
      ["access", 1],
    ]);
    expect(categories).toMatchObject({ none: 2, more: 0, total: 5 });
    expect(categories.rows[0]?.share).toBe(0.4);
    const tags = tagsView(cohort);
    expect(tags.rows.map((r) => [r.key, r.count])).toEqual([
      ["invoice", 2],
      ["vat", 2],
    ]);
    expect(tags).toMatchObject({ none: 2, more: 0, total: 5 });

    const many = Array.from({ length: REPORT_TOP_LIMIT + 3 }, (_, i) =>
      ticket({ category: `c${String(i).padStart(2, "0")}` }),
    );
    const capped = categoriesView(many);
    expect(capped.rows).toHaveLength(REPORT_TOP_LIMIT);
    expect(capped.more).toBe(3);
  });
});

describe("organisationsView", () => {
  it("adds the share of all cohort tickets", () => {
    const view = organisationsView(
      snapshot({
        organisations: [
          { organizationId: "o1", name: "Acme", slug: "acme", tickets: 6, open: 2, resolved: 3 },
          { organizationId: null, name: null, slug: null, tickets: 2, open: 2, resolved: 0 },
        ],
        organisationsDistinct: 1,
        withoutOrganisation: 2,
        cohortTotal: 8,
      }),
    );
    expect(view.rows.map((r) => r.share)).toEqual([0.75, 0.25]);
    expect(view).toMatchObject({ distinct: 1, withoutOrganisation: 2, total: 8 });
  });
});

describe("supportReportView", () => {
  it("flags small samples and truncated cohorts", () => {
    const small = supportReportView(snapshot({ cohort: [ticket()], cohortTotal: 1 }));
    expect(small.cohort).toEqual({ tickets: 1, loaded: 1, truncated: false, smallSample: true });
    expect(small.generatedAt).toBe(now.toISOString());
    const big = supportReportView(
      snapshot({ cohort: [ticket()], cohortTotal: REPORT_MAX_TICKETS + 1 }),
    );
    expect(big.cohort).toMatchObject({ truncated: true, smallSample: false });
    expect(SMALL_SAMPLE_TICKETS).toBeGreaterThan(1);
  });
});

describe("CSV export", () => {
  it("quotes and neutralises cells", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(true)).toBe("true");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-1")).toBe("'-1");
  });

  it("writes every section with counts, minutes and rates only", () => {
    const created = days(-3);
    const view = supportReportView(
      snapshot({
        created: [{ bucket: "2026-09-08", channel: "email", count: 2 }],
        solved: [{ bucket: "2026-09-08", count: 1 }],
        backlog: [{ status: "open", count: 2 }],
        cohort: [
          ticket({
            createdAt: created,
            firstResponseDueAt: hours(4, created),
            firstRespondedAt: hours(1.5, created),
            resolvedAt: hours(10, created),
            status: "solved",
            satisfactionScore: 4,
            category: "billing",
            tags: ["vat"],
            organizationId: "o1",
          }),
          ticket({
            createdAt: created,
            firstResponseDueAt: hours(1, created),
            firstRespondedAt: hours(2, created),
            organizationId: "o1",
          }),
        ],
        cohortTotal: 2,
        agents: [{ id: "u1", name: 'Al, "the" agent' }],
        agentReplies: [{ userId: "u1", count: 3 }],
        firstResponders: [
          {
            ticketId: "t",
            authorUserId: "u1",
            ticketCreatedAt: created,
            respondedAt: hours(1.5, created),
          },
        ],
        organisations: [
          { organizationId: "o1", name: "Acme", slug: "acme", tickets: 2, open: 1, resolved: 1 },
        ],
        organisationsDistinct: 1,
      }),
    );
    const summary = supportReportCsv(view, "summary");
    expect(
      summary.body.startsWith("metric,value\r\nrange_from,2026-09-02\r\nrange_to,2026-09-08\r\n"),
    ).toBe(true);
    expect(summary.rows).toBe(summaryRows(view).length);
    expect(summary.body).toContain("first_response_median_minutes,105\r\n");
    expect(summary.body).toContain("sla_first_response_rate,0.5\r\n");
    expect(summary.body).toContain("csat_average,4\r\n");

    const volume = supportReportCsv(view, "volume");
    expect(volume.body.split("\r\n")[0]).toBe(
      "bucket,partial,email,form,dashboard,api,agent,total,solved",
    );
    expect(volume.rows).toBe(7);
    expect(volume.body).toContain("2026-09-08,true,2,0,0,0,0,2,1\r\n");

    expect(supportReportCsv(view, "backlog").body).toContain("open,2,1\r\n");
    expect(supportReportCsv(view, "times").body).toContain("first_response,2,0,105,,true\r\n");
    const sla = supportReportCsv(view, "sla");
    expect(sla.body).toContain("all,first_response,1,1,0,0,0.5\r\n");
    expect(sla.rows).toBe(2 + 2 * SUPPORT_TICKET_PRIORITIES.length);
    expect(supportReportCsv(view, "agents").body).toContain(
      'u1,"Al, ""the"" agent",0,3,1,90,0\r\n',
    );
    expect(supportReportCsv(view, "csat").body).toContain("4,1,1\r\n");
    expect(supportReportCsv(view, "categories").body).toContain("billing,1,0.5\r\n");
    expect(supportReportCsv(view, "tags").body).toContain("vat,1,0.5\r\n");
    expect(supportReportCsv(view, "organisations").body).toContain("o1,acme,Acme,2,1,1,1\r\n");
    // never a subject, a message or an address
    for (const kind of [
      "summary",
      "volume",
      "backlog",
      "times",
      "sla",
      "agents",
      "csat",
      "categories",
      "tags",
      "organisations",
    ] as const) {
      expect(supportReportCsv(view, kind).body).not.toMatch(/@|subject|body/i);
    }
  });
});
