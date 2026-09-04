import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * E-mail transport of the `alerts` job. Same order as the web app's mail module: `SMTP_URL`
 * (nodemailer) → `RESEND_API_KEY` (HTTP API) → local file outbox outside production. The variables
 * are read from the process environment because they are not part of the worker's env schema; a
 * missing transport is reported, never thrown, so one broken channel does not stop the job. Message
 * bodies are never logged.
 */
export interface AlertMail {
  to: string;
  subject: string;
  text: string;
}

export interface AlertMailResult {
  ok: boolean;
  transport: "smtp" | "resend" | "file" | "none";
  error?: string;
  httpStatus?: number;
}

export interface AlertMailEnv {
  SMTP_URL?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  APP_ENV?: string;
}

export const ALERT_MAIL_OUTBOX_DIR = path.resolve(process.cwd(), ".local", "mail");
const RESEND_URL = "https://api.resend.com/emails";

export async function sendAlertMail(
  mail: AlertMail,
  env: AlertMailEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<AlertMailResult> {
  const from = env.MAIL_FROM?.trim() || "Track <no-reply@track.site>";
  try {
    if (env.SMTP_URL) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.default.createTransport(env.SMTP_URL);
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
      return { ok: true, transport: "smtp" };
    }
    if (env.RESEND_API_KEY) {
      const res = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok)
        return {
          ok: false,
          transport: "resend",
          error: `resend responded ${res.status}`,
          httpStatus: res.status,
        };
      return { ok: true, transport: "resend", httpStatus: res.status };
    }
    if (env.APP_ENV === "production")
      return { ok: false, transport: "none", error: "no mail transport configured" };
    mkdirSync(ALERT_MAIL_OUTBOX_DIR, { recursive: true });
    const file = path.join(
      ALERT_MAIL_OUTBOX_DIR,
      `${Date.now()}-alert-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.json`,
    );
    writeFileSync(file, JSON.stringify({ from, ...mail, at: new Date().toISOString() }, null, 2));
    return { ok: true, transport: "file" };
  } catch (err) {
    return {
      ok: false,
      transport: env.SMTP_URL ? "smtp" : env.RESEND_API_KEY ? "resend" : "file",
      error: err instanceof Error ? err.message.slice(0, 200) : "send failed",
    };
  }
}
