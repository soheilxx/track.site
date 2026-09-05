import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError, newUlid, silentLogger } from "@track-site/core";
import { PgEventStore } from "@track-site/analytics";
import { credentialRequirementsFor, getConnector, missingCredentialKinds, type ConnectorContext, type CredentialKind } from "@track-site/connectors";
import type { ConfigBundle } from "@track-site/config";
import { credentials, deliveryAttempts, getOrCreateDraft, getSite, integrations, listCredentialRefs, setIntegrationStatus, updateDraft, withTenant, recordAudit } from "@track-site/db";
import { getStandardEvent, isValidCustomEventName } from "@track-site/events";
import { QUEUES } from "@track-site/queue";
import type { AgentContext } from "../context.ts";
import { defineTool } from "./registry.ts";
import { syncDestinationsStep } from "./draft.ts";
import { loadSetupState, saveSetupState } from "../setup-store.ts";

function poolOf(ctx: AgentContext) {
  return (ctx.db as unknown as { $client: Pool }).$client;
}

function actorOf(ctx: AgentContext) {
  return { kind: "agent" as const, onBehalfOfUserId: ctx.userId, role: ctx.role as "OWNER", chatSessionId: ctx.chatSessionId };
}

/** Destination ids only ever come from tool results; the context block lists destinations by name, so the model must not guess. */
const integrationIdSchema = z.string().uuid().describe("UUID of the destination: copy `id` from list_integrations / get_workspace_state or `integration_id` from create_integration_draft; never the name or connector type");

async function integrationOf(ctx: AgentContext, integrationId: string) {
  const row = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(integrations).where(and(eq(integrations.id, integrationId), eq(integrations.siteId, ctx.siteId))).limit(1))[0] ?? null);
  if (!row) throw new AppError("NOT_FOUND", `integration ${integrationId} not found for this site; call list_integrations for valid ids`);
  return row;
}

/** Connector context whose credentials come from the vault; the plaintext never leaves the server process. */
export function connectorContextFor(ctx: AgentContext, integration: { id: string; siteId: string; publicConfig: Record<string, unknown>; settings: Record<string, unknown>; testMode: boolean }, platform: Record<string, string | null | undefined> = {}): ConnectorContext {
  return {
    organizationId: ctx.organizationId,
    siteId: integration.siteId,
    integrationId: integration.id,
    publicConfig: integration.publicConfig,
    settings: integration.settings,
    testMode: integration.testMode,
    getCredential: async (kind: CredentialKind) => {
      if (!ctx.vault) return null;
      const rows = await withTenant(ctx.db, ctx.organizationId, (tx) => tx.select({ ciphertext: credentials.ciphertext }).from(credentials).where(and(eq(credentials.integrationId, integration.id), eq(credentials.kind, kind), eq(credentials.status, "active"))).orderBy(desc(credentials.createdAt)).limit(1));
      const row = rows[0];
      return row ? ctx.vault.decrypt(row.ciphertext, `integration:${integration.id}`) : null;
    },
    fetch: ctx.fetch,
    baseUrlOverride: process.env.VENDOR_MOCK_BASE_URL ?? null,
    allowPrivateNetwork: ctx.allowPrivateNetwork,
    logger: ctx.logger ?? silentLogger(),
    now: ctx.now,
    platform: { google_ads_developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? null, x_consumer_key: process.env.X_CONSUMER_KEY ?? null, x_consumer_secret: process.env.X_CONSUMER_SECRET ?? null, amazon_ads_client_id: process.env.AMAZON_ADS_CLIENT_ID ?? null, ...platform },
    oauth: null,
  };
}

/**
 * settings keys a connector accepts through the wizard/chat (never secrets). The names are exactly
 * the keys the connector reads from `ctx.settings` (packages/connectors), so the webhook keys are camelCase.
 */
