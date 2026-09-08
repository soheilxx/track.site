import "server-only";
import { newUlid } from "@track-site/core";
import { env } from "@/env";
import { pick } from "@/lib/marketing-copy/pick";
import type { LocalizedCopy } from "@/lib/marketing-copy/types";
import { sendMail, type Mail, type MailAttachment, type MailResult } from "@/server/mail";

/**
 * Outbound ticket e-mail of the support desk (docs/18-support-desk.md §"E-mail flow").
 *
 * - From `<from_name> <from_address>` (support_settings, overridable by SUPPORT_FROM_ADDRESS), Reply-To
 *   `support+t<number>@<inbound_domain>` so every answer routes back to the ticket without parsing subjects.
 * - Message-ID `<t<number>.<ulid>@<inbound_domain>>`, In-Reply-To and References for threading; the id is
 *   stored on `support_messages.message_id` before sending so an answer can be matched even when the
 *   provider rewrites the header (then `provider_message_id` matches).
 * - HTML + text bodies with a transactional footer: ticket reference and "reply to this e-mail" — no
 *   unsubscribe link, this is correspondence the person asked for, not marketing.
 * - Automated messages (auto-acknowledgement) carry `Auto-Submitted: auto-replied` and
 *   `X-Auto-Response-Suppress: All` so other desks do not answer them (loop prevention, see inbound.ts).
 *
 * `buildTicketMail` is pure and unit-tested; `sendTicketMail` hands the result to the shared transport.
 */

export interface SupportMailSettings {
  inboundDomain: string;
  fromName: string;
  fromAddress: string;
  signatureText: string;
}

export const SUPPORT_MAIL_DEFAULTS: SupportMailSettings = {
  inboundDomain: "support.track.site",
  fromName: "Track Support",
  fromAddress: "support@track.site",
  signatureText: "",
};

/** Ticket fields the mail needs (a subset of `support_tickets`). */
export interface TicketMailTicket {
  id: string;
  number: number;
  subject: string;
  requesterEmail: string;
  requesterName?: string | null;
  locale?: string | null;
}

/** Message fields the mail needs (a subset of `support_messages` plus the attachment bytes). */
export interface TicketMailMessage {
  id: string;
  textBody: string;
  /** already sanitised HTML (never raw input); omitted → rendered from `textBody` */
  htmlBody?: string | null;
  /** RFC 5322 id without angle brackets; generated when absent (`ticketMessageId`) */
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
  ccEmails?: string[] | null;
  attachments?: MailAttachment[];
  /** `auto` marks system messages (acknowledgements): Auto-Submitted header, no signature */
  kind?: "agent" | "auto";
  /** display name of the answering agent (never the e-mail address) */
  agentName?: string | null;
}

export interface TicketMailInput {
  ticket: TicketMailTicket;
  message: TicketMailMessage;
  /** recipient language; falls back to the ticket locale, then English */
  locale?: string | null;
  /** stored `support_settings`; environment overrides and defaults are applied by `supportMailSettings` */
  settings?: Partial<SupportMailSettings> | null;
}

export interface TicketMailResult extends MailResult {
  /** the Message-ID the mail was built with (without angle brackets) — persist it on the message row */
  messageId: string;
}

interface TicketMailCopy {
  /** `{number}` */
  reference: string;
  /** `{number}` */
  footer: string;
  transactional: string;
  regards: string;
}

