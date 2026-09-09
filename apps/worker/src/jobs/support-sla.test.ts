import { describe, expect, it } from "vitest";
import type { SupportBusinessHours } from "@track-site/db";
import {
  autoCloseDue,
  businessMinutesBetween,
  effectiveBusinessHours,
  escalationSettings,
  evaluateClocks,
  normalizeBusinessHours,
  opsTicketUrl,
  renderSlaMail,
  warnedClocks,
  warningRef,
  type ClockPolicy,
  type ClockTicket,
  type WarningEventRef,
} from "./support-sla.ts";

/** Same fixtures as apps/web/src/server/support/sla.test.ts so the mirrored arithmetic stays in step. */
const BH: SupportBusinessHours = { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } };
const at = (iso: string) => new Date(iso);
const MON_10 = at("2026-09-07T08:00:00.000Z");
const FRI_17 = at("2026-09-11T15:00:00.000Z");
const NEXT_MON_10 = at("2026-09-14T08:00:00.000Z");

const POLICY: ClockPolicy = {
  priorities: {
    urgent: { first_response_minutes: 60, resolution_minutes: 480 },
    normal: { first_response_minutes: 480, resolution_minutes: 4320 },
  },
  businessHours: BH,
  escalation: { warning_percent: 80 },
};

function ticket(overrides: Partial<ClockTicket> = {}): ClockTicket {
  return {
    priority: "urgent",
    firstResponseDueAt: at("2026-09-07T09:00:00.000Z"),
    resolutionDueAt: at("2026-09-07T16:00:00.000Z"),
    firstRespondedAt: null,
    resolvedAt: null,
    breachedFirstResponse: false,
    breachedResolution: false,
    pausedAt: null,
    reopenCount: 0,
    slaClockStartedAt: null,
    ...overrides,
  };
}

const none = new Set<never>();