export const DESTINATION_SETTING_KEYS: Record<string, string[]> = {
  meta: ["test_event_code"],
  tiktok: ["test_event_code"],
  linkedin: ["conversion_rules"],
  google_ads: ["conversion_actions"],
  gmp: ["floodlight_activities"],
  x: ["event_ids"],
  affiliate: ["merchant_id", "commission_group", "enterprise_id", "action_id", "account_sid", "campaign_id", "action_tracker_id", "product_id", "organization_id", "event_id", "program_id", "network_domain", "network_id", "goal_id", "postback_url"],
  amazon: ["profile_id"],
  microsoft: [],
  reddit: [],
  pinterest: [],
  snapchat: [],
  ga4: [],
  taboola: [],
  outbrain: [],
  spotify: [],
  quora: [],
  yahoo: [],
  tradedesk: [],
  adroll: [],
  criteo: [],
  webhook: ["allowFields", "includeIdentifiers", "timeoutMs"],
};

export type DestinationSettingKind = "string" | "number" | "boolean" | "event_map" | "string_list";

export interface DestinationSettingSpec {
  kind: DestinationSettingKind;
  /** what a valid value looks like; shown to the model and echoed in validation errors */
  hint: string;
  /** string / string_list: every value must match; event_map: every id must match */
  pattern?: RegExp;
  /** number bounds (inclusive) */
  min?: number;
  max?: number;
  integer?: boolean;
  /** the connector reads this key from publicConfig, so the value is mirrored there as well */
  mirrorToPublicConfig?: boolean;
}

const NUMERIC_ID = /^[0-9]{1,20}$/;
const affiliateId = (hint: string): DestinationSettingSpec => ({ kind: "string", hint, mirrorToPublicConfig: true });

/** value shape per setting key, matching what the connectors read (linkedin.ts, google-ads.ts, gmp.ts, x.ts, webhook.ts, amazon.ts, affiliate.ts) */
export const DESTINATION_SETTING_SPECS: Record<string, DestinationSettingSpec> = {
  test_event_code: { kind: "string", pattern: /^[A-Za-z0-9_-]{1,64}$/, hint: "test event code from the vendor's Events Manager test tab (letters, digits, _ or -), e.g. TEST12345" },
  conversion_rules: { kind: "event_map", pattern: NUMERIC_ID, hint: "canonical event name -> LinkedIn conversion rule id (digits only)" },
  conversion_actions: { kind: "event_map", pattern: NUMERIC_ID, hint: "canonical event name -> Google Ads conversion action id (digits only)" },
  floodlight_activities: { kind: "event_map", pattern: NUMERIC_ID, hint: "canonical event name -> Floodlight activity id (digits only)" },
  event_ids: { kind: "event_map", pattern: /^tw-[a-z0-9]+-[a-z0-9]+$/i, hint: "canonical event name -> X event id in the form tw-xxxxx-xxxxx" },
  merchant_id: affiliateId("affiliate network merchant id (public)"),
  commission_group: affiliateId("affiliate commission group (public)"),
  enterprise_id: affiliateId("affiliate enterprise id (public)"),
  action_id: affiliateId("affiliate action id (public)"),
  account_sid: affiliateId("affiliate account sid (public)"),
  campaign_id: affiliateId("affiliate campaign id (public)"),
  action_tracker_id: affiliateId("affiliate action tracker id (public)"),
  product_id: affiliateId("affiliate product id (public)"),
  organization_id: affiliateId("affiliate network organization id (public)"),
  event_id: affiliateId("affiliate event id (public)"),
  program_id: affiliateId("affiliate program id (public)"),
  network_domain: affiliateId("affiliate network domain (public)"),
  network_id: affiliateId("affiliate network id (public)"),
  goal_id: affiliateId("affiliate goal id (public)"),
  postback_url: affiliateId("affiliate postback URL (public, https)"),
  profile_id: { kind: "string", pattern: /^[A-Za-z0-9._-]{1,64}$/, hint: "Amazon Ads profile id (Amazon-Advertising-API-Scope)", mirrorToPublicConfig: true },
  allowFields: { kind: "string_list", pattern: /^[a-z][a-z0-9_]{0,63}$/, hint: "event field names forwarded to the webhook, e.g. event_id, name, url, props, commerce" },
  includeIdentifiers: { kind: "boolean", hint: "true also forwards identifier fields (anonymous_id, session_id, user_id, user_data, click_ids, vendor_ids, ip_truncated, ua_family)" },
  timeoutMs: { kind: "number", min: 1000, max: 30_000, integer: true, hint: "request timeout in milliseconds, 1000-30000 (default 10000)" },
};