const COPY: LocalizedCopy<TicketMailCopy> = {
  en: {
    reference: "Ticket #{number}",
    footer: "This e-mail belongs to ticket #{number}. Reply to this e-mail to add to the conversation — keep the subject as it is.",
    transactional: "You receive this message because you contacted Track Support.",
    regards: "Kind regards",
  },
  de: {
    reference: "Ticket #{number}",
    footer: "Diese E-Mail gehört zu Ticket #{number}. Antworten Sie einfach auf diese E-Mail, um die Unterhaltung fortzusetzen — Betreff bitte unverändert lassen.",
    transactional: "Sie erhalten diese Nachricht, weil Sie den Track-Support kontaktiert haben.",
    regards: "Freundliche Grüße",
  },
  fr: {
    reference: "Ticket n° {number}",
    footer: "Cet e-mail concerne le ticket n° {number}. Répondez simplement à cet e-mail pour poursuivre la conversation, sans modifier l’objet.",
    transactional: "Vous recevez ce message parce que vous avez contacté le support Track.",
    regards: "Cordialement",
  },
  es: {
    reference: "Ticket n.º {number}",
    footer: "Este correo pertenece al ticket n.º {number}. Responda a este correo para continuar la conversación, sin cambiar el asunto.",
    transactional: "Recibe este mensaje porque se puso en contacto con el soporte de Track.",
    regards: "Un saludo",
  },
  it: {
    reference: "Ticket n. {number}",
    footer: "Questa e-mail riguarda il ticket n. {number}. Rispondi a questa e-mail per continuare la conversazione, senza modificare l’oggetto.",
    transactional: "Ricevi questo messaggio perché hai contattato il supporto Track.",
    regards: "Cordiali saluti",
  },
  nl: {
    reference: "Ticket #{number}",
    footer: "Deze e-mail hoort bij ticket #{number}. Beantwoord deze e-mail om het gesprek voort te zetten — laat het onderwerp ongewijzigd.",
    transactional: "U ontvangt dit bericht omdat u contact hebt opgenomen met Track Support.",
    regards: "Met vriendelijke groet",
  },
};

export function ticketMailCopy(locale: string | null | undefined): TicketMailCopy {
  return pick(locale ?? "en", COPY);
}

const fill = (s: string, values: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k]! : m));

/** Effective sender settings: environment overrides win over the stored row, defaults fill the rest. */
export function supportMailSettings(stored?: Partial<SupportMailSettings> | null): SupportMailSettings {
  let e: { SUPPORT_INBOUND_DOMAIN?: string | null; SUPPORT_FROM_ADDRESS?: string | null } = {};
  try {
    e = env();
  } catch {
    // no environment (tests, tooling): stored values and defaults only
  }
  const clean = (v: string | undefined | null) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    inboundDomain: clean(e.SUPPORT_INBOUND_DOMAIN) ?? clean(stored?.inboundDomain) ?? SUPPORT_MAIL_DEFAULTS.inboundDomain,
    fromName: clean(stored?.fromName) ?? SUPPORT_MAIL_DEFAULTS.fromName,
    fromAddress: clean(e.SUPPORT_FROM_ADDRESS) ?? clean(stored?.fromAddress) ?? SUPPORT_MAIL_DEFAULTS.fromAddress,
    signatureText: stored?.signatureText?.trim() ?? SUPPORT_MAIL_DEFAULTS.signatureText,
  };
}

/** Subject tag that identifies a ticket in a mailbox (`[Track #1234]`); inbound.ts parses it as a last resort. */
export function ticketSubjectTag(number: number): string {
  return `[Track #${number}]`;
}

