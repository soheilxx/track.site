import { describe, expect, it } from "vitest";
import { PAID_PLAN_IDS, estimateCost, planById, recommendPlan } from "@track-site/catalog";
import {
  CONTACT_SALES_HREF,
  EVENT_STOPS,
  FINDER_EVENT_OPTIONS,
  SIGNUP_HREF,
  calculate,
  clampEvents,
  fill,
  findPlanFor,
  formatAmount,
  formatCompact,
  formatInteger,
  formatList,
  formatMoney,
  largestPaidEventLimit,
  longestPaidRetentionMonths,
  nearestStopIndex,
  parseEventsInput,
  retentionOptions,
  signupHref,
  yearlyInstalments,
} from "./pricing-helpers";
import { planSelectionFromSearchParams } from "./plan-selection";

/** Intl inserts non-breaking spaces (U+00A0 / U+202F) in some locales; compare with plain spaces. */
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("copy templates and formatting", () => {
  it("fills placeholders and leaves unknown ones untouched", () => {
    expect(fill("Choose {plan} for {price}", { plan: "Growth", price: "€90" })).toBe("Choose Growth for €90");
    expect(fill("{n} × {events}", { n: 2 })).toBe("2 × {events}");
  });

  it("formats EUR per copy locale without inventing decimals", () => {
    expect(plain(formatMoney(1_900, "EUR", "en"))).toBe("€19");
    expect(plain(formatMoney(1_900, "EUR", "de"))).toBe("19 €");
    expect(plain(formatMoney(19_000 / 12, "EUR", "en"))).toBe("€15.83");
    expect(plain(formatMoney(9_000, "EUR", "en", 2))).toBe("€90.00");
    expect(plain(formatAmount(180, "EUR", "de"))).toBe("180 €");
    expect(formatInteger(500_000, "en")).toBe("500,000");
    expect(formatInteger(500_000, "de")).toBe("500.000");
    expect(formatCompact(5_000_000, "en")).toBe("5M");
    expect(plain(formatCompact(5_000_000, "de"))).toBe("5 Mio.");
    expect(formatList(["70 %", "90 %", "100 %"], "en")).toBe("70 %, 90 % and 100 %");
    expect(formatList(["70 %", "90 %", "100 %"], "de")).toBe("70 %, 90 % und 100 %");
  });
});

describe("signup links", () => {
  it("emits only validated plan ids and intervals", () => {
    expect(signupHref("growth", "yearly")).toBe(`${SIGNUP_HREF}?plan=growth&interval=yearly`);
    expect(signupHref("starter", "monthly")).toBe(`${SIGNUP_HREF}?plan=starter&interval=monthly`);
    expect(signupHref("pro", "weekly")).toBe(`${SIGNUP_HREF}?plan=pro&interval=monthly`);
    expect(signupHref("enterprise", "monthly")).toBe(CONTACT_SALES_HREF);
    expect(signupHref("scale", "monthly")).toBe(SIGNUP_HREF);
    expect(signupHref("<script>", "monthly")).toBe(SIGNUP_HREF);
  });

  it("emits links the signup-side parser reads back unchanged (hand-over contract)", () => {
    for (const planId of PAID_PLAN_IDS) {
      for (const interval of ["monthly", "yearly"] as const) {
        const href = signupHref(planId, interval);
        expect(href.startsWith(`${SIGNUP_HREF}?`)).toBe(true);
        expect(planSelectionFromSearchParams(new URLSearchParams(href.slice(SIGNUP_HREF.length)))).toEqual({ planId, interval });
      }
    }
  });
});

describe("event volume inputs", () => {
  it("has strictly increasing slider stops that include every paid plan limit", () => {
    for (let i = 1; i < EVENT_STOPS.length; i += 1) expect(EVENT_STOPS[i]).toBeGreaterThan(EVENT_STOPS[i - 1] ?? 0);
    for (const id of PAID_PLAN_IDS) expect(EVENT_STOPS).toContain(planById(id).limits.eventsPerMonth);
    for (const id of PAID_PLAN_IDS) expect(FINDER_EVENT_OPTIONS).toContain(planById(id).limits.eventsPerMonth);
    expect(FINDER_EVENT_OPTIONS.at(-1)).toBe(Number.POSITIVE_INFINITY);
    expect(largestPaidEventLimit()).toBe(20_000_000);
  });

  it("maps a volume to the nearest lower stop", () => {
    expect(nearestStopIndex(0)).toBe(0);
    expect(nearestStopIndex(50_000)).toBe(0);
    expect(nearestStopIndex(999_999)).toBe(EVENT_STOPS.indexOf(750_000));
    expect(nearestStopIndex(5_000_000)).toBe(EVENT_STOPS.indexOf(5_000_000));
    expect(nearestStopIndex(1e12)).toBe(EVENT_STOPS.length - 1);
  });

  it("parses typed volumes with any separators and clamps them", () => {
    expect(parseEventsInput("1.500.000")).toBe(1_500_000);
    expect(parseEventsInput("2,000,000")).toBe(2_000_000);
    expect(parseEventsInput(" 750 000 ")).toBe(750_000);
    expect(parseEventsInput("")).toBeNull();
    expect(parseEventsInput("abc")).toBeNull();
    expect(parseEventsInput("99999999999")).toBe(1_000_000_000);
    expect(clampEvents(-5)).toBe(0);
    expect(clampEvents(Number.NaN)).toBe(0);
    expect(clampEvents(12.9)).toBe(12);
  });

  it("derives the retention choices from the paid plans", () => {
    const options = retentionOptions();
    expect(options.map((o) => o.days)).toEqual([90, 396, 761, Number.POSITIVE_INFINITY]);
    expect(options.map((o) => o.months)).toEqual([null, 13, 25, null]);
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
    expect(options.at(-1)?.longer).toBe(true);
    expect(longestPaidRetentionMonths()).toBe(25);
  });
});