/** every key any connector accepts; the tool schema exposes exactly this list as an enum */
export const DESTINATION_SETTING_KEY_LIST = Array.from(new Set(Object.values(DESTINATION_SETTING_KEYS).flat())) as [string, ...string[]];
for (const key of DESTINATION_SETTING_KEY_LIST) if (!DESTINATION_SETTING_SPECS[key]) throw new Error(`DESTINATION_SETTING_SPECS is missing a value shape for setting ${key}`);

const VALUE_FIELDS = ["string_value", "number_value", "boolean_value", "event_map", "string_list"] as const;
type ValueField = (typeof VALUE_FIELDS)[number];
const VALUE_FIELD_OF: Record<DestinationSettingKind, ValueField> = { string: "string_value", number: "number_value", boolean: "boolean_value", event_map: "event_map", string_list: "string_list" };

const SECRET_LIKE = /\b(EAA[A-Za-z0-9]{40,}|sk_(live|test)_|whsec_|AKIA|ya29\.)/;

const settingShapes = Object.entries(DESTINATION_SETTING_SPECS)
  .map(([key, spec]) => `${key}: ${spec.kind} (${spec.hint})`)
  .join("; ");

export const destinationSettingEntrySchema = z.object({
  key: z.enum(DESTINATION_SETTING_KEY_LIST).describe(`setting name; only the keys listed for the destination's connector are accepted. Shapes — ${settingShapes}`),
  string_value: z.string().max(256).nullable().describe("value for string settings; null for other shapes"),
  number_value: z.number().nullable().describe("value for number settings (timeoutMs); null for other shapes"),
  boolean_value: z.boolean().nullable().describe("value for boolean settings (includeIdentifiers); null for other shapes"),
  event_map: z
    .array(z.object({ event: z.string().min(1).max(64).describe("canonical event name, e.g. purchase or generate_lead"), id: z.string().min(1).max(128).describe("the vendor's id for that event") }))
    .min(1)
    .max(100)
    .nullable()
    .describe("value for event_map settings (conversion_rules, conversion_actions, floodlight_activities, event_ids): one entry per canonical event, replaces the stored map; null for other shapes"),
  string_list: z.array(z.string().min(1).max(64)).min(1).max(50).nullable().describe("value for string_list settings (allowFields), replaces the stored list; null for other shapes"),
});
export type DestinationSettingEntry = z.infer<typeof destinationSettingEntrySchema>;

function settingError(key: string, spec: DestinationSettingSpec, detail: string): AppError {
  return new AppError("VALIDATION_ERROR", `setting ${key}: ${detail}; expected ${spec.hint}`);
}

function eventMapOf(key: string, spec: DestinationSettingSpec, entries: NonNullable<DestinationSettingEntry["event_map"]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { event, id } of entries) {
    const name = event.trim().toLowerCase();
    if (!getStandardEvent(name) && !isValidCustomEventName(name)) throw new AppError("VALIDATION_ERROR", `setting ${key}: "${event}" is not a canonical event name (use a standard event such as purchase or a valid custom event name)`);
    if (name in out) throw new AppError("VALIDATION_ERROR", `setting ${key}: event ${name} is listed twice`);
    const value = id.trim();
    if (spec.pattern && !spec.pattern.test(value)) throw settingError(key, spec, `id "${value}" for ${name} is invalid`);
    out[name] = value;
  }
  return out;
}

function settingValueOf(key: string, spec: DestinationSettingSpec, entry: DestinationSettingEntry): unknown {
  switch (spec.kind) {
    case "string": {
      const value = (entry.string_value ?? "").trim();
      if (SECRET_LIKE.test(value)) throw new AppError("POLICY_BLOCKED", `setting ${key} looks like a secret; secrets are only accepted through the secure credential card`);
      if (!value) throw settingError(key, spec, "value is empty");
      if (spec.pattern && !spec.pattern.test(value)) throw settingError(key, spec, `"${value}" is invalid`);
      return value;
    }
    case "number": {
      const value = entry.number_value ?? Number.NaN;
      if (!Number.isFinite(value) || (spec.integer && !Number.isInteger(value))) throw settingError(key, spec, `${value} is not ${spec.integer ? "an integer" : "a number"}`);
      if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) throw settingError(key, spec, `${value} is out of range`);
      return value;
    }
    case "boolean":
      return entry.boolean_value === true;
    case "event_map":
      return eventMapOf(key, spec, entry.event_map ?? []);
    case "string_list": {
      const out: string[] = [];
      for (const raw of entry.string_list ?? []) {
        const value = raw.trim();
        if (spec.pattern && !spec.pattern.test(value)) throw settingError(key, spec, `"${value}" is not a valid field name`);
        if (!out.includes(value)) out.push(value);
      }
      return out;
    }
  }
}

