import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, tz } from "./_helpers.ts";
import { integrations } from "./config.ts";
import { environments, orgRef, sites } from "./tenancy.ts";

/**
 * Event lineage and Live Test Lab runs (Events module, migration 0007). Regular tables next to the
 * partitioned event store: they live here (not in events.ts) so drizzle-kit sees them via kit.ts.
 */
/** Pipeline stages recorded in `event_lineage` (migration 0007), in processing order. */
export const LINEAGE_STAGES = ["captured", "accepted", "normalized", "policy", "deduplicated", "routed", "delivered"] as const;
export type LineageStage = (typeof LINEAGE_STAGES)[number];

/** Outcome of one stage: `ok`/`rejected` (accepted, normalized), `ok`/`blocked` (policy), `unique`/`duplicate` (dedup), `ok`/`skipped`/`none` (routed), `delivered`/`retry`/`failed`/`dead`/`skipped` (delivered). */
export const LINEAGE_OUTCOMES = ["ok", "rejected", "blocked", "unique", "duplicate", "none", "skipped", "delivered", "retry", "failed", "dead"] as const;
export type LineageOutcome = (typeof LINEAGE_OUTCOMES)[number];

/**
 * Per-stage lineage of every event (Live Event Explorer, Test Lab timeline; migration 0007). One row
 * per stage and — for `routed`/`delivered` — per destination or attempt. Written by the worker stages
 * as the data-plane role; the dashboard reads it under RLS. `batch_id` is the collector's message id,
 * `detail` is redacted and never contains identifiers or payload fields.
 */
export const eventLineage = pgTable(
  "event_lineage",
  {
    id: text("id").primaryKey(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id").references(() => environments.id, { onDelete: "set null" }),
    eventId: text("event_id").notNull(),
    sourceEventId: text("source_event_id"),
    batchId: text("batch_id"),
    eventName: text("event_name").notNull(),
    source: text("source").notNull(),
    stage: text("stage").$type<LineageStage>().notNull(),
    outcome: text("outcome").$type<LineageOutcome>().notNull(),
    reason: text("reason"),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: tz("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("event_lineage_site_event_idx").on(t.siteId, t.eventId, t.occurredAt),
    index("event_lineage_site_time_idx").on(t.siteId, t.occurredAt),
    index("event_lineage_site_batch_idx").on(t.siteId, t.batchId).where(sql`batch_id IS NOT NULL`),
    index("event_lineage_site_source_event_idx").on(t.siteId, t.sourceEventId).where(sql`source_event_id IS NOT NULL`),
    index("event_lineage_occurred_idx").on(t.occurredAt),
    index("event_lineage_org_idx").on(t.organizationId),
  ],
);

export const TEST_LAB_JOURNEYS = ["page_view", "lead", "add_to_cart", "checkout", "purchase"] as const;
export type TestLabJourney = (typeof TEST_LAB_JOURNEYS)[number];
export const TEST_LAB_RUN_STATUSES = ["pending", "sent", "rejected", "failed"] as const;
export type TestLabRunStatus = (typeof TEST_LAB_RUN_STATUSES)[number];

/** One controlled test event of a run: the source event id the collector was given plus what it is. */
export interface TestLabStep {
  sourceEventId: string;
  name: string;
  /** step label key (`page_view`, `duplicate_purchase`, …) */
  kind: string;
}

/**
 * Live Test Lab runs (migration 0007): guided journeys sent through the real collector with an
 * ephemeral source key of the site's test-mode environment. `batch_id` correlates the run with its
 * lineage rows; `steps` lists the source event ids so the events and delivery attempts can be joined.
 */
export const testLabRuns = pgTable(
  "test_lab_runs",
  {
    id: text("id").primaryKey(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    journey: text("journey").$type<TestLabJourney>().notNull(),
    consent: jsonb("consent").$type<{ granted: string[]; source: string; region: string | null }>().notNull(),
    status: text("status").$type<TestLabRunStatus>().notNull().default("pending"),
    collectorStatus: integer("collector_status"),
    collectorReason: text("collector_reason"),
    batchId: text("batch_id"),
    sourceKeyId: uuid("source_key_id"),
    steps: jsonb("steps").$type<TestLabStep[]>().notNull().default([]),
    error: text("error"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    sentAt: tz("sent_at"),
  },
  (t) => [index("test_lab_runs_site_created_idx").on(t.siteId, t.createdAt), index("test_lab_runs_org_idx").on(t.organizationId)],
);
