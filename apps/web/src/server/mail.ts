import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { logger } from "./db";

/**
 * Transactional e-mail. Order: SMTP_URL (nodemailer) -> RESEND_API_KEY -> local file outbox
 * (development/test only; E2E tests read verification links from it). Never logs message bodies.
 *
 * The optional fields (`from`, `cc`, `headers`, `messageId`, `inReplyTo`, `references`, `attachments`) exist
 * for the support desk (docs/18-support-desk.md): ticket mails carry their own sender, threading headers and
 * attachments. Callers that leave them out get exactly the behaviour of before.
 */
export interface MailAttachment {
  filename: string;
  /** file bytes (Buffer) or text */
  content: Buffer | string;
  contentType?: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** sender in `Name <address>` form; defaults to MAIL_FROM */
  from?: string;
  cc?: string[];
  /** additional headers (names as they should appear on the wire, e.g. `X-Track-Ticket`) */
  headers?: Record<string, string>;
  /** RFC 5322 Message-ID including angle brackets; providers may replace it (the result carries the provider id) */
  messageId?: string;
  /** In-Reply-To / References with angle brackets, for threading */
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachment[];
}

export interface MailResult {
  ok: boolean;
  transport: "smtp" | "resend" | "file" | "none";
  id?: string;
  error?: string;
}

export const MAIL_OUTBOX_DIR = path.resolve(process.cwd(), ".local", "mail");

/** Threading headers as a plain header map (Resend takes them as custom headers, nodemailer has fields). */
function threadingHeaders(mail: Mail): Record<string, string> {
  const h: Record<string, string> = { ...(mail.headers ?? {}) };
  if (mail.messageId) h["Message-ID"] = mail.messageId;
  if (mail.inReplyTo) h["In-Reply-To"] = mail.inReplyTo;
  if (mail.references?.length) h.References = mail.references.join(" ");
  return h;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const e = env();
  const from = mail.from ?? e.MAIL_FROM ?? "Track <no-reply@track.site>";
  try {
    if (e.SMTP_URL) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(e.SMTP_URL);
      const info = await transport.sendMail({
        from,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        replyTo: mail.replyTo,
        headers: mail.headers,
        messageId: mail.messageId,
        inReplyTo: mail.inReplyTo,
        references: mail.references,
        attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      return { ok: true, transport: "smtp", id: info.messageId };
    }
    if (e.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(e.RESEND_API_KEY);
      const headers = threadingHeaders(mail);
      const res = await resend.emails.send({
        from,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        replyTo: mail.replyTo,
        headers: Object.keys(headers).length ? headers : undefined,
        attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      if (res.error) return { ok: false, transport: "resend", error: res.error.message };
      return { ok: true, transport: "resend", id: res.data?.id };
    }
    if (e.APP_ENV === "production") {
      logger.error({ to: "[redacted]", subject: mail.subject }, "no mail transport configured");
      return { ok: false, transport: "none", error: "no mail transport configured" };
    }
    mkdirSync(MAIL_OUTBOX_DIR, { recursive: true });
    const file = path.join(MAIL_OUTBOX_DIR, `${Date.now()}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.json`);
    // attachment bytes never land in the outbox file — names, types and sizes are enough to verify a flow
    const { attachments, ...rest } = mail;
    const summary = attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType ?? null, size: Buffer.byteLength(a.content) }));
    writeFileSync(file, JSON.stringify({ from, ...rest, attachments: summary, at: new Date().toISOString() }, null, 2));
    logger.info({ subject: mail.subject, file }, "mail written to local outbox");
    return { ok: true, transport: "file", id: file };
  } catch (err) {
    return { ok: false, transport: e.SMTP_URL ? "smtp" : e.RESEND_API_KEY ? "resend" : "file", error: err instanceof Error ? err.message : "send failed" };
  }
}