describe("plan finder", () => {
  it("is deterministic and mirrors recommendPlan", () => {
    const inputs = [
      { sites: 1, eventsPerMonth: 100_000, teamMembers: 2, retentionDays: 90 },
      { sites: 3, eventsPerMonth: 2_000_000, teamMembers: 4, retentionDays: 396 },
      { sites: 6, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 30 },
      { sites: 1, eventsPerMonth: Number.POSITIVE_INFINITY, teamMembers: 1, retentionDays: 30 },
      { sites: 1, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: Number.POSITIVE_INFINITY },
    ];
    for (const input of inputs) {
      const a = findPlanFor(input);
      const b = findPlanFor({ ...input });
      expect(a.planId).toBe(recommendPlan(input));
      expect(b.planId).toBe(a.planId);
      expect(a.plan.id).toBe(a.planId);
      expect(a.checks.map((c) => c.key)).toEqual(["sites", "events", "team", "retention"]);
      for (const check of a.checks) expect(check.fits).toBe(true);
    }
    expect(findPlanFor(inputs[0]!).planId).toBe("starter");
    expect(findPlanFor(inputs[1]!).planId).toBe("growth");
    expect(findPlanFor(inputs[2]!).planId).toBe("pro");
    expect(findPlanFor(inputs[3]!).planId).toBe("enterprise");
    expect(findPlanFor(inputs[4]!).planId).toBe("enterprise");
  });

  it("explains the recommendation with the plan's caps", () => {
    const growth = findPlanFor({ sites: 3, eventsPerMonth: 2_000_000, teamMembers: 4, retentionDays: 396 });
    expect(growth.checks).toEqual([
      { key: "sites", wanted: 3, limit: 5, fits: true },
      { key: "events", wanted: 2_000_000, limit: 5_000_000, fits: true },
      { key: "team", wanted: 4, limit: 10, fits: true },
      { key: "retention", wanted: 396, limit: 396, fits: true },
    ]);
    const enterprise = findPlanFor({ sites: 40, eventsPerMonth: 0, teamMembers: 0, retentionDays: 0 });
    expect(enterprise.checks.every((c) => c.limit === null && c.fits)).toBe(true);
    const sanitized = findPlanFor({ sites: -1, eventsPerMonth: Number.NaN, teamMembers: -3, retentionDays: 0 });
    expect(sanitized.planId).toBe("starter");
    expect(sanitized.checks.map((c) => c.wanted)).toEqual([0, 0, 0, 0]);
  });
});

describe("cost calculator", () => {
  it("returns the catalogue estimate with packs and the honest upgrade hint", () => {
    const inside = calculate("starter", 400_000, "monthly");
    expect(inside?.estimate).toMatchObject({ base: 1_900, overagePacks: 0, overageCost: 0, total: 1_900 });
    expect(inside?.cheaper).toBeNull();
    expect(inside?.pack).toMatchObject({ events: 100_000, priceCents: 600 });
    expect(inside?.beyondTopPlan).toBe(false);

    const growth = calculate("growth", 12_000_000, "monthly");
    expect(growth?.estimate).toMatchObject({ overagePacks: 7, overageCost: 12_600, total: 21_600 });
    expect(growth?.cheaper).toMatchObject({ total: 18_000, savings: 3_600 });
    expect(growth?.cheaper?.plan.id).toBe("pro");
    expect(growth?.estimate).toEqual(estimateCost({ planId: "growth", eventsPerMonth: 12_000_000, interval: "monthly" }));
  });

  it("multiplies overage by the period in yearly mode and flags volumes beyond the top plan", () => {
    const yearly = calculate("growth", 12_000_000, "yearly");
    expect(yearly?.estimate).toMatchObject({ base: 90_000, periodMonths: 12, overageCost: 12_600 * 12, total: 90_000 + 12_600 * 12 });
    const beyond = calculate("pro", 25_000_000, "monthly");
    expect(beyond?.beyondTopPlan).toBe(true);
    expect(beyond?.estimate).toMatchObject({ overagePacks: 1, overageCost: 3_000, total: 21_000 });
    expect(beyond?.cheaper).toBeNull();
    expect(calculate("pro", -10, "monthly")?.estimate.total).toBe(18_000);
  });

  it("reports whole yearly instalments only", () => {
    expect(yearlyInstalments(9_000, 90_000)).toBe(10);
    expect(yearlyInstalments(9_000, 95_000)).toBeNull();
    expect(yearlyInstalments(0, 90_000)).toBeNull();
  });
});
