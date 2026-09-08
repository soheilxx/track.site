import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { withWorker } from "@track-site/db";
import { db, logger } from "@/server/db";
import { defaultDeliveryDeps, deliveryOutcomeResponse, handleDeliveryEvent } from "@/server/support/delivery";
import { isDeliveryEventType, parseResendDeliveryEvent, parseResendReceivedEvent, svixHeadersFrom, verifySvixSignature } from "@/server/support/inbound";
import { defaultInboundDeps, handleInboundEvent, inboundOutcomeResponse } from "@/server/support/inbound-handler";
import { fanOutAfterMutation } from "@/server/support/notifications";

export const dynamic = "force-dynamic";

/** the `email.received` event is a few KB; anything bigger is not a Resend webhook */
const MAX_BODY_BYTES = 1_000_000;

/**
 * Resend inbound webhook (docs/18-support-desk.md §4 "Inbound", §5 "DNS and Resend setup"): the raw body is
 * verified against `RESEND_WEBHOOK_SECRET` (Svix headers, ± 5 minutes, constant time) before anything is
 * parsed; `email.received` runs through `handleInboundEvent` (idempotent ledger, receiving API, routing,
 * sanitising, ticket creation / append, auto-acknowledgement). Delivery events (`email.delivered`,
 * `email.bounced`, `email.complained`, …) posted to this URL are handled too, so one Resend webhook for all
 * events is enough; other event types are acknowledged and ignored. No session, no tenant — the handler runs
 * as `tracksite_worker`. Answers: 503 without a secret, 400 for a bad signature or payload, 409 while the
 * same delivery is still being processed, 500 when processing failed (Resend retries), 200 otherwise.
 */
export async function POST(req: NextRequest) {
  const secret = env().RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, code: "NOT_CONFIGURED" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const verified = verifySvixSignature(raw, svixHeadersFrom(req.headers), secret);
  if (!verified.ok) {
    logger.warn({ reason: verified.reason }, "support.inbound.signature_invalid");
    return NextResponse.json({ ok: false, code: "SIGNATURE_INVALID" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const type = typeof json === "object" && json !== null && typeof (json as { type?: unknown }).type === "string" ? (json as { type: string }).type : "";

  if (isDeliveryEventType(type)) {
    const parsed = parseResendDeliveryEvent(json, verified.id);
    if (!parsed.ok) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", reason: parsed.reason }, { status: 400 });
    const { status, body } = deliveryOutcomeResponse(await handleDeliveryEvent(parsed.event, defaultDeliveryDeps()));
    return NextResponse.json(body, { status });
  }

  const parsed = parseResendReceivedEvent(json, verified.id);
  if (!parsed.ok) {
    if (parsed.reason === "unsupported_type") return NextResponse.json({ ok: true, ignored: true, type: parsed.detail ?? null });
    logger.warn({ reason: parsed.reason, detail: parsed.detail }, "support.inbound.invalid_payload");
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", reason: parsed.reason }, { status: 400 });
  }
  const outcome = await handleInboundEvent(parsed.email, defaultInboundDeps());
  // a stored customer mail notifies the ticket's assignee (docs/18 §"Notifications"): materialise it now, fenced —
  // as `tracksite_worker` like the handler itself (docs/03 §B8: `tracksite_ops` never outside `withPlatform(ctx, …)`);
  // the worker role holds the same privileges on the operator-only notification tables
  if (outcome.status === "processed") await fanOutAfterMutation((fn) => withWorker(db(), fn));
  const { status, body } = inboundOutcomeResponse(outcome);
  return NextResponse.json(body, { status });
}
