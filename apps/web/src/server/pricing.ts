import "server-only";
import { plans } from "@track-site/db";
import { db } from "./db";
import { priceIdFor, stripe } from "./billing";

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
  const rows = await db().select().from(plans).orderBy(plans.sortOrder);
  const client = stripe();
  const value: PublicPlan[] = [];
  for (const p of rows.filter((r) => r.isPublic)) {
    const load = async (interval: "monthly" | "yearly") => {
      const id = priceIdFor(p, interval);
      if (!id || !client) return null;
      try {
        const price = await client.prices.retrieve(id);
        return price.unit_amount != null ? { amount: price.unit_amount / 100, currency: price.currency.toUpperCase() } : null;
      } catch {
        return null;
      }
    };
    value.push({ id: p.id, name: p.name, limits: p.limits, features: p.features, contactSales: p.contactSales, monthly: await load("monthly"), yearly: await load("yearly") });
  }
  cache = { at: Date.now(), value };
  return value;
}
