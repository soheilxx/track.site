import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_PER_MESSAGE, type SupportDeliveryStatus } from "@track-site/db";
import { ALL_LOCALES, isKnownLocale, type AppLocale } from "@/i18n/routing";

/**
 * Inbound e-mail helpers of the support desk (docs/18-support-desk.md §"E-mail flow"). Pure functions —
 * no database, no environment — so the webhook route and the unit tests share one implementation:
 *
 * 1. `verifySvixSignature`: Resend signs webhooks the Svix way (`svix-id`, `svix-timestamp`,
 *    `svix-signature`; HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 secret after `whsec_`,
 *    base64 signature, five-minute tolerance). Nothing is parsed before the signature is good.
 * 2. `parseResendReceivedEvent`: the `email.received` payload → `InboundEmail` (addresses, threading ids,
 *    headers lower-cased, attachment metadata). Bodies and bytes are fetched by the route through the
 *    Resend receiving API and pass through `sanitizeHtml` / `screenAttachments` before anything is stored.
 * 3. `routeInbound`: plus address `support+t<number>@<inbound_domain>` → In-Reply-To / References against
 *    stored message ids → subject tag `[Track #<number>]` → otherwise a new ticket.
 * 4. `detectAutoReply`: Auto-Submitted, Precedence bulk/junk/auto_reply/list, X-Autoreply & co., list
 *    headers and out-of-office subjects — such mails never trigger an automatic answer (loop prevention).
 * 5. `sanitizeHtml`: allow-list sanitiser for inbound HTML (no scripts, styles, forms, event handlers or
 *    remote images; links limited to http(s)/mailto/tel with `rel="noopener noreferrer nofollow"`).
 * 6. `screenAttachments`: ≤ 5 per message, ≤ 5 MB each, allow-listed content types; `AttachmentScanner` is
 *    the virus-scan hook (a no-op placeholder until a scanner is wired in).
 * 7. `createResendReceivingClient` / `mergeReceivedEmail`: the event carries ids only — bodies, headers and
 *    attachment links come from Resend's receiving API (task T3).
 * 8. `trustedAuthenticationResults` / `spamVerdict` / `senderAuthentication`: SPF / DKIM / DMARC results read
 *    from the receiving MTA's `Authentication-Results` only (first instance, authserv-id pinned to
 *    `SUPPORT_AUTHSERV_ID`; `ARC-Authentication-Results` is never read), spam flags and the blocked-sender
 *    decision of the desk (task T3).
 * 9. `detectInboundLocale`: stored user locale → language headers → a conservative text heuristic → English.
 * 10. `parseResendDeliveryEvent` / `nextDeliveryStatus`: delivery webhooks (`email.delivered|bounced|…`)
 *     → `support_messages.delivery_status` without ever downgrading a terminal state.
 */

// ---------------------------------------------------------------------------------------------------
// 1. Svix-style signature verification
// ---------------------------------------------------------------------------------------------------

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type SvixFailure = "missing_headers" | "invalid_secret" | "timestamp_invalid" | "timestamp_out_of_tolerance" | "signature_mismatch";

export type SvixVerification = { ok: true; id: string; timestamp: Date } | { ok: false; reason: SvixFailure };

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function readHeader(source: HeaderSource, name: string): string | null {
  if (typeof (source as Headers).get === "function") return (source as Headers).get(name);
  const record = source as Record<string, string | string[] | undefined>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? record[key] : undefined;
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

/** Reads the Svix headers (Resend) or their Standard-Webhooks aliases (`webhook-*`). */
export function svixHeadersFrom(source: HeaderSource): SvixHeaders {
  return {
    id: readHeader(source, "svix-id") ?? readHeader(source, "webhook-id"),
    timestamp: readHeader(source, "svix-timestamp") ?? readHeader(source, "webhook-timestamp"),
    signature: readHeader(source, "svix-signature") ?? readHeader(source, "webhook-signature"),
  };
}

function secretBytes(secret: string): Buffer | null {
  const raw = secret.trim().replace(/^whsec_/, "");
  if (!raw) return null;
  try {
    const bytes = Buffer.from(raw, "base64");
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

/** Signature value (`v1,<base64>`) for a payload — the test helper mirrors what Resend/Svix send. */
export function signSvix(payload: string, id: string, timestamp: string | number, secret: string): string {
  const key = secretBytes(secret);
  if (!key) throw new Error("invalid webhook secret");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return `v1,${mac}`;
}

/**
 * Verifies a Resend webhook delivery. `payload` must be the raw request body exactly as received (no
 * re-serialisation). Rejects missing headers, a malformed secret, timestamps outside ± tolerance and a
 * signature that matches none of the `v1` entries (comparison in constant time).
 */
export function verifySvixSignature(
  payload: string,
  headers: SvixHeaders,
  secret: string | null | undefined,
  options: { now?: Date; toleranceSeconds?: number } = {},
): SvixVerification {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing_headers" };
  const key = secret ? secretBytes(secret) : null;
  if (!key) return { ok: false, reason: "invalid_secret" };
  if (!/^\d{1,12}$/.test(headers.timestamp.trim())) return { ok: false, reason: "timestamp_invalid" };
  const ts = Number(headers.timestamp.trim());
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const tolerance = options.toleranceSeconds ?? SVIX_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };
  const expected = createHmac("sha256", key).update(`${headers.id}.${ts}.${payload}`).digest();
  const candidates = headers.signature
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice(3));
  for (const candidate of candidates) {
    let given: Buffer;
    try {
      given = Buffer.from(candidate, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ok: true, id: headers.id, timestamp: new Date(ts * 1000) };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}

// ---------------------------------------------------------------------------------------------------
// 2. Addresses, headers, message ids, the Resend event
// ---------------------------------------------------------------------------------------------------

export interface InboundAddress {
  email: string;
  name: string | null;
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** `"Ada Lovelace" <ada@example.com>`, `ada@example.com`, `Ada <ada@example.com>` → lower-cased address + name. */
export function parseAddress(value: string): InboundAddress | null {
  const raw = value.trim();
  if (!raw) return null;
  const bracket = raw.match(/^(.*?)<\s*([^<>\s]+)\s*>\s*$/);
  if (bracket) {
    const email = bracket[2]!.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return null;
    const name = bracket[1]!.trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim();
    return { email, name: name || null };
  }
  const email = raw.toLowerCase();
  return EMAIL_RE.test(email) ? { email, name: null } : null;
}

/** Comma-separated string or list → addresses; unparsable entries are dropped, duplicates collapsed. */
export function parseAddressList(value: string | string[] | null | undefined): InboundAddress[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : splitAddresses(value);
  const seen = new Set<string>();
  const out: InboundAddress[] = [];
  for (const part of parts) {
    const parsed = parseAddress(part);
    if (parsed && !seen.has(parsed.email)) {
      seen.add(parsed.email);
      out.push(parsed);
    }
  }
  return out;
}

/** Splits on commas outside quotes and angle brackets. */
function splitAddresses(value: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  let depth = 0;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") depth++;
    else if (!quoted && ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && !quoted && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

/** `<abc@host>` → `abc@host` (angle brackets and every whitespace removed — a msg-id never contains any, and the value is echoed into outbound headers); empty → null. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, "").replace(/^<+/, "").replace(/>+$/, "");
  return trimmed.length ? trimmed : null;
}

/** `References` / `In-Reply-To` header → list of ids without angle brackets, in order, deduplicated. */
export function parseMessageIdList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const text = Array.isArray(value) ? value.join(" ") : value;
  const ids: string[] = [];
  for (const match of text.matchAll(/<([^<>\s]+)>/g)) ids.push(match[1]!);
  if (!ids.length) {
    for (const token of text.split(/[\s,]+/)) {
      const id = normalizeMessageId(token);
      if (id) ids.push(id);
    }
  }
  return Array.from(new Set(ids));
}

/** Lower-cases header names; repeated headers are joined with `, ` as RFC 5322 allows. */
export function normalizeHeaders(input: Array<{ name: string; value: string }> | Record<string, string | string[]> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const entries = Array.isArray(input) ? input.map((h) => [h.name, h.value] as const) : Object.entries(input).map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : value] as const);
  for (const [name, value] of entries) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    out[key] = key in out ? `${out[key]}, ${value}` : String(value);
  }
  return out;
}

export interface InboundAttachmentMeta {
  providerId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  contentId: string | null;
  inline: boolean;
  downloadUrl: string | null;
  /** bytes already at hand (development fixture, tests) — the handler never fetches those */
  content?: Buffer | null;
}

export interface InboundEmail {
  provider: "resend";
  /** webhook delivery id (`svix-id`) — idempotency key of `support_inbound_events` */
  providerEventId: string;
  /** Resend's own id of the received e-mail (`data.email_id`) — needed to fetch bodies and attachments */
  providerMessageId: string;
  from: InboundAddress;
  to: InboundAddress[];
  cc: InboundAddress[];
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  headers: Record<string, string>;
  text: string | null;
  html: string | null;
  attachments: InboundAttachmentMeta[];
  receivedAt: Date;
}

const attachmentSchema = z.object({
  id: z.string().optional().nullable(),
  filename: z.string().optional().nullable(),
  content_type: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
  content_id: z.string().optional().nullable(),
  content_disposition: z.string().optional().nullable(),
  download_url: z.string().optional().nullable(),
});

const headerEntry = z.object({ name: z.string(), value: z.string() });

/** The `email.received` event as Resend Inbound posts it (unknown keys are ignored). */
export const resendReceivedEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string().min(3),
    to: z.union([z.array(z.string()), z.string()]).optional(),
    cc: z.union([z.array(z.string()), z.string()]).optional().nullable(),
    subject: z.string().optional().nullable(),
    message_id: z.string().optional().nullable(),
    created_at: z.string().optional(),
    headers: z.union([z.array(headerEntry), z.record(z.string(), z.union([z.string(), z.array(z.string())]))]).optional().nullable(),
    attachments: z.array(attachmentSchema).optional().nullable(),
    text: z.string().optional().nullable(),
    html: z.string().optional().nullable(),
  }),
});

