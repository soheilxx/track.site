import { describe, expect, it } from "vitest";
import type { SupportBusinessHours } from "@track-site/db";
import {
  addBusinessMinutes,
  applyPolicyOnCreate,
  applyPolicyOnPriorityChange,
  businessMinutesBetween,
  computeClockStart,
  computeDueDates,
  effectiveBusinessHours,
  escalationJson,
  escalationSettings,
  hasBusinessWindows,
  isBusinessTime,
  isSlaReopen,
  isValidTimeZone,
  markFirstResponse,
  minutesToTargetInput,
  minutesToTime,
  normalizeBusinessHours,
  parseSlaPolicyInput,
  pauseClock,
  resumeClock,
  selectSlaPolicy,
  slaClockState,
  statusTransition,
  subtractBusinessMinutes,
  targetMinutes,
  targetMs,
  timeToMinutes,
  transitionStatus,
  withDeskBusinessHours,
  type SlaClockStateInput,
  type SlaPolicyLike,
  type SlaPolicyRawInput,
  type SlaTicketClock,
  type SlaTransitionInput,
} from "./sla";

/**
 * Fixtures: Mon–Fri 09:00–18:00 Europe/Berlin (the seeded default) in September 2026 (CEST = UTC+2).
 * The worker's mirror test (apps/worker/src/jobs/support-sla.test.ts) uses the same instants.
 */
const BH: SupportBusinessHours = { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } };
const ALWAYS: SupportBusinessHours = { timezone: "Europe/Berlin", days: {} };
const at = (iso: string) => new Date(iso);

const POLICY: SlaPolicyLike = {
  id: "a0000000-0000-4000-8000-000000000501",
  priorities: {
    urgent: { first_response_minutes: 60, resolution_minutes: 480 },
    high: { first_response_minutes: 240, resolution_minutes: 1440 },
    normal: { first_response_minutes: 480, resolution_minutes: 4320 },
    low: { first_response_minutes: 1440, resolution_minutes: 10080 },
  },
  businessHours: BH,
  escalation: { warning_percent: 80 },
};

const MON_10 = at("2026-09-07T08:00:00.000Z"); // Monday 10:00 CEST
const FRI_17 = at("2026-09-11T15:00:00.000Z"); // Friday 17:00 CEST
const NEXT_MON_10 = at("2026-09-14T08:00:00.000Z");

function ticket(overrides: Partial<SlaTicketClock> = {}): SlaTicketClock {
  return {
    priority: "urgent",
    status: "open",
    createdAt: MON_10,
    firstResponseDueAt: at("2026-09-07T09:00:00.000Z"),
    resolutionDueAt: at("2026-09-07T16:00:00.000Z"),
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    pausedAt: null,
    pauseTotalMs: 0,
    breachedFirstResponse: false,
    breachedResolution: false,
    ...overrides,
  };
}