describe("warnedClocks", () => {
  /** a ticket the migration could not give a clock start to: scoped by the reopen generation */
  const run0 = { priority: "urgent" as const, reopenCount: 0, slaClockStartedAt: null };
  const ref = (over: Partial<WarningEventRef> = {}): WarningEventRef => ({ clock: "first_response", targetMinutes: 60, reopenCount: 0, clockStartedAt: null, createdAt: null, ...over });

  it("scopes a warning to the persisted clock start: a reopening starts a new run, a pause does not", () => {
    const started = { priority: "urgent" as const, reopenCount: 0, slaClockStartedAt: MON_10 };
    const thisRun = ref({ clockStartedAt: MON_10.toISOString(), createdAt: at("2026-09-07T08:50:00.000Z") });
    expect(warnedClocks([thisRun], started, POLICY)).toEqual(new Set(["first_response"]));
    // reopened Friday 17:00: the Monday warning belongs to the old run → warn again; one written for the new run counts
    const reopened = { ...started, slaClockStartedAt: FRI_17 };
    expect(warnedClocks([thisRun], reopened, POLICY).size).toBe(0);
    expect(warnedClocks([thisRun, ref({ clockStartedAt: FRI_17.toISOString(), createdAt: NEXT_MON_10 })], reopened, POLICY)).toEqual(new Set(["first_response"]));
    // the reopen generation no longer matters once a start is persisted (both stamp the same run)
    expect(warnedClocks([ref({ clockStartedAt: FRI_17.toISOString(), reopenCount: 7 })], { ...reopened, reopenCount: 1 }, POLICY).has("first_response")).toBe(true);
    // a legacy warning without the field: judged by when it was written — at or after the start counts, before it does not
    expect(warnedClocks([ref({ createdAt: at("2026-09-07T08:50:00.000Z") })], started, POLICY).has("first_response")).toBe(true);
    expect(warnedClocks([ref({ createdAt: at("2026-09-07T08:50:00.000Z") })], reopened, POLICY).size).toBe(0);
    expect(warnedClocks([ref({ createdAt: MON_10 })], started, POLICY).has("first_response")).toBe(true);
    expect(warnedClocks([ref()], started, POLICY).size).toBe(0); // no time at all → not this run (fail closed: warn again)
    // a changed target (priority change) starts a new run within the same start
    expect(warnedClocks([thisRun], { ...started, priority: "normal" }, POLICY).size).toBe(0);
    expect(warnedClocks([ref({ clockStartedAt: MON_10.toISOString(), targetMinutes: 480 })], { ...started, priority: "normal" }, POLICY).has("first_response")).toBe(true);
  });

  it("counts a warning for its own run only: same reopen generation, same target (rows without a persisted start)", () => {
    expect(warnedClocks([ref()], run0, POLICY)).toEqual(new Set(["first_response"]));
    // a pause moves the due date but keeps the run → still warned (no second mail after a resume)
    expect(warnedClocks([ref()], { ...run0 }, POLICY).has("first_response")).toBe(true);
    // a reopen starts a new run → warn again; a warning of the new run counts
    expect(warnedClocks([ref()], { ...run0, reopenCount: 1 }, POLICY).size).toBe(0);
    expect(warnedClocks([ref(), ref({ reopenCount: 1 })], { ...run0, reopenCount: 1 }, POLICY)).toEqual(new Set(["first_response"]));
    // a changed target (priority change) starts a new run
    expect(warnedClocks([ref()], { ...run0, priority: "normal" }, POLICY).size).toBe(0);
    expect(warnedClocks([ref({ targetMinutes: 480 })], { ...run0, priority: "normal" }, POLICY).has("first_response")).toBe(true);
    // events written before `reopen_count` existed belong to generation 0
    expect(warnedClocks([ref({ reopenCount: null })], run0, POLICY).has("first_response")).toBe(true);
    expect(warnedClocks([ref({ reopenCount: null })], { ...run0, reopenCount: 2 }, POLICY).size).toBe(0);
    // unknown clocks are ignored, each clock is scoped on its own
    expect(warnedClocks([ref({ clock: "x" }), ref({ clock: null }), ref({ clock: "resolution", targetMinutes: 480 })], run0, POLICY)).toEqual(new Set(["resolution"]));
    expect(warnedClocks([], run0, POLICY).size).toBe(0);
  });

  it("reads a stored payload without trusting its shape", () => {
    expect(warningRef({ clock: "resolution", target_minutes: 480, reopen_count: 2, clock_started_at: "2026-09-07T08:00:00.000Z" }, MON_10)).toEqual({ clock: "resolution", targetMinutes: 480, reopenCount: 2, clockStartedAt: "2026-09-07T08:00:00.000Z", createdAt: MON_10 });
    expect(warningRef({ clock: 5, target_minutes: "480", reopen_count: Number.NaN, clock_started_at: "yesterday" })).toEqual({ clock: null, targetMinutes: null, reopenCount: null, clockStartedAt: null, createdAt: null });
    expect(warningRef(null)).toEqual({ clock: null, targetMinutes: null, reopenCount: null, clockStartedAt: null, createdAt: null });
  });

  it("feeds evaluateClocks: a reopened ticket is warned again, a resumed one is not", () => {
    const inside = at("2026-09-07T08:50:00.000Z");
    const earlier = [ref()];
    expect(evaluateClocks(ticket(), POLICY, warnedClocks(earlier, ticket(), POLICY), inside)).toEqual([]);
    const reopened = ticket({ reopenCount: 1 });
    expect(evaluateClocks(reopened, POLICY, warnedClocks(earlier, reopened, POLICY), inside)).toHaveLength(1);
    // with a persisted start: the warning of the run before the reopening never silences the new run
    const started = ticket({ slaClockStartedAt: MON_10 });
    const warnedThisRun = [ref({ clockStartedAt: MON_10.toISOString(), createdAt: at("2026-09-07T08:40:00.000Z") })];
    expect(evaluateClocks(started, POLICY, warnedClocks(warnedThisRun, started, POLICY), inside)).toEqual([]);
    const restarted = ticket({ slaClockStartedAt: FRI_17, firstResponseDueAt: at("2026-09-14T09:00:00.000Z"), resolutionDueAt: at("2026-09-14T16:00:00.000Z") });
    expect(evaluateClocks(restarted, POLICY, warnedClocks(warnedThisRun, restarted, POLICY), at("2026-09-14T08:50:00.000Z"))).toHaveLength(1);
  });
});

