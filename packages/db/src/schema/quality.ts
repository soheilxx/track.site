import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tz } from "./_helpers.ts";
import { environments, orgRef, sites } from "./tenancy.ts";

export const severityEnum = pgEnum("issue_severity", ["info", "warning", "critical"]);
export const issueStatusEnum = pgEnum("issue_status", ["open", "resolved", "ignored"]);

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
  },
  (t) => [uniqueIndex("dq_issues_site_fingerprint_uq").on(t.siteId, t.fingerprint), index("dq_issues_org_status_idx").on(t.organizationId, t.status)],
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
