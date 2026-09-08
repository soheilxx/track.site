import "server-only";
import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import {
  DEFAULT_OVERAGE_POLICY,
  TRIAL,
  findPlan,
  isOveragePolicy,
  isPlanId,
  overagePackFor,
  publicPlanOrder,
  type OveragePolicy,
} from "@track-site/catalog";
import { usagePeriodKey } from "@track-site/core";
import {
  orgSettings,
  organization,
  stripeEvents,
  subscriptions,
  usagePeriods,
  type DbOrTx,
} from "@track-site/db";

/**
 * Track Operations → Revenue (docs/17, task O4). Read side of the module: the billing ledger
 * (`subscriptions`, synced from Stripe webhooks), the usage counters of the current period and the
 * Stripe invoice list, reduced to aggregates and metadata. Nothing here touches event data.
 *
 * Money rules: MRR is computed from the tariff catalogue's list prices (`@track-site/catalog`), never
 * from Stripe amounts — a monthly subscription counts its monthly list price, a yearly one a twelfth of
 * its yearly list price. Only `active` subscriptions count; `past_due` / `unpaid` are "MRR at risk",
 * trials never count (the catalogue trial converts only through an explicit checkout). Enterprise
 * (custom price), unknown plan ids and rows without an interval are excluded and reported as such —
 * nothing is invented for them. Amounts are integer or fractional cents; format at the edge only.
 *
 * The loader takes a transaction so the page decides the role (`withPlatform`); the reducers are pure
 * and unit-tested. The Stripe client is injected: the restricted key may not read invoices (403), which
 * is reported honestly instead of being retried or hidden.
 */

// ---------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------

export type SubscriptionStatus = (typeof subscriptions.$inferSelect)["status"];

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

/** One subscription row of the ledger with its organisation's metadata (never member or end-user data). */
export interface RevenueSubscription {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  suspendedAt: Date | null;
  planId: string;
  status: SubscriptionStatus;
  interval: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  canceledAt: Date | null;
  trialEnd: Date | null;
  graceUntil: Date | null;
  updatedAt: Date;
}

/** Usage counters of one organisation for the current period, joined with plan and overage policy. */
export interface UsagePeriodRow {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  planId: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  billableEvents: number;
  acceptedEvents: number;
  siteCount: number;
  /** limit written by the usage job for this period; null = not evaluated yet or no cap */
  limitEvents: number | null;
  overagePolicy: string | null;
  costLimitCents: number | null;
  hardLimitHitAt: Date | null;
  updatedAt: Date;
}

export interface LedgerFreshness {
  /** latest Stripe webhook event received (null = none ever) */
  latestEventAt: Date | null;
  latestProcessedAt: Date | null;
  /** events whose processing failed and was not retried */
  failedEvents: number;
  /** last write to the subscriptions table */
  subscriptionsUpdatedAt: Date | null;
}

export interface RevenueSnapshot {
  now: Date;
  periodKey: string;
  subscriptions: RevenueSubscription[];
  usage: UsagePeriodRow[];
  ledger: LedgerFreshness;
}

export type PriceExclusion = "custom_price" | "unknown_plan" | "unknown_interval";

export type MonthlyPrice =
  { cents: number; reason: null } | { cents: null; reason: PriceExclusion };

export interface PlanRevenueRow {
  /** catalogue plan id, or `other` for rows whose plan id the catalogue does not know */
  planId: string;
  name: string | null;
  customPrice: boolean;
  /** all rows on the plan regardless of status */
  total: number;
  active: number;
  monthly: number;
  yearly: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  /** null for custom-priced or unknown plans */
  mrrCents: number | null;
  /** share of the total MRR (0–1); null when there is no MRR */
  share: number | null;
}

export interface SubscriptionSummary {
  mrrCents: number;
  arrCents: number;
  paying: { total: number; monthly: number; yearly: number };
  atRisk: { count: number; mrrCents: number };
  trialing: number;
  statusCounts: Record<SubscriptionStatus, number>;
  byPlan: PlanRevenueRow[];
  /** paying rows that could not be priced, by reason */
  excluded: Record<PriceExclusion, number>;
}