/**
 * Validates settings entries for one connector and returns the records to merge into the
 * integration. Throws before anything is persisted; every message names the allowed keys or shape.
 */
export function resolveSettingEntries(connectorType: string, entries: DestinationSettingEntry[]): { settings: Record<string, unknown>; publicConfig: Record<string, unknown> } {
  const allowed = DESTINATION_SETTING_KEYS[connectorType] ?? [];
  const settings: Record<string, unknown> = {};
  const publicConfig: Record<string, unknown> = {};
  for (const entry of entries) {
    const key = entry.key;
    if (!allowed.includes(key)) throw new AppError("VALIDATION_ERROR", `setting ${key} is not supported for ${connectorType}; supported: ${allowed.join(", ") || "none"}`);
    if (key in settings) throw new AppError("VALIDATION_ERROR", `setting ${key} is listed twice; send each key once`);
    const spec = DESTINATION_SETTING_SPECS[key];
    if (!spec) throw new AppError("VALIDATION_ERROR", `setting ${key} has no value shape`);
    const field = VALUE_FIELD_OF[spec.kind];
    const provided = VALUE_FIELDS.filter((f) => entry[f] !== null);
    if (provided.length !== 1 || provided[0] !== field) throw new AppError("VALIDATION_ERROR", `setting ${key} is a ${spec.kind} setting: set ${field} (${spec.hint}) and leave the other value fields null`);
    settings[key] = settingValueOf(key, spec, entry);
    if (spec.mirrorToPublicConfig) publicConfig[key] = settings[key];
  }
  return { settings, publicConfig };
}

const settingsCatalog = Object.entries(DESTINATION_SETTING_KEYS)
  .filter(([, keys]) => keys.length)
  .map(([type, keys]) => `${type}: ${keys.join(", ")}`)
  .join("; ");

export const setDestinationSettingsDraft = defineTool({
  name: "set_destination_settings_draft",
  // keep this under OpenAI's 1024-character function description limit; per-key shapes live on the `key` property
  description: `Updates a destination's delivery mode (browser/server/hybrid), test mode, name, enabled flag and connector settings. Never accepts secrets. Supported settings per connector — ${settingsCatalog}; connectors not listed have none. Each settings entry sets exactly one value field for its shape (string_value, number_value, boolean_value, event_map or string_list) and leaves the others null. Unsupported keys or malformed values are rejected and nothing is changed.`,
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({
    integration_id: integrationIdSchema,
    mode: z.enum(["browser", "server", "hybrid"]).nullable().describe("delivery mode; null keeps the current mode"),
    test_mode: z.boolean().nullable().describe("null keeps the current test mode"),
    enabled: z.boolean().nullable().describe("null keeps the current enabled flag"),
    name: z.string().min(1).max(80).nullable().describe("new display name; null keeps the current name"),
    settings: z.array(destinationSettingEntrySchema).max(20).nullable().describe("settings to set or replace; null changes no settings"),
  }),
  handler: async (args, ctx) => {
    const integration = await integrationOf(ctx, args.integration_id);
    const connector = getConnector(integration.connectorType);
    if (args.mode === "browser" && !connector?.meta.supportsBrowser) throw new AppError("VALIDATION_ERROR", `${integration.connectorType} has no browser tag`);
    if (args.mode === "server" && !connector?.meta.supportsServer) throw new AppError("VALIDATION_ERROR", `${integration.connectorType} has no server path`);
    const resolved = resolveSettingEntries(integration.connectorType, args.settings ?? []);
    const settings: Record<string, unknown> = { ...integration.settings, ...resolved.settings };
    const publicConfig: Record<string, unknown> = { ...integration.publicConfig, ...resolved.publicConfig };
    const updatedKeys = Object.keys(resolved.settings);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const draft = await getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId });
      // membership is checked before any write: a disconnected destination keeps its row but must not receive settings
      if (!(draft.bundle as ConfigBundle).destinations.some((d) => d.id === integration.id)) throw new AppError("NOT_FOUND", `destination ${integration.id} is not part of the current draft (removed or disconnected); nothing was changed — create it again with create_integration_draft`);
      await tx.update(integrations).set({ settings, publicConfig, ...(args.test_mode !== null ? { testMode: args.test_mode } : {}), ...(args.name ? { name: args.name } : {}) }).where(eq(integrations.id, integration.id));
      await recordAudit(tx, { organizationId: ctx.organizationId, actor: actorOf(ctx), action: "integration.settings", targetType: "integration", targetId: integration.id, diff: { keys: updatedKeys, mode: args.mode, test_mode: args.test_mode, enabled: args.enabled } });
      return updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === integration.id);
        if (!d) throw new AppError("NOT_FOUND", `destination ${integration.id} is not part of the current draft`);
        if (args.mode) d.mode = args.mode;
        if (args.test_mode !== null) d.test_mode = args.test_mode;
        if (args.enabled !== null) d.enabled = args.enabled;
        if (args.name) d.name = args.name;
        if (integration.connectorType === "affiliate") d.browser = null;
      });
    });
    return { integration_id: integration.id, mode: args.mode, test_mode: args.test_mode, enabled: args.enabled, settings_updated: updatedKeys, settings_keys: Object.keys(settings), lint_errors: lint.errors.map((e) => e.message), lint_warnings: lint.warnings.map((w) => w.message) };
  },
});