export type ResendReceivedEvent = z.infer<typeof resendReceivedEventSchema>;

export type ParsedInbound =
  | { ok: true; email: InboundEmail }
  | { ok: false; reason: "invalid_payload" | "unsupported_type" | "invalid_sender"; detail?: string };

/** Validates and normalises the webhook payload; `eventId` is the verified `svix-id`. */
export function parseResendReceivedEvent(json: unknown, eventId: string): ParsedInbound {
  const parsed = resendReceivedEventSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_payload", detail: parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ") };
  const event = parsed.data;
  if (event.type !== "email.received") return { ok: false, reason: "unsupported_type", detail: event.type };
  const from = parseAddress(event.data.from);
  if (!from) return { ok: false, reason: "invalid_sender" };
  const headers = normalizeHeaders(event.data.headers ?? null);
  const messageId = normalizeMessageId(event.data.message_id ?? headers["message-id"] ?? null);
  const inReplyTo = parseMessageIdList(headers["in-reply-to"])[0] ?? null;
  const references = parseMessageIdList(headers.references);
  const receivedAt = new Date(event.data.created_at ?? event.created_at ?? Date.now());
  return {
    ok: true,
    email: {
      provider: "resend",
      providerEventId: eventId,
      providerMessageId: event.data.email_id,
      from,
      to: parseAddressList(event.data.to ?? []),
      cc: parseAddressList(event.data.cc ?? []),
      subject: (event.data.subject ?? "").replace(/[\r\n]+/g, " ").trim(),
      messageId,
      inReplyTo,
      references,
      headers,
      text: event.data.text ?? null,
      html: event.data.html ?? null,
      attachments: (event.data.attachments ?? []).map((a) => ({
        providerId: a.id ?? null,
        fileName: sanitizeFileName(a.filename ?? "attachment"),
        contentType: (a.content_type ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase(),
        sizeBytes: typeof a.size === "number" ? a.size : null,
        contentId: a.content_id ?? null,
        inline: (a.content_disposition ?? "").toLowerCase() === "inline",
        downloadUrl: a.download_url ?? null,
      })),
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// 3. Routing
// ---------------------------------------------------------------------------------------------------

export const TICKET_PLUS_PREFIX = "support+t";
const SUBJECT_TAG_RE = /\[Track #(\d{1,12})\]/i;

/** The ticket number addressed by `support+t<number>@<inbound_domain>` among the recipients, else null. */
export function ticketNumberFromRecipients(recipients: ReadonlyArray<InboundAddress | string>, inboundDomain: string): number | null {
  const domain = inboundDomain.trim().toLowerCase();
  if (!domain) return null;
  for (const recipient of recipients) {
    const email = ((typeof recipient === "string" ? parseAddress(recipient)?.email : recipient.email) ?? "").toLowerCase();
    const at = email.lastIndexOf("@");
    if (at < 0 || email.slice(at + 1) !== domain) continue;
    const local = email.slice(0, at);
    const match = local.match(/^[^+]+\+t(\d{1,12})$/);
    if (match) return Number(match[1]);
  }
  return null;
}

/** `[Track #1234]` anywhere in the subject (the tag `ticketSubjectTag` puts on outbound mails). */
export function ticketNumberFromSubject(subject: string | null | undefined): number | null {
  const match = (subject ?? "").match(SUBJECT_TAG_RE);
  return match ? Number(match[1]) : null;
}

/** Which stored row a threading id matched: the desk's own outbound Message-ID (unguessable) or a customer-supplied one. */
export type ThreadMatchDirection = "outbound" | "inbound";

export interface RoutingLookups {
  /** ticket by human-facing number (open or closed — a reply to a closed ticket reopens it) */
  byTicketNumber(number: number): Promise<{ ticketId: string } | null>;
  /** ticket owning a stored message whose `message_id` or `provider_message_id` is among `ids`; `direction` of the matched row when known */
  byMessageIds(ids: string[]): Promise<{ ticketId: string; direction?: ThreadMatchDirection } | null>;
}

export type InboundRoute = { kind: "reply"; ticketId: string; via: "plus_address" | "thread" | "subject"; matched?: ThreadMatchDirection } | { kind: "new" };

/** Plus address → threading headers → subject tag → new ticket. */
export async function routeInbound(email: Pick<InboundEmail, "to" | "cc" | "inReplyTo" | "references" | "subject">, inboundDomain: string, lookups: RoutingLookups): Promise<InboundRoute> {
  const number = ticketNumberFromRecipients([...email.to, ...email.cc], inboundDomain);
  if (number != null) {
    const hit = await lookups.byTicketNumber(number);
    if (hit) return { kind: "reply", ticketId: hit.ticketId, via: "plus_address" };
  }
  const ids = Array.from(new Set([email.inReplyTo, ...email.references].filter((id): id is string => Boolean(id))));
  if (ids.length) {
    const hit = await lookups.byMessageIds(ids);
    if (hit) return { kind: "reply", ticketId: hit.ticketId, via: "thread", ...(hit.direction ? { matched: hit.direction } : {}) };
  }
  const tagged = ticketNumberFromSubject(email.subject);
  if (tagged != null) {
    const hit = await lookups.byTicketNumber(tagged);
    if (hit) return { kind: "reply", ticketId: hit.ticketId, via: "subject" };
  }
  return { kind: "new" };
}

// ---------------------------------------------------------------------------------------------------
// 4. Loop and auto-reply detection
// ---------------------------------------------------------------------------------------------------

export interface AutoReplyVerdict {
  /** the message was generated automatically (auto-responder, bounce, list) — never answer it automatically */
  auto: boolean;
  /** the sender asked for no automatic responses (`X-Auto-Response-Suppress`) even if the mail itself is human */
  suppressAutoReply: boolean;
  reason: string | null;
}

const OOO_SUBJECT_RE = /^\s*((auto(matic|mated)?[\s-]*(reply|response|antwort)|automatische antwort|r[ée]ponse automatique|respuesta autom[áa]tica|risposta automatica|automatisch antwoord|out of office|out-of-office|abwesenheit(snotiz)?|absence du bureau|fuera de la oficina|fuori sede|afwezig)\b)/i;

/** Detects automatic messages (RFC 3834 and the vendor headers everybody sets) and suppression requests. */
export function detectAutoReply(headers: Record<string, string>, subject: string | null | undefined): AutoReplyVerdict {
  const h = (name: string) => (headers[name.toLowerCase()] ?? "").trim().toLowerCase();
  const verdict = (reason: string): AutoReplyVerdict => ({ auto: true, suppressAutoReply: true, reason });
  const autoSubmitted = h("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return verdict(`auto-submitted: ${autoSubmitted}`);
  const precedence = h("precedence");
  if (["bulk", "junk", "auto_reply", "auto-reply", "list"].includes(precedence)) return verdict(`precedence: ${precedence}`);
  for (const name of ["x-autoreply", "x-autorespond", "x-autoresponder", "x-auto-reply"]) {
    const value = h(name);
    if (value && value !== "no" && value !== "false" && value !== "0") return verdict(`${name}: ${value}`);
  }
  if (headers["list-id"] || headers["list-unsubscribe"]) return verdict("mailing list headers");
  const failed = h("x-failed-recipients");
  if (failed) return verdict("delivery status notification");
  const contentType = h("content-type");
  if (contentType.includes("multipart/report") && contentType.includes("delivery-status")) return verdict("delivery status notification");
  const suppress = h("x-auto-response-suppress");
  if (subject && OOO_SUBJECT_RE.test(subject)) return { auto: true, suppressAutoReply: true, reason: "out-of-office subject" };
  if (suppress && suppress !== "none") return { auto: false, suppressAutoReply: true, reason: `x-auto-response-suppress: ${suppress}` };
  return { auto: false, suppressAutoReply: false, reason: null };
}

/** A mail from the desk's own sender or reply domain would loop; the caller drops it. */
export function isOwnAddress(email: string, settings: { fromAddress: string; inboundDomain: string }): boolean {
  const address = email.trim().toLowerCase();
  const own = settings.fromAddress.trim().toLowerCase();
  const domain = settings.inboundDomain.trim().toLowerCase();
  if (own && address === own) return true;
  const at = address.lastIndexOf("@");
  return at > 0 && domain.length > 0 && address.slice(at + 1) === domain;
}

// ---------------------------------------------------------------------------------------------------
// 5. HTML sanitiser (allow-list)
// ---------------------------------------------------------------------------------------------------

/** Tags whose content survives (the tag itself is re-emitted with allow-listed attributes only). */
export const SANITIZE_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "div", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);

/** Tags removed together with everything inside them. */
export const SANITIZE_DROP_WITH_CONTENT: ReadonlySet<string> = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "svg", "math", "template", "head", "title", "textarea", "select", "option", "button", "input", "meta", "link", "base", "xml", "canvas", "audio", "video", "picture", "source", "track", "map", "area",
]);

const VOID_TAGS: ReadonlySet<string> = new Set(["br", "hr", "img"]);

const ALLOWED_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  ol: new Set(["start"]),
  abbr: new Set(["title"]),
  q: new Set(["cite"]),
  blockquote: new Set(["cite"]),
};

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

/** Decodes the entities that matter for attribute checks (numeric and the basic named ones). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return lower in NAMED_ENTITIES ? NAMED_ENTITIES[lower]! : match;
  });
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (value: string) => value.replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SAFE_LINK_RE = /^(https?:|mailto:|tel:)/i;
const SAFE_IMAGE_RE = /^(cid:|data:image\/(png|jpeg|jpg|gif|webp);base64,)/i;
const REMOTE_IMAGE_RE = /^https?:/i;

function safeUrl(raw: string, kind: "link" | "image", allowRemoteImages: boolean): string | null {
  // decode entities, then strip control characters and whitespace that browsers ignore inside a scheme
  const decoded = stripControl(decodeEntities(raw), true).trim();
  if (!decoded) return null;
  if (kind === "link") return SAFE_LINK_RE.test(decoded) || decoded.startsWith("#") ? decoded : null;
  if (SAFE_IMAGE_RE.test(decoded)) return decoded;
  return allowRemoteImages && REMOTE_IMAGE_RE.test(decoded) ? decoded : null;
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

/** Removes C0 control characters and DEL (and, with `andSpace`, every whitespace) without a control-char regex. */
function stripControl(value: string, andSpace = false): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x7f || code < (andSpace ? 0x21 : 0x20)) continue;
    out += ch;
  }
  return out;
}

