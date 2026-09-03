import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError, newUlid, silentLogger } from "@track-site/core";
import { PgEventStore } from "@track-site/analytics";
import { getConnector, type ConnectorContext, type CredentialKind } from "@track-site/connectors";
import type { ConfigBundle } from "@track-site/config";
import { credentials, deliveryAttempts, getOrCreateDraft, getSite, integrations, listCredentialRefs, setIntegrationStatus, updateDraft, withTenant, recordAudit } from "@track-site/db";
import { getStandardEvent, isValidCustomEventName } from "@track-site/events";
import { QUEUES } from "@track-site/queue";
import type { AgentContext } from "../context.ts";
import { defineTool } from "./registry.ts";

function poolOf(ctx: AgentContext) {
  return (ctx.db as unknown as { $client: Pool }).$client;
}

function actorOf(ctx: AgentContext) {
  return { kind: "agent" as const, onBehalfOfUserId: ctx.userId, role: ctx.role as "OWNER", chatSessionId: ctx.chatSessionId };
}

async function integrationOf(ctx: AgentContext, integrationId: string) {
  const row = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(integrations).where(and(eq(integrations.id, integrationId), eq(integrations.siteId, ctx.siteId))).limit(1))[0] ?? null);
  if (!row) throw new AppError("NOT_FOUND", "integration not found");
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

/** settings keys a connector accepts through the wizard/chat (never secrets) */
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
  webhook: ["allowed_fields"],
};

export const setDestinationSettingsDraft = defineTool({
  name: "set_destination_settings_draft",
  description: "Updates a destination's delivery mode (browser/server/hybrid), test mode, name, enabled flag and connector settings such as the Meta/TikTok test event code, LinkedIn conversion rule ids, Google Ads conversion action ids, Floodlight activity ids or X event ids. Never accepts secrets.",
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({
    integration_id: z.string().uuid(),
    mode: z.enum(["browser", "server", "hybrid"]).nullable(),
    test_mode: z.boolean().nullable(),
    enabled: z.boolean().nullable(),
    name: z.string().min(1).max(80).nullable(),
    settings: z.record(z.string().regex(/^[a-z_]{2,40}$/), z.union([z.string().max(256), z.number(), z.boolean(), z.record(z.string(), z.union([z.string().max(128), z.number()]))])).nullable(),
  }),
  handler: async (args, ctx) => {
    const integration = await integrationOf(ctx, args.integration_id);
    const connector = getConnector(integration.connectorType);
    if (args.mode === "browser" && !connector?.meta.supportsBrowser) throw new AppError("VALIDATION_ERROR", `${integration.connectorType} has no browser tag`);
    if (args.mode === "server" && !connector?.meta.supportsServer) throw new AppError("VALIDATION_ERROR", `${integration.connectorType} has no server path`);
    const allowed = DESTINATION_SETTING_KEYS[integration.connectorType] ?? [];
    const settings: Record<string, unknown> = { ...integration.settings };
    for (const [k, v] of Object.entries(args.settings ?? {})) {
      if (!allowed.includes(k)) throw new AppError("VALIDATION_ERROR", `setting ${k} is not supported for ${integration.connectorType}`);
      if (typeof v === "string" && /\b(EAA[A-Za-z0-9]{40,}|sk_(live|test)_|whsec_|AKIA|ya29\.)/.test(v)) throw new AppError("POLICY_BLOCKED", "this looks like a secret; use the secure credential card");
      settings[k] = v;
    }
    const publicConfig = { ...integration.publicConfig };
    if (integration.connectorType === "affiliate") for (const k of Object.keys(args.settings ?? {})) publicConfig[k] = settings[k];
    await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      await tx.update(integrations).set({ settings, publicConfig, ...(args.test_mode !== null && args.test_mode !== undefined ? { testMode: args.test_mode } : {}), ...(args.name ? { name: args.name } : {}) }).where(eq(integrations.id, integration.id));
      await recordAudit(tx, { organizationId: ctx.organizationId, actor: actorOf(ctx), action: "integration.settings", targetType: "integration", targetId: integration.id, diff: { keys: Object.keys(args.settings ?? {}), mode: args.mode, test_mode: args.test_mode, enabled: args.enabled } });
    });
    const draft = await withTenant(ctx.db, ctx.organizationId, (tx) => getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId }));
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === integration.id);
        if (!d) throw new AppError("NOT_FOUND", "destination not in draft");
        if (args.mode) d.mode = args.mode;
        if (args.test_mode !== null && args.test_mode !== undefined) d.test_mode = args.test_mode;
        if (args.enabled !== null && args.enabled !== undefined) d.enabled = args.enabled;
        if (args.name) d.name = args.name;
        if (integration.connectorType === "affiliate") d.browser = null;
      }),
    );
    return { integration_id: integration.id, mode: args.mode, test_mode: args.test_mode, enabled: args.enabled, settings_keys: Object.keys(settings), lint_errors: lint.errors.map((e) => e.message), lint_warnings: lint.warnings.map((w) => w.message) };
  },
});

export const validateIntegrationCredentials = defineTool({
  name: "validate_integration_credentials",
  description: "Validates the stored credentials and public identifiers of a destination against the vendor API (cheapest read or validate-only call), updates the destination status and health and returns the vendor's verdict. Never returns secrets.",
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({ integration_id: z.string().uuid() }),
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
    const missingCreds = connector.meta.requiredCredentials.filter((c) => !refs.some((r) => r.kind === c.kind && r.status === "active")).map((c) => c.kind);
    return { integration_id: integration.id, status: integration.status === "paused" ? "paused" : status, validation: { ok: validation.ok, status: validation.status, detail: validation.detail, api_version: validation.apiVersion, checked_at: validation.checkedAt }, health: { status: health.status, detail: health.detail, sunset_watch: health.sunsetWatch }, missing_public_ids: missingIds, missing_credentials: missingCreds, access_note: connector.meta.accessNote ?? null };
  },
});

export const getDestinationStatus = defineTool({
  name: "get_destination_status",
  description: "Full status of one destination: connector requirements, stored credential references, draft configuration (mode, mappings, test mode), health, delivery counts for the last 7 days and the most recent delivery attempts with redacted errors.",
  kind: "read",
  permission: "integrations.read",
  input: z.object({ integration_id: z.string().uuid() }),
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
  permission: "events.read",
  input: z.object({ integration_id: z.string().uuid(), event_name: z.string().max(64) }),
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
      events: [{ id, name, ts: now.getTime(), props: { test: true, source: "destination_wizard", destination: integration.id }, ...(commerce ? { commerce } : {}), page: { url: `https://${site.primaryDomain ?? "example.test"}/track-site-test`, referrer: null, title: "track.site test event" }, ids: { anonymous_id: `test-${ctx.userId.slice(0, 8)}`, session_id: `test-${id.slice(0, 8)}` }, consent: { granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "test", ts: now.getTime(), region: "DE", gpc: false }, sdk: { name: "browser" as const, version: "test", config_version: null, schema_version: "1.0.0" } }],
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