export const validateIntegrationCredentials = defineTool({
  name: "validate_integration_credentials",
  description: "Validates the stored credentials and public identifiers of a destination against the vendor API (cheapest read or validate-only call), updates the destination status and health and returns the vendor's verdict. Never returns secrets.",
  kind: "draft",
  trust: "external",
  permission: "integrations.manage",
  input: z.object({ integration_id: integrationIdSchema }),
  handler: async (args, ctx) => {
    const integration = await integrationOf(ctx, args.integration_id);
    const connector = getConnector(integration.connectorType);
    if (!connector) throw new AppError("NOT_FOUND", "connector not available");
    const cctx = connectorContextFor(ctx, integration);
    const validation = await connector.validateCredentials(cctx);
    const health = await connector.getHealth(cctx);
    const status = validation.ok ? "connected" : validation.status === "not_connected" ? "not_connected" : "error";
    await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      await setIntegrationStatus(tx, { siteId: integration.siteId, integrationId: integration.id, status: integration.status === "paused" ? "paused" : status, health: { status: health.status, checkedAt: health.checkedAt, detail: health.detail, apiVersion: health.apiVersion }, actor: actorOf(ctx) });
      await tx.update(credentials).set({ lastValidatedAt: new Date() }).where(and(eq(credentials.integrationId, integration.id), eq(credentials.status, "active")));
    });
    const refs = await withTenant(ctx.db, ctx.organizationId, (tx) => listCredentialRefs(tx, integration.id));
    const missingIds = connector.meta.requiredPublicIds.filter((p) => !/\?\$$/.test(p.pattern) && !/\{0,/.test(p.pattern) && !integration.publicConfig[p.key]).map((p) => p.key);
    const missingCreds = missingCredentialKinds(credentialRequirementsFor(connector, integration.publicConfig as Record<string, unknown>), refs);
    // a stored or validated credential can complete the destinations step
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state = (await syncDestinationsStep(ctx, state, `credentials validated for ${integration.id}`)).state;
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { integration_id: integration.id, status: integration.status === "paused" ? "paused" : status, validation: { ok: validation.ok, status: validation.status, detail: validation.detail, api_version: validation.apiVersion, checked_at: validation.checkedAt }, health: { status: health.status, detail: health.detail, sunset_watch: health.sunsetWatch }, missing_public_ids: missingIds, missing_credentials: missingCreds, access_note: connector.meta.accessNote ?? null };
  },
});