export interface TrialRow {
  subscription: RevenueSubscription;
  /** whole days until the trial ends; negative when it ended */
  daysLeft: number | null;
}

export interface TrialSummary {
  /** false when no row in the ledger carries a trial state — the page shows "no trial data" */
  hasData: boolean;
  catalogue: { planId: string; planName: string; days: number; cardRequired: boolean };
  active: number;
  endingSoon: number;
  expired: number;
  rows: TrialRow[];
}

export interface CancellationWindow {
  days: number;
  count: number;
  /** list-price MRR of the cancelled subscriptions (today's catalogue) */
  mrrCents: number;
}

export interface CancellationSummary {
  windows: CancellationWindow[];
  /** cancellations scheduled for a future date on subscriptions that still run */
  pending: { count: number; mrrCents: number; rows: RevenueSubscription[] };
  /** subscriptions cancelled within the longest window, newest first */
  recent: RevenueSubscription[];
}

export interface OverageRow {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  planId: string | null;
  planName: string | null;
  billableEvents: number;
  limit: number | null;
  overEvents: number;
  pack: { events: number; priceCents: number } | null;
  packs: number;
  /** packs × pack list price (what `allow` would bill) */
  listCents: number;
  /** what the organisation's overage policy actually lets the platform bill */
  exposureCents: number;
  effectivePolicy: OveragePolicy;
  /** overage without a pack (Enterprise or unknown plan): contractual, no list price */
  contractual: boolean;
  hardLimitHitAt: Date | null;
}

export interface OverageSummary {
  periodKey: string;
  rows: OverageRow[];
  totalExposureCents: number;
  totalListCents: number;
  contractualCount: number;
}

export interface UsageRankRow {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  planId: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  billableEvents: number;
  acceptedEvents: number;
  siteCount: number;
  limit: number | null;
  /** billable / limit, null without a cap */
  ratio: number | null;
}

export interface RevenueView {
  now: Date;
  periodKey: string;
  ledger: LedgerFreshness;
  summary: SubscriptionSummary;
  trials: TrialSummary;
  pastDue: RevenueSubscription[];
  cancellations: CancellationSummary;
  overage: OverageSummary;
  topUsage: UsageRankRow[];
  /** Stripe customer id → organisation, for the invoice list */
  customers: Map<string, { organizationId: string; name: string; slug: string }>;
}

// ---------------------------------------------------------------------------------------------------
// Pure reducers
// ---------------------------------------------------------------------------------------------------

export const DAY_MS = 86_400_000;
export const CANCELLATION_WINDOWS: readonly number[] = [30, 90];
export const TRIAL_ENDING_SOON_DAYS = 7;
export const TOP_USAGE_LIMIT = 10;
const AT_RISK_STATUSES: readonly SubscriptionStatus[] = ["past_due", "unpaid"];

/** Monthly list price of a plan for a billing interval, or the reason it cannot be priced. */
export function monthlyListCents(planId: string, interval: string | null): MonthlyPrice {
  const plan = findPlan(planId);
  if (!plan) return { cents: null, reason: "unknown_plan" };
  if (!plan.price) return { cents: null, reason: "custom_price" };
  if (interval === "monthly") return { cents: plan.price.monthlyCents, reason: null };
  if (interval === "yearly") return { cents: plan.price.yearlyCents / 12, reason: null };
  return { cents: null, reason: "unknown_interval" };
}

function emptyStatusCounts(): Record<SubscriptionStatus, number> {
  const out = {} as Record<SubscriptionStatus, number>;
  for (const s of SUBSCRIPTION_STATUSES) out[s] = 0;
  return out;
}