describe("effectiveBusinessHours (mirror of the web engine)", () => {
  it("falls back to the desk's hours for a policy without windows, else runs around the clock", () => {
    const desk: SupportBusinessHours = { timezone: "Europe/Dublin", days: { mon: [[480, 960]] } };
    const open: SupportBusinessHours = { timezone: "Europe/Berlin", days: {} };
    expect(effectiveBusinessHours(BH, desk)).toBe(BH);
    expect(effectiveBusinessHours(open, desk)).toBe(desk);
    expect(effectiveBusinessHours(open, null)).toBe(open);
    expect(effectiveBusinessHours(open, { timezone: "UTC", days: {} })).toBe(open);
    expect(effectiveBusinessHours(null, null)).toEqual({ timezone: "Europe/Berlin", days: {} });
    // the clocks then count the desk's minutes: Monday 10:00 CEST = 09:00 Dublin (IST), seven hours left of the 08:00–16:00 window
    expect(businessMinutesBetween(MON_10, at("2026-09-07T20:00:00.000Z"), effectiveBusinessHours(open, desk))).toBe(420);
    expect(businessMinutesBetween(MON_10, at("2026-09-07T20:00:00.000Z"), effectiveBusinessHours(open, null))).toBe(720);
  });
});

describe("business minutes (mirror of the web engine)", () => {
  it("matches the web fixtures", () => {
    expect(businessMinutesBetween(FRI_17, NEXT_MON_10, BH)).toBe(120);
    expect(businessMinutesBetween(at("2026-09-07T07:00:00.000Z"), at("2026-09-14T07:00:00.000Z"), BH)).toBe(2700);
    expect(businessMinutesBetween(at("2026-09-07T07:30:00.000Z"), MON_10, BH)).toBe(30);
    expect(businessMinutesBetween(at("2026-09-12T10:00:00.000Z"), at("2026-09-13T10:00:00.000Z"), BH)).toBe(0);
    expect(businessMinutesBetween(NEXT_MON_10, FRI_17, BH)).toBe(0);
    expect(businessMinutesBetween(at("2026-10-23T15:00:00.000Z"), at("2026-10-26T09:00:00.000Z"), BH)).toBe(120); // across the DST end
    const lunch: SupportBusinessHours = { timezone: "Europe/Berlin", days: { mon: [[780, 1080], [540, 720]] } };
    expect(businessMinutesBetween(at("2026-09-07T09:30:00.000Z"), at("2026-09-07T11:30:00.000Z"), lunch)).toBe(60);
    expect(businessMinutesBetween(FRI_17, NEXT_MON_10, { timezone: "Europe/Berlin", days: {} })).toBe(65 * 60);
  });

  it("normalises like the web engine", () => {
    const n = normalizeBusinessHours({ timezone: "Mars/Olympus", days: { mon: [[600, 720], [540, 660], [1000, 900]] } });
    expect(n.timezone).toBe("Europe/Berlin");
    expect(n.days.mon).toEqual([{ start: 540, end: 720 }]);
    expect(n.alwaysOpen).toBe(false);
    expect(normalizeBusinessHours(null).alwaysOpen).toBe(true);
  });
});

