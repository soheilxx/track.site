import { and, desc, eq, isNull } from "drizzle-orm";
import { buildSignatureHeader, newUlid } from "@track-site/core";
import type { DbOrTx } from "../client.ts";
import {
  alertEvents,
  type AlertChannelKind,
  type AlertDelivery,
  type AlertDeliveryRecord,
  type AlertEventDetail,
  type AlertEventRow,
  type AlertRuleKind,
  type AlertSeverity,
} from "../schema/alerts.ts";

/**
 * Alerts & Incident Mode helpers shared by the worker job (`apps/worker/src/jobs/alerts.ts`) and the
 * dashboard's "send test notification" action: the outbound payloads (webhook JSON, HMAC signature
 * header, Slack blocks) and the cooldown / resolution bookkeeping on `alert_events`. Nothing here
 * touches the network or decrypts a channel; both callers do that with their own vault and fetch.
 */

/** Wire format of an alert as sent to webhooks (also the subject of the HMAC signature). */
export interface AlertNotification {
  id: string;
  /** `alert.triggered` for a rule hit, `alert.test` for the dashboard's test notification */
  type: "alert.triggered" | "alert.test";
  kind: AlertRuleKind;
  severity: AlertSeverity;
  /** localized, plain-language title (channel locale) */
  title: string;
  /** localized summary sentence (channel locale) */
  summary: string;
  organizationId: string;
  siteId: string | null;
  siteName: string | null;
  triggeredAt: string;
  /** redacted facts (counts, rates, own destination names) */
  detail: AlertEventDetail;
  /** deep link into the dashboard history */
  url: string;
}

/** Header carrying the platform's standard signature scheme (`t=<unix>,n=<nonce>,v1=<hmac>` over `t.n.sha256(body)`). */
export const ALERT_SIGNATURE_HEADER = "x-track-signature";
export const ALERT_EVENT_HEADER = "x-track-event";
export const ALERT_USER_AGENT = "Track-Alerts/1.0 (+https://track.site)";
/** Outbound notification requests are aborted after this long. */
export const ALERT_FETCH_TIMEOUT_MS = 10_000;

export function alertWebhookBody(notification: AlertNotification): string {
  return JSON.stringify(notification);
}

/** Signature header for a webhook body; `nonce` is fresh per request so a replayed body is detectable by the receiver. */
export async function alertSignatureHeader(
  body: string,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return buildSignatureHeader(body, secret, Math.floor(now.getTime() / 1000), newUlid());
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: ":information_source:",
  warning: ":warning:",
  critical: ":rotating_light:",
};

/** Slack incoming-webhook payload (Block Kit): headline, summary, a few facts and the dashboard link. */
export function alertSlackPayload(
  notification: AlertNotification,
  labels: { severity: string; site: string; open: string },
): Record<string, unknown> {
  const facts = Object.entries(notification.detail)
    .filter(([, v]) => v !== null && v !== "" && typeof v !== "boolean")
    .slice(0, 8)
    .map(([k, v]) => `*${k.replace(/_/g, " ")}:* ${String(v)}`);
  return {
    text: `${SEVERITY_EMOJI[notification.severity]} ${notification.title}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: notification.title.slice(0, 150), emoji: false },
      },
      { type: "section", text: { type: "mrkdwn", text: notification.summary.slice(0, 2900) } },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `*${labels.severity}:* ${notification.severity}` },
          ...(notification.siteName
            ? [{ type: "mrkdwn", text: `*${labels.site}:* ${notification.siteName}` }]
            : []),
          { type: "mrkdwn", text: `<${notification.url}|${labels.open}>` },
        ],
      },
      ...(facts.length
        ? [{ type: "section", text: { type: "mrkdwn", text: facts.join("\n").slice(0, 2900) } }]
        : []),
    ],
  };
}

/** A completed delivery record (timestamped now). */
export function deliveryRecord(
  kind: AlertChannelKind,
  status: AlertDeliveryRecord["status"],
  input: { transport?: string | null; error?: string | null; httpStatus?: number | null } = {},
  at: Date = new Date(),
): AlertDeliveryRecord {
  return {
    kind,
    status,
    at: at.toISOString(),
    transport: input.transport ?? null,
    error: input.error ? input.error.slice(0, 300) : null,
    httpStatus: input.httpStatus ?? null,
  };
}

/**
 * Whether a finding may produce a new event: never while the last event for the subject is still open
 * (the condition simply persists), and not inside the cooldown after the last trigger.
 */
export function shouldTriggerAlert(
  latest: { triggeredAt: Date; resolvedAt: Date | null } | null,
  cooldownMinutes: number,
  now: Date,
): boolean {
  if (!latest) return true;
  if (!latest.resolvedAt) return false;
  return now.getTime() - latest.triggeredAt.getTime() >= cooldownMinutes * 60_000;
}

/** Latest event of a rule for one subject (open or not). */
export async function latestAlertEvent(
  tx: DbOrTx,
  ruleId: string,
  subjectKey: string,
): Promise<AlertEventRow | null> {
  const rows = await tx
    .select()
    .from(alertEvents)
    .where(and(eq(alertEvents.ruleId, ruleId), eq(alertEvents.subjectKey, subjectKey)))
    .orderBy(desc(alertEvents.triggeredAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Open events of one rule (the subjects whose condition cleared are resolved by the worker). */
export async function openAlertEvents(tx: DbOrTx, ruleId: string): Promise<AlertEventRow[]> {
  return tx
    .select()
    .from(alertEvents)
    .where(and(eq(alertEvents.ruleId, ruleId), isNull(alertEvents.resolvedAt)));
}

export async function insertAlertEvent(
  tx: DbOrTx,
  input: {
    organizationId: string;
    ruleId: string;
    siteId: string | null;
    kind: AlertRuleKind;
    subjectKey: string;
    severity: AlertSeverity;
    title: string;
    detail: AlertEventDetail;
    triggeredAt: Date;
  },
): Promise<AlertEventRow> {
  const [row] = await tx.insert(alertEvents).values(input).returning();
  return row!;
}

export async function recordAlertDelivery(
  tx: DbOrTx,
  eventId: string,
  delivery: AlertDelivery,
  notifiedAt: Date | null,
): Promise<void> {
  await tx.update(alertEvents).set({ delivery, notifiedAt }).where(eq(alertEvents.id, eventId));
}

export async function resolveAlertEvent(
  tx: DbOrTx,
  eventId: string,
  resolvedBy: string | null,
  at: Date = new Date(),
): Promise<void> {
  await tx
    .update(alertEvents)
    .set({ resolvedAt: at, resolvedBy })
    .where(and(eq(alertEvents.id, eventId), isNull(alertEvents.resolvedAt)));
}