/** MRR / ARR, paying and at-risk subscriptions and the per-plan breakdown from the ledger rows. */
export function summarizeSubscriptions(rows: readonly RevenueSubscription[]): SubscriptionSummary {
  const statusCounts = emptyStatusCounts();
  const excluded: Record<PriceExclusion, number> = {
    custom_price: 0,
    unknown_plan: 0,
    unknown_interval: 0,
  };
  const plans = new Map<string, PlanRevenueRow>();
  for (const plan of publicPlanOrder()) {
    plans.set(plan.id, {
      planId: plan.id,
      name: plan.name,
      customPrice: !plan.price,
      total: 0,
      active: 0,
      monthly: 0,
      yearly: 0,
      trialing: 0,
      pastDue: 0,
      canceled: 0,
      mrrCents: plan.price ? 0 : null,
      share: null,
    });
  }
  let mrr = 0;
  let paying = 0;
  let monthly = 0;
  let yearly = 0;
  let atRiskCount = 0;
  let atRiskMrr = 0;
  let trialing = 0;
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    const key = findPlan(row.planId) ? row.planId : "other";
    let plan = plans.get(key);
    if (!plan) {
      plan = {
        planId: "other",
        name: null,
        customPrice: false,
        total: 0,
        active: 0,
        monthly: 0,
        yearly: 0,
        trialing: 0,
        pastDue: 0,
        canceled: 0,
        mrrCents: null,
        share: null,
      };
      plans.set(key, plan);
    }
    plan.total++;
    if (row.status === "trialing") {
      trialing++;
      plan.trialing++;
    }
    if (row.status === "canceled") plan.canceled++;
    if (AT_RISK_STATUSES.includes(row.status)) {
      plan.pastDue++;
      atRiskCount++;
      const price = monthlyListCents(row.planId, row.interval);
      if (price.cents != null) atRiskMrr += price.cents;
    }
    if (row.status !== "active") continue;
    paying++;
    plan.active++;
    if (row.interval === "monthly") {
      monthly++;
      plan.monthly++;
    } else if (row.interval === "yearly") {
      yearly++;
      plan.yearly++;
    }
    const price = monthlyListCents(row.planId, row.interval);
    if (price.cents == null) {
      excluded[price.reason]++;
      continue;
    }
    mrr += price.cents;
    if (plan.mrrCents != null) plan.mrrCents += price.cents;
  }
  const byPlan = [...plans.values()].filter((p) => p.planId !== "other" || p.total > 0);
  for (const plan of byPlan)
    plan.share = mrr > 0 && plan.mrrCents != null ? plan.mrrCents / mrr : null;
  return {
    mrrCents: mrr,
    arrCents: mrr * 12,
    paying: { total: paying, monthly, yearly },
    atRisk: { count: atRiskCount, mrrCents: atRiskMrr },
    trialing,
    statusCounts,
    byPlan,
    excluded,
  };
}

/** Trials from the ledger: only rows that carry a trial state; the catalogue's trial terms for context. */
export function summarizeTrials(rows: readonly RevenueSubscription[], now: Date): TrialSummary {
  const catalogue = {
    planId: TRIAL.planId,
    planName: findPlan(TRIAL.planId)?.name ?? TRIAL.planId,
    days: TRIAL.days,
    cardRequired: TRIAL.cardRequired,
  };
  const trialRows = rows.filter((r) => r.status === "trialing" || r.trialEnd != null);
  const active: TrialRow[] = [];
  let endingSoon = 0;
  let expired = 0;
  for (const subscription of trialRows) {
    if (subscription.status !== "trialing") continue;
    const daysLeft = subscription.trialEnd
      ? Math.ceil((subscription.trialEnd.getTime() - now.getTime()) / DAY_MS)
      : null;
    if (daysLeft != null && daysLeft < 0) expired++;
    else if (daysLeft != null && daysLeft <= TRIAL_ENDING_SOON_DAYS) endingSoon++;
    active.push({ subscription, daysLeft });
  }
  active.sort(
    (a, b) =>
      (a.subscription.trialEnd?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.subscription.trialEnd?.getTime() ?? Number.MAX_SAFE_INTEGER),
  );
  return {
    hasData: trialRows.length > 0,
    catalogue,
    active: active.length - expired,
    endingSoon,
    expired,
    rows: active,
  };
}

