import { describe, expect, it } from "vitest";
import {
  BILLABLE_EVENT_RULES,
  DEFAULT_OVERAGE_POLICY,
  FEATURES,
  FEATURE_KEYS,
  LEGACY_STRIPE_PRICE_ENV,
  OVERAGE_PACKS,
  PLANS,
  PLAN_IDS,
  TRIAL,
  USAGE_WARNING_THRESHOLDS,
  estimablePlanIds,
  estimateCost,
  inheritsLabel,
  isBillableEvent,
  labelIn,
  limitBullets,
  listPriceCents,
  nonBillableReason,
  planById,
  planForStripePriceEnv,
  planRecords,
  publicPlanOrder,
  recommendPlan,
  retentionDaysForMonths,
  stripePriceSlots,
  verifyStripeAmount,
  yearlyMonthlyEquivalentCents,
} from "./index.ts";

describe("catalogue invariants", () => {
  it("has exactly the four plans with unique ids in display order", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["starter", "growth", "pro", "enterprise"]);
    expect(new Set(PLANS.map((p) => p.id)).size).toBe(PLAN_IDS.length);
    expect(publicPlanOrder().map((p) => p.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(PLANS.map((p) => p.sortOrder)).toEqual([...PLANS].map((p) => p.sortOrder).sort((a, b) => a - b));
  });

  it("carries the binding list prices in integer cents, EUR, yearly = ten monthly instalments", () => {
    expect(listPriceCents("starter", "monthly")).toBe(1_900);
    expect(listPriceCents("growth", "monthly")).toBe(9_000);
    expect(listPriceCents("pro", "monthly")).toBe(18_000);
    expect(listPriceCents("starter", "yearly")).toBe(19_000);
    expect(listPriceCents("growth", "yearly")).toBe(90_000);
    expect(listPriceCents("pro", "yearly")).toBe(180_000);
    expect(listPriceCents("enterprise", "monthly")).toBeNull();
    for (const p of PLANS) {
      if (!p.price) {
        expect(p.contactSales).toBe(true);
        continue;
      }
      expect(p.price.currency).toBe("EUR");
      expect(Number.isInteger(p.price.monthlyCents)).toBe(true);
      expect(Number.isInteger(p.price.yearlyCents)).toBe(true);
      expect(p.price.yearlyCents).toBe(10 * p.price.monthlyCents);
    }
    expect(yearlyMonthlyEquivalentCents("starter")).toBeCloseTo(19_000 / 12, 6);
  });

  it("only Growth is recommended and only Enterprise is contact-sales", () => {
    expect(PLANS.filter((p) => p.recommended).map((p) => p.id)).toEqual(["growth"]);
    expect(PLANS.filter((p) => p.contactSales).map((p) => p.id)).toEqual(["enterprise"]);
  });

  it("entitlements match the owner supplement §5", () => {
    expect(planById("starter").limits).toMatchObject({ sites: 1, eventsPerMonth: 500_000, teamMembers: 2, retentionDays: 90 });
    expect(planById("growth").limits).toMatchObject({ sites: 5, eventsPerMonth: 5_000_000, teamMembers: 10, retentionMonths: 13 });
    expect(planById("pro").limits).toMatchObject({ sites: 25, eventsPerMonth: 20_000_000, teamMembers: null, retentionMonths: 25 });
    expect(planById("enterprise").limits).toEqual({ sites: null, eventsPerMonth: null, teamMembers: null, retentionDays: null, retentionMonths: null });
    expect(retentionDaysForMonths(13)).toBe(396);
    expect(retentionDaysForMonths(25)).toBe(761);
    expect(planById("growth").limits.retentionDays).toBe(396);
    expect(planById("pro").limits.retentionDays).toBe(761);
  });

  it("features are cumulative and every key is registered with en + de labels", () => {
    const has = (id: "starter" | "growth" | "pro" | "enterprise") => new Set(planById(id).features);
    for (const key of has("starter")) expect(has("growth").has(key)).toBe(true);
    for (const key of has("growth")) expect(has("pro").has(key)).toBe(true);
    for (const key of has("pro")) expect(has("enterprise").has(key)).toBe(true);
    for (const p of PLANS) {
      expect(new Set(p.features).size).toBe(p.features.length);
      for (const key of p.features) expect(FEATURE_KEYS).toContain(key);
      expect(p.highlights.length).toBeLessThanOrEqual(6);
      for (const h of p.highlights) {
        expect(h.en.length).toBeGreaterThan(0);
        expect(h.de.length).toBeGreaterThan(0);
      }
      expect(p.audience.en.length).toBeGreaterThan(0);
      expect(p.audience.de.length).toBeGreaterThan(0);
    }
    for (const key of FEATURE_KEYS) {
      expect(FEATURES[key].label.en.length).toBeGreaterThan(0);
      expect(FEATURES[key].label.de.length).toBeGreaterThan(0);
    }
    const paid = ["starter", "growth", "pro"] as const;
    for (const id of paid) for (const key of ["server_side_tracking", "all_standard_destinations", "ai_assistant", "consent_engine", "event_debugger", "tracking_health", "config_versioning"] as const) expect(planById(id).features).toContain(key);
    expect(planById("starter").features).not.toContain("advanced_ecommerce_events");
    expect(planById("growth").features).toContain("advanced_ecommerce_events");
    expect(planById("growth").features).not.toContain("event_replay");
    expect(planById("pro").features).toContain("event_replay");
    expect(planById("pro").features).not.toContain("saml_sso");
    expect(planById("enterprise").features).toContain("saml_sso");
  });

  it("labels are strict per locale (no silent fallback) and inherits reads naturally", () => {
    const label = planById("growth").audience;
    expect(labelIn(label, "de")).toBe(label.de);
    expect(labelIn(label, "fr")).toBeNull();
    expect(labelIn(label, "xx")).toBeNull();
    expect(inheritsLabel(planById("starter"))).toBeNull();
    expect(inheritsLabel(planById("pro"))).toEqual({ en: "Everything in Growth, plus", de: "Alles aus Growth, zusätzlich" });
  });

  it("limit bullets format numbers per language and never invent a cap", () => {
    const starter = limitBullets(planById("starter"));
    expect(starter[0]?.en).toContain("1 production website");
    expect(starter[1]?.en).toBe("500,000 accepted events per month");
    expect(starter[1]?.de).toBe("500.000 akzeptierte Events pro Monat");
    expect(starter[3]?.de).toBe("90 Tage Eventaufbewahrung");
    const pro = limitBullets(planById("pro"));
    expect(pro[2]?.en).toContain("Unlimited team members");
    expect(pro[3]?.en).toBe("25 months event retention");
    const ent = limitBullets(planById("enterprise"));
    expect(ent.every((b) => /custom|individuell/i.test(b.en + b.de))).toBe(true);
  });

  it("overage packs, policy defaults, thresholds and trial follow the supplement", () => {
    expect(OVERAGE_PACKS.starter).toMatchObject({ events: 100_000, priceCents: 600, currency: "EUR" });
    expect(OVERAGE_PACKS.growth).toMatchObject({ events: 1_000_000, priceCents: 1_800 });
    expect(OVERAGE_PACKS.pro).toMatchObject({ events: 5_000_000, priceCents: 3_000 });
    expect(DEFAULT_OVERAGE_POLICY).toBe("pause");
    expect([...USAGE_WARNING_THRESHOLDS]).toEqual([70, 90, 100]);
    expect(TRIAL).toMatchObject({ planId: "growth", days: 14, cardRequired: false, maxEvents: 100_000, autoConvert: false, afterExpiry: "read_only_export" });
  });

  it("database records mirror the catalogue and carry PRO env names", () => {
    const records = planRecords();
    expect(records.map((r) => r.id)).toEqual(["starter", "growth", "pro", "enterprise"]);
    const pro = records.find((r) => r.id === "pro")!;
    expect(pro.stripePriceEnv).toEqual({ monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" });
    expect(pro.limits).toMatchObject({ sites: 25, eventsPerMonth: 20_000_000, teamMembers: null, destinations: null, serverSide: true, exports: true, sso: false });
    const starter = records.find((r) => r.id === "starter")!;
    expect(starter.limits).toMatchObject({ sites: 1, eventsPerMonth: 500_000, teamMembers: 2, retentionDays: 90, serverSide: true, exports: false, sso: false });
    const enterprise = records.find((r) => r.id === "enterprise")!;
    expect(enterprise.stripePriceEnv).toEqual({ monthly: null, yearly: null });
    expect(enterprise.limits.sso).toBe(true);
    expect(enterprise.contactSales).toBe(true);
  });
});

describe("billable event rules", () => {
  it("counts an accepted event once and excludes the listed cases", () => {
    expect([...BILLABLE_EVENT_RULES.notCounted]).toEqual(["invalid_or_rejected", "duplicate", "retry", "test_or_debug", "internal", "consent_dropped"]);
    expect(BILLABLE_EVENT_RULES.destinationFanOutCounts).toBe(false);
    expect(isBillableEvent({ accepted: true })).toBe(true);
    expect(nonBillableReason({ accepted: false })).toBe("invalid_or_rejected");
    expect(nonBillableReason({ accepted: true, duplicate: true })).toBe("duplicate");
    expect(nonBillableReason({ accepted: true, retry: true })).toBe("retry");
    expect(nonBillableReason({ accepted: true, testMode: true })).toBe("test_or_debug");
    expect(nonBillableReason({ accepted: true, internal: true })).toBe("internal");
    expect(nonBillableReason({ accepted: false, consentDropped: true })).toBe("consent_dropped");
  });
});

describe("recommendPlan", () => {
  it("picks the smallest plan whose limits satisfy every input", () => {
    expect(recommendPlan({ sites: 1, eventsPerMonth: 100_000, teamMembers: 2, retentionDays: 90 })).toBe("starter");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 500_000, teamMembers: 2, retentionDays: 90 })).toBe("starter");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 500_001, teamMembers: 2, retentionDays: 90 })).toBe("growth");
    expect(recommendPlan({ sites: 2, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 30 })).toBe("growth");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 1_000, teamMembers: 3, retentionDays: 30 })).toBe("growth");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 120 })).toBe("growth");
    expect(recommendPlan({ sites: 6, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 30 })).toBe("pro");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 6_000_000, teamMembers: 1, retentionDays: 30 })).toBe("pro");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 1_000, teamMembers: 50, retentionDays: 30 })).toBe("pro");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 700 })).toBe("pro");
    expect(recommendPlan({ sites: 26, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 30 })).toBe("enterprise");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 25_000_000, teamMembers: 1, retentionDays: 30 })).toBe("enterprise");
    expect(recommendPlan({ sites: 1, eventsPerMonth: 1_000, teamMembers: 1, retentionDays: 800 })).toBe("enterprise");
  });

  it("is deterministic and tolerant to empty inputs", () => {
    const input = { sites: 3, eventsPerMonth: 2_000_000, teamMembers: 4, retentionDays: 365 };
    expect(recommendPlan(input)).toBe(recommendPlan({ ...input }));
    expect(recommendPlan({ sites: 0, eventsPerMonth: 0, teamMembers: 0, retentionDays: 0 })).toBe("starter");
    expect(recommendPlan({ sites: -5, eventsPerMonth: Number.NaN, teamMembers: -1, retentionDays: Number.POSITIVE_INFINITY })).toBe("enterprise");
  });
});

