import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { id, timestamps, tz } from "./_helpers.ts";

/**
 * Track Operations console (migration 0014, docs/17-operations-console.md). Everything here is written by
 * platform operators through `withPlatform` (role `tracksite_ops`) — the customer app only ever reads the
 * global tables and its own feature-flag overrides. `ops_notes` is not tenant-visible at all.
 */

/** Global feature flags: the default for every organization; overrides below refine it per tenant. */
export const featureFlags = pgTable("feature_flags", {
  /** ^[a-z][a-z0-9_.-]{1,63}$ (CHECK in the migration) */
  key: text("key").primaryKey(),
  description: text("description").notNull().default(""),
  defaultEnabled: boolean("default_enabled").notNull().default(false),
  createdBy: uuid("created_by"),
  ...timestamps(),
});

/**
 * Per-organization override of one flag. Tenant table with a SELECT-only policy for `tracksite_app`
 * (customers read their own overrides; only operators write). Unique per (organization, key).
 */
export const featureFlagOverrides = pgTable(
  "feature_flag_overrides",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key")
      .notNull()
      .references(() => featureFlags.key, { onDelete: "cascade", onUpdate: "cascade" }),
    enabled: boolean("enabled").notNull(),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("feature_flag_overrides_org_key_uq").on(t.organizationId, t.key),
    index("feature_flag_overrides_org_idx").on(t.organizationId),
  ],
);

export const ANNOUNCEMENT_SEVERITIES = ["info", "warn", "bad"] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

/** Localized announcement copy keyed by app locale (`en`, `de`, …); a missing locale falls back to English in the UI. */
export type AnnouncementTexts = Record<string, { title: string; body: string }>;

/** Who sees an announcement: every organization when both lists are absent or empty. */
export interface AnnouncementAudience {
  plans?: string[];
  organizationIds?: string[];
}

/** Platform-wide notices shown in the customer dashboard between `starts_at` and `ends_at` unless revoked. */
export const platformAnnouncements = pgTable(
  "platform_announcements",
  {
    id: id(),
    startsAt: tz("starts_at").notNull().defaultNow(),
    endsAt: tz("ends_at"),
    severity: text("severity").$type<AnnouncementSeverity>().notNull().default("info"),
    texts: jsonb("texts").$type<AnnouncementTexts>().notNull().default({}),
    audience: jsonb("audience").$type<AnnouncementAudience>().notNull().default({}),
    linkUrl: text("link_url"),
    createdBy: uuid("created_by"),
    revokedAt: tz("revoked_at"),
    ...timestamps(),
  },
  (t) => [index("platform_announcements_window_idx").on(t.revokedAt, t.startsAt, t.endsAt)],
);

/**
 * One row per scheduled worker job (`JOB_SCHEDULE` in apps/worker/src/jobs/index.ts), upserted after every
 * run as `tracksite_worker`. `last_ok_at` only moves on a successful run, so `last_run_at > last_ok_at`
 * means the latest run failed (`last_error`). Platform health reads it; nothing here is tenant data.
 */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  job: text("job").primaryKey(),
  lastRunAt: tz("last_run_at").notNull().defaultNow(),
  lastOkAt: tz("last_ok_at"),
  lastError: text("last_error"),
  lastDurationMs: integer("last_duration_ms"),
  host: text("host"),
});

/**
 * Internal operator notes about an organization. NOT tenant-visible: the migration revokes every privilege
 * from `tracksite_app` and enables RLS without a policy for it; only `tracksite_ops` reads and writes.
 */
export const opsNotes = pgTable(
  "ops_notes",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("ops_notes_org_idx").on(t.organizationId),
    index("ops_notes_org_pinned_idx").on(t.organizationId, t.pinned, t.createdAt),
  ],
);
