import { describe, expect, it, vi } from "vitest";

// the loader's runtime dependencies are server-only; the reducers under test are pure
vi.mock("server-only", () => ({}));

import type Stripe from "stripe";
import {
  csvCell,
  effectiveOveragePolicy,
  invoiceView,
  isStripePermissionError,
  listStripeInvoices,
  monthlyListCents,
  overageCsv,
  pastDueSubscriptions,
  rankUsage,
  revenueView,
  stripeDashboardUrl,
  stripeErrorDetail,
  stripeModeFromKey,
  subscriptionsCsv,
  summarizeCancellations,
  summarizeOverage,
  summarizeSubscriptions,
  summarizeTrials,
  toCsv,
  type RevenueSubscription,
  type UsagePeriodRow,
} from "./revenue";

const now = new Date("2026-09-08T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

let seq = 0;
function sub(over: Partial<RevenueSubscription> & { planId: string; status: RevenueSubscription["status"] }): RevenueSubscription {
  seq++;
  return {
    id: `sub-${seq}`,
    organizationId: `org-${seq}`,
    organizationName: `Org ${seq}`,
    organizationSlug: `org-${seq}`,
    suspendedAt: null,
    interval: "monthly",
    stripeCustomerId: `cus_${seq}`,
    stripeSubscriptionId: `sub_${seq}`,
    currentPeriodEnd: days(10),
    cancelAt: null,
    canceledAt: null,
    trialEnd: null,
    graceUntil: null,
    updatedAt: days(-1),
    ...over,
  };
}

function usage(over: Partial<UsagePeriodRow> & { billableEvents: number }): UsagePeriodRow {
  seq++;
  return {
    organizationId: `org-${seq}`,
    organizationName: `Org ${seq}`,
    organizationSlug: `org-${seq}`,
    planId: "starter",
    subscriptionStatus: "active",
    acceptedEvents: over.billableEvents,
    siteCount: 1,
    limitEvents: null,
    overagePolicy: "pause",
    costLimitCents: null,
    hardLimitHitAt: null,
    updatedAt: days(-1),
    ...over,
  };
}

describe("list prices per month", () => {
  it("prices monthly and yearly intervals from the catalogue and refuses the rest honestly", () => {
    expect(monthlyListCents("starter", "monthly")).toEqual({ cents: 1_900, reason: null });
    expect(monthlyListCents("growth", "yearly")).toEqual({ cents: 90_000 / 12, reason: null });
    expect(monthlyListCents("enterprise", "monthly")).toEqual({ cents: null, reason: "custom_price" });
    expect(monthlyListCents("legacy", "monthly")).toEqual({ cents: null, reason: "unknown_plan" });
    expect(monthlyListCents("pro", null)).toEqual({ cents: null, reason: "unknown_interval" });
  });
});

describe("subscription summary", () => {
  it("counts MRR from active subscriptions only, interval-aware, and reports what it excludes", () => {
    const rows = [
      sub({ planId: "starter", status: "active" }),
      sub({ planId: "growth", status: "active", interval: "yearly" }),
      sub({ planId: "pro", status: "active" }),
      sub({ planId: "growth", status: "past_due" }),
      sub({ planId: "starter", status: "unpaid", interval: "yearly" }),
      sub({ planId: "growth", status: "trialing", trialEnd: days(5) }),
      sub({ planId: "enterprise", status: "active" }),
      sub({ planId: "legacy", status: "active" }),
      sub({ planId: "pro", status: "active", interval: null }),
      sub({ planId: "starter", status: "canceled", canceledAt: days(-3) }),
    ];
    const s = summarizeSubscriptions(rows);
    expect(s.mrrCents).toBe(1_900 + 90_000 / 12 + 18_000);
    expect(s.arrCents).toBe(s.mrrCents * 12);
    // enterprise, legacy and the interval-less row are active (and counted per interval) but not priced
    expect(s.paying).toEqual({ total: 6, monthly: 4, yearly: 1 });
    expect(s.excluded).toEqual({ custom_price: 1, unknown_plan: 1, unknown_interval: 1 });
    expect(s.atRisk).toEqual({ count: 2, mrrCents: 9_000 + 19_000 / 12 });
    expect(s.trialing).toBe(1);
    expect(s.statusCounts.active).toBe(6);
    expect(s.statusCounts.canceled).toBe(1);
    expect(s.statusCounts.none).toBe(0);
  });

  it("breaks the revenue down per catalogue plan with shares, plus an `other` bucket for unknown plans", () => {
    const rows = [sub({ planId: "starter", status: "active" }), sub({ planId: "starter", status: "active" }), sub({ planId: "pro", status: "active", interval: "yearly" }), sub({ planId: "legacy", status: "canceled" })];
    const s = summarizeSubscriptions(rows);
    expect(s.byPlan.map((p) => p.planId)).toEqual(["starter", "growth", "pro", "enterprise", "other"]);
    const starter = s.byPlan[0]!;
    expect(starter).toMatchObject({ name: "Starter", active: 2, monthly: 2, yearly: 0, mrrCents: 3_800, customPrice: false });
    expect(starter.share).toBeCloseTo(3_800 / (3_800 + 15_000), 6);
    expect(s.byPlan[2]).toMatchObject({ planId: "pro", active: 1, yearly: 1, mrrCents: 15_000 });
    expect(s.byPlan[3]).toMatchObject({ planId: "enterprise", customPrice: true, mrrCents: null, share: null });
    expect(s.byPlan[4]).toMatchObject({ planId: "other", name: null, total: 1, canceled: 1, mrrCents: null });
  });

  it("is empty and zero without rows, without inventing a share", () => {
    const s = summarizeSubscriptions([]);
    expect(s.mrrCents).toBe(0);
    expect(s.byPlan).toHaveLength(4);
    expect(s.byPlan.every((p) => p.share === null)).toBe(true);
  });
});

describe("trials", () => {
  it("has no data when nothing in the ledger carries a trial state", () => {
    const t = summarizeTrials([sub({ planId: "starter", status: "active" })], now);
    expect(t.hasData).toBe(false);
    expect(t.catalogue).toEqual({ planId: "growth", planName: "Growth", days: 14, cardRequired: false });
    expect(t.rows).toEqual([]);
  });

  it("counts running, ending-soon and expired trials with the days left, soonest first", () => {
    const rows = [sub({ planId: "growth", status: "trialing", trialEnd: days(12) }), sub({ planId: "growth", status: "trialing", trialEnd: days(3) }), sub({ planId: "growth", status: "trialing", trialEnd: days(-2) }), sub({ planId: "growth", status: "active", trialEnd: days(-20) }), sub({ planId: "growth", status: "trialing", trialEnd: null })];
    const t = summarizeTrials(rows, now);
    expect(t.hasData).toBe(true);
    expect(t.active).toBe(3);
    expect(t.endingSoon).toBe(1);
    expect(t.expired).toBe(1);
    expect(t.rows.map((r) => r.daysLeft)).toEqual([-2, 3, 12, null]);
  });
});

describe("past due and cancellations", () => {
  it("lists past-due and unpaid rows, the shortest grace period first", () => {
    const later = sub({ planId: "pro", status: "past_due", graceUntil: days(6) });
    const soon = sub({ planId: "starter", status: "unpaid", graceUntil: days(1) });
    const noGrace = sub({ planId: "growth", status: "past_due", graceUntil: null });
    const rows = pastDueSubscriptions([sub({ planId: "starter", status: "active" }), later, noGrace, soon]);
    expect(rows.map((r) => r.id)).toEqual([soon.id, later.id, noGrace.id]);
  });

  it("counts cancellations per window at list price and keeps scheduled cancellations apart", () => {
    const rows = [
      sub({ planId: "growth", status: "canceled", canceledAt: days(-10) }),
      sub({ planId: "starter", status: "canceled", canceledAt: days(-45), interval: "yearly" }),
      sub({ planId: "pro", status: "canceled", canceledAt: days(-120) }),
      sub({ planId: "pro", status: "active", cancelAt: days(15), canceledAt: days(-1) }),
      sub({ planId: "starter", status: "active", cancelAt: days(-1) }),
    ];
    const c = summarizeCancellations(rows, now);
    expect(c.windows).toEqual([
      { days: 30, count: 1, mrrCents: 9_000 },
      { days: 90, count: 2, mrrCents: 9_000 + 19_000 / 12 },
    ]);
    expect(c.recent.map((r) => r.planId)).toEqual(["growth", "starter"]);
    expect(c.pending.count).toBe(1);
    expect(c.pending.mrrCents).toBe(18_000);
    expect(c.pending.rows[0]!.planId).toBe("pro");
  });
});

describe("overage exposure", () => {
  it("applies the organisation's policy the way the usage guard does", () => {
    expect(effectiveOveragePolicy("allow", null, true)).toBe("allow");
    expect(effectiveOveragePolicy("cost_limit", 1_800, true)).toBe("cost_limit");
    expect(effectiveOveragePolicy("cost_limit", null, true)).toBe("pause");
    expect(effectiveOveragePolicy("cost_limit", 1_800, false)).toBe("pause");
    expect(effectiveOveragePolicy(null, null, true)).toBe("pause");
    expect(effectiveOveragePolicy("bogus", null, true)).toBe("pause");
  });

  it("prices packs above the limit and reduces them to what the policy lets the platform bill", () => {
    const rows = [
      usage({ planId: "starter", billableEvents: 750_000, overagePolicy: "allow" }),
      usage({ planId: "starter", billableEvents: 750_000, overagePolicy: "cost_limit", costLimitCents: 1_300 }),
      usage({ planId: "starter", billableEvents: 750_000, overagePolicy: "pause", hardLimitHitAt: days(-1) }),
      usage({ planId: "growth", billableEvents: 4_000_000 }),
      usage({ planId: "enterprise", billableEvents: 50_000_000, overagePolicy: "allow" }),
      usage({ planId: "starter", billableEvents: 900_000, limitEvents: 1_000_000, overagePolicy: "allow" }),
      usage({ planId: null, billableEvents: 1_000, limitEvents: 500, overagePolicy: "allow" }),
    ];
    const o = summarizeOverage(rows, "2026-09");
    expect(o.rows.map((r) => [r.planId, r.overEvents, r.packs, r.listCents, r.effectivePolicy, r.exposureCents, r.contractual])).toEqual([
      ["starter", 250_000, 3, 1_800, "allow", 1_800, false],
      ["starter", 250_000, 3, 1_800, "cost_limit", 1_200, false],
      ["starter", 250_000, 3, 1_800, "pause", 0, false],
      // no catalogue plan: the limit written by the usage job counts, but there is no pack to price
      [null, 500, 0, 0, "allow", 0, true],
    ]);
    expect(o.totalExposureCents).toBe(3_000);
    expect(o.totalListCents).toBe(5_400);
    expect(o.contractualCount).toBe(1);
    expect(o.rows[2]!.hardLimitHitAt).toEqual(days(-1));
    // Enterprise has no cap in the catalogue and no limit from the usage job: no overage at all
    expect(o.rows.some((r) => r.planId === "enterprise")).toBe(false);
    // 900k below a limit of 1M written by the usage job: no overage
    expect(o.rows.some((r) => r.billableEvents === 900_000)).toBe(false);
  });

  it("ranks organisations by billable events with the ratio to their cap", () => {
    const rows = [usage({ planId: "starter", billableEvents: 100_000 }), usage({ planId: "growth", billableEvents: 2_500_000, siteCount: 3 }), usage({ planId: "enterprise", billableEvents: 9_000_000 }), usage({ planId: "legacy", billableEvents: 5, limitEvents: 10 })];
    const top = rankUsage(rows, 3);
    expect(top.map((r) => [r.planName, r.billableEvents, r.limit, r.ratio])).toEqual([
      ["Enterprise", 9_000_000, null, null],
      ["Growth", 2_500_000, 5_000_000, 0.5],
      ["Starter", 100_000, 500_000, 0.2],
    ]);
    expect(rankUsage(rows, 10)[3]).toMatchObject({ planName: null, limit: 10, ratio: 0.5 });
  });
});

describe("revenue view", () => {
  it("composes every section from one snapshot and indexes Stripe customers by organisation", () => {
    const rows = [sub({ planId: "starter", status: "active", stripeCustomerId: "cus_A" }), sub({ planId: "growth", status: "trialing", trialEnd: days(4), stripeCustomerId: null })];
    const view = revenueView({ now, periodKey: "2026-09", subscriptions: rows, usage: [usage({ planId: "starter", billableEvents: 600_000, overagePolicy: "allow" })], ledger: { latestEventAt: null, latestProcessedAt: null, failedEvents: 0, subscriptionsUpdatedAt: null } });
    expect(view.summary.mrrCents).toBe(1_900);
    expect(view.trials.active).toBe(1);
    expect(view.pastDue).toEqual([]);
    expect(view.overage.totalExposureCents).toBe(600);
    expect(view.topUsage).toHaveLength(1);
    expect(view.customers.get("cus_A")).toEqual({ organizationId: rows[0]!.organizationId, name: rows[0]!.organizationName, slug: rows[0]!.organizationSlug });
    expect(view.customers.size).toBe(1);
  });
});

describe("Stripe helpers", () => {
  it("derives the dashboard mode from the key prefix only and builds deep links", () => {
    expect(stripeModeFromKey("sk_test_abc")).toBe("test");
    expect(stripeModeFromKey("rk_live_abc")).toBe("live");
    expect(stripeModeFromKey("")).toBeNull();
    expect(stripeModeFromKey(undefined)).toBeNull();
    expect(stripeDashboardUrl("customers", "cus_123", "test")).toBe("https://dashboard.stripe.com/test/customers/cus_123");
    expect(stripeDashboardUrl("subscriptions", "sub_123", "live")).toBe("https://dashboard.stripe.com/subscriptions/sub_123");
    expect(stripeDashboardUrl("invoices", "in_123", null)).toBe("https://dashboard.stripe.com/invoices/in_123");
    expect(stripeDashboardUrl("customers", null, "live")).toBeNull();
    expect(stripeDashboardUrl("customers", "cus_1/../x", "live")).toBeNull();
  });

  it("recognises a restricted key's 403 and summarises errors without their message", () => {
    const forbidden = { type: "StripePermissionError", statusCode: 403, code: "permission_denied", message: "The provided key does not have access to invoices" };
    expect(isStripePermissionError(forbidden)).toBe(true);
    expect(isStripePermissionError({ statusCode: 500 })).toBe(false);
    expect(isStripePermissionError(new Error("boom"))).toBe(false);
    expect(stripeErrorDetail(forbidden)).toBe("StripePermissionError:permission_denied http_403");
    expect(stripeErrorDetail(new Error("network"))).toBe("Error");
    expect(stripeErrorDetail(null)).toBe("error");
  });

  it("maps an invoice to its view and lists invoices as states instead of throwing", async () => {
    const raw = { id: "in_1", number: "A-0001", status: "open", customer: { id: "cus_1" }, amount_due: 1_900, amount_paid: 0, currency: "eur", created: 1_757_000_000, due_date: 1_758_000_000 } as unknown as Stripe.Invoice;
    expect(invoiceView(raw)).toEqual({ id: "in_1", number: "A-0001", status: "open", customerId: "cus_1", amountDueCents: 1_900, amountPaidCents: 0, currency: "eur", createdAt: new Date(1_757_000_000 * 1000), dueAt: new Date(1_758_000_000 * 1000) });
    expect(invoiceView({ ...raw, customer: "cus_2", due_date: null, number: null } as unknown as Stripe.Invoice)).toMatchObject({ customerId: "cus_2", dueAt: null, number: null });

    expect(await listStripeInvoices(null)).toEqual({ state: "not_configured" });
    const ok = { invoices: { list: vi.fn().mockResolvedValue({ data: [raw], has_more: true }) } } as unknown as Stripe;
    expect(await listStripeInvoices(ok, 5)).toMatchObject({ state: "ok", hasMore: true, invoices: [{ id: "in_1" }] });
    expect((ok.invoices.list as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([{ limit: 5 }, { timeout: 8_000, maxNetworkRetries: 0 }]);
    const denied = { invoices: { list: vi.fn().mockRejectedValue({ type: "StripePermissionError", statusCode: 403 }) } } as unknown as Stripe;
    expect(await listStripeInvoices(denied)).toEqual({ state: "forbidden", detail: "StripePermissionError http_403" });
    const down = { invoices: { list: vi.fn().mockRejectedValue({ type: "StripeConnectionError" }) } } as unknown as Stripe;
    expect(await listStripeInvoices(down)).toEqual({ state: "error", detail: "StripeConnectionError" });
  });
});

describe("CSV export", () => {
  it("quotes RFC 4180 style, keeps ISO dates and neutralises formula prefixes", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(true)).toBe("true");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell(new Date("2026-09-08T12:00:00Z"))).toBe("2026-09-08T12:00:00.000Z");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });

  it("exports subscriptions with their list-price MRR and overage rows with the period", () => {
    const rows = [sub({ planId: "growth", status: "active", interval: "yearly", organizationName: "Acme, Inc.", stripeCustomerId: "cus_9" }), sub({ planId: "growth", status: "canceled", canceledAt: days(-2) })];
    const csv = subscriptionsCsv(rows);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("organization_id,organization_slug,organization_name,plan_id,status,interval,mrr_cents,current_period_end,cancel_at,canceled_at,trial_end,grace_until,suspended_at,stripe_customer_id,stripe_subscription_id,updated_at");
    expect(lines[1]).toContain('"Acme, Inc.",growth,active,yearly,7500,');
    expect(lines[1]).toContain(",cus_9,");
    expect(lines[2]).toContain(",growth,canceled,monthly,,");
    const over = overageCsv(summarizeOverage([usage({ planId: "starter", billableEvents: 650_000, overagePolicy: "allow" })], "2026-09"));
    const overLines = over.trimEnd().split("\r\n");
    expect(overLines[0]).toBe("period,organization_id,organization_slug,organization_name,plan_id,billable_events,limit_events,over_events,pack_events,pack_price_cents,packs,list_cents,effective_policy,exposure_cents,contractual,hard_limit_hit_at");
    expect(overLines[1]).toMatch(/^2026-09,org-\d+,org-\d+,Org \d+,starter,650000,500000,150000,100000,600,2,1200,allow,1200,false,$/);
  });
});
