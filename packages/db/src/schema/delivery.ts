import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, tz } from "./_helpers.ts";
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