describe("business hours", () => {
  it("normalises windows: sorts, merges overlaps, drops invalid ones, falls back for unknown zones", () => {
    const n = normalizeBusinessHours({ timezone: "Mars/Olympus", days: { mon: [[600, 720], [540, 660], [900, 1080], [1000, 900], [-5, 2000]] } });
    expect(n.timezone).toBe("Europe/Berlin");
    expect(n.days.mon).toEqual([
      { start: 0, end: 1440 },
    ]);
    const lunch = normalizeBusinessHours({ timezone: "Europe/Berlin", days: { mon: [[780, 1080], [540, 720]] } });
    expect(lunch.days.mon).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1080 },
    ]);
    expect(lunch.alwaysOpen).toBe(false);
    expect(normalizeBusinessHours(ALWAYS).alwaysOpen).toBe(true);
    expect(normalizeBusinessHours(null).alwaysOpen).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Nowhere/Land")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("adds business minutes inside a day, across the evening and across the weekend", () => {
    expect(addBusinessMinutes(MON_10, 60, BH)).toEqual(at("2026-09-07T09:00:00.000Z"));
    expect(addBusinessMinutes(at("2026-09-07T15:30:00.000Z"), 60, BH)).toEqual(at("2026-09-08T07:30:00.000Z")); // Mon 17:30 → Tue 09:30
    expect(addBusinessMinutes(FRI_17, 120, BH)).toEqual(NEXT_MON_10); // Fri 17:00 → Mon 10:00
    expect(addBusinessMinutes(at("2026-09-12T10:00:00.000Z"), 30, BH)).toEqual(at("2026-09-14T07:30:00.000Z")); // Sat noon → Mon 09:30
    expect(addBusinessMinutes(at("2026-09-07T07:00:00.000Z"), 540, BH)).toEqual(at("2026-09-07T16:00:00.000Z")); // a full day ends at 18:00
    expect(addBusinessMinutes(MON_10, 0, BH)).toEqual(MON_10);
  });

  it("skips a lunch break with two windows per day", () => {
    const lunch: SupportBusinessHours = { timezone: "Europe/Berlin", days: { mon: [[540, 720], [780, 1080]] } };
    expect(addBusinessMinutes(at("2026-09-07T09:30:00.000Z"), 60, lunch)).toEqual(at("2026-09-07T11:30:00.000Z")); // 11:30 → 13:30
    expect(businessMinutesBetween(at("2026-09-07T09:30:00.000Z"), at("2026-09-07T11:30:00.000Z"), lunch)).toBe(60);
  });

  it("runs around the clock without windows", () => {
    expect(addBusinessMinutes(FRI_17, 60, ALWAYS)).toEqual(at("2026-09-11T16:00:00.000Z"));
    expect(subtractBusinessMinutes(FRI_17, 60, ALWAYS)).toEqual(at("2026-09-11T14:00:00.000Z"));
    expect(businessMinutesBetween(FRI_17, NEXT_MON_10, ALWAYS)).toBe(65 * 60);
    expect(isBusinessTime(at("2026-09-12T10:00:00.000Z"), ALWAYS)).toBe(true);
  });

  it("is DST-safe and honours the policy's zone", () => {
    // DST ends on Sunday 2026-10-25 in Europe/Berlin: Friday 17:00 CEST + 120 min → Monday 10:00 CET
    expect(addBusinessMinutes(at("2026-10-23T15:00:00.000Z"), 120, BH)).toEqual(at("2026-10-26T09:00:00.000Z"));
    expect(businessMinutesBetween(at("2026-10-23T15:00:00.000Z"), at("2026-10-26T09:00:00.000Z"), BH)).toBe(120);
    const ny: SupportBusinessHours = { ...BH, timezone: "America/New_York" };
    expect(addBusinessMinutes(at("2026-09-07T14:00:00.000Z"), 60, ny)).toEqual(at("2026-09-07T15:00:00.000Z")); // 10:00 EDT → 11:00 EDT
    expect(isBusinessTime(at("2026-09-07T12:00:00.000Z"), ny)).toBe(false); // 08:00 EDT
    expect(isBusinessTime(at("2026-09-07T13:00:00.000Z"), ny)).toBe(true); // 09:00 EDT
  });

  it("subtracts business minutes backwards across the weekend", () => {
    expect(subtractBusinessMinutes(NEXT_MON_10, 120, BH)).toEqual(FRI_17);
    expect(subtractBusinessMinutes(at("2026-09-07T09:00:00.000Z"), 60, BH)).toEqual(MON_10);
    expect(subtractBusinessMinutes(at("2026-09-08T07:30:00.000Z"), 60, BH)).toEqual(at("2026-09-07T15:30:00.000Z"));
    expect(subtractBusinessMinutes(MON_10, 0, BH)).toEqual(MON_10);
    // exact fits land on window ends on both sides, so add and subtract are inverses on the edges
    expect(subtractBusinessMinutes(at("2026-09-08T08:00:00.000Z"), 60, BH)).toEqual(at("2026-09-07T16:00:00.000Z")); // Tue 10:00 − 60 → Mon 18:00
    expect(addBusinessMinutes(at("2026-09-07T16:00:00.000Z"), 60, BH)).toEqual(at("2026-09-08T08:00:00.000Z"));
    expect(subtractBusinessMinutes(at("2026-09-08T16:00:00.000Z"), 540, BH)).toEqual(at("2026-09-07T16:00:00.000Z"));
  });

  it("counts business minutes between two instants", () => {
    expect(businessMinutesBetween(FRI_17, NEXT_MON_10, BH)).toBe(120);
    expect(businessMinutesBetween(at("2026-09-07T07:00:00.000Z"), at("2026-09-14T07:00:00.000Z"), BH)).toBe(2700);
    expect(businessMinutesBetween(at("2026-09-07T07:30:00.000Z"), MON_10, BH)).toBe(30);
    expect(businessMinutesBetween(at("2026-09-12T10:00:00.000Z"), at("2026-09-13T10:00:00.000Z"), BH)).toBe(0); // weekend
    expect(businessMinutesBetween(NEXT_MON_10, FRI_17, BH)).toBe(0); // reversed
    expect(businessMinutesBetween(MON_10, MON_10, BH)).toBe(0);
  });
});

