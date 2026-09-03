import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripeEvents, subscriptions } from "@track-site/db";
import { env } from "@/env";
import { stripe, syncSubscription } from "@/server/billing";
import { db, logger } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook: signature-verified, idempotent (stripe_events ledger), maps subscription lifecycle
 * events to the organization's subscription row. Payment failures start a 7-day grace period.
 */
export async function POST(req: NextRequest) {
  const client = stripe();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!client || !secret) return NextResponse.json({ ok: false, code: "NOT_CONFIGURED" }, { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "stripe.signature_invalid");
    return NextResponse.json({ ok: false, code: "SIGNATURE_INVALID" }, { status: 400 });
  }
  const digest = createHash("sha256").update(raw).digest("hex");
  const seen = await db().select({ id: stripeEvents.id, processedAt: stripeEvents.processedAt }).from(stripeEvents).where(eq(stripeEvents.id, event.id)).limit(1);
  if (seen[0]?.processedAt) return NextResponse.json({ ok: true, duplicate: true });
  if (!seen[0]) await db().insert(stripeEvents).values({ id: event.id, type: event.type, apiVersion: event.api_version ?? null, organizationId: null, payloadDigest: digest }).onConflictDoNothing();

  try {
    let organizationId: string | null = null;
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        organizationId = s.client_reference_id ?? s.metadata?.organization_id ?? null;
        if (organizationId && typeof s.subscription === "string") {
          const sub = await client.subscriptions.retrieve(s.subscription);
          await syncSubscription(organizationId, sub, event.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object;
        organizationId = sub.metadata?.organization_id ?? null;
        if (!organizationId) {
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const row = (await db().select({ organizationId: subscriptions.organizationId }).from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1))[0];
          organizationId = row?.organizationId ?? null;
        }
        if (organizationId) await syncSubscription(organizationId, sub, event.id);
        break;
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (customerId) {
          const row = (await db().select({ id: subscriptions.id, organizationId: subscriptions.organizationId }).from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1))[0];
          if (row) {
            organizationId = row.organizationId;
            await db()
              .update(subscriptions)
              .set(event.type === "invoice.payment_failed" ? { status: "past_due", graceUntil: new Date(Date.now() + 7 * 86_400_000), lastStripeEventId: event.id } : { graceUntil: null, lastStripeEventId: event.id })
              .where(eq(subscriptions.id, row.id));
          }
        }
        break;
      }
      default:
        break;
    }
    await db().update(stripeEvents).set({ processedAt: new Date(), organizationId }).where(eq(stripeEvents.id, event.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().update(stripeEvents).set({ error: message.slice(0, 500) }).where(eq(stripeEvents.id, event.id));
    logger.error({ err: message, type: event.type }, "stripe.webhook_failed");
    return NextResponse.json({ ok: false, code: "PROCESSING_FAILED" }, { status: 500 });
  }
}