export const getDestinationStatus = defineTool({
  name: "get_destination_status",
  description: "Full status of one destination: connector requirements, stored credential references, draft configuration (mode, mappings, test mode), health, delivery counts for the last 7 days and the most recent delivery attempts with redacted errors.",
  kind: "read",
  trust: "external",
  permission: "integrations.read",
  input: z.object({ integration_id: integrationIdSchema }),
  handler: async (args, ctx) => {
    const integration = await integrationOf(ctx, args.integration_id);
    const connector = getConnector(integration.connectorType);
    const since = new Date(ctx.now().getTime() - 7 * 86_400_000);
    const data = await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const refs = await listCredentialRefs(tx, integration.id);
      const draft = await getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId });
      const counts = await tx.select({ status: deliveryAttempts.status, n: sql<number>`count(*)::int` }).from(deliveryAttempts).where(and(eq(deliveryAttempts.integrationId, integration.id), gte(deliveryAttempts.startedAt, since))).groupBy(deliveryAttempts.status);
      const recent = await tx
        .select({ id: deliveryAttempts.id, event: deliveryAttempts.eventName, status: deliveryAttempts.status, errorClass: deliveryAttempts.errorClass, code: deliveryAttempts.errorCode, message: deliveryAttempts.errorMessage, http: deliveryAttempts.httpStatus, at: deliveryAttempts.startedAt, durationMs: deliveryAttempts.durationMs, attempt: deliveryAttempts.attempt })
        .from(deliveryAttempts)
        .where(eq(deliveryAttempts.integrationId, integration.id))
        .orderBy(desc(deliveryAttempts.startedAt))
        .limit(10);
      const lastSuccess = await tx.select({ at: deliveryAttempts.startedAt }).from(deliveryAttempts).where(and(eq(deliveryAttempts.integrationId, integration.id), eq(deliveryAttempts.status, "success"))).orderBy(desc(deliveryAttempts.startedAt)).limit(1);
      return { refs, draft, counts, recent, lastSuccess: lastSuccess[0]?.at ?? null };
    });
    const dest = (data.draft.bundle as ConfigBundle).destinations.find((d) => d.id === integration.id) ?? null;
    return {
      integration: { id: integration.id, type: integration.connectorType, name: integration.name, status: integration.status, health: integration.health, test_mode: integration.testMode, public_config: integration.publicConfig, settings: integration.settings, paused_at: integration.pausedAt?.toISOString() ?? null },
      connector: connector
        ? { display_name: connector.meta.displayName, api_version: connector.meta.apiVersion, verified_at: connector.meta.verifiedAt, docs_url: connector.meta.docsUrl, supports_browser: connector.meta.supportsBrowser, supports_server: connector.meta.supportsServer, dedup_field: connector.meta.dedupField, access_note: connector.meta.accessNote ?? null, required_public_ids: connector.meta.requiredPublicIds, required_credentials: connector.meta.requiredCredentials.map((c) => ({ kind: c.kind, label: c.label, help: c.help, oauth: c.oauth?.provider ?? null })), transfer: connector.meta.transfer }
        : null,
      credentials: data.refs.map((r) => ({ id: r.id, kind: r.kind, label: r.label, last4: r.last4, status: r.status, expires_at: r.expiresAt?.toISOString() ?? null, created_at: r.createdAt.toISOString() })),
      draft: dest ? { mode: dest.mode, enabled: dest.enabled, test_mode: dest.test_mode, purpose: dest.purpose, browser: dest.browser, mappings: dest.mappings } : null,
      deliveries_7d: Object.fromEntries(data.counts.map((c) => [c.status, c.n])),
      last_success_at: data.lastSuccess ? new Date(data.lastSuccess).toISOString() : null,
      recent_attempts: data.recent.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
    };
  },
});

