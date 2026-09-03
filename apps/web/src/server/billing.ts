import "server-only";
import { desc, eq } from "drizzle-orm";
import Stripe from "stripe";
import { plans, subscriptions, usagePeriods } from "@track-site/db";
import { env } from "@/env";
import { db } from "./db";

/** Stripe client (secret key from the environment only; never persisted). */
export function stripe(): Stripe | null {
  const key = env().STRIPE_SECRET_KEY;
  // no apiVersion override: the SDK pins its own version (2026-08-26.dahlia for stripe 20.x); a mistyped override made every call fail with "Invalid Stripe API version"
  return key ? new Stripe(key) : null;
}

export function priceIdFor(plan: { stripePriceEnv: { monthly: string | null; yearly: string | null } }, interval: "monthly" | "yearly"): string | null {
  const name = plan.stripePriceEnv[interval];
  if (!name) return null;
  return (env() as unknown as Record<string, string | undefined>)[name] ?? null;
}

type PriceInterval = "monthly" | "yearly";
export type ResolvedPrice = { price: Stripe.Price | null; error: string | null };
const priceCache = new Map<string, { at: number; value: ResolvedPrice }>();

/** Stripe errors carry type/code/status; the message may name a price or product id (not a secret). */
export function stripeErrorText(err: unknown): string {
  const s = err as { type?: string; code?: string; statusCode?: number; message?: string };
  return `${s.type ?? "error"}${s.code ? `:${s.code}` : ""}${s.statusCode ? ` http_${s.statusCode}` : ""} ${(s.message ?? "").slice(0, 120)}`.trim();
}

/**
 * Resolves a `STRIPE_PRICE_*` value to a Stripe price. The value is a price id (`price_…`) or a product id
 * (`prod_…`: the product's single active recurring price with the slot's interval is used). Cached 10 minutes.
 * Errors come back as text, never thrown, so pages and health show an honest state.
 */
export async function resolvePrice(envName: string | null, interval: PriceInterval): Promise<ResolvedPrice> {
  if (!envName) return { price: null, error: "no_price_slot" };
  const value = (env() as unknown as Record<string, string | undefined>)[envName];
  if (!value) return { price: null, error: "missing" };
  const client = stripe();
  if (!client) return { price: null, error: "stripe_not_configured" };
  const key = `${value}:${interval}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const opts = { timeout: 8_000, maxNetworkRetries: 0 };
  let resolved: ResolvedPrice;
  try {
    if (value.startsWith("price_")) {
      resolved = { price: await client.prices.retrieve(value, undefined, opts), error: null };
    } else if (value.startsWith("prod_")) {
      const want = interval === "monthly" ? "month" : "year";
      const list = await client.prices.list({ product: value, active: true, type: "recurring", limit: 100 }, opts);
      const matches = list.data.filter((p) => p.recurring?.interval === want && (p.recurring.interval_count ?? 1) === 1);
      resolved = matches.length === 1 ? { price: matches[0]!, error: null } : { price: null, error: matches.length ? `ambiguous_product_prices:${matches.length}` : `no_active_${interval}_price_on_product` };
    } else {
      resolved = { price: null, error: "unrecognised_id" };
    }
  } catch (err) {
    resolved = { price: null, error: stripeErrorText(err) };
  }
  priceCache.set(key, { at: Date.now(), value: resolved });
  return resolved;
}

export function periodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function billingOverview(organizationId: string) {
  const [allPlans, sub, usage] = await Promise.all([
    db().select().from(plans).orderBy(plans.sortOrder),
    db().select().from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1),
    db().select().from(usagePeriods).where(eq(usagePeriods.organizationId, organizationId)).orderBy(desc(usagePeriods.periodKey)).limit(6),
  ]);
  return { plans: allPlans, subscription: sub[0] ?? null, usage, currentPeriod: periodKey() };
}

/** Applies a Stripe subscription object to our subscription row (idempotent; called from webhooks). */
export async function syncSubscription(organizationId: string, s: Stripe.Subscription, eventId: string): Promise<void> {
  const item = s.items.data[0];
  const priceId = item?.price.id ?? null;
  const allPlans = await db().select().from(plans);
  const e = env() as unknown as Record<string, string | undefined>;
  const plan = allPlans.find((p) => [p.stripePriceEnv.monthly, p.stripePriceEnv.yearly].some((n) => n && e[n] === priceId)) ?? allPlans.find((p) => p.id === "starter");
  if (!plan) return;
  const status = (["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const).find((x) => x === s.status) ?? "none";
  const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000) : null;
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
  const values: typeof subscriptions.$inferInsert = {
    organizationId,
    planId: plan.id,
    stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    stripeSubscriptionId: s.id,
    status,
    interval: item?.price.recurring?.interval === "year" ? "yearly" : "monthly",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAt: s.cancel_at ? new Date(s.cancel_at * 1000) : null,
    canceledAt: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
    trialEnd: s.trial_end ? new Date(s.trial_end * 1000) : null,
    graceUntil: status === "past_due" ? new Date(Date.now() + 7 * 86_400_000) : null,
    lastStripeEventId: eventId,
  };
  const existing = await db().select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
  if (existing[0]) await db().update(subscriptions).set(values).where(eq(subscriptions.id, existing[0].id));
  else await db().insert(subscriptions).values(values);
}
