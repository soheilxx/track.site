import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/server/db";
import { defaultDeliveryDeps, deliveryOutcomeResponse, deliveryWebhookSecret, handleDeliveryEvent } from "@/server/support/delivery";
import { parseResendDeliveryEvent, svixHeadersFrom, verifySvixSignature } from "@/server/support/inbound";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256_000;

/**
 * Resend delivery webhook for ticket mails (docs/18-support-desk.md §4 "Delivery events"): `email.sent`,
 * `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`,
 * `email.suppressed` → `support_messages.delivery_status` by `provider_message_id`; a complaint flags the
 * requester `do-not-email`. Verified against `RESEND_DELIVERY_WEBHOOK_SECRET` (a second Resend webhook) or,
 * when one webhook posts every event to `/api/support/inbound`, the shared `RESEND_WEBHOOK_SECRET` — that
 * route handles delivery events as well, this one exists for a split setup. Events of mails that are no
 * ticket mail are acknowledged and recorded as `ignored`.
 */
export async function POST(req: NextRequest) {
  const secret = deliveryWebhookSecret();
  if (!secret) return NextResponse.json({ ok: false, code: "NOT_CONFIGURED" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const verified = verifySvixSignature(raw, svixHeadersFrom(req.headers), secret);
  if (!verified.ok) {
    logger.warn({ reason: verified.reason }, "support.delivery.signature_invalid");
    return NextResponse.json({ ok: false, code: "SIGNATURE_INVALID" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = parseResendDeliveryEvent(json, verified.id);
  if (!parsed.ok) {
    if (parsed.reason === "unsupported_type") return NextResponse.json({ ok: true, ignored: true, type: parsed.detail ?? null });
    logger.warn({ reason: parsed.reason, detail: parsed.detail }, "support.delivery.invalid_payload");
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", reason: parsed.reason }, { status: 400 });
  }
  const { status, body } = deliveryOutcomeResponse(await handleDeliveryEvent(parsed.event, defaultDeliveryDeps()));
  return NextResponse.json(body, { status });
}
