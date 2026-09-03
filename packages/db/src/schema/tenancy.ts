import type { OveragePolicy } from "@track-site/catalog";
import { sql } from "drizzle-orm";
import { bigint, boolean, char, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { createdAt, id, timestamps, tz } from "./_helpers.ts";

export const orgRef = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const siteStatusEnum = pgEnum("site_status", ["active", "paused", "deleted"]);
export const businessTypeEnum = pgEnum("business_type", ["ecommerce", "lead_generation", "saas", "content", "other"]);
export const platformEnum = pgEnum("site_platform", [
  "shopify",
  "woocommerce",
  "shopware",
  "wordpress",
  "headless",
  "custom",
  "unknown",
]);

export const sites = pgTable(
  "sites",
  {
    id: id(),
    organizationId: orgRef(),
    /** public, immutable, never recycled: ^[A-Z0-9]{6}$ */
    trackingId: char("tracking_id", { length: 6 }).notNull(),
    name: text("name").notNull(),
    primaryDomain: text("primary_domain"),
    businessType: businessTypeEnum("business_type"),
    platform: platformEnum("platform").notNull().default("unknown"),
    platformEvidence: jsonb("platform_evidence").$type<{ confidence: number; signals: string[] } | null>(),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    currency: char("currency", { length: 3 }),
    status: siteStatusEnum("status").notNull().default("active"),
    killSwitch: boolean("kill_switch").notNull().default(false),
    partitionOverride: text("partition_override"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by"),
    deletedAt: tz("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("sites_tracking_id_uq").on(t.trackingId),
    index("sites_org_idx").on(t.organizationId),
    uniqueIndex("sites_org_id_uq").on(t.organizationId, t.id),
  ],
);

export const domainVerificationMethodEnum = pgEnum("domain_verification_method", ["dns_txt", "file", "meta_tag"]);

export const domains = pgTable(
  "domains",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verificationToken: text("verification_token").notNull(),
    verificationMethod: domainVerificationMethodEnum("verification_method"),
    verifiedAt: tz("verified_at"),
    lastCheckedAt: tz("last_checked_at"),
    lastCheckResult: jsonb("last_check_result").$type<{ ok: boolean; detail: string } | null>(),
    /** optional first-party CNAME (metrics.customer.tld -> ingest) */
    cnameHost: text("cname_host"),
    cnameVerifiedAt: tz("cname_verified_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("domains_site_hostname_uq").on(t.siteId, t.hostname),
    index("domains_org_idx").on(t.organizationId),
    index("domains_hostname_idx").on(t.hostname),
  ],
);

export const environmentKindEnum = pgEnum("environment_kind", ["production", "staging", "development"]);

export const environments = pgTable(
  "environments",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: environmentKindEnum("kind").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    testMode: boolean("test_mode").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("environments_site_kind_uq").on(t.siteId, t.kind), index("environments_org_idx").on(t.organizationId)],
);

export const sourceKeyStatusEnum = pgEnum("source_key_status", ["active", "revoked"]);

/** Long, rotatable secrets for server events. Only the hash is stored. */
export const sourceKeys = pgTable(
  "source_keys",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    last4: text("last4").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'["events:write"]'::jsonb`),
    status: sourceKeyStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by"),
    lastUsedAt: tz("last_used_at"),
    revokedAt: tz("revoked_at"),
    /** grace period during rotation: old key valid until */
    validUntil: tz("valid_until"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("source_keys_hash_uq").on(t.keyHash), index("source_keys_org_idx").on(t.organizationId), index("source_keys_site_idx").on(t.siteId)],
);

/** Tracking ids are never recycled: tombstones survive site deletion. */
export const trackingIdTombstones = pgTable("tracking_id_tombstones", {
  trackingId: char("tracking_id", { length: 6 }).primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  siteId: uuid("site_id").notNull(),
  deletedAt: tz("deleted_at").notNull().defaultNow(),
});

export const nonces = pgTable(
  "nonces",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    expiresAt: tz("expires_at").notNull(),
  },
  (t) => [index("nonces_expires_idx").on(t.expiresAt)],
);

export const orgSettings = pgTable("organization_settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  dataRegion: text("data_region").notNull().default("eu"),
  killSwitch: boolean("kill_switch").notNull().default(false),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  locale: text("locale").notNull().default("en"),
  retentionOverrides: jsonb("retention_overrides").$type<Record<string, number>>().notNull().default({}),
  benchmarkOptIn: boolean("benchmark_opt_in").notNull().default(false),
  maxSites: integer("max_sites"),
  /** overage is never activated without an explicit choice: allow | cost_limit | pause (catalogue default: pause) */
  usageOveragePolicy: text("usage_overage_policy").$type<OveragePolicy>().notNull().default("pause"),
  /** monthly overage cost limit in cents for the `cost_limit` policy; null = not set */
  usageCostLimitCents: bigint("usage_cost_limit_cents", { mode: "number" }),
  ...timestamps(),
});
