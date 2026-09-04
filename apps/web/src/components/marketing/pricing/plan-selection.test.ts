import { describe, expect, it, vi } from "vitest";
import { BILLING_INTERVALS, PAID_PLAN_IDS, PLAN_IDS } from "@track-site/catalog";
import { DEFAULT_INTERVAL, INTERVAL_PARAM, PLAN_PARAM, PLAN_SELECTION_KEY, planSelectionFromSearchParams, planSelectionQuery, readStoredPlanSelection, safePlanSelection, storePlanSelection } from "./plan-selection";

describe("safePlanSelection", () => {
  it("accepts every paid plan with every billing interval", () => {
    for (const planId of PAID_PLAN_IDS) {
      for (const interval of BILLING_INTERVALS) {
        expect(safePlanSelection(planId, interval)).toEqual({ planId, interval });
      }
    }
  });

  it("falls back to the monthly default for a missing or unknown interval", () => {
    expect(DEFAULT_INTERVAL).toBe("monthly");
    expect(safePlanSelection("growth", undefined)).toEqual({ planId: "growth", interval: "monthly" });
    expect(safePlanSelection("growth", "weekly")).toEqual({ planId: "growth", interval: "monthly" });
    expect(safePlanSelection("growth", ["yearly"])).toEqual({ planId: "growth", interval: "monthly" });
  });

  it("rejects contact-sales, unknown and non-string plans", () => {
    const contactSales = PLAN_IDS.filter((id) => !(PAID_PLAN_IDS as readonly string[]).includes(id));
    expect(contactSales.length).toBeGreaterThan(0);
    for (const id of contactSales) expect(safePlanSelection(id, "monthly")).toBeNull();
    expect(safePlanSelection("scale", "monthly")).toBeNull();
    expect(safePlanSelection("GROWTH", "monthly")).toBeNull();
    expect(safePlanSelection("<script>", "monthly")).toBeNull();
    expect(safePlanSelection(["growth"], "monthly")).toBeNull();
    expect(safePlanSelection(undefined, "monthly")).toBeNull();
    expect(safePlanSelection(null, null)).toBeNull();
    expect(safePlanSelection(42, "monthly")).toBeNull();
  });
});

describe("planSelectionFromSearchParams", () => {
  it("reads a Next.js searchParams record", () => {
    expect(planSelectionFromSearchParams({ plan: "pro", interval: "yearly" })).toEqual({ planId: "pro", interval: "yearly" });
    expect(planSelectionFromSearchParams({ plan: "pro", interval: "yearly", domain: "shop.example.com" })).toEqual({ planId: "pro", interval: "yearly" });
    expect(planSelectionFromSearchParams({ plan: "starter" })).toEqual({ planId: "starter", interval: "monthly" });
    expect(planSelectionFromSearchParams({})).toBeNull();
    expect(planSelectionFromSearchParams({ interval: "yearly" })).toBeNull();
    expect(planSelectionFromSearchParams({ plan: "enterprise", interval: "yearly" })).toBeNull();
  });

  it("treats repeated params as no selection", () => {
    expect(planSelectionFromSearchParams({ plan: ["growth", "pro"], interval: "yearly" })).toBeNull();
    expect(planSelectionFromSearchParams({ plan: "growth", interval: ["yearly", "monthly"] })).toEqual({ planId: "growth", interval: "monthly" });
  });

  it("reads URLSearchParams", () => {
    expect(planSelectionFromSearchParams(new URLSearchParams("plan=growth&interval=yearly"))).toEqual({ planId: "growth", interval: "yearly" });
    expect(planSelectionFromSearchParams(new URLSearchParams("plan=growth"))).toEqual({ planId: "growth", interval: "monthly" });
    expect(planSelectionFromSearchParams(new URLSearchParams("plan=nope&interval=yearly"))).toBeNull();
    expect(planSelectionFromSearchParams(new URLSearchParams(""))).toBeNull();
  });
});

describe("planSelectionQuery", () => {
  it("serialises a selection as the first or an appended query", () => {
    expect(PLAN_PARAM).toBe("plan");
    expect(INTERVAL_PARAM).toBe("interval");
    expect(planSelectionQuery({ planId: "growth", interval: "yearly" })).toBe("?plan=growth&interval=yearly");
    expect(planSelectionQuery({ planId: "growth", interval: "yearly" }, false)).toBe("&plan=growth&interval=yearly");
    expect(planSelectionQuery(null)).toBe("");
    expect(planSelectionQuery(null, false)).toBe("");
  });

  it("round-trips through the parser for every paid plan and interval", () => {
    for (const planId of PAID_PLAN_IDS) {
      for (const interval of BILLING_INTERVALS) {
        const query = planSelectionQuery({ planId, interval });
        expect(planSelectionFromSearchParams(new URLSearchParams(query))).toEqual({ planId, interval });
        const appended = new URLSearchParams(`?domain=shop.example.com${planSelectionQuery({ planId, interval }, false)}`);
        expect(appended.get("domain")).toBe("shop.example.com");
        expect(planSelectionFromSearchParams(appended)).toEqual({ planId, interval });
      }
    }
  });
});

describe("stored plan selection", () => {
  it("is a no-op without session storage (server, private mode)", () => {
    expect(readStoredPlanSelection()).toBeNull();
    expect(() => storePlanSelection({ planId: "growth", interval: "yearly" })).not.toThrow();
  });

  it("round-trips a selection through session storage and re-validates what it reads", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
    try {
      storePlanSelection(null);
      expect(store.size).toBe(0);
      storePlanSelection({ planId: "pro", interval: "yearly" });
      expect(store.get(PLAN_SELECTION_KEY)).toBe('{"planId":"pro","interval":"yearly"}');
      expect(readStoredPlanSelection()).toEqual({ planId: "pro", interval: "yearly" });
      store.set(PLAN_SELECTION_KEY, '{"planId":"enterprise","interval":"yearly"}');
      expect(readStoredPlanSelection()).toBeNull();
      store.set(PLAN_SELECTION_KEY, '{"planId":"growth","interval":"weekly"}');
      expect(readStoredPlanSelection()).toEqual({ planId: "growth", interval: "monthly" });
      store.set(PLAN_SELECTION_KEY, "not json");
      expect(readStoredPlanSelection()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
