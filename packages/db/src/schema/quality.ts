import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tz } from "./_helpers.ts";
import { configDrafts } from "./config.ts";
import { environments, orgRef, sites } from "./tenancy.ts";

export const severityEnum = pgEnum("issue_severity", ["info", "warning", "critical"]);
/**
 * Inbox workflow (redesign supplement §8 module 7): `open` → `acknowledged` (someone owns it) → `resolved`;
 * `muted` hides an issue with a reason and an optional end date. `ignored` is the legacy value of the first
 * inbox (treated as muted without a reason); migration 0009 appends the two new values.
 */
export const issueStatusEnum = pgEnum("issue_status", ["open", "resolved", "ignored", "acknowledged", "muted"]);
export type IssueStatus = (typeof issueStatusEnum.enumValues)[number];

/** One redacted sample event backing an issue (never a payload: identifiers, no PII, no vendor secrets). */
export interface IssueSample {
  event_id: string;
  name: string;
  source: string;
  server_ts: string;
  /** what is wrong with this sample, e.g. `commerce.currency=null` */
  detail: string | null;
}

/** Evidence written by the worker scan: counts inside the observation window, first/last seen and redacted samples. */
export interface IssueEvidence {
  window: { from: string; to: string } | null;
  /** affected events (or orders) inside the window */
  affected: number | null;
  /** events (or orders) the affected ones were compared against inside the window */
  total: number | null;
  /** monetary value of the affected conversions when every affected conversion carries a value; null otherwise */
  value: { amount: number; currency: string } | null;
  samples: IssueSample[];
  /** machine-readable facts for the fix plan (event name, field, reason, integration id …) */
  facts: Record<string, string | number | boolean | null>;
}

/** Data Quality Inbox entries; `fixTool` names the agent tool that can resolve the issue. */
export const dataQualityIssues = pgTable(
  "data_quality_issues",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    fingerprint: text("fingerprint").notNull(),
    severity: severityEnum("severity").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    status: issueStatusEnum("status").notNull().default("open"),
    fixTool: text("fix_tool"),
    occurrences: integer("occurrences").notNull().default(1),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    resolvedAt: tz("resolved_at"),
    /** migration 0009: inbox workflow, evidence and fix drafts */
    environmentId: uuid("environment_id").references(() => environments.id, { onDelete: "set null" }),
    /** coarse group for the inbox (required_fields, schema, values, duplicates, drops, spikes, revenue, usage, delivery, other) */
    category: text("category"),
    /** 0–100, computed by the worker from severity, share of affected volume and value; null until the first scan */
    impactScore: integer("impact_score"),
    evidence: jsonb("evidence").$type<IssueEvidence | null>(),
    acknowledgedAt: tz("acknowledged_at"),
    acknowledgedBy: uuid("acknowledged_by"),
    mutedUntil: tz("muted_until"),
    muteReason: text("mute_reason"),
    statusNote: text("status_note"),
    statusChangedBy: uuid("status_changed_by"),
    statusChangedAt: tz("status_changed_at"),
    /** config draft prepared for this issue (never published automatically) */
    fixDraftId: uuid("fix_draft_id").references(() => configDrafts.id, { onDelete: "set null" }),
    fixDraftAt: tz("fix_draft_at"),
  },
  (t) => [uniqueIndex("dq_issues_site_fingerprint_uq").on(t.siteId, t.fingerprint), index("dq_issues_org_status_idx").on(t.organizationId, t.status), index("dq_issues_site_status_impact_idx").on(t.siteId, t.status, t.impactScore)],
);

export const siteHealthSnapshots = pgTable(
  "site_health_snapshots",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    components: jsonb("components").$type<Record<string, { score: number; weight: number; detail: string }>>().notNull(),
    computedAt: tz("computed_at").notNull().defaultNow(),
  },
  (t) => [index("site_health_site_time_idx").on(t.siteId, t.computedAt), index("site_health_org_idx").on(t.organizationId)],
);

/** Hourly aggregates materialized by the worker; the debugger and metrics share these definitions. */
export const eventAggregates = pgTable(
  "event_aggregates",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    bucketStart: tz("bucket_start").notNull(),
    eventName: text("event_name").notNull(),
    source: text("source").notNull(),
    received: integer("received").notNull().default(0),
    accepted: integer("accepted").notNull().default(0),
    dropped: jsonb("dropped").$type<Record<string, number>>().notNull().default({}),
    deduplicated: integer("deduplicated").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    billable: integer("billable").notNull().default(0),
  },
  (t) => [uniqueIndex("event_aggregates_bucket_uq").on(t.siteId, t.environmentId, t.bucketStart, t.eventName, t.source), index("event_aggregates_org_idx").on(t.organizationId)],
);

export const conversionKindEnum = pgEnum("conversion_kind", ["purchase", "refund", "lead", "sign_up", "subscribe"]);

/** Conversion records enforce cross-source purchase dedup on (site, kind, order_id). */
export const conversionRecords = pgTable(
  "conversion_records",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    kind: conversionKindEnum("kind").notNull(),
    orderId: text("order_id"),
    value: numeric("value", { precision: 14, scale: 2 }),
    currency: text("currency"),
    source: text("source").notNull(),
    sourceVerified: boolean("source_verified").notNull().default(false),
    occurredAt: tz("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversion_records_site_kind_order_uq").on(t.siteId, t.kind, t.orderId).where(sql`order_id IS NOT NULL`),
    index("conversion_records_org_idx").on(t.organizationId),
    index("conversion_records_site_time_idx").on(t.siteId, t.occurredAt),
  ],
);

export const attributionTouchpoints = pgTable(
  "attribution_touchpoints",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    anonymousId: text("anonymous_id").notNull(),
    channel: text("channel").notNull(),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    clickIds: jsonb("click_ids").$type<Record<string, string>>().notNull().default({}),
    occurredAt: tz("occurred_at").notNull(),
    expiresAt: tz("expires_at").notNull(),
  },
  (t) => [index("attribution_site_anon_idx").on(t.siteId, t.anonymousId, t.occurredAt), index("attribution_org_idx").on(t.organizationId)],
);
