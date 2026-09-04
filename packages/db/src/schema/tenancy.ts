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

/**
 * Change types an organization can put behind a four-eyes approval (Team & Access, supplement §5
 * Pro entitlements "Freigabeprozesse, Vier-Augen-Prinzip"). The keys are stable identifiers that the
 * Releases, Destinations, Consent and Team modules look up before they execute the change; labels
 * live in the dashboard catalogs.
 */
export const APPROVAL_CHANGE_TYPES = ["config_publish", "config_rollback", "consent_publish", "credential_change", "destination_pause", "member_role_change", "kill_switch"] as const;
export type ApprovalChangeType = (typeof APPROVAL_CHANGE_TYPES)[number];

/**
 * Approval requirements stored in `organization_settings.approval_policy` (migration 0012). An
 * empty object means "nothing configured": no change type requires a second person. The requester
 * of a change never counts as its approver; `approverRoles` always includes OWNER.
 */
export interface ApprovalPolicy {
  /** change types that need a second, different member with an approver role before they run */
  fourEyes: Partial<Record<ApprovalChangeType, boolean>>;
  /** roles allowed to approve (OWNER is implied) */
  approverRoles: string[];
  /** ISO timestamp and user id of the last change; null until first configured */
  updatedAt: string | null;
  updatedBy: string | null;
}

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
  /** four-eyes approval requirements per change type (Team & Access, migration 0012); `{}` = nothing configured */
  approvalPolicy: jsonb("approval_policy").$type<Partial<ApprovalPolicy>>().notNull().default({}),
  ...timestamps(),
});

export const APPROVAL_REQUEST_STATUSES = ["pending", "applied", "rejected", "withdrawn", "expired"] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

/**
 * Four-eyes requests (migration 0012): a change that the organization's approval policy puts behind a
 * second person is stored here instead of being executed. A different member with an approver role
 * applies or rejects it; the requester can withdraw it. `payload` is the redacted description of the
 * change the applying module needs (for `member_role_change`: `{ role }`); `expiresAt` is set on
 * creation and evaluated on read (no job). Tenant table: `organization_id` + RLS policy.
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    organizationId: orgRef(),
    changeType: text("change_type").$type<ApprovalChangeType>().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    requestedBy: uuid("requested_by").notNull(),
    status: text("status").$type<ApprovalRequestStatus>().notNull().default("pending"),
    decidedBy: uuid("decided_by"),
    decidedAt: tz("decided_at"),
    decisionNote: text("decision_note"),
    expiresAt: tz("expires_at").notNull(),
    ...timestamps(),
  },
  (t) => [index("approval_requests_org_idx").on(t.organizationId), index("approval_requests_org_status_idx").on(t.organizationId, t.status, t.createdAt)],
);
