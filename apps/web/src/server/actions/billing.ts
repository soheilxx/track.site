"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findPlan, verifyStripeAmount } from "@track-site/catalog";
import { plans, recordAudit, subscriptions } from "@track-site/db";
import { env } from "@/env";
import { resolvePrice, stripe } from "@/server/billing";
import { db, logger } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

const checkoutSchema = z.object({ planId: z.string().regex(/^[a-z]{3,20}$/), interval: z.enum(["monthly", "yearly"]) });

/**
 * Starts a Stripe Checkout session for a catalogue plan; the Stripe customer id is the only identifier stored.
 * A Stripe price whose amount or currency differs from the catalogue list price is refused, never sold.
 */
export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("billing.manage");
  const parsed = checkoutSchema.safeParse({ planId: formData.get("planId"), interval: formData.get("interval") });
  if (!parsed.success) return { ok: false, error: "generic" };
  const client = stripe();
  if (!client) return { ok: false, error: "stripe_not_configured" };
  const catalogPlan = findPlan(parsed.data.planId);
  if (!catalogPlan || !catalogPlan.price || catalogPlan.contactSales) return { ok: false, error: "generic" };
  const plan = (await db().select().from(plans).where(eq(plans.id, catalogPlan.id)).limit(1))[0];
  if (!plan || !plan.isPublic || plan.contactSales) return { ok: false, error: "generic" };
  const resolved = await resolvePrice(plan.stripePriceEnv[parsed.data.interval], parsed.data.interval);
  const verified = resolved.price ? verifyStripeAmount({ planId: catalogPlan.id, interval: parsed.data.interval, unitAmount: resolved.price.unit_amount, currency: resolved.price.currency }) : null;
  if (!resolved.price || !verified?.ok) {
    const error = resolved.error ?? (verified && !verified.ok ? verified.error : "unknown");
    logger.warn({ plan: plan.id, interval: parsed.data.interval, error }, "billing.checkout_refused");
    const mismatch = typeof error === "string" && (error.startsWith("amount_mismatch") || error.startsWith("currency_mismatch"));
    return { ok: false, error: mismatch ? "price_mismatch" : error === "missing" || error === "stripe_not_configured" || error === "no_price_slot" ? "stripe_not_configured" : "generic" };
  }
  const price = resolved.price.id;
  const existing = (await db().select().from(subscriptions).where(eq(subscriptions.organizationId, ctx.organization.id)).limit(1))[0];
  const app = env().HOST_APP.replace(/\/$/, "");
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${app}/app/billing?checkout=success`,
    cancel_url: `${app}/app/billing?checkout=cancelled`,
    client_reference_id: ctx.organization.id,
    customer: existing?.stripeCustomerId ?? undefined,
    customer_email: existing?.stripeCustomerId ? undefined : ctx.user.email,
    metadata: { organization_id: ctx.organization.id, plan_id: plan.id },
    subscription_data: { metadata: { organization_id: ctx.organization.id, plan_id: plan.id } },
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
  });
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "billing.checkout_started", targetType: "organization", targetId: ctx.organization.id, diff: { plan: plan.id, interval: parsed.data.interval }, requestId: ctx.tenant.requestId }));
  if (!session.url) return { ok: false, error: "generic" };
  redirect(session.url);
}

/** Opens the Stripe customer portal (invoices, payment method, cancellation). */
export async function openPortalAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("billing.manage");
  const client = stripe();
  if (!client) return { ok: false, error: "stripe_not_configured" };
  const existing = (await db().select().from(subscriptions).where(eq(subscriptions.organizationId, ctx.organization.id)).limit(1))[0];
  if (!existing?.stripeCustomerId) return { ok: false, error: "no_customer" };
  const session = await client.billingPortal.sessions.create({ customer: existing.stripeCustomerId, return_url: `${env().HOST_APP.replace(/\/$/, "")}/app/billing` });
  redirect(session.url);
}