describe("computeDueDates", () => {
  it("derives both clocks from the priority's targets and the business hours", () => {
    expect(computeDueDates(POLICY, "urgent", MON_10)).toEqual({ firstResponseDueAt: at("2026-09-07T09:00:00.000Z"), resolutionDueAt: at("2026-09-07T16:00:00.000Z") });
    // normal from Friday 17:00: 480 min = 60 left on Friday + 420 on Monday → Monday 16:00; 4320 min → Wednesday 23 Sept 17:00
    expect(computeDueDates(POLICY, "normal", FRI_17)).toEqual({ firstResponseDueAt: at("2026-09-14T14:00:00.000Z"), resolutionDueAt: at("2026-09-23T15:00:00.000Z") });
  });

  it("gives null for missing or zero targets — never a guess", () => {
    expect(computeDueDates({ priorities: { urgent: { first_response_minutes: 60, resolution_minutes: 0 } }, businessHours: BH }, "urgent", MON_10)).toEqual({ firstResponseDueAt: at("2026-09-07T09:00:00.000Z"), resolutionDueAt: null });
    expect(computeDueDates({ priorities: {}, businessHours: BH }, "low", MON_10)).toEqual({ firstResponseDueAt: null, resolutionDueAt: null });
    expect(targetMinutes(POLICY, "high", "resolution")).toBe(1440);
    expect(targetMinutes({ priorities: {} }, "high", "resolution")).toBeNull();
  });

  it("stops the clock inside pauses", () => {
    const pause = [{ from: at("2026-09-07T08:30:00.000Z"), to: at("2026-09-07T09:00:00.000Z") }];
    expect(computeDueDates(POLICY, "urgent", MON_10, pause)).toEqual({ firstResponseDueAt: at("2026-09-07T09:30:00.000Z"), resolutionDueAt: at("2026-09-08T07:30:00.000Z") });
    // a pause over the weekend only counts its business minutes (30 min Friday + 30 min Monday)
    const weekend = [{ from: at("2026-09-11T15:30:00.000Z"), to: at("2026-09-14T07:30:00.000Z") }];
    expect(computeDueDates(POLICY, "normal", FRI_17, weekend).firstResponseDueAt).toEqual(at("2026-09-14T15:00:00.000Z"));
    // two pauses accumulate in order
    const two = [
      { from: at("2026-09-07T08:10:00.000Z"), to: at("2026-09-07T08:20:00.000Z") },
      { from: at("2026-09-07T08:40:00.000Z"), to: at("2026-09-07T08:50:00.000Z") },
    ];
    expect(computeDueDates(POLICY, "urgent", MON_10, two).firstResponseDueAt).toEqual(at("2026-09-07T09:20:00.000Z"));
  });

  it("ignores pauses that begin after the target was reached, pauses before the start and open pauses", () => {
    const late = [{ from: at("2026-09-07T10:00:00.000Z"), to: at("2026-09-07T11:00:00.000Z") }];
    const due = computeDueDates(POLICY, "urgent", MON_10, late);
    expect(due.firstResponseDueAt).toEqual(at("2026-09-07T09:00:00.000Z"));
    expect(due.resolutionDueAt).toEqual(at("2026-09-08T08:00:00.000Z"));
    const before = [{ from: at("2026-09-07T06:00:00.000Z"), to: at("2026-09-07T07:30:00.000Z") }];
    expect(computeDueDates(POLICY, "urgent", MON_10, before).firstResponseDueAt).toEqual(at("2026-09-07T09:00:00.000Z"));
    const open = [{ from: at("2026-09-07T08:30:00.000Z"), to: null }];
    expect(computeDueDates(POLICY, "urgent", MON_10, open).firstResponseDueAt).toEqual(at("2026-09-07T09:00:00.000Z"));
  });
});