describe("estimateCost", () => {
  it("returns the base price without overage inside the limit", () => {
    expect(estimateCost({ planId: "starter", eventsPerMonth: 400_000, interval: "monthly" })).toMatchObject({ base: 1_900, overagePacks: 0, overageCost: 0, total: 1_900, periodMonths: 1, currency: "EUR" });
    expect(estimateCost({ planId: "starter", eventsPerMonth: 500_000, interval: "yearly" })).toMatchObject({ base: 19_000, overagePacks: 0, overageCost: 0, total: 19_000, periodMonths: 12 });
    expect(estimateCost({ planId: "growth", eventsPerMonth: 400_000, interval: "monthly" })?.cheaperUpgrade).toBeUndefined();
  });

  it("rounds overage up to whole packs and compares honestly with higher plans", () => {
    // 650k on Starter: 150k over → 2 packs × 6 € = 12 € → 31 € total; Growth would be 90 €
    const starter = estimateCost({ planId: "starter", eventsPerMonth: 650_000, interval: "monthly" });
    expect(starter).toMatchObject({ overageEventsPerMonth: 150_000, overagePacks: 2, overageCost: 1_200, total: 3_100 });
    expect(starter?.cheaperUpgrade).toBeUndefined();
    // 2.5M on Starter: 2M over → 20 packs × 6 € = 120 € → 139 €; Growth at 90 € is cheaper
    const heavy = estimateCost({ planId: "starter", eventsPerMonth: 2_500_000, interval: "monthly" });
    expect(heavy).toMatchObject({ overagePacks: 20, overageCost: 12_000, total: 13_900 });
    expect(heavy?.cheaperUpgrade).toEqual({ planId: "growth", total: 9_000, savings: 4_900 });
    // 6M on Starter: Growth (90 + 18) = 108 € beats Pro (180 €): the cheapest higher plan wins
    const six = estimateCost({ planId: "starter", eventsPerMonth: 6_000_000, interval: "monthly" });
    expect(six?.cheaperUpgrade).toEqual({ planId: "growth", total: 10_800, savings: six!.total - 10_800 });
    // 12M on Growth: 7 packs × 18 € = 126 € → 216 €; Pro at 180 € is cheaper
    const growth = estimateCost({ planId: "growth", eventsPerMonth: 12_000_000, interval: "monthly" });
    expect(growth).toMatchObject({ overagePacks: 7, overageCost: 12_600, total: 21_600 });
    expect(growth?.cheaperUpgrade).toEqual({ planId: "pro", total: 18_000, savings: 3_600 });
  });

  it("multiplies overage by the period length in yearly mode", () => {
    const yearly = estimateCost({ planId: "growth", eventsPerMonth: 12_000_000, interval: "yearly" });
    expect(yearly).toMatchObject({ base: 90_000, overagePacks: 7, overageCost: 12_600 * 12, total: 90_000 + 12_600 * 12 });
    expect(yearly?.cheaperUpgrade).toEqual({ planId: "pro", total: 180_000, savings: 90_000 + 12_600 * 12 - 180_000 });
  });

  it("returns null for custom-priced plans and flags contractual overage", () => {
    expect(estimateCost({ planId: "enterprise", eventsPerMonth: 1_000, interval: "monthly" })).toBeNull();
    expect(estimablePlanIds()).toEqual(["starter", "growth", "pro"]);
    const pro = estimateCost({ planId: "pro", eventsPerMonth: 30_000_000, interval: "monthly" });
    expect(pro).toMatchObject({ overagePacks: 2, overageCost: 6_000, total: 24_000, overageContractual: false });
    expect(pro?.cheaperUpgrade).toBeUndefined();
  });
});