describe("escalationSettings", () => {
  it("applies the defaults and drops invalid values", () => {
    expect(escalationSettings(null)).toEqual({ warningPercent: 80, notifyUserIds: [], escalateToAdmins: true, autoCloseDays: 7 });
    expect(escalationSettings({ warning_percent: 120, notify_user_ids: ["x", "5c9f7a2e-1234-4abc-8def-000000000001"], escalate_to_admins: false, auto_close_days: null } as never)).toEqual({
      warningPercent: 80,
      notifyUserIds: ["5c9f7a2e-1234-4abc-8def-000000000001"],
      escalateToAdmins: false,
      autoCloseDays: null,
    });
    expect(escalationSettings({ warning_percent: 50, auto_close_days: 3 } as never)).toMatchObject({ warningPercent: 50, autoCloseDays: 3 });
  });
});

describe("evaluateClocks", () => {
  it("stays quiet before the warning share and warns once inside it", () => {
    expect(evaluateClocks(ticket(), POLICY, none, at("2026-09-07T08:40:00.000Z"))).toEqual([]);
    const [warning] = evaluateClocks(ticket(), POLICY, none, at("2026-09-07T08:50:00.000Z"));
    expect(warning).toMatchObject({ clock: "first_response", kind: "warning", targetMinutes: 60, remainingMinutes: 10, warningPercent: 80, dueAt: at("2026-09-07T09:00:00.000Z") });
    expect(evaluateClocks(ticket(), POLICY, none, at("2026-09-07T08:50:00.000Z"))).toHaveLength(1);
    // already warned → nothing
    expect(evaluateClocks(ticket(), POLICY, new Set(["first_response"]), at("2026-09-07T08:50:00.000Z"))).toEqual([]);
  });

  it("counts remaining time in business minutes, not wall-clock time", () => {
    // resolution due Tuesday 09:30: at Monday 17:00 only 90 business minutes remain (16.5 h on the wall clock)
    const t = ticket({ firstRespondedAt: MON_10, resolutionDueAt: at("2026-09-08T07:30:00.000Z") });
    const findings = evaluateClocks(t, POLICY, none, at("2026-09-07T15:00:00.000Z"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ clock: "resolution", kind: "warning", remainingMinutes: 90, targetMinutes: 480 });
    expect(evaluateClocks(t, POLICY, none, at("2026-09-07T14:00:00.000Z"))).toEqual([]);
  });

  it("reports a breach past the due date and never a warning next to it", () => {
    const findings = evaluateClocks(ticket(), POLICY, none, at("2026-09-07T09:30:00.000Z"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ clock: "first_response", kind: "breach", remainingMinutes: -30 });
    expect(evaluateClocks(ticket(), POLICY, none, at("2026-09-07T09:00:00.000Z"))[0]).toMatchObject({ kind: "breach", remainingMinutes: 0 });
    // both clocks overdue → two breaches
    expect(evaluateClocks(ticket(), POLICY, none, at("2026-09-08T10:00:00.000Z")).map((f) => [f.clock, f.kind])).toEqual([
      ["first_response", "breach"],
      ["resolution", "breach"],
    ]);
  });

  it("ignores paused, stopped, flagged and clock-less tickets", () => {
    const late = at("2026-09-07T09:30:00.000Z");
    expect(evaluateClocks(ticket({ pausedAt: at("2026-09-07T08:30:00.000Z") }), POLICY, none, late)).toEqual([]);
    expect(evaluateClocks(ticket({ firstRespondedAt: at("2026-09-07T08:30:00.000Z") }), POLICY, none, late).map((f) => f.clock)).toEqual([]);
    expect(evaluateClocks(ticket({ breachedFirstResponse: true }), POLICY, none, late)).toEqual([]);
    expect(evaluateClocks(ticket({ firstResponseDueAt: null, resolutionDueAt: null }), POLICY, none, late)).toEqual([]);
    // a priority the policy does not know: breaches still count, warnings need a target
    const unknown = ticket({ priority: "low" });
    expect(evaluateClocks(unknown, POLICY, none, at("2026-09-07T08:55:00.000Z"))).toEqual([]);
    expect(evaluateClocks(unknown, POLICY, none, late)[0]).toMatchObject({ kind: "breach", targetMinutes: null });
  });

  it("honours the policy's warning percent", () => {
    const strict: ClockPolicy = { ...POLICY, escalation: { warning_percent: 50 } };
    expect(evaluateClocks(ticket(), strict, none, at("2026-09-07T08:25:00.000Z"))).toEqual([]);
    expect(evaluateClocks(ticket(), strict, none, at("2026-09-07T08:30:00.000Z"))[0]).toMatchObject({ kind: "warning", warningPercent: 50, remainingMinutes: 30 });
  });
});

