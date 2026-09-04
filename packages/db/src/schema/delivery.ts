import { sql } from "drizzle-orm";
import { doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tz } from "./_helpers.ts";
import { integrations } from "./config.ts";
import { orgRef, sites } from "./tenancy.ts";

export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "success", "retry", "failed", "dead", "skipped"]);
export const errorClassEnum = pgEnum("delivery_error_class", [
  "none",
  "temporary",
  "permanent",
  "rate_limited",
  "auth",
  "credential_expired",
  "invalid_payload",
  "policy_blocked",
  "timeout",
]);

/** One row per delivery attempt; lineage for the debugger and health metrics. */
export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: text("id").primaryKey(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    eventName: text("event_name").notNull(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    connectorType: text("connector_type").notNull(),
    attempt: integer("attempt").notNull(),
    status: deliveryStatusEnum("status").notNull(),
    errorClass: errorClassEnum("error_class").notNull().default("none"),
    errorCode: text("error_code"),
    /** redacted, max 500 chars */
    errorMessage: text("error_message"),
    httpStatus: integer("http_status"),
    vendorEventId: text("vendor_event_id"),
    requestDigest: text("request_digest"),
    /** redacted vendor payload preview for the debugger */
    payloadPreview: jsonb("payload_preview").$type<Record<string, unknown> | null>(),
    responseExcerpt: text("response_excerpt"),
    durationMs: integer("duration_ms"),
    nextRetryAt: tz("next_retry_at"),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
  },
  (t) => [
    uniqueIndex("delivery_attempts_event_integration_attempt_uq").on(t.eventId, t.integrationId, t.attempt),
    index("delivery_attempts_site_started_idx").on(t.siteId, t.startedAt),
    index("delivery_attempts_integration_started_idx").on(t.integrationId, t.startedAt),
    index("delivery_attempts_org_idx").on(t.organizationId),
  ],
);

export const deadLetterReferences = pgTable(
  "dead_letter_references",
  {
    id: text("id").primaryKey(),
    organizationId: orgRef(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    queue: text("queue").notNull(),
    eventId: text("event_id"),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
    replayedAt: tz("replayed_at"),
  },
  (t) => [index("dead_letter_refs_org_idx").on(t.organizationId), index("dead_letter_refs_queue_idx").on(t.queue)],
);

/**
 * Latest health measurement per destination (Destination Health Center, migration 0008). Written by
 * the worker job `destination-health` (apps/worker/src/jobs/destination-health.ts) from
 * `delivery_attempts` and from the queue tables the dashboard role cannot read (`queue_messages` and
 * `queue_dead_letters` are revoked from tracksite_app). One row per integration, upserted on every run;
 * the dashboard reads it under RLS, shows a missing row as "not measured" and marks a row stale when
 * `computed_at` is older than the job interval allows. Counters cover the trailing `window_minutes`;
 * `last_success_at` looks back 90 days. Tenant table: organization_id + RLS policy.
 */
export const destinationHealthSnapshots = pgTable(
  "destination_health_snapshots",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    computedAt: tz("computed_at").notNull().defaultNow(),
    windowMinutes: integer("window_minutes").notNull().default(1440),
    attemptsTotal: integer("attempts_total").notNull().default(0),
    attemptsSuccess: integer("attempts_success").notNull().default(0),
    attemptsFailed: integer("attempts_failed").notNull().default(0),
    attemptsRetry: integer("attempts_retry").notNull().default(0),
    attemptsSkipped: integer("attempts_skipped").notNull().default(0),
    attemptsRateLimited: integer("attempts_rate_limited").notNull().default(0),
    attemptsAuthFailed: integer("attempts_auth_failed").notNull().default(0),
    /** (failed + retry) / (success + failed + retry) within the window; null without attempts */
    errorRate: doublePrecision("error_rate"),
    queueReady: integer("queue_ready"),
    queueScheduled: integer("queue_scheduled"),
    queueInFlight: integer("queue_in_flight"),
    queueOldestAvailableAt: tz("queue_oldest_available_at"),
    queueDead: integer("queue_dead"),
    lastSuccessAt: tz("last_success_at"),
    lastFailureAt: tz("last_failure_at"),
    lastErrorClass: text("last_error_class"),
    lastErrorCode: text("last_error_code"),
    /** copied from delivery_attempts.error_message (truncated to 500 chars by the worker; the dashboard redacts it before display) */
    lastErrorMessage: text("last_error_message"),
    lastErrorHttpStatus: integer("last_error_http_status"),
    lastRateLimitAt: tz("last_rate_limit_at"),
    /** wait the vendor imposed on the last rate-limited attempt (next_retry_at - started_at) */
    lastRateLimitWaitMs: integer("last_rate_limit_wait_ms"),
  },
  (t) => [uniqueIndex("destination_health_integration_uq").on(t.integrationId), index("destination_health_org_idx").on(t.organizationId), index("destination_health_site_idx").on(t.siteId)],
);

/** Transactional outbox for control-plane events (publish, credential rotation, deletion jobs). */
export const outbox = pgTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    organizationId: uuid("organization_id"),
    topic: text("topic").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    publishedAt: tz("published_at"),
  },
  (t) => [index("outbox_unpublished_idx").on(t.publishedAt, t.createdAt)],
);

/** Durable queue tables used by PgQueue (see @track-site/queue). */
export const queueMessages = pgTable(
  "queue_messages",
  {
    id: text("id").primaryKey(),
    queue: text("queue").notNull(),
    partitionKey: text("partition_key").notNull(),
    body: jsonb("body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: tz("available_at").notNull().defaultNow(),
    lockedUntil: tz("locked_until"),
    lockToken: text("lock_token"),
    dedupKey: text("dedup_key"),
    organizationId: uuid("organization_id"),
    enqueuedAt: tz("enqueued_at").notNull().defaultNow(),
    lastError: text("last_error"),
  },
  (t) => [
    index("queue_messages_poll_idx").on(t.queue, t.availableAt, t.lockedUntil),
    index("queue_messages_partition_idx").on(t.queue, t.partitionKey),
    uniqueIndex("queue_messages_dedup_uq").on(t.queue, t.dedupKey).where(sql`dedup_key IS NOT NULL`),
  ],
);

/** Global idempotency guard independent of event-store partitions: (site_id, source_event_id). */
export const eventDedup = pgTable(
  "event_dedup",
  {
    siteId: uuid("site_id").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    eventId: text("event_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("event_dedup_site_source_uq").on(t.siteId, t.sourceEventId), index("event_dedup_created_idx").on(t.createdAt)],
);

export const queueDeadLetters = pgTable(
  "queue_dead_letters",
  {
    id: text("id").primaryKey(),
    queue: text("queue").notNull(),
    partitionKey: text("partition_key").notNull(),
    body: jsonb("body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    reason: text("reason").notNull(),
    organizationId: uuid("organization_id"),
    deadAt: tz("dead_at").notNull().defaultNow(),
    replayedAt: tz("replayed_at"),
  },
  (t) => [index("queue_dead_letters_queue_idx").on(t.queue, t.replayedAt)],
);