describe("ticket lifecycle", () => {
  it("applies the policy on creation and persists the clock run (start + booked targets)", () => {
    expect(applyPolicyOnCreate(POLICY, "urgent", MON_10)).toEqual({
      slaPolicyId: POLICY.id,
      firstResponseDueAt: at("2026-09-07T09:00:00.000Z"),
      resolutionDueAt: at("2026-09-07T16:00:00.000Z"),
      slaClockStartedAt: MON_10,
      firstResponseTargetMs: 60 * 60_000,
      resolutionTargetMs: 480 * 60_000,
      pausedAt: null,
      pauseTotalMs: 0,
      breachedFirstResponse: false,
      breachedResolution: false,
    });
    // what the inbound handler, the portal and the contact form write on creation
    expect(computeClockStart(POLICY, "normal", MON_10)).toEqual({ ...computeDueDates(POLICY, "normal", MON_10), slaClockStartedAt: MON_10, firstResponseTargetMs: 480 * 60_000, resolutionTargetMs: 4320 * 60_000 });
    // without a policy the start is still recorded, the rest stays null — never a guess
    expect(computeClockStart(null, "urgent", MON_10)).toEqual({ firstResponseDueAt: null, resolutionDueAt: null, slaClockStartedAt: MON_10, firstResponseTargetMs: null, resolutionTargetMs: null });
    expect(targetMs(POLICY, "urgent", "first_response")).toBe(3_600_000);
    expect(targetMs({ priorities: {} }, "urgent", "resolution")).toBeNull();
    expect(targetMs(null, "urgent", "resolution")).toBeNull();
  });

  it("pauses while pending and resumes on the customer's reply with the same result as the pause model", () => {
    const paused = { ...ticket(), ...pauseClock(ticket(), at("2026-09-07T08:30:00.000Z")) };
    expect(paused.pausedAt).toEqual(at("2026-09-07T08:30:00.000Z"));
    expect(pauseClock(paused, at("2026-09-07T08:45:00.000Z"))).toEqual({});
    const resumed = resumeClock(POLICY, paused, at("2026-09-07T09:00:00.000Z"));
    expect(resumed).toEqual({ pausedAt: null, pauseTotalMs: 30 * 60_000, firstResponseDueAt: at("2026-09-07T09:30:00.000Z"), resolutionDueAt: at("2026-09-08T07:30:00.000Z") });
    const model = computeDueDates(POLICY, "urgent", MON_10, [{ from: at("2026-09-07T08:30:00.000Z"), to: at("2026-09-07T09:00:00.000Z") }]);
    expect(resumed.firstResponseDueAt).toEqual(model.firstResponseDueAt);
    expect(resumed.resolutionDueAt).toEqual(model.resolutionDueAt);
    expect(resumeClock(POLICY, ticket(), at("2026-09-07T09:00:00.000Z"))).toEqual({});
  });

  it("keeps a clock that was already overdue when the pause began and leaves stopped clocks alone", () => {
    const overdue = ticket({ pausedAt: at("2026-09-07T09:30:00.000Z"), firstRespondedAt: null });
    const resumed = resumeClock(POLICY, overdue, at("2026-09-07T10:00:00.000Z"));
    expect(resumed.firstResponseDueAt).toEqual(at("2026-09-07T09:00:00.000Z"));
    expect(resumed.resolutionDueAt).toEqual(at("2026-09-08T07:30:00.000Z")); // Mon 18:00 + 30 min → Tue 09:30
    const answered = ticket({ pausedAt: at("2026-09-07T08:30:00.000Z"), firstRespondedAt: at("2026-09-07T08:20:00.000Z") });
    expect(resumeClock(POLICY, answered, at("2026-09-07T09:00:00.000Z"))).not.toHaveProperty("firstResponseDueAt");
  });

  it("transitions: pending pauses, leaving pending resumes, solved and closed stop the resolution clock", () => {
    const now = at("2026-09-07T08:30:00.000Z");
    expect(transitionStatus(POLICY, ticket(), "pending", now)).toEqual({ status: "pending", pausedAt: now });
    const pending = ticket({ status: "pending", pausedAt: now });
    const reopened = transitionStatus(POLICY, pending, "open", at("2026-09-07T09:00:00.000Z"));
    expect(reopened).toMatchObject({ status: "open", pausedAt: null, pauseTotalMs: 30 * 60_000, firstResponseDueAt: at("2026-09-07T09:30:00.000Z") });
    const solvedInTime = transitionStatus(POLICY, ticket(), "solved", at("2026-09-07T12:00:00.000Z"));
    expect(solvedInTime).toEqual({ status: "solved", resolvedAt: at("2026-09-07T12:00:00.000Z"), breachedResolution: false });
    const solvedLate = transitionStatus(POLICY, ticket(), "solved", at("2026-09-07T17:00:00.000Z"));
    expect(solvedLate).toMatchObject({ resolvedAt: at("2026-09-07T17:00:00.000Z"), breachedResolution: true });
    const fromPending = transitionStatus(POLICY, pending, "solved", at("2026-09-07T09:00:00.000Z"));
    expect(fromPending).toMatchObject({ status: "solved", pausedAt: null, resolvedAt: at("2026-09-07T09:00:00.000Z"), breachedResolution: false, resolutionDueAt: at("2026-09-08T07:30:00.000Z") });
    const closed = transitionStatus(POLICY, ticket({ status: "solved", resolvedAt: at("2026-09-07T12:00:00.000Z") }), "closed", at("2026-09-10T12:00:00.000Z"));
    expect(closed).toEqual({ status: "closed", closedAt: at("2026-09-10T12:00:00.000Z") });
    expect(transitionStatus(POLICY, ticket(), "open", now)).toEqual({});
    expect(transitionStatus(POLICY, ticket(), "spam", now)).toEqual({ status: "spam" });
  });

  it("reopening restarts the resolution clock (and the first-response clock when nobody answered yet)", () => {
    const solved = ticket({ status: "solved", resolvedAt: at("2026-09-07T12:00:00.000Z"), closedAt: at("2026-09-10T12:00:00.000Z"), breachedResolution: true, firstRespondedAt: at("2026-09-07T08:30:00.000Z") });
    const reopenAt = FRI_17;
    const patch = transitionStatus(POLICY, solved, "open", reopenAt);
    // the persisted run moves to the reopening and the resolution target is booked again
    expect(patch).toEqual({ status: "open", resolvedAt: null, closedAt: null, pausedAt: null, resolutionDueAt: addBusinessMinutes(reopenAt, 480, BH), resolutionTargetMs: 480 * 60_000, breachedResolution: false, slaClockStartedAt: reopenAt });
    const unanswered = transitionStatus(POLICY, { ...solved, firstRespondedAt: null, breachedFirstResponse: true }, "open", reopenAt);
    expect(unanswered).toMatchObject({ firstResponseDueAt: addBusinessMinutes(reopenAt, 60, BH), firstResponseTargetMs: 60 * 60_000, breachedFirstResponse: false, slaClockStartedAt: reopenAt });
    // an answered ticket keeps its first-response clock (and its booked target) untouched
    expect(patch).not.toHaveProperty("firstResponseTargetMs");
    // reopening straight into pending pauses the fresh clock
    expect(transitionStatus(POLICY, solved, "pending", reopenAt)).toMatchObject({ status: "pending", pausedAt: reopenAt, resolvedAt: null });
  });

  it("marks the first response and flags a late one", () => {
    expect(markFirstResponse(ticket(), at("2026-09-07T08:45:00.000Z"))).toEqual({ firstRespondedAt: at("2026-09-07T08:45:00.000Z"), breachedFirstResponse: false });
    expect(markFirstResponse(ticket(), at("2026-09-07T09:05:00.000Z"))).toEqual({ firstRespondedAt: at("2026-09-07T09:05:00.000Z"), breachedFirstResponse: true });
    expect(markFirstResponse(ticket({ firstRespondedAt: MON_10 }), at("2026-09-07T09:05:00.000Z"))).toEqual({});
    expect(markFirstResponse(ticket({ firstResponseDueAt: null }), at("2026-09-07T09:05:00.000Z"))).toEqual({ firstRespondedAt: at("2026-09-07T09:05:00.000Z"), breachedFirstResponse: false });
  });

  it("moves running clocks by the target difference on a priority change", () => {
    const normal = ticket({ priority: "normal", ...computeDueDates(POLICY, "normal", MON_10) });
    const urgent = applyPolicyOnPriorityChange(POLICY, normal, "urgent", at("2026-09-07T08:10:00.000Z"));
    expect(urgent).toEqual({ ...computeDueDates(POLICY, "urgent", MON_10), firstResponseTargetMs: 60 * 60_000, resolutionTargetMs: 480 * 60_000, breachedFirstResponse: false, breachedResolution: false });
    // the shorter target is already overdue at 12:00
    expect(applyPolicyOnPriorityChange(POLICY, normal, "urgent", at("2026-09-07T10:00:00.000Z"))).toMatchObject({ breachedFirstResponse: true, breachedResolution: false });
    // a longer target: absorbed pauses stay absorbed (the shift starts from the stored due date)
    const shifted = ticket({ firstResponseDueAt: at("2026-09-07T09:30:00.000Z") });
    expect(applyPolicyOnPriorityChange(POLICY, shifted, "high", MON_10).firstResponseDueAt).toEqual(addBusinessMinutes(at("2026-09-07T09:30:00.000Z"), 180, BH));
    // a stopped clock is not touched
    const answered = ticket({ firstRespondedAt: MON_10 });
    expect(applyPolicyOnPriorityChange(POLICY, answered, "low", MON_10)).not.toHaveProperty("firstResponseDueAt");
    // no due date so far → from the creation time
    const none = ticket({ firstResponseDueAt: null, resolutionDueAt: null });
    expect(applyPolicyOnPriorityChange(POLICY, none, "high", MON_10)).toMatchObject(computeDueDates(POLICY, "high", MON_10));
  });

  it("measures a clock without a due date from the persisted clock start, never from a creation days before the reopening", () => {
    // reopened Friday 17:00 (the run's start) on a ticket created Monday; the policy had no urgent entry → no due dates so far
    const reopened = ticket({ priority: "urgent", firstResponseDueAt: null, resolutionDueAt: null, slaClockStartedAt: FRI_17 });
    const fromStart = applyPolicyOnPriorityChange(POLICY, reopened, "high", NEXT_MON_10);
    expect(fromStart).toMatchObject(computeDueDates(POLICY, "high", FRI_17));
    expect(fromStart).not.toMatchObject(computeDueDates(POLICY, "high", MON_10));
    // a stopped clock is not re-booked; a running one carries the new target
    expect(applyPolicyOnPriorityChange(POLICY, ticket({ firstRespondedAt: MON_10, slaClockStartedAt: MON_10 }), "low", MON_10)).toEqual({ resolutionDueAt: addBusinessMinutes(at("2026-09-07T16:00:00.000Z"), 10080 - 480, BH), resolutionTargetMs: 10080 * 60_000, breachedResolution: false });
    // a missing target in the new priority clears the due date and the booked target
    const sparse: SlaPolicyLike = { ...POLICY, priorities: { urgent: POLICY.priorities.urgent } };
    expect(applyPolicyOnPriorityChange(sparse, ticket(), "low", MON_10)).toEqual({ firstResponseDueAt: null, firstResponseTargetMs: null, breachedFirstResponse: false, resolutionDueAt: null, resolutionTargetMs: null, breachedResolution: false });
  });

  it("books nothing for an agent-created ticket still waiting for the first customer reply (reopen, priority change)", () => {
    // migration 0017: both due times null, the flag set — the run starts with `applyFirstCustomerReply`, never here
    const waiting = ticket({ status: "solved", resolvedAt: MON_10, closedAt: null, firstResponseDueAt: null, resolutionDueAt: null, slaPendingFirstCustomerReply: true });
    const reopened = statusTransition(POLICY, waiting, "open", FRI_17);
    expect(reopened.reopened).toBe(true);
    expect(reopened.patch).toEqual({ status: "open", resolvedAt: null, closedAt: null, resolutionDueAt: null, resolutionTargetMs: null, breachedResolution: false, pausedAt: null, slaClockStartedAt: FRI_17, firstResponseDueAt: null, firstResponseTargetMs: null, breachedFirstResponse: false });
    const change = applyPolicyOnPriorityChange(POLICY, ticket({ firstResponseDueAt: null, resolutionDueAt: null, slaPendingFirstCustomerReply: true }), "urgent", MON_10);
    expect(change).toEqual({ firstResponseDueAt: null, firstResponseTargetMs: null, breachedFirstResponse: false, resolutionDueAt: null, resolutionTargetMs: null, breachedResolution: false });
    // without the flag the same rows book their clocks as before
    expect(applyPolicyOnPriorityChange(POLICY, ticket({ firstResponseDueAt: null, resolutionDueAt: null }), "urgent", MON_10)).toMatchObject(computeDueDates(POLICY, "urgent", MON_10));
  });

  it("describes a clock from real timestamps only", () => {
    const now = at("2026-09-07T08:40:00.000Z");
    expect(slaClockState(ticket({ firstResponseDueAt: null }), "first_response", now).status).toBe("none");
    expect(slaClockState(ticket({ firstRespondedAt: at("2026-09-07T08:30:00.000Z") }), "first_response", now)).toMatchObject({ status: "met", stoppedAt: at("2026-09-07T08:30:00.000Z"), remainingMs: null });
    expect(slaClockState(ticket({ firstRespondedAt: at("2026-09-07T09:30:00.000Z") }), "first_response", at("2026-09-07T10:00:00.000Z")).status).toBe("breached");
    expect(slaClockState(ticket({ pausedAt: now }), "first_response", now).status).toBe("paused");
    expect(slaClockState(ticket(), "first_response", at("2026-09-07T09:01:00.000Z"))).toMatchObject({ status: "breached", remainingMs: -60_000 });
    expect(slaClockState(ticket({ breachedFirstResponse: true }), "first_response", now).status).toBe("breached");
    expect(slaClockState(ticket(), "first_response", now, POLICY)).toMatchObject({ status: "running", remainingMs: 20 * 60_000 });
    expect(slaClockState(ticket(), "first_response", at("2026-09-07T08:50:00.000Z"), POLICY).status).toBe("due_soon");
    expect(slaClockState(ticket(), "first_response", at("2026-09-07T08:50:00.000Z")).status).toBe("running");
    expect(slaClockState(ticket(), "resolution", now, POLICY).status).toBe("running");
  });
});

