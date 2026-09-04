import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_helpers.ts";
import { credentials, integrations } from "./config.ts";
import { orgRef, sites } from "./tenancy.ts";

export const shopPlatformEnum = pgEnum("shop_platform", ["shopify", "woocommerce", "shopware"]);
export const shopConnectionStatusEnum = pgEnum("shop_connection_status", ["pending", "connected", "paused"]);

export interface ShopConnectionSettings {
  /** currency assumed when the platform payload carries no ISO code (Shopware app webhooks) */
  default_currency?: string;
  /** webhook topics observed so far */
  topics?: string[];
}

/**
 * Verified server-side order sources: one connection per site and shop platform. The webhook URL carries
 * an unguessable path token; the signing secret lives envelope-encrypted in `credentials`, never here.
 */
export const shopConnections = pgTable(
  "shop_connections",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    platform: shopPlatformEnum("platform").notNull(),
    shopDomain: text("shop_domain").notNull(),
    status: shopConnectionStatusEnum("status").notNull().default("pending"),
    pathToken: text("path_token").notNull(),
    credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
    settings: jsonb("settings").$type<ShopConnectionSettings>().notNull().default({}),
    lastEventAt: tz("last_event_at"),
    lastError: text("last_error"),
    createdBy: uuid("created_by"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("shop_connections_site_platform_uq").on(t.siteId, t.platform), uniqueIndex("shop_connections_path_token_uq").on(t.pathToken), index("shop_connections_org_idx").on(t.organizationId)],
);

/** Reasons a verified order did not reach a destination; `unknown` is never resolved by guessing. */
export const RECONCILIATION_GAP_REASONS = ["no_consent", "blocked", "not_captured", "delivery_failed", "unknown"] as const;
export type ReconciliationGapReason = (typeof RECONCILIATION_GAP_REASONS)[number];

export interface ReconciliationSources {
  /** shop connections of the site at computation time */
  shop_connections: Array<{ platform: string; status: string; last_event_at: string | null }>;
  /** active server source keys (server-API orders and leads) */
  server_keys: number;
  /** delivery attempts were recorded for the destination inside the period */
  delivery_attempts: number;
  /** the destination's delivery mode in the active bundle (`browser` destinations receive nothing server-side) */
  destination_mode: string | null;
  /** per-destination rows only: the destination had an enabled mapping for the kind's event in the active bundle */
  mapped?: boolean;
  /** per-destination rows only: the destination was enabled in the active bundle */
  enabled?: boolean;
}

/**
 * Signal Gap & Revenue Leak Detector (redesign supplement §8 module 4), migration 0009. One row per site,
 * kind (purchase | lead), day and destination — `integration_id` NULL is the site-level capture row. The worker
 * compares authoritative conversion records (verified shop webhooks, verified server API) with the events
 * observed for the same order id and with the delivery attempts per destination. Values are sums of the values
 * the records carry: an order without a value is counted in `authoritative_count` but never valued, so the leak
 * is reported as a range (`leak_value_min`/`leak_value_max`) plus the number of unvalued orders.
 */
export const revenueReconciliationSnapshots = pgTable(
  "revenue_reconciliation_snapshots",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    granularity: text("granularity").notNull().default("day"),
    periodStart: tz("period_start").notNull(),
    periodEnd: tz("period_end").notNull(),
    /** authoritative conversions (verified records) inside the period */
    authoritativeCount: integer("authoritative_count").notNull().default(0),
    /** how many of them carry a value */
    authoritativeValuedCount: integer("authoritative_valued_count").notNull().default(0),
    /** sum of the known values; null when no record carries a value or the currencies are mixed */
    authoritativeValue: numeric("authoritative_value", { precision: 14, scale: 2 }),
    /** ISO code shared by every valued record; null when unknown or mixed */
    currency: text("currency"),
    currencyMixed: boolean("currency_mixed").notNull().default(false),
    /** authoritative conversions for which a browser event with the same order id exists */
    observedBrowserCount: integer("observed_browser_count").notNull().default(0),
    /** events dropped as duplicate conversions inside the period (same path reported the order twice) */
    deduplicatedCount: integer("deduplicated_count").notNull().default(0),
    /** authoritative conversions with at least one successful delivery (site row: to any destination) */
    deliveredCount: integer("delivered_count").notNull().default(0),
    gapNoConsent: integer("gap_no_consent").notNull().default(0),
    gapBlocked: integer("gap_blocked").notNull().default(0),
    gapNotCaptured: integer("gap_not_captured").notNull().default(0),
    gapDeliveryFailed: integer("gap_delivery_failed").notNull().default(0),
    gapUnknown: integer("gap_unknown").notNull().default(0),
    /** value of the definitive gaps (no consent, blocked, not captured, delivery failed) with a known value */
    leakValueMin: numeric("leak_value_min", { precision: 14, scale: 2 }),
    /** `leak_value_min` plus the known values of the conversions whose state is unknown */
    leakValueMax: numeric("leak_value_max", { precision: 14, scale: 2 }),
    /** gaps (definitive or unknown) whose value is unknown — they can never be turned into an amount */
    leakUnvaluedCount: integer("leak_unvalued_count").notNull().default(0),
    sources: jsonb("sources").$type<ReconciliationSources>().notNull().default({ shop_connections: [], server_keys: 0, delivery_attempts: 0, destination_mode: null }),
    computedAt: tz("computed_at").notNull().defaultNow(),
  },
  (t) => [
    unique("revenue_reconciliation_period_uq").on(t.siteId, t.integrationId, t.kind, t.granularity, t.periodStart).nullsNotDistinct(),
    index("revenue_reconciliation_site_period_idx").on(t.siteId, t.periodStart),
    index("revenue_reconciliation_org_idx").on(t.organizationId),
  ],
);
