import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { logger } from "./db";

/**
 * Transactional e-mail. Order: SMTP_URL (nodemailer) -> RESEND_API_KEY -> local file outbox
 * (development/test only; E2E tests read verification links from it). Never logs message bodies.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface MailResult {
  ok: boolean;
  transport: "smtp" | "resend" | "file" | "none";
  id?: string;
  error?: string;
}

export const MAIL_OUTBOX_DIR = path.resolve(process.cwd(), ".local", "mail");

export async function sendMail(mail: Mail): Promise<MailResult> {
  const e = env();
  const from = e.MAIL_FROM ?? "track.site <no-reply@track.site>";
  try {
    if (e.SMTP_URL) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(e.SMTP_URL);
      const info = await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.replyTo });
      return { ok: true, transport: "smtp", id: info.messageId };
    }
    if (e.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(e.RESEND_API_KEY);
      const res = await resend.emails.send({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.replyTo });
      if (res.error) return { ok: false, transport: "resend", error: res.error.message };
      return { ok: true, transport: "resend", id: res.data?.id };
    }
    if (e.APP_ENV === "production") {
      logger.error({ to: "[redacted]", subject: mail.subject }, "no mail transport configured");
      return { ok: false, transport: "none", error: "no mail transport configured" };
    }
    mkdirSync(MAIL_OUTBOX_DIR, { recursive: true });
    const file = path.join(MAIL_OUTBOX_DIR, `${Date.now()}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.json`);
    writeFileSync(file, JSON.stringify({ from, ...mail, at: new Date().toISOString() }, null, 2));
    logger.info({ subject: mail.subject, file }, "mail written to local outbox");
    return { ok: true, transport: "file", id: file };
  } catch (err) {
    return { ok: false, transport: e.SMTP_URL ? "smtp" : e.RESEND_API_KEY ? "resend" : "file", error: err instanceof Error ? err.message : "send failed" };
  }
}