describe("integration with the ticket slices", () => {
  const HOURS_65 = 65 * 3_600_000;
  /** The pick `statusPatch` in ticket.ts receives: no `createdAt`, no breach flags, a nullable policy. */
  const row = (over: Partial<SlaTransitionInput> = {}): SlaTransitionInput => {
    const t = ticket();
    return { status: t.status, priority: t.priority, pausedAt: t.pausedAt, pauseTotalMs: t.pauseTotalMs, firstResponseDueAt: t.firstResponseDueAt, resolutionDueAt: t.resolutionDueAt, firstRespondedAt: t.firstRespondedAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt, ...over };
  };

  it("resumes by business minutes: pending Friday 17:00, answered Monday 10:00 = two business hours, not 65", () => {
    // due Friday 17:30 (first response) and Monday 15:00 (resolution)
    const pending = row({ status: "pending", pausedAt: FRI_17, firstResponseDueAt: at("2026-09-11T15:30:00.000Z"), resolutionDueAt: at("2026-09-14T13:00:00.000Z") });
    const t = statusTransition(POLICY, pending, "open", NEXT_MON_10);
    expect(t.reopened).toBe(false);
    expect(t.pauseEndedMs).toBe(HOURS_65);
    expect(t.patch).toEqual({ status: "open", pausedAt: null, pauseTotalMs: HOURS_65, firstResponseDueAt: at("2026-09-14T08:30:00.000Z"), resolutionDueAt: at("2026-09-14T15:00:00.000Z") });
    expect(businessMinutesBetween(pending.resolutionDueAt!, t.patch.resolutionDueAt!, BH)).toBe(120);
    // the same through the customer's reply on a pending ticket (portal / inbound) — `transitionStatus` is the patch alone
    expect(transitionStatus(POLICY, pending, "open", NEXT_MON_10)).toEqual(t.patch);
    // without a policy (a ticket without SLA) there are no due dates and the wall clock is all that is booked
    const noSla = statusTransition(null, row({ status: "pending", pausedAt: FRI_17, firstResponseDueAt: null, resolutionDueAt: null }), "open", NEXT_MON_10);
    expect(noSla).toEqual({ patch: { status: "open", pausedAt: null, pauseTotalMs: HOURS_65, firstResponseDueAt: null, resolutionDueAt: null }, reopened: false, pauseEndedMs: HOURS_65 });
    // a policy-less resume of a stored due date is the wall-clock shift (Monday 15:00 + 65 h = Thursday 08:00), a clock overdue before the pause stays
    expect(resumeClock(undefined, row({ pausedAt: FRI_17, resolutionDueAt: at("2026-09-14T13:00:00.000Z") }), NEXT_MON_10)).toEqual({ pausedAt: null, pauseTotalMs: HOURS_65, firstResponseDueAt: at("2026-09-07T09:00:00.000Z"), resolutionDueAt: at("2026-09-17T06:00:00.000Z") });
  });

  it("reports a reopen from the row pick and restarts the clocks — or gives none without a policy", () => {
    const solved = row({ status: "solved", resolvedAt: at("2026-09-07T12:00:00.000Z"), firstRespondedAt: MON_10 });
    expect(statusTransition(POLICY, solved, "open", FRI_17)).toEqual({
      patch: { status: "open", resolvedAt: null, closedAt: null, pausedAt: null, resolutionDueAt: addBusinessMinutes(FRI_17, 480, BH), resolutionTargetMs: 480 * 60_000, breachedResolution: false, slaClockStartedAt: FRI_17 },
      reopened: true,
      pauseEndedMs: 0,
    });
    // without a policy the start is still persisted (a later policy assignment measures from here), the rest stays null
    expect(statusTransition(null, solved, "open", FRI_17)).toMatchObject({ reopened: true, patch: { resolutionDueAt: null, resolutionTargetMs: null, resolvedAt: null, slaClockStartedAt: FRI_17 } });
    expect(statusTransition(POLICY, solved, "solved", FRI_17)).toEqual({ patch: {}, reopened: false, pauseEndedMs: 0 });
    expect(isSlaReopen("closed", "pending")).toBe(true);
    expect(isSlaReopen("solved", "spam")).toBe(false);
    expect(isSlaReopen("open", "pending")).toBe(false);
    // pending → solved ends the pause and reports it
    const pending = row({ status: "pending", pausedAt: at("2026-09-07T08:30:00.000Z") });
    expect(statusTransition(POLICY, pending, "solved", at("2026-09-07T09:00:00.000Z"))).toMatchObject({ reopened: false, pauseEndedMs: 30 * 60_000, patch: { status: "solved", pausedAt: null, pauseTotalMs: 30 * 60_000 } });
  });

  it("flags a late resolution from the row pick (absent breach flags count as not flagged)", () => {
    expect(transitionStatus(POLICY, row(), "solved", at("2026-09-07T17:00:00.000Z"))).toEqual({ status: "solved", resolvedAt: at("2026-09-07T17:00:00.000Z"), breachedResolution: true });
    expect(transitionStatus(POLICY, row({ breachedResolution: true }), "solved", at("2026-09-07T12:00:00.000Z"))).toEqual({ status: "solved", resolvedAt: at("2026-09-07T12:00:00.000Z"), breachedResolution: true });
  });

  it("gives no due dates without a policy and describes a clock from the detail's pick", () => {
    expect(computeDueDates(null, "urgent", MON_10)).toEqual({ firstResponseDueAt: null, resolutionDueAt: null });
    expect(computeDueDates(undefined, "urgent", MON_10)).toEqual({ firstResponseDueAt: null, resolutionDueAt: null });
    const t = ticket();
    const pick: SlaClockStateInput = { priority: t.priority, pausedAt: null, firstResponseDueAt: t.firstResponseDueAt, resolutionDueAt: t.resolutionDueAt, firstRespondedAt: null, resolvedAt: null, breachedFirstResponse: false, breachedResolution: false };
    // the same share the worker warns on: 60-minute target, 10 business minutes left
    expect(slaClockState(pick, "first_response", at("2026-09-07T08:50:00.000Z"), POLICY).status).toBe("due_soon");
    expect(slaClockState(pick, "first_response", at("2026-09-07T08:40:00.000Z"), POLICY).status).toBe("running");
  });
});