describe("autoCloseDue", () => {
  it("closes after the configured full days and never without a window", () => {
    const resolved = at("2026-09-01T12:00:00.000Z");
    expect(autoCloseDue(resolved, 7, at("2026-09-08T11:59:00.000Z"))).toBe(false);
    expect(autoCloseDue(resolved, 7, at("2026-09-08T12:00:00.000Z"))).toBe(true);
    expect(autoCloseDue(resolved, null, at("2027-01-01T00:00:00.000Z"))).toBe(false);
    expect(autoCloseDue(null, 7, at("2027-01-01T00:00:00.000Z"))).toBe(false);
    expect(autoCloseDue(resolved, 0, at("2027-01-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("renderSlaMail", () => {
  const input = {
    kind: "warning" as const,
    clock: "first_response" as const,
    ticketNumber: 1042,
    subject: "Pixel {url} fires twice\r\nsecond line",
    priority: "urgent" as const,
    dueAt: at("2026-09-07T09:00:00.000Z"),
    remainingMinutes: 10.4,
    timezone: "Europe/Berlin",
    assigneeName: "Ada",
    url: "http://localhost:3000/ops/support/t1",
  };

  it("renders the six locales with the ticket facts and the link", () => {
    const en = renderSlaMail("en", input);
    expect(en.subject).toBe("[Track support] SLA warning: ticket #1042 — first response");
    expect(en.text).toContain("10 business minutes left");
    expect(en.text).toContain("Subject: Pixel {url} fires twice second line");
    expect(en.text).toContain("Due: 7 Sept 2026, 11:00 (Europe/Berlin)");
    expect(en.text).toContain("Assignee: Ada");
    expect(en.text).toContain("Open the ticket: http://localhost:3000/ops/support/t1");
    expect(en.text).not.toContain("{number}");
    const de = renderSlaMail("de", { ...input, kind: "breach", remainingMinutes: -35, assigneeName: null });
    expect(de.subject).toBe("[Track-Support] SLA verletzt: Ticket #1042 — erste Antwort");
    expect(de.text).toContain("Überfällig seit: 35 Geschäftsminuten");
    expect(de.text).toContain("Zuständig: noch niemand");
    for (const locale of ["fr", "es", "it", "nl"]) {
      const mail = renderSlaMail(locale, input);
      expect(mail.subject).toContain("1042");
      expect(mail.text).toContain(input.url);
      expect(mail.text).not.toMatch(/\{(number|clock|remaining|count)\}/);
    }
    expect(renderSlaMail("xx", input).subject).toBe(en.subject);
  });

  it("falls back to ISO time for an unknown zone", () => {
    expect(renderSlaMail("en", { ...input, timezone: "Nowhere/Land" }).text).toContain("Due: 2026-09-07T09:00:00.000Z");
  });
});

describe("opsTicketUrl", () => {
  it("puts the console on the app's origin", () => {
    expect(opsTicketUrl("http://localhost:3000/app", "t 1")).toBe("http://localhost:3000/ops/support/t%201");
    expect(opsTicketUrl("https://www.track.site/app/", "abc")).toBe("https://www.track.site/ops/support/abc");
    expect(opsTicketUrl("not a url/", "abc")).toBe("not a url/ops/support/abc");
  });
});