describe("stripe helpers", () => {
  it("lists six price slots with PRO names and the deprecated SCALE fallback", () => {
    const slots = stripePriceSlots();
    expect(slots.map((s) => s.envName)).toEqual(["STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_YEARLY", "STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_GROWTH_YEARLY", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_YEARLY"]);
    expect(slots.find((s) => s.envName === "STRIPE_PRICE_PRO_YEARLY")?.legacyEnvName).toBe("STRIPE_PRICE_SCALE_YEARLY");
    expect(slots.find((s) => s.envName === "STRIPE_PRICE_STARTER_YEARLY")?.legacyEnvName).toBeNull();
    expect(LEGACY_STRIPE_PRICE_ENV.STRIPE_PRICE_PRO_MONTHLY).toBe("STRIPE_PRICE_SCALE_MONTHLY");
  });

  it("parses current and deprecated env names", () => {
    expect(planForStripePriceEnv("STRIPE_PRICE_GROWTH_MONTHLY")).toEqual({ planId: "growth", interval: "monthly", deprecated: false });
    expect(planForStripePriceEnv("STRIPE_PRICE_SCALE_YEARLY")).toEqual({ planId: "pro", interval: "yearly", deprecated: true });
    expect(planForStripePriceEnv("STRIPE_PRICE_ENTERPRISE_MONTHLY")).toBeNull();
    expect(planForStripePriceEnv("STRIPE_SECRET_KEY")).toBeNull();
  });

  it("verifies Stripe amounts against the list price", () => {
    expect(verifyStripeAmount({ planId: "pro", interval: "yearly", unitAmount: 180_000, currency: "eur" })).toEqual({ ok: true });
    expect(verifyStripeAmount({ planId: "pro", interval: "yearly", unitAmount: 184_000, currency: "eur" })).toEqual({ ok: false, error: "amount_mismatch:1840.00 EUR≠1800.00 EUR" });
    expect(verifyStripeAmount({ planId: "starter", interval: "monthly", unitAmount: 1_900, currency: "usd" })).toEqual({ ok: false, error: "currency_mismatch:usd≠eur" });
    expect(verifyStripeAmount({ planId: "starter", interval: "monthly", unitAmount: null, currency: "eur" })).toEqual({ ok: false, error: "no_unit_amount" });
    expect(verifyStripeAmount({ planId: "enterprise", interval: "monthly", unitAmount: 1, currency: "eur" })).toEqual({ ok: false, error: "no_list_price" });
  });
});
