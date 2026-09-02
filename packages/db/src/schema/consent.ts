import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_helpers.ts";
import { orgRef, sites } from "./tenancy.ts";

export const consentPolicyStatusEnum = pgEnum("consent_policy_status", ["draft", "published", "archived"]);

/** Versioned consent/privacy policy per site: region matrix, purposes, vendor map, CMP integration. */
export const consentPolicies = pgTable(
  "consent_policies",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: consentPolicyStatusEnum("status").notNull().default("draft"),
    regionPolicies: jsonb("region_policies").$type<Record<string, { mode: string; allowAdvancedConsentMode: boolean }>>().notNull().default({}),
    purposes: jsonb("purposes").$type<string[]>().notNull().default(sql`'["necessary","analytics","marketing","personalization"]'::jsonb`),
    destinationPurposes: jsonb("destination_purposes").$type<Record<string, string>>().notNull().default({}),
    operationalEvents: jsonb("operational_events").$type<string[]>().notNull().default(sql`'["purchase","refund"]'::jsonb`),
    cmp: jsonb("cmp").$type<{ provider: string; settings: Record<string, unknown> } | null>(),
    consentMode: jsonb("consent_mode").$type<{ mode: "basic" | "advanced"; legalReviewNote: string | null }>().notNull().default({ mode: "basic", legalReviewNote: null }),
    legalBasisNote: text("legal_basis_note"),
    publishedAt: tz("published_at"),
    createdBy: uuid("created_by"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("consent_policies_site_version_uq").on(t.siteId, t.version), index("consent_policies_org_idx").on(t.organizationId)],
);

/** Deduplicated evidentiary consent snapshots referenced by events. */
export const consentSnapshots = pgTable(
  "consent_snapshots",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    policyVersion: text("policy_version"),
    granted: jsonb("granted").$type<string[]>().notNull(),
    vendors: jsonb("vendors").$type<string[]>().notNull().default([]),
    source: text("source").notNull(),
    region: text("region"),
    gpc: boolean("gpc"),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    eventCount: integer("event_count").notNull().default(0),
  },
  (t) => [uniqueIndex("consent_snapshots_site_hash_uq").on(t.siteId, t.hash), index("consent_snapshots_org_idx").on(t.organizationId)],
);