/** Subscriptions whose payment failed (`past_due`, `unpaid`), the ones whose grace period ends first on top. */
export function pastDueSubscriptions(rows: readonly RevenueSubscription[]): RevenueSubscription[] {
  const far = Number.MAX_SAFE_INTEGER;
  return rows
    .filter((r) => AT_RISK_STATUSES.includes(r.status))
    .sort(
      (a, b) =>
        (a.graceUntil?.getTime() ?? far) - (b.graceUntil?.getTime() ?? far) ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
}

/**
 * Cancellations. `canceled_at` is Stripe's timestamp of the cancellation request (also set when a
 * cancellation is scheduled for the period end), so a window counts subscriptions that are `canceled`
 * and were requested inside it; scheduled cancellations on running subscriptions are listed separately.
 */
export function summarizeCancellations(
  rows: readonly RevenueSubscription[],
  now: Date,
  windows: readonly number[] = CANCELLATION_WINDOWS,
): CancellationSummary {
  const nowMs = now.getTime();
  const priced = (r: RevenueSubscription) => monthlyListCents(r.planId, r.interval).cents ?? 0;
  const canceled = rows.filter(
    (r) => r.status === "canceled" && r.canceledAt != null && r.canceledAt.getTime() <= nowMs,
  );
  const result: CancellationWindow[] = windows.map((days) => {
    const since = nowMs - days * DAY_MS;
    const inWindow = canceled.filter((r) => r.canceledAt!.getTime() > since);
    return {
      days,
      count: inWindow.length,
      mrrCents: inWindow.reduce((sum, r) => sum + priced(r), 0),
    };
  });
  const longest = Math.max(0, ...windows);
  const recent = canceled
    .filter((r) => r.canceledAt!.getTime() > nowMs - longest * DAY_MS)
    .sort((a, b) => b.canceledAt!.getTime() - a.canceledAt!.getTime());
  const pendingRows = rows
    .filter((r) => r.status !== "canceled" && r.cancelAt != null && r.cancelAt.getTime() > nowMs)
    .sort((a, b) => a.cancelAt!.getTime() - b.cancelAt!.getTime());
  return {
    windows: result,
    pending: {
      count: pendingRows.length,
      mrrCents: pendingRows.reduce((sum, r) => sum + priced(r), 0),
      rows: pendingRows,
    },
    recent,
  };
}

/** The policy that actually applies: `cost_limit` without an amount or without a pack behaves like `pause` (mirrors the usage guard). */
export function effectiveOveragePolicy(
  policy: string | null,
  costLimitCents: number | null,
  hasPack: boolean,
): OveragePolicy {
  const chosen = isOveragePolicy(policy) ? policy : DEFAULT_OVERAGE_POLICY;
  if (chosen === "cost_limit" && (costLimitCents == null || !hasPack)) return "pause";
  return chosen;
}

/**
 * Overage exposure of the current period: events above the plan limit in packs at list price, reduced
 * to what the organisation's policy lets the platform bill (`allow`: every pack; `cost_limit`: packs
 * within the limit; `pause`: nothing — processing pauses after the grace window). Enterprise overage
 * is contractual and carries no amount.
 */
export function summarizeOverage(
  rows: readonly UsagePeriodRow[],
  periodKey: string,
): OverageSummary {
  const out: OverageRow[] = [];
  for (const row of rows) {
    const plan = row.planId ? findPlan(row.planId) : null;
    const limit = row.limitEvents ?? plan?.limits.eventsPerMonth ?? null;
    const overEvents = limit == null ? 0 : Math.max(0, row.billableEvents - limit);
    if (overEvents <= 0) continue;
    const pack = row.planId && isPlanId(row.planId) ? overagePackFor(row.planId) : null;
    const packs = pack ? Math.ceil(overEvents / pack.events) : 0;
    const listCents = pack ? packs * pack.priceCents : 0;
    const effectivePolicy = effectiveOveragePolicy(
      row.overagePolicy,
      row.costLimitCents,
      pack != null,
    );
    let exposureCents = 0;
    if (pack && effectivePolicy === "allow") exposureCents = listCents;
    else if (pack && effectivePolicy === "cost_limit")
      exposureCents =
        Math.min(packs, Math.floor((row.costLimitCents ?? 0) / pack.priceCents)) * pack.priceCents;
    out.push({
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationSlug: row.organizationSlug,
      planId: row.planId,
      planName: plan?.name ?? null,
      billableEvents: row.billableEvents,
      limit,
      overEvents,
      pack: pack ? { events: pack.events, priceCents: pack.priceCents } : null,
      packs,
      listCents,
      exposureCents,
      effectivePolicy,
      contractual: pack == null,
      hardLimitHitAt: row.hardLimitHitAt,
    });
  }
  out.sort(
    (a, b) =>
      b.exposureCents - a.exposureCents || b.listCents - a.listCents || b.overEvents - a.overEvents,
  );
  return {
    periodKey,
    rows: out,
    totalExposureCents: out.reduce((sum, r) => sum + r.exposureCents, 0),
    totalListCents: out.reduce((sum, r) => sum + r.listCents, 0),
    contractualCount: out.filter((r) => r.contractual).length,
  };
}

/** Organisations ranked by billable events of the period (the plan limit for context). */
export function rankUsage(
  rows: readonly UsagePeriodRow[],
  limit = TOP_USAGE_LIMIT,
): UsageRankRow[] {
  return [...rows]
    .sort((a, b) => b.billableEvents - a.billableEvents || b.acceptedEvents - a.acceptedEvents)
    .slice(0, limit)
    .map((row) => {
      const plan = row.planId ? findPlan(row.planId) : null;
      const cap = row.limitEvents ?? plan?.limits.eventsPerMonth ?? null;
      return {
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        organizationSlug: row.organizationSlug,
        planId: row.planId,
        planName: plan?.name ?? null,
        subscriptionStatus: row.subscriptionStatus,
        billableEvents: row.billableEvents,
        acceptedEvents: row.acceptedEvents,
        siteCount: row.siteCount,
        limit: cap,
        ratio: cap != null && cap > 0 ? row.billableEvents / cap : null,
      };
    });
}

/** Everything the page renders, from one snapshot. */
export function revenueView(snapshot: RevenueSnapshot): RevenueView {
  const customers = new Map<string, { organizationId: string; name: string; slug: string }>();
  for (const s of snapshot.subscriptions)
    if (s.stripeCustomerId)
      customers.set(s.stripeCustomerId, {
        organizationId: s.organizationId,
        name: s.organizationName,
        slug: s.organizationSlug,
      });
  return {
    now: snapshot.now,
    periodKey: snapshot.periodKey,
    ledger: snapshot.ledger,
    summary: summarizeSubscriptions(snapshot.subscriptions),
    trials: summarizeTrials(snapshot.subscriptions, snapshot.now),
    pastDue: pastDueSubscriptions(snapshot.subscriptions),
    cancellations: summarizeCancellations(snapshot.subscriptions, snapshot.now),
    overage: summarizeOverage(snapshot.usage, snapshot.periodKey),
    topUsage: rankUsage(snapshot.usage),
    customers,
  };
}

// ---------------------------------------------------------------------------------------------------
// Stripe: dashboard links and the invoice list
// ---------------------------------------------------------------------------------------------------

export type StripeMode = "test" | "live";
export type StripeObjectKind = "customers" | "subscriptions" | "invoices";

/** Mode of the configured key from its prefix only (`sk_test_`, `rk_live_`, …); the value itself never leaves the server. */
export function stripeModeFromKey(key: string | null | undefined): StripeMode | null {
  if (!key) return null;
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}

const STRIPE_ID = /^[A-Za-z0-9_]{1,255}$/;

/** Deep link into the Stripe dashboard (test-mode links carry the `/test` segment); null for an id that is not a Stripe id. */
export function stripeDashboardUrl(
  kind: StripeObjectKind,
  id: string | null | undefined,
  mode: StripeMode | null,
): string | null {
  if (!id || !STRIPE_ID.test(id)) return null;
  return `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}${kind}/${id}`;
}

export interface InvoiceView {
  id: string;
  number: string | null;
  status: string | null;
  customerId: string | null;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: Date;
  dueAt: Date | null;
}

export type InvoiceListing =
  | { state: "ok"; invoices: InvoiceView[]; hasMore: boolean }
  | { state: "not_configured" }
  | { state: "forbidden"; detail: string }
  | { state: "error"; detail: string };

/** Stripe errors carry type/code/status; the message is left out (it may name ids, never needed on the page). */
export function stripeErrorDetail(err: unknown): string {
  const s = err as { type?: unknown; code?: unknown; statusCode?: unknown; name?: unknown };
  const type =
    typeof s?.type === "string" ? s.type : typeof s?.name === "string" ? s.name : "error";
  const code = typeof s?.code === "string" ? `:${s.code}` : "";
  const status = typeof s?.statusCode === "number" ? ` http_${s.statusCode}` : "";
  return `${type}${code}${status}`;
}

/** A restricted key without the Invoices permission answers 403 (`StripePermissionError`). */
export function isStripePermissionError(err: unknown): boolean {
  const s = err as { type?: unknown; statusCode?: unknown };
  return s?.statusCode === 403 || s?.type === "StripePermissionError";
}

export function invoiceView(invoice: Stripe.Invoice): InvoiceView {
  const customer = invoice.customer;
  return {
    id: invoice.id,
    number: invoice.number ?? null,
    status: invoice.status ?? null,
    customerId: typeof customer === "string" ? customer : (customer?.id ?? null),
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    currency: invoice.currency,
    createdAt: new Date(invoice.created * 1000),
    dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
  };
}

/**
 * The most recent invoices from Stripe. Errors come back as states, never thrown: a restricted key
 * without invoice access yields `forbidden` (the page says so), anything else `error` with type/code/status.
 */
export async function listStripeInvoices(
  client: Stripe | null,
  limit = 20,
): Promise<InvoiceListing> {
  if (!client) return { state: "not_configured" };
  try {
    const page = await client.invoices.list({ limit }, { timeout: 8_000, maxNetworkRetries: 0 });
    return { state: "ok", invoices: page.data.map(invoiceView), hasMore: page.has_more };
  } catch (err) {
    const detail = stripeErrorDetail(err);
    return isStripePermissionError(err)
      ? { state: "forbidden", detail }
      : { state: "error", detail };
  }
}

// ---------------------------------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------------------------------

/** RFC 4180 cell; values that a spreadsheet would treat as a formula are prefixed with an apostrophe. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "number"
        ? String(value)
        : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== "number") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const SUBSCRIPTIONS_CSV_HEADER = [
  "organization_id",
  "organization_slug",
  "organization_name",
  "plan_id",
  "status",
  "interval",
  "mrr_cents",
  "current_period_end",
  "cancel_at",
  "canceled_at",
  "trial_end",
  "grace_until",
  "suspended_at",
  "stripe_customer_id",
  "stripe_subscription_id",
  "updated_at",
] as const;

export function subscriptionsCsv(rows: readonly RevenueSubscription[]): string {
  return toCsv(
    SUBSCRIPTIONS_CSV_HEADER,
    rows.map((r) => {
      const price = r.status === "active" ? monthlyListCents(r.planId, r.interval).cents : null;
      return [
        r.organizationId,
        r.organizationSlug,
        r.organizationName,
        r.planId,
        r.status,
        r.interval,
        price == null ? null : Math.round(price),
        r.currentPeriodEnd,
        r.cancelAt,
        r.canceledAt,
        r.trialEnd,
        r.graceUntil,
        r.suspendedAt,
        r.stripeCustomerId,
        r.stripeSubscriptionId,
        r.updatedAt,
      ];
    }),
  );
}

export const OVERAGE_CSV_HEADER = [
  "period",
  "organization_id",
  "organization_slug",
  "organization_name",
  "plan_id",
  "billable_events",
  "limit_events",
  "over_events",
  "pack_events",
  "pack_price_cents",
  "packs",
  "list_cents",
  "effective_policy",
  "exposure_cents",
  "contractual",
  "hard_limit_hit_at",
] as const;

export function overageCsv(summary: OverageSummary): string {
  return toCsv(
    OVERAGE_CSV_HEADER,
    summary.rows.map((r) => [
      summary.periodKey,
      r.organizationId,
      r.organizationSlug,
      r.organizationName,
      r.planId,
      r.billableEvents,
      r.limit,
      r.overEvents,
      r.pack?.events ?? null,
      r.pack?.priceCents ?? null,
      r.packs,
      r.listCents,
      r.effectivePolicy,
      r.exposureCents,
      r.contractual,
      r.hardLimitHitAt,
    ]),
  );
}

// ---------------------------------------------------------------------------------------------------
// Loader (runs inside the caller's transaction — `withPlatform` on the page and the export route)
// ---------------------------------------------------------------------------------------------------

export async function loadRevenueSnapshot(tx: DbOrTx, now = new Date()): Promise<RevenueSnapshot> {
  const periodKey = usagePeriodKey(now);
  // sequential on purpose: the four reads share the transaction's single `pg` client, which rejects
  // overlapping queries (deprecated in pg 8, removed in pg 9)
  const subs = await tx
    .select({
      id: subscriptions.id,
      organizationId: subscriptions.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      suspendedAt: organization.suspendedAt,
      planId: subscriptions.planId,
      status: subscriptions.status,
      interval: subscriptions.interval,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAt: subscriptions.cancelAt,
      canceledAt: subscriptions.canceledAt,
      trialEnd: subscriptions.trialEnd,
      graceUntil: subscriptions.graceUntil,
      updatedAt: subscriptions.updatedAt,
    })
    .from(subscriptions)
    .innerJoin(organization, eq(organization.id, subscriptions.organizationId))
    .orderBy(desc(subscriptions.updatedAt));
  const usage = await tx
    .select({
      organizationId: usagePeriods.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      planId: subscriptions.planId,
      subscriptionStatus: subscriptions.status,
      billableEvents: usagePeriods.billableEvents,
      acceptedEvents: usagePeriods.acceptedEvents,
      siteCount: usagePeriods.siteCount,
      limitEvents: usagePeriods.limitEvents,
      overagePolicy: orgSettings.usageOveragePolicy,
      costLimitCents: orgSettings.usageCostLimitCents,
      hardLimitHitAt: usagePeriods.hardLimitHitAt,
      updatedAt: usagePeriods.updatedAt,
    })
    .from(usagePeriods)
    .innerJoin(organization, eq(organization.id, usagePeriods.organizationId))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, usagePeriods.organizationId))
    .leftJoin(orgSettings, eq(orgSettings.organizationId, usagePeriods.organizationId))
    .where(eq(usagePeriods.periodKey, periodKey))
    .orderBy(desc(usagePeriods.billableEvents));
  const ledger = await tx
    .select({
      latestEventAt: sql<Date | null>`max(${stripeEvents.receivedAt})`,
      latestProcessedAt: sql<Date | null>`max(${stripeEvents.processedAt})`,
      failedEvents:
        sql<number>`count(*) filter (where ${isNotNull(stripeEvents.error)} and ${isNull(stripeEvents.processedAt)})`.mapWith(
          Number,
        ),
    })
    .from(stripeEvents);
  const subsUpdated = await tx
    .select({ updatedAt: sql<Date | null>`max(${subscriptions.updatedAt})` })
    .from(subscriptions);
  const asDate = (v: unknown): Date | null =>
    v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;
  return {
    now,
    periodKey,
    subscriptions: subs.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      organizationSlug: r.organizationSlug,
      suspendedAt: r.suspendedAt,
      planId: r.planId,
      status: r.status,
      interval: r.interval,
      stripeCustomerId: r.stripeCustomerId,
      stripeSubscriptionId: r.stripeSubscriptionId,
      currentPeriodEnd: r.currentPeriodEnd,
      cancelAt: r.cancelAt,
      canceledAt: r.canceledAt,
      trialEnd: r.trialEnd,
      graceUntil: r.graceUntil,
      updatedAt: r.updatedAt,
    })),
    usage: usage.map((r) => ({
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      organizationSlug: r.organizationSlug,
      planId: r.planId,
      subscriptionStatus: r.subscriptionStatus,
      billableEvents: Number(r.billableEvents),
      acceptedEvents: Number(r.acceptedEvents),
      siteCount: r.siteCount,
      limitEvents: r.limitEvents == null ? null : Number(r.limitEvents),
      overagePolicy: r.overagePolicy,
      costLimitCents: r.costLimitCents == null ? null : Number(r.costLimitCents),
      hardLimitHitAt: r.hardLimitHitAt,
      updatedAt: r.updatedAt,
    })),
    ledger: {
      latestEventAt: asDate(ledger[0]?.latestEventAt),
      latestProcessedAt: asDate(ledger[0]?.latestProcessedAt),
      failedEvents: ledger[0]?.failedEvents ?? 0,
      subscriptionsUpdatedAt: asDate(subsUpdated[0]?.updatedAt),
    },
  };
}
