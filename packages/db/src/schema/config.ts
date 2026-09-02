import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps, tz } from "./_helpers.ts";
import { environments, orgRef, sites } from "./tenancy.ts";

export const eventDefinitionStatusEnum = pgEnum("event_definition_status", ["draft", "active", "disabled"]);
export const captureEnum = pgEnum("event_capture", ["auto_page", "data_layer", "shop_integration", "manual_api", "form_submit", "click_selector"]);

export const eventDefinitions = pgTable(
  "event_definitions",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isStandard: boolean("is_standard").notNull(),
    critical: boolean("critical").notNull().default(false),
    capture: captureEnum("capture").notNull().default("manual_api"),
    schema: jsonb("schema").$type<Record<string, unknown> | null>(),
    purposes: jsonb("purposes").$type<string[]>().notNull().default([]),
    sourceOfTruth: text("source_of_truth"),
    status: eventDefinitionStatusEnum("status").notNull().default("draft"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("event_definitions_site_name_uq").on(t.siteId, t.name), index("event_definitions_org_idx").on(t.organizationId)],
);

export const connectorTypeEnum = pgEnum("connector_type", [
  "webhook",
  "meta",
  "google_ads",
  "ga4",
  "tiktok",
  "microsoft",
  "linkedin",
  "reddit",
  "pinterest",
  "snapchat",
  "x",
  "taboola",
  "outbrain",
  "amazon",
  "spotify",
  "quora",
  "yahoo",
  "tradedesk",
  "gmp",
  "adroll",
  "criteo",
  "affiliate",
]);
export const integrationStatusEnum = pgEnum("integration_status", ["draft", "not_connected", "connected", "paused", "error"]);

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    connectorType: connectorTypeEnum("connector_type").notNull(),
    name: text("name").notNull(),
    status: integrationStatusEnum("status").notNull().default("draft"),
    /** public identifiers only (pixel id, measurement id, webhook url) */
    publicConfig: jsonb("public_config").$type<Record<string, unknown>>().notNull().default({}),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    requiredPurpose: text("required_purpose"),
    health: jsonb("health").$type<{ status: string; checkedAt: string | null; detail: string | null; apiVersion: string | null }>().notNull().default({ status: "unknown", checkedAt: null, detail: null, apiVersion: null }),
    testMode: boolean("test_mode").notNull().default(true),
    pausedAt: tz("paused_at"),
    ...timestamps(),
  },
  (t) => [index("integrations_org_idx").on(t.organizationId), index("integrations_site_idx").on(t.siteId), uniqueIndex("integrations_org_id_uq").on(t.organizationId, t.id)],
);

export const credentialKindEnum = pgEnum("credential_kind", ["access_token", "api_secret", "oauth_refresh_token", "oauth_access_token", "webhook_secret", "signing_secret"]);
export const credentialStatusEnum = pgEnum("credential_status", ["active", "rotated", "revoked", "expired"]);

/** Envelope-encrypted secrets. The model only ever sees id, kind, status, scope and last4. */
export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    organizationId: orgRef(),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    kind: credentialKindEnum("kind").notNull(),
    label: text("label").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyId: text("key_id").notNull(),
    last4: text("last4"),
    scope: jsonb("scope").$type<string[]>().notNull().default([]),
    status: credentialStatusEnum("status").notNull().default("active"),
    expiresAt: tz("expires_at"),
    rotatedAt: tz("rotated_at"),
    revokedAt: tz("revoked_at"),
    lastValidatedAt: tz("last_validated_at"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("credentials_org_idx").on(t.organizationId), index("credentials_integration_idx").on(t.integrationId)],
);

export const oauthConnections = pgTable(
  "oauth_connections",
  {
    id: id(),
    organizationId: orgRef(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    externalAccountName: text("external_account_name"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    refreshCredentialId: uuid("refresh_credential_id").references(() => credentials.id, { onDelete: "set null" }),
    accessCredentialId: uuid("access_credential_id").references(() => credentials.id, { onDelete: "set null" }),
    accessExpiresAt: tz("access_expires_at"),
    status: text("status").notNull().default("connected"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("oauth_connections_integration_uq").on(t.integrationId), index("oauth_connections_org_idx").on(t.organizationId)],
);

export const eventMappings = pgTable(
  "event_mappings",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    vendorEventName: text("vendor_event_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** JSONLogic field map, validated against the allow-list */
    fieldMap: jsonb("field_map").$type<Record<string, unknown>>().notNull().default({}),
    conditions: jsonb("conditions").$type<Record<string, unknown> | null>(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("event_mappings_integration_event_uq").on(t.integrationId, t.eventName), index("event_mappings_org_idx").on(t.organizationId)],
);

export const configDraftStatusEnum = pgEnum("config_draft_status", ["open", "validated", "published", "discarded"]);

export const configDrafts = pgTable(
  "config_drafts",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    baseVersion: integer("base_version"),
    bundle: jsonb("bundle").$type<Record<string, unknown>>().notNull(),
    lint: jsonb("lint").$type<{ errors: unknown[]; warnings: unknown[]; checkedAt: string } | null>(),
    status: configDraftStatusEnum("status").notNull().default("open"),
    createdBy: uuid("created_by"),
    ...timestamps(),
  },
  (t) => [index("config_drafts_site_env_idx").on(t.siteId, t.environmentId), index("config_drafts_org_idx").on(t.organizationId)],
);

/** Immutable, signed config versions. */
export const configVersions = pgTable(
  "config_versions",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    bundle: jsonb("bundle").$type<Record<string, unknown>>().notNull(),
    digest: text("digest").notNull(),
    signature: text("signature").notNull(),
    keyId: text("key_id").notNull(),
    summary: text("summary"),
    diff: jsonb("diff").$type<unknown[]>(),
    draftId: uuid("draft_id").references(() => configDrafts.id, { onDelete: "set null" }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("config_versions_env_version_uq").on(t.environmentId, t.version), index("config_versions_org_idx").on(t.organizationId)],
);

export const publicationKindEnum = pgEnum("publication_kind", ["publish", "rollback"]);

export const configPublications = pgTable(
  "config_publications",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => configVersions.id, { onDelete: "cascade" }),
    kind: publicationKindEnum("kind").notNull().default("publish"),
    rollbackOfVersionId: uuid("rollback_of_version_id").references(() => configVersions.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    approvalId: uuid("approval_id"),
    publishedBy: uuid("published_by"),
    publishedAt: tz("published_at").notNull().defaultNow(),
    supersededAt: tz("superseded_at"),
  },
  (t) => [index("config_publications_env_active_idx").on(t.environmentId, t.isActive), index("config_publications_org_idx").on(t.organizationId)],
);
