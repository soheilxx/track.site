import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_helpers.ts";
import { orgRef, sites } from "./tenancy.ts";

/**
 * Alerts & Incident Mode (redesign supplement §8 module 13, migration 0013).
 *
 * `alert_channels` are the places a notification goes (e-mail address, webhook URL, Slack incoming
 * webhook). Only the e-mail address is stored in clear; URLs and webhook secrets are envelope
 * encrypted with the key id next to them and never leave the server again — the dashboard shows a
 * host hint only. `alert_rules` say what to watch (one of six kinds), for which site (null = every
 * site of the organization), with which thresholds, through which channels and how long to stay
 * quiet after a notification. `alert_events` is the history the worker job `alerts` writes: one row
 * per triggered condition and subject, with the per-channel delivery outcome in `delivery` and the
 * resolution timestamp once the condition cleared or a person resolved it. `detail` never contains
 * identifiers of visitors or payload fields — counts, rates, names and ids of the organization's own
 * destinations only. Tenant tables: organization_id + org index + RLS policy for tracksite_app.
 */
export const ALERT_CHANNEL_KINDS = ["email", "webhook", "slack"] as const;
export type AlertChannelKind = (typeof ALERT_CHANNEL_KINDS)[number];

export const ALERT_RULE_KINDS = [
  "event_drop",
  "vendor_outage",
  "credential_expiry",
  "consent_errors",
  "queue_lag",
  "conversion_anomaly",
] as const;
export type AlertRuleKind = (typeof ALERT_RULE_KINDS)[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** Thresholds are flat numeric objects; the field set per kind is `ALERT_THRESHOLD_FIELDS`. */
export type AlertThreshold = Record<string, number>;

export interface AlertThresholdField {
  key: string;
  min: number;
  max: number;
  /** display unit; `minutes` fields are windows the worker evaluates over hourly aggregates */
  unit: "percent" | "minutes" | "days" | "seconds" | "count";
  integer: boolean;
}

/**
 * What every rule kind needs and the bounds the web action and the worker both enforce. Windows are
 * at least 60 minutes because event volume is measured from hourly aggregates.
 */
export const ALERT_THRESHOLD_FIELDS: Record<AlertRuleKind, readonly AlertThresholdField[]> = {
  event_drop: [
    { key: "dropPercent", min: 5, max: 100, unit: "percent", integer: true },
    { key: "windowMinutes", min: 60, max: 1440, unit: "minutes", integer: true },
    { key: "minBaseline", min: 1, max: 1_000_000, unit: "count", integer: true },
  ],
  vendor_outage: [
    { key: "errorRatePercent", min: 1, max: 100, unit: "percent", integer: true },
    { key: "minAttempts", min: 1, max: 100_000, unit: "count", integer: true },
  ],
  credential_expiry: [{ key: "daysBefore", min: 1, max: 90, unit: "days", integer: true }],
  consent_errors: [
    { key: "errorRatePercent", min: 1, max: 100, unit: "percent", integer: true },
    { key: "windowMinutes", min: 60, max: 1440, unit: "minutes", integer: true },
    { key: "minEvents", min: 1, max: 1_000_000, unit: "count", integer: true },
  ],
  queue_lag: [{ key: "lagSeconds", min: 30, max: 86_400, unit: "seconds", integer: true }],
  conversion_anomaly: [
    { key: "deviationPercent", min: 5, max: 100, unit: "percent", integer: true },
    { key: "windowMinutes", min: 60, max: 1440, unit: "minutes", integer: true },
    { key: "minBaseline", min: 1, max: 1_000_000, unit: "count", integer: true },
  ],
};

/** Defaults offered by the rule form (and used when a stored threshold lacks a field). */
export const ALERT_THRESHOLD_DEFAULTS: Record<AlertRuleKind, AlertThreshold> = {
  event_drop: { dropPercent: 50, windowMinutes: 60, minBaseline: 50 },
  vendor_outage: { errorRatePercent: 25, minAttempts: 20 },
  credential_expiry: { daysBefore: 7 },
  consent_errors: { errorRatePercent: 20, windowMinutes: 60, minEvents: 50 },
  queue_lag: { lagSeconds: 900 },
  conversion_anomaly: { deviationPercent: 50, windowMinutes: 180, minBaseline: 10 },
};

export const ALERT_COOLDOWN_MIN_MINUTES = 5;
export const ALERT_COOLDOWN_MAX_MINUTES = 1440;
export const ALERT_COOLDOWN_DEFAULT_MINUTES = 60;

/** Outcome of one notification attempt per channel, stored on the event (`delivery[channelId]`). */
export interface AlertDeliveryRecord {
  kind: AlertChannelKind;
  status: "sent" | "failed" | "skipped";
  at: string;
  /** transport or skip reason, never a secret: `smtp`, `resend`, `file`, `channel_disabled`, `vault_missing` … */
  transport: string | null;
  error: string | null;
  httpStatus: number | null;
}
export type AlertDelivery = Record<string, AlertDeliveryRecord>;

/** Redacted facts behind an event: counts, rates, thresholds and the organization's own destination names/ids. */
export type AlertEventDetail = Record<string, string | number | boolean | null>;

export const alertChannels = pgTable(
  "alert_channels",
  {
    id: id(),
    organizationId: orgRef(),
    kind: text("kind").$type<AlertChannelKind>().notNull(),
    name: text("name").notNull(),
    /** e-mail address (clear); null for webhook and Slack channels whose URL is encrypted */
    target: text("target"),
    /** envelope-encrypted URL of a webhook / Slack channel (`SecretVault.encrypt`, aad `alert_channel:<id>`) */
    targetCiphertext: text("target_ciphertext"),
    /** envelope-encrypted signing secret of a webhook channel; null = unsigned */
    secretCiphertext: text("secret_ciphertext"),
    /** key id of the vault key that wrapped the ciphertexts */
    keyId: text("key_id"),
    /** what the dashboard may show for an encrypted target: the host name */
    targetHint: text("target_hint"),
    /** language of the notifications sent through this channel */
    locale: text("locale").notNull().default("en"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by"),
    lastTestAt: tz("last_test_at"),
    lastTestStatus: text("last_test_status"),
    lastTestError: text("last_test_error"),
    ...timestamps(),
  },
  (t) => [
    index("alert_channels_org_idx").on(t.organizationId),
    index("alert_channels_org_kind_idx").on(t.organizationId, t.kind),
  ],
);

export const alertRules = pgTable(
  "alert_rules",
  {
    id: id(),
    organizationId: orgRef(),
    /** null = every active site of the organization */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AlertRuleKind>().notNull(),
    name: text("name").notNull(),
    threshold: jsonb("threshold").$type<AlertThreshold>().notNull().default({}),
    channelIds: jsonb("channel_ids").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    cooldownMinutes: integer("cooldown_minutes").notNull().default(ALERT_COOLDOWN_DEFAULT_MINUTES),
    createdBy: uuid("created_by"),
    lastEvaluatedAt: tz("last_evaluated_at"),
    ...timestamps(),
  },
  (t) => [
    index("alert_rules_org_idx").on(t.organizationId),
    index("alert_rules_org_enabled_idx").on(t.organizationId, t.enabled),
    index("alert_rules_site_idx").on(t.siteId),
  ],
);

export const alertEvents = pgTable(
  "alert_events",
  {
    id: id(),
    organizationId: orgRef(),
    /** kept as history when the rule is deleted */
    ruleId: uuid("rule_id").references(() => alertRules.id, { onDelete: "set null" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AlertRuleKind>().notNull(),
    /** what the event is about, for cooldown and resolution: `site:<id>` or `integration:<id>[:<credential kind>]` */
    subjectKey: text("subject_key").notNull(),
    severity: text("severity").$type<AlertSeverity>().notNull(),
    /** English machine summary for webhook consumers; the dashboard renders a localized title from `kind` + `detail` */
    title: text("title").notNull(),
    detail: jsonb("detail").$type<AlertEventDetail>().notNull().default({}),
    triggeredAt: tz("triggered_at").notNull().defaultNow(),
    resolvedAt: tz("resolved_at"),
    /** user who resolved it by hand; null when the condition cleared on its own */
    resolvedBy: uuid("resolved_by"),
    notifiedAt: tz("notified_at"),
    delivery: jsonb("delivery").$type<AlertDelivery>().notNull().default({}),
  },
  (t) => [
    index("alert_events_org_idx").on(t.organizationId),
    index("alert_events_org_triggered_idx").on(t.organizationId, t.triggeredAt),
    index("alert_events_rule_subject_idx").on(t.ruleId, t.subjectKey, t.triggeredAt),
    index("alert_events_site_idx").on(t.siteId),
  ],
);

export type AlertChannelRow = typeof alertChannels.$inferSelect;
export type AlertRuleRow = typeof alertRules.$inferSelect;
export type AlertEventRow = typeof alertEvents.$inferSelect;
