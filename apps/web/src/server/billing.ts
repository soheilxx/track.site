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