function parseAttributes(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const match of raw.matchAll(ATTR_RE)) {
    const name = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    out.push([name, value]);
  }
  return out;
}

export interface SanitizeOptions {
  /** allow `http(s)` image sources; off by default (remote images are tracking pixels until proven otherwise) */
  allowRemoteImages?: boolean;
}

/**
 * Allow-list sanitiser for inbound HTML. Output contains only `SANITIZE_ALLOWED_TAGS` with allow-listed
 * attributes; every `on*` handler, `style`, `class`, `id`, form element, script, comment, processing
 * instruction and unknown tag is removed (unknown tags keep their text). Links get
 * `rel="noopener noreferrer nofollow" target="_blank"`. Unbalanced markup is closed at the end; stray closing
 * tags are dropped, so the result is well-formed.
 */
export function sanitizeHtml(input: string, options: SanitizeOptions = {}): string {
  const html = input.replace(/\r\n?/g, "\n");
  const out: string[] = [];
  const stack: string[] = [];
  let i = 0;
  let dropUntil: string | null = null;
  const closeTo = (name: string) => {
    const idx = stack.lastIndexOf(name);
    if (idx < 0) return;
    while (stack.length > idx) out.push(`</${stack.pop()}>`);
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      if (!dropUntil) out.push(escapeText(html.slice(i)));
      break;
    }
    if (lt > i && !dropUntil) out.push(escapeText(html.slice(i, lt)));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<![CDATA[", lt)) {
      const end = html.indexOf("]]>", lt + 9);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const tagMatch = html.slice(lt).match(/^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/);
    if (!tagMatch) {
      // a lone "<" that opens no tag is text
      if (!dropUntil) out.push("&lt;");
      i = lt + 1;
      continue;
    }
    const closing = tagMatch[1] === "/";
    const name = tagMatch[2]!.toLowerCase();
    const rawAttrs = tagMatch[3] ?? "";
    i = lt + tagMatch[0].length;
    if (dropUntil) {
      if (closing && name === dropUntil) dropUntil = null;
      continue;
    }
    if (SANITIZE_DROP_WITH_CONTENT.has(name)) {
      if (!closing && !rawAttrs.trim().endsWith("/") && !VOID_TAGS.has(name)) {
        // drop until the matching close; an unclosed dangerous tag drops the rest of the document
        dropUntil = ["meta", "link", "base", "input", "source", "track", "area"].includes(name) ? null : name;
      }
      continue;
    }
    if (!SANITIZE_ALLOWED_TAGS.has(name)) continue; // unknown or structural tag: keep the content only
    if (closing) {
      if (!VOID_TAGS.has(name)) closeTo(name);
      continue;
    }
    if (name === "img") {
      const attrs = parseAttributes(rawAttrs);
      const src = attrs.find(([k]) => k === "src")?.[1];
      const safe = src ? safeUrl(src, "image", options.allowRemoteImages ?? false) : null;
      if (!safe) {
        const alt = attrs.find(([k]) => k === "alt")?.[1]?.trim();
        if (alt) out.push(escapeText(`[${decodeEntities(alt)}]`));
        continue;
      }
      const alt = attrs.find(([k]) => k === "alt")?.[1] ?? "";
      out.push(`<img src="${escapeAttr(safe)}" alt="${escapeAttr(decodeEntities(alt))}">`);
      continue;
    }
    const allowed = ALLOWED_ATTRIBUTES[name];
    const kept: string[] = [];
    if (allowed) {
      for (const [attr, value] of parseAttributes(rawAttrs)) {
        if (!allowed.has(attr)) continue;
        if (attr === "href" || attr === "cite") {
          const safe = safeUrl(value, "link", false);
          if (safe) kept.push(`${attr}="${escapeAttr(safe)}"`);
          continue;
        }
        if (attr === "colspan" || attr === "rowspan" || attr === "start" || attr === "width" || attr === "height") {
          if (/^\d{1,4}$/.test(value.trim())) kept.push(`${attr}="${value.trim()}"`);
          continue;
        }
        if (attr === "scope") {
          if (["row", "col", "rowgroup", "colgroup"].includes(value.trim().toLowerCase())) kept.push(`scope="${value.trim().toLowerCase()}"`);
          continue;
        }
        kept.push(`${attr}="${escapeAttr(decodeEntities(value))}"`);
      }
      if (name === "a" && kept.some((k) => k.startsWith("href="))) kept.push('rel="noopener noreferrer nofollow"', 'target="_blank"');
    }
    const attrText = kept.length ? ` ${kept.join(" ")}` : "";
    if (VOID_TAGS.has(name)) {
      out.push(`<${name}${attrText}>`);
      continue;
    }
    out.push(`<${name}${attrText}>`);
    stack.push(name);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** Rough plain text of an HTML body (fallback for `text_body` when a sender sends HTML only). */
export function htmlToText(input: string): string {
  const withoutBlocks = input.replace(/<(script|style|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const withBreaks = withoutBlocks
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*(p|div|h[1-6]|blockquote|pre|table)\b[^>]*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|blockquote|pre|dd|dt)\s*>/gi, "\n")
    .replace(/<\s*(li)\b[^>]*>/gi, "- ")
    .replace(/<\/\s*(td|th)\s*>/gi, "\t");
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, ""));
  return text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------------------------------
// 6. Attachments
// ---------------------------------------------------------------------------------------------------

export const ATTACHMENT_MAX_BYTES = SUPPORT_ATTACHMENT_MAX_BYTES;
export const ATTACHMENT_MAX_PER_MESSAGE = SUPPORT_ATTACHMENT_MAX_PER_MESSAGE;

/** Content types the desk stores; everything else (executables, archives, HTML, scripts) is refused and listed. */
export const ATTACHMENT_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "message/rfc822",
]);