export const sendDestinationTestEvent = defineTool({
  name: "send_destination_test_event",
  description: "Sends a flagged synthetic test event (with full consent) through the real pipeline and waits for the delivery attempt to this destination, returning the vendor result (status, error class, redacted preview). Uses the destination's test mode / test event code; never sends live conversions.",
  kind: "draft",
  trust: "external",
  permission: "events.read",
  input: z.object({ integration_id: integrationIdSchema, event_name: z.string().max(64).describe("canonical event name to send, e.g. purchase or page_view") }),
  handler: async (args, ctx) => {
    if (!ctx.queue) throw new AppError("NOT_CONNECTED", "queue not configured");
    const integration = await integrationOf(ctx, args.integration_id);
    const site = await withTenant(ctx.db, ctx.organizationId, (tx) => getSite(tx, ctx.organizationId, ctx.siteId));
    if (!site) throw new AppError("NOT_FOUND", "site not found");
    const name = args.event_name.toLowerCase();
    if (!getStandardEvent(name) && !isValidCustomEventName(name)) throw new AppError("VALIDATION_ERROR", "invalid event name");
    const id = newUlid();
    const now = ctx.now();
    const commerce = ["purchase", "add_to_cart", "begin_checkout", "view_item"].includes(name) ? { order_id: name === "purchase" ? `test-${id.slice(-8)}` : undefined, currency: site.currency ?? "EUR", value: 1, items: [{ item_id: "test-sku", item_name: "Test product", price: 1, quantity: 1 }] } : undefined;
    const message = {
      kind: "browser_batch" as const,
      message_id: newUlid(),
      received_at: now.toISOString(),
      site: { organization_id: ctx.organizationId, site_id: ctx.siteId, tracking_id: site.trackingId, environment_id: ctx.environmentId, partition_key: `${ctx.organizationId}:${ctx.siteId}` },
      ip_truncated: null,
      ua_family: "chrome",
      is_bot_hint: false,
      origin_host: site.primaryDomain,
      events: [{ id, name, ts: now.getTime(), props: { test: true, source: "destination_wizard", destination: integration.id }, ...(commerce ? { commerce } : {}), page: { url: `https://${site.primaryDomain ?? "example.test"}/track-site-test`, referrer: null, title: "Track test event" }, ids: { anonymous_id: `test-${ctx.userId.slice(0, 8)}`, session_id: `test-${id.slice(0, 8)}` }, consent: { granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "test", ts: now.getTime(), region: "DE", gpc: false }, sdk: { name: "browser" as const, version: "test", config_version: null, schema_version: "1.0.0" } }],
    };
    await ctx.queue.enqueue(QUEUES.ingest, [{ id: message.message_id, body: message, partitionKey: message.site.partition_key }]);
    const store = new PgEventStore(poolOf(ctx));
    let stored: { event_id: string; processing_state: string } | null = null;
    let attempt: { status: string; errorClass: string; code: string | null; message: string | null; http: number | null; preview: Record<string, unknown> | null; responseExcerpt: string | null } | null = null;
    for (let i = 0; i < 16 && !attempt; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (!stored) {
        const rows = await store.query({ siteId: ctx.siteId, environmentId: ctx.environmentId, limit: 10 });
        const hit = rows.find((e) => e.source_event_id === id);
        if (hit) stored = { event_id: hit.event_id, processing_state: hit.processing_state };
      }
      if (stored) {
        const rows = await withTenant(ctx.db, ctx.organizationId, (tx) => tx.select({ status: deliveryAttempts.status, errorClass: deliveryAttempts.errorClass, code: deliveryAttempts.errorCode, message: deliveryAttempts.errorMessage, http: deliveryAttempts.httpStatus, preview: deliveryAttempts.payloadPreview, responseExcerpt: deliveryAttempts.responseExcerpt }).from(deliveryAttempts).where(and(eq(deliveryAttempts.integrationId, integration.id), eq(deliveryAttempts.eventId, stored!.event_id))).orderBy(desc(deliveryAttempts.startedAt)).limit(1));
        attempt = rows[0] ?? null;
      }
    }
    return {
      source_event_id: id,
      stored: Boolean(stored),
      processing_state: stored?.processing_state ?? "not_processed_yet",
      delivery: attempt,
      passed: attempt?.status === "success",
      note: attempt ? (attempt.status === "success" ? "Delivered to the vendor in test mode. Confirm it in the vendor's test-events view." : `Delivery ${attempt.status}: ${attempt.errorClass} ${attempt.code ?? ""} ${attempt.message ?? ""}`.trim()) : stored ? "Stored; no delivery attempt recorded yet (destination disabled in the published config, mapping missing, or still queued)." : "The worker has not processed the event yet; check the event debugger in a moment.",
    };
  },
});

export const DESTINATION_TOOLS = [getDestinationStatus, setDestinationSettingsDraft, validateIntegrationCredentials, sendDestinationTestEvent];