const TAG_RE = /\[Track #\d+\]/i;
const REPLY_PREFIX_RE = /^\s*((re|aw|sv|wg|fwd?|tr|rif|r)\s*:\s*)+/i;

/** `Re: [Track #1234] original subject` — one tag, one reply prefix, never doubled. */
export function ticketSubject(number: number, subject: string, options: { reply?: boolean } = {}): string {
  const reply = options.reply ?? true;
  const base = subject.replace(TAG_RE, "").replace(REPLY_PREFIX_RE, "").replace(/\s+/g, " ").trim() || "(no subject)";
  return `${reply ? "Re: " : ""}${ticketSubjectTag(number)} ${base}`;
}

/** Reply-To of every ticket mail: the plus address that routes an answer back to the ticket. */
export function ticketReplyTo(number: number, settings: Pick<SupportMailSettings, "inboundDomain">): string {
  return `support+t${number}@${settings.inboundDomain}`;
}

/** RFC 5322 Message-ID (without angle brackets): `t<number>.<ulid>@<inbound_domain>`. */
export function ticketMessageId(number: number, settings: Pick<SupportMailSettings, "inboundDomain">, token: string = newUlid()): string {
  return `t${number}.${token.toLowerCase()}@${settings.inboundDomain}`;
}

const angle = (id: string) => (id.startsWith("<") ? id : `<${id}>`);

/** `"Name" <address>` with a name that cannot break the header (quotes, CR/LF and angle brackets removed). */
export function formatAddress(name: string | null | undefined, email: string): string {
  const clean = (name ?? "").replace(/[\r\n"<>]/g, "").trim();
  return clean ? `"${clean}" <${email}>` : email;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Plain text → paragraphs (`<p>`) with `<br>` line breaks; nothing is interpreted as markup. */
export function textToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  return paragraphs
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function htmlLayout(bodyHtml: string, footer: string[]): string {
  const foot = footer.map((line) => `<p style="margin:0 0 4px 0">${escapeHtml(line)}</p>`).join("");
  return [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"></head>',
    '<body style="margin:0;padding:24px;background:#f7f7f5;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0a0a0a">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:24px">',
    bodyHtml,
    "</div>",
    `<div style="max-width:640px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#62626b">${foot}</div>`,
    "</body></html>",
  ].join("");
}

/** Builds the complete mail (pure). The Message-ID is returned separately so the caller stores it before sending. */
export function buildTicketMail(input: TicketMailInput): { mail: Mail; messageId: string } {
  const settings = supportMailSettings(input.settings);
  const copy = ticketMailCopy(input.locale ?? input.ticket.locale);
  const number = input.ticket.number;
  const values = { number: String(number) };
  const messageId = input.message.messageId?.trim() || ticketMessageId(number, settings);
  const kind = input.message.kind ?? "agent";

  const signature = kind === "agent" ? [input.message.agentName?.trim(), settings.signatureText].filter((s): s is string => Boolean(s && s.length)) : [];
  const body = input.message.textBody.replace(/\r\n?/g, "\n").trim();
  const closing = signature.length ? `\n\n${copy.regards}\n${signature.join("\n")}` : "";
  const footerLines = [fill(copy.footer, values), copy.transactional];
  const text = `${body}${closing}\n\n—\n${footerLines.join("\n")}`;

  const bodyHtml = input.message.htmlBody?.trim() ? input.message.htmlBody : textToHtml(body);
  const closingHtml = signature.length ? `<p>${escapeHtml(copy.regards)}<br>${signature.map(escapeHtml).join("<br>")}</p>` : "";
  const html = htmlLayout(`${bodyHtml}${closingHtml}`, footerLines);

  const headers: Record<string, string> = { "X-Track-Ticket": String(number) };
  if (kind === "auto") {
    headers["Auto-Submitted"] = "auto-replied";
    headers["X-Auto-Response-Suppress"] = "All";
  }
  const references = (input.message.references ?? []).map((r) => r.trim()).filter(Boolean);
  const inReplyTo = input.message.inReplyTo?.trim() || null;
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);

  const mail: Mail = {
    to: formatAddress(input.ticket.requesterName, input.ticket.requesterEmail),
    cc: input.message.ccEmails?.length ? input.message.ccEmails : undefined,
    from: formatAddress(settings.fromName, settings.fromAddress),
    replyTo: ticketReplyTo(number, settings),
    subject: ticketSubject(number, input.ticket.subject),
    text,
    html,
    headers,
    messageId: angle(messageId),
    inReplyTo: inReplyTo ? angle(inReplyTo) : undefined,
    references: references.length ? references.map(angle) : undefined,
    attachments: input.message.attachments?.length ? input.message.attachments : undefined,
  };
  return { mail, messageId };
}

/**
 * Sends a ticket mail through the shared transport (SMTP → Resend → local outbox). Never throws for a transport
 * failure — the caller records `delivery_status` / `delivery_error` on the message row and shows it honestly.
 */
export async function sendTicketMail(input: TicketMailInput): Promise<TicketMailResult> {
  const { mail, messageId } = buildTicketMail(input);
  const result = await sendMail(mail).catch((err: unknown): MailResult => ({ ok: false, transport: "none", error: err instanceof Error ? err.message : "send failed" }));
  return { ...result, messageId };
}