export interface AttachmentCandidate {
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
}

export type AttachmentRejection = "too_many" | "too_large" | "size_unknown" | "type_not_allowed";

export interface AttachmentScreening<T extends AttachmentCandidate> {
  accepted: T[];
  rejected: Array<{ attachment: T; reason: AttachmentRejection }>;
}

/** File name without paths, control characters or leading dots; at most 200 characters, never empty. */
export function sanitizeFileName(name: string | null | undefined): string {
  const base = stripControl((name ?? "").replace(/[\\/]+/g, "/").split("/").pop()!)
    .replace(/[<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim();
  const limited = base.length > 200 ? `${base.slice(0, 180)}${base.slice(base.lastIndexOf(".")).slice(0, 20)}` : base;
  return limited || "attachment";
}

/** Applies count, size and type limits; the order of `list` decides which ones exceed the count. */
export function screenAttachments<T extends AttachmentCandidate>(list: readonly T[]): AttachmentScreening<T> {
  const accepted: T[] = [];
  const rejected: Array<{ attachment: T; reason: AttachmentRejection }> = [];
  for (const attachment of list) {
    const type = attachment.contentType.split(";")[0]!.trim().toLowerCase();
    if (!ATTACHMENT_ALLOWED_TYPES.has(type)) rejected.push({ attachment, reason: "type_not_allowed" });
    else if (attachment.sizeBytes == null) rejected.push({ attachment, reason: "size_unknown" });
    else if (attachment.sizeBytes > ATTACHMENT_MAX_BYTES) rejected.push({ attachment, reason: "too_large" });
    else if (accepted.length >= ATTACHMENT_MAX_PER_MESSAGE) rejected.push({ attachment, reason: "too_many" });
    else accepted.push(attachment);
  }
  return { accepted, rejected };
}

export interface AttachmentScanResult {
  clean: boolean;
  /** scanner name and verdict for the audit trail; never file contents */
  detail: string | null;
}

/**
 * Virus-scan hook. The desk calls `scan` with the bytes before storing an attachment and refuses the file when
 * `clean` is false. `noopAttachmentScanner` is the placeholder until a scanner (ClamAV over a sidecar, a vendor
 * API) is wired in — it reports `clean: true` with `detail: "not scanned"`, and the console shows attachments
 * as "not scanned" as long as it is in place (docs/18 §"Attachments").
 */
export interface AttachmentScanner {
  readonly name: string;
  scan(content: Buffer, meta: AttachmentCandidate): Promise<AttachmentScanResult>;
}

export const noopAttachmentScanner: AttachmentScanner = {
  name: "none",
  async scan() {
    return { clean: true, detail: "not scanned" };
  },
};

// ---------------------------------------------------------------------------------------------------
// 7. Resend receiving API — bodies, headers and attachment bytes of a received mail
// ---------------------------------------------------------------------------------------------------

/**
 * The `email.received` event carries ids, addresses and attachment names only — no bodies, no headers, no
 * sizes. The handler fetches the rest from Resend's receiving API: the same endpoints the installed SDK wraps
 * as `resend.emails.receiving.get(id)` / `resend.emails.receiving.attachments.get({ emailId, id })`
 * (`GET /emails/receiving/{id}`, `GET /emails/receiving/{id}/attachments/{id}` → signed `download_url`),
 * called through `fetch` so tests inject recorded responses instead of the network. Inline images come back
 * as `data:` URIs inside `html` (Resend's default `html_format`), which the sanitiser keeps; remote images
 * are stripped as always.
 */
export const RESEND_API_BASE_URL = "https://api.resend.com";
export const RESEND_API_TIMEOUT_MS = 15_000;

export class ResendApiError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(path: string, status: number, message: string) {
    super(message);
    this.name = "ResendApiError";
    this.status = status;
    this.path = path;
  }
}

const receivedAttachmentDetailSchema = z.object({
  id: z.string().min(1),
  filename: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
  content_type: z.string().optional().nullable(),
  content_id: z.string().optional().nullable(),
  content_disposition: z.string().optional().nullable(),
});

/** `GET /emails/receiving/{id}`: the stored mail with bodies and headers (unknown keys are ignored). */
export const resendReceivedEmailSchema = z.object({
  id: z.string().min(1),
  from: z.string().optional().nullable(),
  to: z.array(z.string()).optional().nullable(),
  cc: z.array(z.string()).optional().nullable(),
  subject: z.string().optional().nullable(),
  html: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  headers: z.union([z.record(z.string(), z.union([z.string(), z.array(z.string())])), z.array(headerEntry)]).optional().nullable(),
  message_id: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
  attachments: z.array(receivedAttachmentDetailSchema).optional().nullable(),
});
export type ResendReceivedEmail = z.infer<typeof resendReceivedEmailSchema>;

/** `GET /emails/receiving/{id}/attachments/{id}`: metadata plus a short-lived signed download URL. */
export const resendAttachmentLinkSchema = z.object({
  id: z.string().min(1),
  filename: z.string().optional().nullable(),
  size: z.number().int().nonnegative().optional().nullable(),
  content_type: z.string().optional().nullable(),
  content_disposition: z.string().optional().nullable(),
  content_id: z.string().optional().nullable(),
  download_url: z.string().min(1),
  expires_at: z.string().optional().nullable(),
});
export type ResendAttachmentLink = z.infer<typeof resendAttachmentLinkSchema>;

export interface ResendReceivingClient {
  getEmail(emailId: string): Promise<ResendReceivedEmail>;
  getAttachment(emailId: string, attachmentId: string): Promise<ResendAttachmentLink>;
  /** downloads a signed attachment URL (https only); rejects bodies above `maxBytes` before buffering them */
  download(url: string, maxBytes: number): Promise<Buffer>;
}

export interface ResendReceivingClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export class AttachmentTooLargeError extends Error {
  constructor(size: number, max: number) {
    super(`attachment of ${size} bytes exceeds ${max} bytes`);
    this.name = "AttachmentTooLargeError";
  }
}

export function createResendReceivingClient(options: ResendReceivingClientOptions): ResendReceivingClient {
  const base = (options.baseUrl ?? RESEND_API_BASE_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? RESEND_API_TIMEOUT_MS;
  const getJson = async (path: string): Promise<unknown> => {
    const res = await doFetch(`${base}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new ResendApiError(path, res.status, `resend ${path} answered ${res.status}`);
    return res.json();
  };
  return {
    async getEmail(emailId) {
      const path = `/emails/receiving/${encodeURIComponent(emailId)}`;
      const parsed = resendReceivedEmailSchema.safeParse(await getJson(path));
      if (!parsed.success) throw new ResendApiError(path, 200, "unexpected receiving payload");
      return parsed.data;
    },
    async getAttachment(emailId, attachmentId) {
      const path = `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`;
      const parsed = resendAttachmentLinkSchema.safeParse(await getJson(path));
      if (!parsed.success) throw new ResendApiError(path, 200, "unexpected attachment payload");
      return parsed.data;
    },
    async download(url, maxBytes) {
      if (!/^https:\/\//i.test(url.trim())) throw new Error("attachment download url must be https");
      const res = await doFetch(url, { method: "GET", signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new ResendApiError("download", res.status, `attachment download answered ${res.status}`);
      const declared = Number.parseInt(res.headers.get("content-length") ?? "", 10);
      if (Number.isFinite(declared) && declared > maxBytes) throw new AttachmentTooLargeError(declared, maxBytes);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > maxBytes) throw new AttachmentTooLargeError(bytes.length, maxBytes);
      return bytes;
    },
  };
}

/**
 * Fills the event's `InboundEmail` with what the receiving API returned: bodies, the full header set (which
 * also yields In-Reply-To / References when the event had none), cc, the subject and attachment sizes. Values
 * the event already carried win; attachments are matched by provider id and unknown ones are appended.
 */
export function mergeReceivedEmail(email: InboundEmail, detail: ResendReceivedEmail): InboundEmail {
  const headers = { ...normalizeHeaders(detail.headers ?? null), ...email.headers };
  const messageId = email.messageId ?? normalizeMessageId(detail.message_id ?? headers["message-id"] ?? null);
  const inReplyTo = email.inReplyTo ?? parseMessageIdList(headers["in-reply-to"])[0] ?? null;
  const references = email.references.length ? email.references : parseMessageIdList(headers.references);
  const cc = email.cc.length ? email.cc : parseAddressList(detail.cc ?? []);
  const to = email.to.length ? email.to : parseAddressList(detail.to ?? []);
  const attachments = email.attachments.map((a) => ({ ...a }));
  for (const found of detail.attachments ?? []) {
    const existing = attachments.find((a) => a.providerId === found.id);
    const contentType = (found.content_type ?? existing?.contentType ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    if (existing) {
      existing.sizeBytes = typeof found.size === "number" ? found.size : existing.sizeBytes;
      existing.contentType = contentType;
      existing.contentId = existing.contentId ?? found.content_id ?? null;
      existing.inline = existing.inline || (found.content_disposition ?? "").toLowerCase() === "inline";
      continue;
    }
    attachments.push({
      providerId: found.id,
      fileName: sanitizeFileName(found.filename ?? "attachment"),
      contentType,
      sizeBytes: typeof found.size === "number" ? found.size : null,
      contentId: found.content_id ?? null,
      inline: (found.content_disposition ?? "").toLowerCase() === "inline",
      downloadUrl: null,
    });
  }
  return {
    ...email,
    to,
    cc,
    subject: email.subject || (detail.subject ?? "").replace(/[\r\n]+/g, " ").trim(),
    messageId,
    inReplyTo,
    references,
    headers,
    text: detail.text ?? email.text,
    html: detail.html ?? email.html,
    attachments,
  };
}

// ---------------------------------------------------------------------------------------------------
// 8. Authentication results, pinned to the receiving MTA's authserv-id — and the spam heuristics
// ---------------------------------------------------------------------------------------------------

/**
 * Which `Authentication-Results` header the desk believes (RFC 8601). A mail may carry any number of them — a
 * forwarding server's, or one the sender simply typed: `Authentication-Results: x; dmarc=pass header.from=<victim>`
 * costs nothing. Only the receiving MTA's own header (Resend's) is a verdict about *this* delivery, and RFC 8601
 * §5 obliges that MTA to strip incoming headers claiming its authserv-id. So the desk reads exactly one
 * instance — the **first** (a receiving MTA prepends its trace headers, so its verdict comes first) — and only
 * when its authserv-id is one of `trustedAuthservIds` (`SUPPORT_AUTHSERV_ID`, docs/18 §5). Nothing configured,
 * a foreign id first, or no header at all → no results: the mail counts as unauthenticated (fail closed).
 *
 * `ARC-Authentication-Results` is never consulted, not even as a fallback: the §5 stripping covers
 * `Authentication-Results` only — ARC sets are preserved by every hop by design (RFC 8617 §5.1), so a sender who
 * knows the configured id could ship `ARC-Authentication-Results: i=1; <id>; dmarc=pass header.from=<victim>`
 * and it would arrive intact. An AAR is the sealer's verdict about an earlier hop, never the receiving MTA's
 * verdict about this delivery.
 *
 * The receiving API collapses repeated headers into one string, so the scan stops at the first unquoted comma
 * outside comments (where a second instance would begin) and at the first clause that is not `method=result`
 * (RFC 8601 grammar — a collapsed second instance starts with a bare authserv-id). Comments and quoted strings
 * are honoured, so nothing can be smuggled into the trusted instance through them; an instance without an
 * authserv-id is nobody's verdict. `Received-SPF` carries no authserv-id and is ignored.
 */
export interface AuthservTrust {
  /** authserv-ids whose verdicts count (case-insensitive; `SUPPORT_AUTHSERV_ID`); empty → nothing is trusted */
  trustedAuthservIds: readonly string[];
}

export interface AuthenticationClause {
  method: string;
  result: string;
  /** `header.d`, `header.i`, `header.from`, `smtp.mailfrom`, … — lower-cased keys, first occurrence wins */
  props: Record<string, string>;
}

export interface AuthenticationResultsInstance {
  /** lower-cased authserv-id of the instance */
  authservId: string;
  clauses: AuthenticationClause[];
}

/** Removes CFWS comments and cuts at the first instance boundary (an unquoted `,`); quoted strings survive intact. */
function firstInstanceText(value: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (quoted) {
      out += ch;
      if (ch === "\\" && i + 1 < value.length) {
        out += value[++i];
        continue;
      }
      if (ch === '"') quoted = false;
      continue;
    }
    if (depth > 0) {
      if (ch === "\\") i++;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ",") break;
    if (ch === '"') quoted = true;
    out += ch;
  }
  return out;
}

/** Splits on `;` outside quoted strings. */
function splitClauses(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) current += text[++i];
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    if (ch === ";") {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

const unquote = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2 ? trimmed.slice(1, -1).replace(/\\(.)/g, "$1") : trimmed;
};

const CLAUSE_RE = /^([a-z0-9-]+)(?:\/\d+)?\s*=\s*([a-z0-9]+)\b([\s\S]*)$/i;
const PROP_RE = /([a-z]+\.[a-z]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s;]+)/gi;

/**
 * The first instance of an `Authentication-Results` value (comments stripped, later instances of a collapsed
 * header cut off); null when it carries no authserv-id — such a header is nobody's verdict. A leading ARC-style
 * `i=N` tag is skipped so a value in that shape still parses, but the desk never reads
 * `ARC-Authentication-Results` (`trustedAuthenticationResults`). Parsing stops at the first segment that is not
 * `method=result` (`none` included).
 */
export function parseAuthenticationResultsInstance(value: string | null | undefined): AuthenticationResultsInstance | null {
  if (!value) return null;
  const parts = splitClauses(firstInstanceText(value)).map((p) => p.trim());
  if (parts.length && /^i\s*=\s*\d+$/i.test(parts[0]!)) parts.shift(); // ARC instance tag
  const head = parts.shift() ?? "";
  const idToken = /^("(?:[^"\\]|\\.)*"|[^\s"]+)/.exec(head)?.[1];
  const authservId = idToken ? unquote(idToken).toLowerCase() : "";
  if (!authservId || authservId.includes("=") || authservId.includes(";")) return null;
  const clauses: AuthenticationClause[] = [];
  for (const part of parts) {
    const match = CLAUSE_RE.exec(part);
    if (!match) break;
    const props: Record<string, string> = {};
    for (const p of match[3]!.matchAll(PROP_RE)) props[p[1]!.toLowerCase()] ??= unquote(p[2]!);
    clauses.push({ method: match[1]!.toLowerCase(), result: match[2]!.toLowerCase(), props });
  }
  return { authservId, clauses };
}

export interface TrustedAuthenticationResults {
  /** the instance the desk believes; null when none is trusted */
  instance: AuthenticationResultsInstance | null;
  /** authserv-id of the first instance seen, trusted or not — the value to put into `SUPPORT_AUTHSERV_ID` */
  authservId: string | null;
  trusted: boolean;
  /** the header the believed instance came from — only ever `Authentication-Results` (ARC is never read); null when nothing is trusted */
  source: "authentication-results" | null;
}

/** The first `Authentication-Results` instance, believed only under a trusted authserv-id; `ARC-Authentication-Results` is ignored (see above). */
export function trustedAuthenticationResults(headers: Record<string, string>, trust: AuthservTrust): TrustedAuthenticationResults {
  const trusted = new Set(trust.trustedAuthservIds.map((id) => id.trim().toLowerCase()).filter(Boolean));
  const instance = parseAuthenticationResultsInstance(headers["authentication-results"]);
  if (!instance) return { instance: null, authservId: null, trusted: false, source: null };
  if (!trusted.has(instance.authservId)) return { instance: null, authservId: instance.authservId, trusted: false, source: null };
  return { instance, authservId: instance.authservId, trusted: true, source: "authentication-results" };
}

export interface AuthenticationResults {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

/** First `spf=` / `dkim=` / `dmarc=` result of the trusted instance; all null when none is trusted. */
export function parseAuthenticationResults(headers: Record<string, string>, trust: AuthservTrust): AuthenticationResults {
  const out: AuthenticationResults = { spf: null, dkim: null, dmarc: null };
  for (const clause of trustedAuthenticationResults(headers, trust).instance?.clauses ?? []) {
    if ((clause.method === "spf" || clause.method === "dkim" || clause.method === "dmarc") && out[clause.method] == null) out[clause.method] = clause.result;
  }
  return out;
}

export interface SpamVerdict {
  spam: boolean;
  reasons: string[];
  auth: AuthenticationResults;
}

/**
 * Spam decision of an inbound mail. Conservative: DMARC `fail`, SPF **and** DKIM `fail` (both from the trusted
 * instance), an upstream spam flag (`X-Spam-Flag: YES`, `X-Spam-Status: Yes`) or a sender the desk blocked. SPF
 * alone failing is not spam (forwarders break SPF every day). A spam mail is still stored — as a `spam` ticket —
 * never answered. Without a trusted instance only the flag headers and the block count.
 */
export function spamVerdict(email: Pick<InboundEmail, "headers">, options: AuthservTrust & { blockedSender?: boolean }): SpamVerdict {
  const auth = parseAuthenticationResults(email.headers, options);
  const reasons: string[] = [];
  if (options.blockedSender) reasons.push("blocked sender");
  if (auth.dmarc === "fail") reasons.push("dmarc fail");
  else if (auth.spf === "fail" && auth.dkim === "fail") reasons.push("spf and dkim fail");
  const flag = (email.headers["x-spam-flag"] ?? "").trim().toLowerCase();
  const status = (email.headers["x-spam-status"] ?? "").trim().toLowerCase();
  if (flag === "yes" || status.startsWith("yes")) reasons.push("spam flag header");
  return { spam: reasons.length > 0, reasons, auth };
}

export type SenderAuthenticationVia = "dmarc" | "dkim" | "spf";

export interface SenderAuthentication {
  /** an authenticated identity aligns with the `From` domain (DMARC pass, or DKIM `header.d` / SPF `smtp.mailfrom` on the From domain or a parent / child of it) */
  aligned: boolean;
  via: SenderAuthenticationVia | null;
  /** authserv-id of the first `Authentication-Results` instance seen (null without one) — what `SUPPORT_AUTHSERV_ID` must name */
  authservId: string | null;
  /** whether that instance was trusted; false means no verdict was read at all */
  trusted: boolean;
}

/** `ada@Mail.Example.com` / `@example.com` / `example.com.` → `mail.example.com` / `example.com`. */
function domainOf(value: string): string {
  const bare = value.trim().replace(/^"|"$/g, "");
  const at = bare.lastIndexOf("@");
  return (at >= 0 ? bare.slice(at + 1) : bare)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

/** Relaxed identifier alignment (RFC 7489 §3.1): the domains are equal or one is a parent of the other. */
export function domainsAlign(a: string, b: string): boolean {
  const x = domainOf(a);
  const y = domainOf(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/**
 * Whether the `From` address is backed by an authenticated identity in the trusted instance (docs/18 §4 step 6):
 * `dmarc=pass` (the verifier checked the alignment; a `header.from` it names must still align with `From`), else
 * `dkim=pass` whose `header.d` / `header.i` aligns with the From domain, else `spf=pass` whose `smtp.mailfrom`
 * aligns. A bare or foreign pass proves nothing about `From` — anyone passes SPF for their own envelope
 * sender — and a `dmarc=fail` in the instance outranks every pass. No trusted instance → not aligned.
 */
export function senderAuthentication(headers: Record<string, string>, fromEmail: string, trust: AuthservTrust): SenderAuthentication {
  const results = trustedAuthenticationResults(headers, trust);
  const base = { authservId: results.authservId, trusted: results.trusted };
  const from = fromEmail.includes("@") ? domainOf(fromEmail) : "";
  if (!from || !results.instance) return { aligned: false, via: null, ...base };
  const clauses = results.instance.clauses;
  if (clauses.some((c) => c.method === "dmarc" && c.result === "fail")) return { aligned: false, via: null, ...base };
  let dmarc = false;
  let dkim = false;
  let spf = false;
  for (const clause of clauses) {
    if (clause.result !== "pass") continue;
    if (clause.method === "dmarc") {
      const headerFrom = clause.props["header.from"];
      if (!headerFrom || domainsAlign(headerFrom, from)) dmarc = true;
    } else if (clause.method === "dkim") {
      const signer = clause.props["header.d"] ?? clause.props["header.i"];
      if (signer && domainsAlign(signer, from)) dkim = true;
    } else if (clause.method === "spf") {
      const envelope = clause.props["smtp.mailfrom"];
      if (envelope && domainsAlign(envelope, from)) spf = true;
    }
  }
  if (dmarc) return { aligned: true, via: "dmarc", ...base };
  if (dkim) return { aligned: true, via: "dkim", ...base };
  if (spf) return { aligned: true, via: "spf", ...base };
  return { aligned: false, via: null, ...base };
}

// ---------------------------------------------------------------------------------------------------
// 9. Locale detection
// ---------------------------------------------------------------------------------------------------

export type InboundLocaleSource = "user" | "header" | "text" | "default";

/** `de-DE, en;q=0.8` → `de`; null when no tag maps to a programme locale. */
export function localeFromLanguageTag(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  for (const entry of value.split(",")) {
    const tag = entry.split(";")[0]!.trim().toLowerCase();
    const primary = tag.split(/[-_]/)[0] ?? "";
    if (isKnownLocale(primary)) return primary;
  }
  return null;
}

/** Distinctive, mostly language-exclusive words; a language wins only with a clear margin (see `guessLocaleFromText`). */
const LOCALE_WORDS: Record<AppLocale, readonly string[]> = {
  en: ["the", "and", "you", "with", "hello", "thanks", "thank", "please", "regards", "we", "our", "this", "have", "your", "are"],
  de: ["und", "nicht", "ist", "das", "die", "der", "wir", "ich", "mit", "bitte", "danke", "grüße", "freundliche", "guten", "haben", "ihre", "wird"],
  fr: ["bonjour", "merci", "vous", "nous", "est", "les", "des", "une", "pas", "avec", "pour", "cordialement", "je", "votre", "sur"],
  es: ["hola", "gracias", "usted", "nosotros", "está", "los", "las", "para", "por", "saludos", "tenemos", "nuestro", "cuando", "también"],
  it: ["ciao", "grazie", "salve", "buongiorno", "sono", "che", "non", "per", "gli", "cordiali", "saluti", "abbiamo", "nostro", "anche"],
  nl: ["hoi", "beste", "dank", "bedankt", "wij", "niet", "het", "een", "van", "met", "voor", "groet", "vriendelijke", "hebben", "onze"],
};

export const LOCALE_GUESS_MIN_SCORE = 3;
export const LOCALE_GUESS_MIN_MARGIN = 2;

/**
 * Guesses the language of a text from a small stop-word vocabulary per programme locale. Returns a locale only
 * when it matched at least `LOCALE_GUESS_MIN_SCORE` distinct words and leads the runner-up by
 * `LOCALE_GUESS_MIN_MARGIN`; otherwise null (the caller falls back — never a guessed language shown as fact).
 */
export function guessLocaleFromText(text: string | null | undefined): AppLocale | null {
  if (!text) return null;
  const words = new Set(text.slice(0, 4000).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean));
  const scores = ALL_LOCALES.map((locale) => ({ locale, score: LOCALE_WORDS[locale].filter((w) => words.has(w)).length })).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score < LOCALE_GUESS_MIN_SCORE) return null;
  if (second && best.score - second.score < LOCALE_GUESS_MIN_MARGIN) return null;
  return best.locale;
}

export interface InboundLocaleInput {
  /** the requester's stored preference when the sender is a known user */
  storedLocale?: string | null;
  headers: Record<string, string>;
  /** subject and body for the text heuristic */
  text?: string | null;
}

/** Stored user locale → `Content-Language` / `Accept-Language` / `X-Accept-Language` → text heuristic → English. */
export function detectInboundLocale(input: InboundLocaleInput): { locale: AppLocale; source: InboundLocaleSource } {
  if (isKnownLocale(input.storedLocale)) return { locale: input.storedLocale, source: "user" };
  for (const name of ["content-language", "accept-language", "x-accept-language"]) {
    const locale = localeFromLanguageTag(input.headers[name]);
    if (locale) return { locale, source: "header" };
  }
  const guessed = guessLocaleFromText(input.text);
  if (guessed) return { locale: guessed, source: "text" };
  return { locale: "en", source: "default" };
}

// ---------------------------------------------------------------------------------------------------
// 10. Delivery events (email.sent / delivered / bounced / complained / failed / suppressed)
// ---------------------------------------------------------------------------------------------------

export const RESEND_DELIVERY_EVENT_TYPES = ["email.sent", "email.delivered", "email.delivery_delayed", "email.complained", "email.bounced", "email.failed", "email.suppressed"] as const;
export type ResendDeliveryEventType = (typeof RESEND_DELIVERY_EVENT_TYPES)[number];

export function isDeliveryEventType(type: unknown): type is ResendDeliveryEventType {
  return typeof type === "string" && (RESEND_DELIVERY_EVENT_TYPES as readonly string[]).includes(type);
}

export const resendDeliveryEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional().nullable(),
  data: z.object({
    email_id: z.string().min(1),
    message_id: z.string().optional().nullable(),
    from: z.string().optional().nullable(),
    to: z.union([z.array(z.string()), z.string()]).optional().nullable(),
    subject: z.string().optional().nullable(),
    created_at: z.string().optional().nullable(),
    bounce: z.object({ message: z.string().optional().nullable(), type: z.string().optional().nullable(), subType: z.string().optional().nullable() }).optional().nullable(),
    failed: z.object({ reason: z.string().optional().nullable() }).optional().nullable(),
    suppressed: z.object({ message: z.string().optional().nullable(), type: z.string().optional().nullable() }).optional().nullable(),
  }),
});

export interface DeliveryEvent {
  provider: "resend";
  /** webhook delivery id (`svix-id`) — idempotency key of `support_inbound_events` */
  providerEventId: string;
  type: ResendDeliveryEventType;
  /** Resend's id of the sent e-mail — matches `support_messages.provider_message_id` */
  emailId: string;
  messageId: string | null;
  to: string[];
  createdAt: Date;
  /** short human-readable reason (bounce type / sub type / message, failure reason) — never a body */
  detail: string | null;
}

export type ParsedDelivery = { ok: true; event: DeliveryEvent } | { ok: false; reason: "invalid_payload" | "unsupported_type"; detail?: string };

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/** Validates and normalises a delivery webhook; `eventId` is the verified `svix-id`. */
export function parseResendDeliveryEvent(json: unknown, eventId: string): ParsedDelivery {
  const parsed = resendDeliveryEventSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_payload", detail: parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ") };
  const event = parsed.data;
  if (!isDeliveryEventType(event.type)) return { ok: false, reason: "unsupported_type", detail: event.type };
  const data = event.data;
  let detail: string | null = null;
  if (event.type === "email.bounced") {
    detail = [data.bounce?.type, data.bounce?.subType].filter(Boolean).join("/") + (data.bounce?.message ? `: ${data.bounce.message}` : "");
  } else if (event.type === "email.failed") detail = data.failed?.reason ?? "failed";
  else if (event.type === "email.suppressed") detail = [data.suppressed?.type, data.suppressed?.message].filter(Boolean).join(": ") || "suppressed";
  else if (event.type === "email.complained") detail = "complaint";
  const createdAt = new Date(data.created_at ?? event.created_at ?? Date.now());
  return {
    ok: true,
    event: {
      provider: "resend",
      providerEventId: eventId,
      type: event.type,
      emailId: data.email_id,
      messageId: normalizeMessageId(data.message_id ?? null),
      to: parseAddressList(data.to ?? []).map((a) => a.email),
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      detail: detail ? clip(detail.replace(/\s+/g, " ").trim(), 500) || null : null,
    },
  };
}

/** Delivery state a webhook type stands for; `email.delivery_delayed` changes nothing (the mail is still in flight). */
export function deliveryStatusForEvent(type: ResendDeliveryEventType): SupportDeliveryStatus | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
    case "email.suppressed":
      return "failed";
    case "email.delivery_delayed":
      return null;
  }
}

// `sending` (the console's transient send claim, 0018) ranks with `queued`: a provider event only ever moves it forward
const DELIVERY_RANK: Record<SupportDeliveryStatus, number> = { na: 0, queued: 1, sending: 1, sent: 2, delivered: 3, failed: 4, bounced: 4, complained: 5 };

/**
 * Applies a delivery state monotonically: webhooks may arrive out of order, so `sent` after `delivered` is
 * ignored and a terminal state (`bounced`, `complained`, `failed`) is never replaced by an earlier one.
 */
export function nextDeliveryStatus(current: SupportDeliveryStatus, incoming: SupportDeliveryStatus): SupportDeliveryStatus {
  return DELIVERY_RANK[incoming] >= DELIVERY_RANK[current] ? incoming : current;
}