describe("desk business hours as the fallback of a policy without windows", () => {
  const DESK: SupportBusinessHours = { timezone: "Europe/Dublin", days: { mon: [[480, 960]], tue: [[480, 960]] } };

  it("uses the policy's own windows when it has any, else the desk's, else runs around the clock", () => {
    expect(hasBusinessWindows(BH)).toBe(true);
    expect(hasBusinessWindows(ALWAYS)).toBe(false);
    expect(hasBusinessWindows(null)).toBe(false);
    expect(hasBusinessWindows({ timezone: "UTC", days: { mon: [[600, 500]] } })).toBe(false); // an invalid window is no window
    expect(effectiveBusinessHours(BH, DESK)).toBe(BH);
    expect(effectiveBusinessHours(ALWAYS, DESK)).toBe(DESK);
    expect(effectiveBusinessHours(ALWAYS, null)).toBe(ALWAYS);
    expect(effectiveBusinessHours(ALWAYS, { timezone: "UTC", days: {} })).toBe(ALWAYS);
    expect(effectiveBusinessHours(null, null)).toEqual({ timezone: "Europe/Berlin", days: {} });
    // the loaders hand the engine a policy with the fallback applied; an untouched policy is returned as is
    const open: SlaPolicyLike = { ...POLICY, businessHours: ALWAYS };
    expect(withDeskBusinessHours(POLICY, DESK)).toBe(POLICY);
    expect(withDeskBusinessHours(open, DESK)).toEqual({ ...open, businessHours: DESK });
    expect(withDeskBusinessHours(open, null)).toBe(open);
  });

  it("changes what the clocks compute: the same ticket is due by the desk's windows once the policy has none", () => {
    const withDesk = withDeskBusinessHours({ ...POLICY, businessHours: ALWAYS }, DESK);
    // Monday 10:00 CEST = 09:00 Dublin; 60 minutes in the desk's 08:00–16:00 windows → 10:00 Dublin = 09:00 UTC
    expect(computeDueDates(withDesk, "urgent", MON_10).firstResponseDueAt).toEqual(at("2026-09-07T09:00:00.000Z"));
    // 480 minutes: 7 h left on Monday (until 15:00 UTC), 1 h on Tuesday → Tuesday 09:00 Dublin = 08:00 UTC
    expect(computeDueDates(withDesk, "urgent", MON_10).resolutionDueAt).toEqual(at("2026-09-08T08:00:00.000Z"));
    // around the clock without desk hours
    expect(computeDueDates({ ...POLICY, businessHours: ALWAYS }, "urgent", MON_10).resolutionDueAt).toEqual(at("2026-09-07T16:00:00.000Z"));
  });
});

