import type { PlanRecordLimits } from "@track-site/catalog";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps, tz } from "./_helpers.ts";
import { organization } from "./auth.ts";
import { orgRef, sites } from "./tenancy.ts";

/** Shape of `plans.limits`; defined by the tariff catalogue (`null` = no fixed cap in this plan). */
export type PlanLimits = PlanRecordLimits;

/**
 * Plans mirror the tariff catalogue (`@track-site/catalog`): the seed writes one row per catalogue plan,
 * list prices live in the catalogue, Stripe price ids are referenced via env-configured names.
 * `features` holds catalogue feature keys (labels come from the catalogue per locale).
 */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  limits: jsonb("limits").$type<PlanLimits>().notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  /** env variable names holding the Stripe price ids (never the ids themselves in the DB) */
  stripePriceEnv: jsonb("stripe_price_env").$type<{ monthly: string | null; yearly: string | null }>().notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  contactSales: boolean("contact_sales").notNull().default(false),
  ...timestamps(),
});

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: subscriptionStatusEnum("status").notNull().default("none"),
    interval: text("interval"),
    currentPeriodStart: tz("current_period_start"),
    currentPeriodEnd: tz("current_period_end"),
    cancelAt: tz("cancel_at"),
    canceledAt: tz("canceled_at"),
    trialEnd: tz("trial_end"),
    /** payment failure grace period end; after this, hard limits apply */
    graceUntil: tz("grace_until"),
    lastStripeEventId: text("last_stripe_event_id"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("subscriptions_org_uq").on(t.organizationId), uniqueIndex("subscriptions_stripe_sub_uq").on(t.stripeSubscriptionId), index("subscriptions_customer_idx").on(t.stripeCustomerId)],
);

export const entitlementSourceEnum = pgEnum("entitlement_source", ["plan", "override", "trial"]);

export const entitlements = pgTable(
  "entitlements",
  {
    id: id(),
    organizationId: orgRef(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    source: entitlementSourceEnum("source").notNull().default("plan"),
    validFrom: tz("valid_from").notNull().defaultNow(),
    validTo: tz("valid_to"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("entitlements_org_key_uq").on(t.organizationId, t.key)],
);

export const usageKindEnum = pgEnum("usage_kind", ["accepted_event", "billable_event", "dropped_event", "deduplicated_event"]);

/** Immutable usage ledger: one row per accepted event and kind (append-only trigger in migration). */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    eventId: text("event_id").notNull(),
    kind: usageKindEnum("kind").notNull(),
    quantity: integer("quantity").notNull().default(1),
    recordedAt: tz("recorded_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usage_ledger_event_kind_uq").on(t.eventId, t.kind), index("usage_ledger_org_period_idx").on(t.organizationId, t.periodKey, t.kind)],
);

export const usagePeriods = pgTable(
  "usage_periods",
  {
    id: id(),
    organizationId: orgRef(),
    periodKey: text("period_key").notNull(),
    acceptedEvents: bigint("accepted_events", { mode: "number" }).notNull().default(0),
    billableEvents: bigint("billable_events", { mode: "number" }).notNull().default(0),
    droppedEvents: bigint("dropped_events", { mode: "number" }).notNull().default(0),
    deduplicatedEvents: bigint("deduplicated_events", { mode: "number" }).notNull().default(0),
    siteCount: integer("site_count").notNull().default(0),
    destinationCount: integer("destination_count").notNull().default(0),
    limitEvents: bigint("limit_events", { mode: "number" }),
    /** catalogue thresholds 70 / 90 / 100 %; `warned_80_at` is kept for rows written before the catalogue */
    warned70At: tz("warned_70_at"),
    warned80At: tz("warned_80_at"),
    warned90At: tz("warned_90_at"),
    warned100At: tz("warned_100_at"),
    softLimitHitAt: tz("soft_limit_hit_at"),
    hardLimitHitAt: tz("hard_limit_hit_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("usage_periods_org_period_uq").on(t.organizationId, t.periodKey)],
);

/** Idempotent Stripe webhook ledger. */
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    apiVersion: text("api_version"),
    organizationId: uuid("organization_id"),
    payloadDigest: text("payload_digest").notNull(),
    receivedAt: createdAt(),
    processedAt: tz("processed_at"),
    error: text("error"),
  },
  (t) => [index("stripe_events_type_idx").on(t.type, t.receivedAt)],
);
