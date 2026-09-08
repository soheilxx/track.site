import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { newUlid } from "@track-site/core";
import { devFixturesEnabled } from "@/app/api/ai/dev-fixture/fixtures";
import { isActivePlatformRole } from "@/server/ops/platform";
import { getSession } from "@/server/session";
import { defaultDeliveryDeps, deliveryOutcomeResponse, handleDeliveryEvent } from "@/server/support/delivery";
import { RESEND_DELIVERY_EVENT_TYPES, normalizeHeaders, normalizeMessageId, parseAddress, parseAddressList, parseMessageIdList, sanitizeFileName, type DeliveryEvent, type InboundEmail } from "@/server/support/inbound";
import { FIXTURE_AUTHSERV_ID, defaultInboundDeps, handleInboundEvent, trustedAuthservIdsFromEnv } from "@/server/support/inbound-handler";
import { supportMailSettings } from "@/server/support/mail";

export const dynamic = "force-dynamic";

/**
 * Development-only simulation of the support webhooks for end-to-end tests (docs/18-support-desk.md §4
 * "Development fixture"). Guarded exactly like the Track AI fixture (`devFixturesEnabled`: dead with
 * `APP_ENV=production`, a production build under test opts in with `AI_DEV_FIXTURES=1`) and, on top, by a
 * signed-in platform operator (401 / 403 otherwise). The body describes an inbound mail (or a delivery event)
 * that runs through the real handler — ledger, routing, sanitising, attachment limits, acknowledgement (which
 * lands in `.local/mail` locally) — without Resend: bodies and attachment bytes come inline, nothing is
 * fetched. Rows are real rows in the development database; the ledger provider is `fixture`.
 */
const attachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  /** base64 bytes; the handler applies the 5 MB / 5 files / allow-list limits like for a real mail */
  contentBase64: z.string().max(8_000_000),
});

const inboundSchema = z.object({
  kind: z.literal("inbound").optional(),
  from: z.string().min(3).max(320),
  to: z.array(z.string().max(320)).max(10).optional(),
  cc: z.array(z.string().max(320)).max(10).optional(),
  subject: z.string().max(998).optional(),
  text: z.string().max(200_000).optional().nullable(),
  html: z.string().max(2_000_000).optional().nullable(),
  headers: z.record(z.string().max(200), z.string().max(4000)).optional(),
  /**
   * `true` (default) adds the `Authentication-Results` header the receiving MTA would write for a legitimate
   * mail (`dmarc=pass` on the From domain, authserv-id `FIXTURE_AUTHSERV_ID`, which this route alone trusts)
   * unless the caller supplied one — a supplied header must carry that authserv-id to count; `false` leaves
   * the mail unauthenticated — a plus-address or subject reply is then refused like a forged one, a known
   * member's address is not linked to its organisation and gets no acknowledgement (docs/18 §4 steps 6, 8, 10)
   */
  authenticated: z.boolean().optional(),
  messageId: z.string().max(998).optional().nullable(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  /** stable id → the same fixture posted twice is a duplicate, like a retried webhook */
  eventId: z.string().max(120).optional(),
  emailId: z.string().max(120).optional(),
  receivedAt: z.string().max(40).optional(),
});

const deliverySchema = z.object({
  kind: z.literal("delivery"),
  type: z.enum(RESEND_DELIVERY_EVENT_TYPES),
  /** the `provider_message_id` of the outbound message (what `sendMail` returned) */
  emailId: z.string().min(1).max(120),
  detail: z.string().max(500).optional(),
  eventId: z.string().max(120).optional(),
});

const schema = z.union([deliverySchema, inboundSchema]);

export async function POST(req: NextRequest) {
  if (!devFixturesEnabled()) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!isActivePlatformRole(session.user.platformRole)) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", issues: parsed.error.issues.map((i) => i.path.join(".") || "(root)") }, { status: 400 });
  const headers = { "cache-control": "no-store" };
  const now = new Date();

  if (parsed.data.kind === "delivery") {
    const data = parsed.data;
    const event: DeliveryEvent = {
      provider: "resend",
      providerEventId: `fixture_${data.eventId ?? newUlid()}`,
      type: data.type,
      emailId: data.emailId,
      messageId: null,
      to: [],
      createdAt: now,
      detail: data.detail ?? null,
    };
    const outcome = await handleDeliveryEvent(event, defaultDeliveryDeps());
    const { status, body } = deliveryOutcomeResponse(outcome);
    return NextResponse.json({ ...body, outcome }, { status, headers });
  }

  const data = parsed.data;
  const from = parseAddress(data.from);
  if (!from) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", issues: ["from"] }, { status: 400 });
  const mailHeaders = normalizeHeaders(data.headers ?? null);
  if (data.authenticated !== false && !mailHeaders["authentication-results"]) {
    const fromDomain = from.email.slice(from.email.lastIndexOf("@") + 1);
    mailHeaders["authentication-results"] = `${FIXTURE_AUTHSERV_ID}; dmarc=pass header.from=${fromDomain}`;
  }
  const stamp = newUlid().toLowerCase();
  const inboundDomain = supportMailSettings(null).inboundDomain;
  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : now;
  const attachments = (data.attachments ?? []).map((a) => {
    const content = Buffer.from(a.contentBase64, "base64");
    return {
      providerId: null,
      fileName: sanitizeFileName(a.fileName),
      contentType: a.contentType.split(";")[0]!.trim().toLowerCase(),
      sizeBytes: content.length,
      contentId: null,
      inline: false,
      downloadUrl: null,
      content,
    };
  });
  const email: InboundEmail = {
    provider: "resend",
    providerEventId: `fixture_${data.eventId ?? stamp}`,
    providerMessageId: data.emailId ?? `fixture-${stamp}`,
    from,
    to: parseAddressList(data.to ?? [`support@${inboundDomain}`]),
    cc: parseAddressList(data.cc ?? []),
    subject: (data.subject ?? "").replace(/[\r\n]+/g, " ").trim(),
    messageId: normalizeMessageId(data.messageId ?? mailHeaders["message-id"] ?? null) ?? `fixture.${stamp}@fixture.invalid`,
    inReplyTo: parseMessageIdList(mailHeaders["in-reply-to"])[0] ?? null,
    references: parseMessageIdList(mailHeaders.references),
    headers: mailHeaders,
    // an empty text keeps the handler from asking the receiving API for bodies
    text: data.text ?? (data.html ? null : ""),
    html: data.html ?? null,
    attachments,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? now : receivedAt,
  };
  // the fixture's own authserv-id is trusted here and nowhere else; the configured ids stay valid for hand-written headers
  const outcome = await handleInboundEvent(email, defaultInboundDeps({ receiving: null, trustedAuthservIds: [FIXTURE_AUTHSERV_ID, ...trustedAuthservIdsFromEnv()] }), { provider: "fixture" });
  const status = outcome.status === "failed" ? 500 : outcome.status === "in_progress" ? 409 : 200;
  return NextResponse.json({ ok: outcome.status !== "failed", outcome }, { status, headers });
}