describe("policies and escalation", () => {
  it("selects the plan's policy, then the default", () => {
    const policies = [
      { id: "enterprise", planIds: ["enterprise"], isDefault: false },
      { id: "default", planIds: null, isDefault: true },
    ];
    expect(selectSlaPolicy(policies, "enterprise")?.id).toBe("enterprise");
    expect(selectSlaPolicy(policies, "starter")?.id).toBe("default");
    expect(selectSlaPolicy(policies, null)?.id).toBe("default");
    expect(selectSlaPolicy([policies[0]!], "starter")).toBeNull();
  });

  it("applies escalation defaults and round-trips the stored JSON", () => {
    expect(escalationSettings(null)).toEqual({ warningPercent: 80, notifyUserIds: [], escalateToAdmins: true, autoCloseDays: 7 });
    expect(escalationSettings({ warning_percent: 150, notify_user_ids: ["nope", "5c9f7a2e-1234-4abc-8def-000000000001", "5c9f7a2e-1234-4abc-8def-000000000001"], escalate_to_admins: false, auto_close_days: null })).toEqual({
      warningPercent: 80,
      notifyUserIds: ["5c9f7a2e-1234-4abc-8def-000000000001"],
      escalateToAdmins: false,
      autoCloseDays: null,
    });
    expect(escalationSettings({ warning_percent: 50, auto_close_days: 3 })).toMatchObject({ warningPercent: 50, autoCloseDays: 3 });
    expect(escalationSettings({ auto_close_days: 0 }).autoCloseDays).toBeNull();
    const json = escalationJson({ warningPercent: 75, notifyUserIds: ["5c9f7a2e-1234-4abc-8def-000000000001"], escalateToAdmins: true, autoCloseDays: 14 });
    expect(json).toEqual({ warning_percent: 75, notify_user_ids: ["5c9f7a2e-1234-4abc-8def-000000000001"], escalate_to_admins: true, auto_close_days: 14 });
    expect(escalationSettings(json)).toEqual({ warningPercent: 75, notifyUserIds: ["5c9f7a2e-1234-4abc-8def-000000000001"], escalateToAdmins: true, autoCloseDays: 14 });
  });
});

