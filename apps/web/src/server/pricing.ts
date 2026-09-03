import "server-only";
import { plans } from "@track-site/db";
import { db, logger } from "./db";
import { resolvePrice, stripe } from "./billing";

export interface PublicPlan {
  id: string;
  name: string;
  limits: { sites: number; eventsPerMonth: number; destinations: number; retentionDays: number; teamMembers: number; serverSide: boolean; exports: boolean; sso: boolean };
  features: string[];
  contactSales: boolean;
  /** null when the Stripe price is not configured — the UI shows an honest state instead of a fake price */
  monthly: { amount: number; currency: string } | null;
  yearly: { amount: number; currency: string } | null;
}

let cache: { at: number; value: PublicPlan[] } | null = null;

/** Public plans with real Stripe prices (cached 10 minutes). Limits come from the database, prices only from Stripe. */
export async function publicPlans(): Promise<PublicPlan[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.value;
  let rows: (typeof plans.$inferSelect)[];
  try {
    rows = await db().select().from(plans).orderBy(plans.sortOrder);
  } catch (e) {
    // no database configured or reachable: publish no plans rather than failing the page (the UI shows an honest state)
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "public plans unavailable");
    return [];
  }
  const client = stripe();
  const value: PublicPlan[] = [];
  for (const p of rows.filter((r) => r.isPublic)) {
    const load = async (interval: "monthly" | "yearly") => {
      const name = p.stripePriceEnv[interval];
      if (!name || !client) return null;
      const { price, error } = await resolvePrice(name, interval);
      if (!price) {
        if (error !== "missing") logger.warn({ plan: p.id, interval, error }, "stripe price lookup failed");
        return null;
      }
      return price.unit_amount != null ? { amount: price.unit_amount / 100, currency: price.currency.toUpperCase() } : null;
    };
    value.push({ id: p.id, name: p.name, limits: p.limits, features: p.features, contactSales: p.contactSales, monthly: await load("monthly"), yearly: await load("yearly") });
  }
  cache = { at: Date.now(), value };
  return value;
}