describe("editor validation", () => {
  const valid: SlaPolicyRawInput = {
    name: "  Enterprise  desk ",
    description: "Faster targets for enterprise plans.",
    planIds: ["enterprise", "enterprise"],
    isDefault: false,
    targets: {
      urgent: { first_response: { value: "30", unit: "minutes" }, resolution: { value: "4", unit: "hours" } },
      high: { first_response: { value: "1", unit: "hours" }, resolution: { value: "1", unit: "days" } },
      normal: { first_response: { value: "4", unit: "hours" }, resolution: { value: "2", unit: "days" } },
      low: { first_response: { value: "1", unit: "days" }, resolution: { value: "5", unit: "days" } },
    },
    timezone: "Europe/Amsterdam",
    days: { mon: { enabled: true, start: "08:00", end: "20:00" }, tue: { enabled: true, start: "08:00", end: "20:00" }, sat: { enabled: false, start: "", end: "" } },
    warningPercent: "75",
    escalateToAdmins: true,
    notifyUserIds: ["5C9F7A2E-1234-4ABC-8DEF-000000000001"],
    autoCloseDays: "14",
  };

  it("accepts a complete policy and converts units, times and ids", () => {
    const parsed = parseSlaPolicyInput(valid);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({
      name: "Enterprise desk",
      description: "Faster targets for enterprise plans.",
      planIds: ["enterprise"],
      isDefault: false,
      priorities: {
        urgent: { first_response_minutes: 30, resolution_minutes: 240 },
        high: { first_response_minutes: 60, resolution_minutes: 1440 },
        normal: { first_response_minutes: 240, resolution_minutes: 2880 },
        low: { first_response_minutes: 1440, resolution_minutes: 7200 },
      },
      businessHours: { timezone: "Europe/Amsterdam", days: { mon: [[480, 1200]], tue: [[480, 1200]] } },
      escalation: { warning_percent: 75, notify_user_ids: ["5c9f7a2e-1234-4abc-8def-000000000001"], escalate_to_admins: true, auto_close_days: 14 },
    });
  });

  it("treats no enabled day as around-the-clock and an empty or zero auto-close as never", () => {
    const parsed = parseSlaPolicyInput({ ...valid, days: {}, autoCloseDays: "", planIds: [] });
    expect(parsed.ok && parsed.value.businessHours).toEqual({ timezone: "Europe/Amsterdam", days: {} });
    expect(parsed.ok && parsed.value.escalation.auto_close_days).toBeNull();
    expect(parsed.ok && parsed.value.planIds).toBeNull();
    const zero = parseSlaPolicyInput({ ...valid, autoCloseDays: "0" });
    expect(zero.ok && zero.value.escalation.auto_close_days).toBeNull();
  });

  it("reports every problem per field", () => {
    const parsed = parseSlaPolicyInput({
      ...valid,
      name: "   ",
      description: "x".repeat(501),
      planIds: ["Enterprise Plan"],
      targets: {
        ...valid.targets,
        urgent: { first_response: { value: "", unit: "minutes" }, resolution: { value: "abc", unit: "hours" } },
        high: { first_response: { value: "2", unit: "days" }, resolution: { value: "1", unit: "hours" } },
        normal: { first_response: { value: "1", unit: "minutes" }, resolution: { value: "100", unit: "days" } },
        low: { first_response: { value: "5", unit: "weeks" }, resolution: { value: "5", unit: "days" } },
      },
      timezone: "Mars/Olympus",
      days: { mon: { enabled: true, start: "18:00", end: "09:00" }, tue: { enabled: true, start: "9am", end: "18:00" } },
      warningPercent: "100",
      notifyUserIds: ["not-a-uuid"],
      autoCloseDays: "400",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors).toEqual({
      name: "required",
      description: "long",
      planIds: "invalid",
      "targets.urgent.first_response": "required",
      "targets.urgent.resolution": "invalid",
      "targets.high.resolution": "order",
      "targets.normal.first_response": "range",
      "targets.normal.resolution": "range",
      "targets.low.first_response": "invalid",
      timezone: "timezone",
      "days.mon": "window",
      "days.tue": "invalid",
      warningPercent: "range",
      notifyUserIds: "invalid",
      autoCloseDays: "range",
    });
    expect(parseSlaPolicyInput({ ...valid, timezone: "", warningPercent: "" }).ok).toBe(false);
  });

  it("converts times and target units for the form", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("9:00")).toBeNull();
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(1440)).toBe("24:00");
    expect(minutesToTargetInput(10080)).toEqual({ value: "7", unit: "days" });
    expect(minutesToTargetInput(240)).toEqual({ value: "4", unit: "hours" });
    expect(minutesToTargetInput(90)).toEqual({ value: "90", unit: "minutes" });
  });
});
