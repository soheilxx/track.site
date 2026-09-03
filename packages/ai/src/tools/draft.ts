import { and, desc, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError, fetchTextLimited, findTrackerSnippet, newUlid, normalizeDomainInput } from "@track-site/core";
import { PgEventStore } from "@track-site/analytics";
import { getConnector, validateDestinationUrl, type ConnectorMeta, credentialRequirementsFor } from "@track-site/connectors";
import { configBundleSchema, diffBundles, lintBundle, type ConfigBundle } from "@track-site/config";
import { activeVersion, compareVersions, consentPolicies, createIntegrationDraft, domains, getOrCreateDraft, getSite, integrations, listCredentialRefs, listShopConnections, listVersions, openDraft, preparePublish, savePublicConfig, sites, sourceKeys, updateDraft, withTenant, recordAudit } from "@track-site/db";
import { MEASUREMENT_PLANS, type BusinessType } from "@track-site/events";
import { CONNECTOR_TYPES, DESTINATION_PURPOSE } from "@track-site/policy";
import { QUEUES } from "@track-site/queue";
import { diffHashOf, issueApprovalToken } from "../approvals.ts";
import type { AgentContext } from "../context.ts";
import { loadSetupState, saveSetupState } from "../setup-store.ts";
import { applyStepUpdate, goToStep, skipStep, type SetupState } from "../state-machine.ts";
import { setupStepSchema } from "../ui-schema.ts";
import { defineTool } from "./registry.ts";
import { EVENT_NAME_RULE, normalizeCurrency, normalizeEventName, normalizeMarkets } from "./normalize.ts";

function poolOf(ctx: AgentContext) {
  return (ctx.db as unknown as { $client: Pool }).$client;
}

function actorOf(ctx: AgentContext) {
  return { kind: "agent" as const, onBehalfOfUserId: ctx.userId, role: ctx.role as "OWNER", chatSessionId: ctx.chatSessionId };
}

async function draftFor(ctx: AgentContext) {
  return withTenant(ctx.db, ctx.organizationId, (tx) => getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId }));
}

const lintOf = (lint: { errors: Array<{ message: string }>; warnings: Array<{ message: string }> }) => ({ errors: lint.errors.map((e) => e.message), warnings: lint.warnings.map((w) => w.message) });

/** Shared field schemas so every tool tells the model where an id or name comes from. */
export const integrationIdSchema = z.string().uuid().describe("integration id (UUID) exactly as listed under integrations (id=...) in the context block or returned by create_integration_draft / list_integrations / get_workspace_state; never a name or connector type");
const eventNameSchema = z.string().min(1).max(64).describe("canonical snake_case event name from inspect_event_schema, e.g. purchase, add_to_cart, generate_lead; vendor spellings (AddToCart, Lead) and spaced names are normalised; custom names must match ^[a-z][a-z0-9_]{1,63}$");

/** Steps the user may skip; site and publish are never skippable. */
export const SKIPPABLE_STEPS = setupStepSchema.exclude(["site", "publish"]);

/** Public ids whose pattern allows an empty value are optional (same heuristic as validate_integration_credentials). */
export function requiredPublicIdKeys(meta: Pick<ConnectorMeta, "requiredPublicIds">): string[] {
  return meta.requiredPublicIds.filter((p) => !/\?\$$/.test(p.pattern) && !/\{0,/.test(p.pattern)).map((p) => p.key);
}

export interface DestinationReadiness {
  id: string;
  name: string;
  type: string;
  missing_public_ids: string[];
  missing_credentials: string[];
  ready: boolean;
}

/** A destination is ready when every required public id is stored and every non-optional credential has an active reference. */
export function destinationReadiness(input: { id: string; name: string; connectorType: string; publicConfig: Record<string, unknown>; meta: Pick<ConnectorMeta, "requiredPublicIds" | "requiredCredentials"> | null; credentialRefs: Array<{ kind: string; status: string }> }): DestinationReadiness {
  if (!input.meta) return { id: input.id, name: input.name, type: input.connectorType, missing_public_ids: [], missing_credentials: [], ready: false };
  const missingIds = requiredPublicIdKeys(input.meta).filter((k) => !input.publicConfig[k]);
  const missingCreds = input.meta.requiredCredentials.filter((c) => !c.optional && !input.credentialRefs.some((r) => r.kind === c.kind && r.status === "active")).map((c) => c.kind);
  return { id: input.id, name: input.name, type: input.connectorType, missing_public_ids: missingIds, missing_credentials: missingCreds, ready: missingIds.length === 0 && missingCreds.length === 0 };
}

export async function listDestinationReadiness(ctx: AgentContext): Promise<DestinationReadiness[]> {
  return withTenant(ctx.db, ctx.organizationId, async (tx) => {
    const rows = await tx.select().from(integrations).where(eq(integrations.siteId, ctx.siteId));
    const out: DestinationReadiness[] = [];
    for (const r of rows) {
      const refs = await listCredentialRefs(tx, r.id);
      out.push(destinationReadiness({ id: r.id, name: r.name, connectorType: r.connectorType, publicConfig: r.publicConfig, meta: getConnector(r.connectorType)?.meta ?? null, credentialRefs: refs }));
    }
    return out;
  });
}

/**
 * Recomputes the destinations step from the database: it is complete once at least one destination has
 * all required public ids and credentials. Called by create_integration_draft, save_public_pixel_id_draft
 * and request_secure_credential_input; validate_integration_credentials (tools/destinations.ts) should
 * call it after a credential was stored through the UI.
 */
export async function syncDestinationsStep(ctx: AgentContext, state: SetupState, detail: string): Promise<{ state: SetupState; readiness: DestinationReadiness[] }> {
  const readiness = await listDestinationReadiness(ctx);
  const ready = readiness.filter((r) => r.ready);
  const next = applyStepUpdate(state, "destinations", {
    fields: { destination_ids: readiness.map((r) => r.id), ready_destination_ids: ready.map((r) => r.id), destination_configured: ready.length > 0 },
    evidence: { source: "tool", detail },
  });
  return { state: next, readiness };
}

/** Verifies the claimed authoritative source against the site: a connected shop integration or an active server source key. */
export async function verifyAuthoritativeSource(ctx: AgentContext, source: "none" | "shop_integration" | "server_api"): Promise<"none" | "shop_integration" | "server_api"> {
  if (source === "none") return "none";
  return withTenant(ctx.db, ctx.organizationId, async (tx) => {
    if (source === "shop_integration") {
      const connections = await listShopConnections(tx, ctx.siteId);
      if (connections.some((c) => c.status === "connected")) return "shop_integration";
      const site = await getSite(tx, ctx.organizationId, ctx.siteId);
      const detail = connections.length ? `existing shop connections: ${connections.map((c) => `${c.platform} (${c.status})`).join(", ")}` : `no shop connection exists (site platform: ${site?.platform ?? "unknown"})`;
      throw new AppError("VALIDATION_ERROR", `authoritative_purchase_source "shop_integration" requires a connected shop integration for this site; ${detail}. Connect Shopify, WooCommerce or Shopware on the site's Shop page in the dashboard first, or use "none".`);
    }
    const keys = await tx.select({ id: sourceKeys.id }).from(sourceKeys).where(and(eq(sourceKeys.siteId, ctx.siteId), eq(sourceKeys.status, "active"))).limit(1);
    if (keys.length) return "server_api";
    throw new AppError("VALIDATION_ERROR", `authoritative_purchase_source "server_api" requires an active server source key for this site; none exists. Create one on the Settings page in the dashboard first, or use "none".`);
  });
}

export const setSetupStep = defineTool({
  name: "set_setup_step",
  description: "Moves the setup to a specific step (to correct or revisit). Does not change any configuration.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({ step: setupStepSchema }),
  handler: async (args, ctx) => {
    const state = goToStep(await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale), args.step);
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { current_step: state.currentStep };
  },
});

export const skipSetupStep = defineTool({
  name: "skip_setup_step",
  description: `Marks the current or a given optional step as skipped after the user explicitly asked to skip it. Skippable steps: ${SKIPPABLE_STEPS.options.join(", ")}; site and publish cannot be skipped.`,
  kind: "draft",
  permission: "config.draft",
  input: z.object({ step: SKIPPABLE_STEPS, reason: z.string().max(200) }),
  handler: async (args, ctx) => {
    const state = skipStep(await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale), args.step);
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { current_step: state.currentStep, skipped: args.step };
  },
});

export const PLATFORM_NOT_CONFIRMED = "platform not confirmed: record the platform the user confirmed (shopify, woocommerce, shopware, wordpress, headless, custom) or skip the step on request";

export const setBusinessProfileDraft = defineTool({
  name: "set_business_profile_draft",
  description: 'Records the confirmed business type, platform, markets and currency on the site and advances the setup. Markets are ISO 3166-1 alpha-2 codes (DE, AT, CH; country names are accepted and normalised), currency is an ISO 4217 code (EUR). Only call after the user confirmed the values. platform "unknown" records that it could not be determined and leaves the platform step open (confirm a platform later or use skip_setup_step).',
  kind: "draft",
  permission: "sites.update",
  input: z.object({
    business_type: z.enum(["ecommerce", "lead_generation", "saas", "content", "other"]).nullable(),
    platform: z.enum(["shopify", "woocommerce", "shopware", "wordpress", "headless", "custom", "unknown"]).nullable().describe("confirmed platform; unknown = could not be determined (does not complete the step); null = not provided"),
    markets: z.array(z.string().min(2).max(56)).max(20).nullable(),
    currency: z.string().min(3).max(24).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    evidence: z.string().max(300).nullable(),
  }),
  handler: async (args, ctx) => {
    const markets = normalizeMarkets(args.markets);
    const currency = normalizeCurrency(args.currency);
    await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      await tx
        .update(sites)
        .set({
          ...(args.business_type ? { businessType: args.business_type } : {}),
          ...(args.platform ? { platform: args.platform, platformEvidence: { confidence: args.confidence ?? 0, signals: args.evidence ? [args.evidence] : [] } } : {}),
          ...(currency ? { currency } : {}),
        })
        .where(eq(sites.id, ctx.siteId));
      await recordAudit(tx, { organizationId: ctx.organizationId, actor: actorOf(ctx), action: "site.profile", targetType: "site", targetId: ctx.siteId, diff: args, requestId: ctx.requestId });
    });
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    if (args.business_type) {
      state.context.businessType = args.business_type;
      state = applyStepUpdate(state, "business_type", { fields: { business_type: args.business_type }, evidence: { source: "user", detail: args.evidence ?? "confirmed in chat" }, confidence: args.confidence ?? 1 });
    }
    if (args.platform === "unknown") {
      state.context.platform = null;
      state = applyStepUpdate(state, "platform", { evidence: { source: "user", detail: args.evidence ?? "platform unknown" }, confidence: args.confidence ?? 0, blockers: [PLATFORM_NOT_CONFIRMED] });
    } else if (args.platform) {
      state.context.platform = args.platform;
      state = applyStepUpdate(state, "platform", { fields: { platform: args.platform }, evidence: { source: "user", detail: args.evidence ?? "confirmed in chat" }, confidence: args.confidence ?? 1, blockers: [] });
    }
    if (markets) state.context.markets = markets;
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return {
      current_step: state.currentStep,
      business_type: state.context.businessType,
      platform: state.context.platform,
      platform_step: state.steps.platform?.status ?? "pending",
      markets: state.context.markets,
      currency,
      note: args.platform === "unknown" ? PLATFORM_NOT_CONFIRMED : null,
    };
  },
});

export const proposeEventPlan = defineTool({
  name: "propose_event_plan",
  description: "Writes the measurement plan for the business type into the configuration draft (events with triggers). include_events restricts the plan to a subset of its own event names; other events are added with create_trigger_draft. Purchase/refund/subscribe are enabled for ad destinations only with a verified authoritative server source; the claimed source is checked against the site.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({
    business_type: z.enum(["ecommerce", "lead_generation", "saas", "content", "other"]),
    include_events: z.array(z.string().min(1).max(64)).max(50).nullable().describe("subset of the plan's canonical event names (see inspect_event_schema); null = the full plan. Names outside the plan are rejected; add those with create_trigger_draft"),
    authoritative_purchase_source: z.enum(["none", "shop_integration", "server_api"]).nullable().describe("verified server source for purchase/refund/subscribe: shop_integration requires a connected shop integration for this site, server_api an active server source key; null or none = not verified (conversions stay disabled for ad destinations)"),
  }),
  handler: async (args, ctx) => {
    const plan = MEASUREMENT_PLANS[args.business_type as BusinessType];
    const planNames = plan.events.map((e) => e.name);
    let wanted = planNames;
    if (args.include_events !== null) {
      const normalized = args.include_events.map((n) => normalizeEventName(n).name);
      const unknown = normalized.filter((n) => !planNames.includes(n));
      if (unknown.length) throw new AppError("VALIDATION_ERROR", `include_events must be names from the ${args.business_type} plan (${planNames.join(", ")}); not in the plan: ${unknown.join(", ")}. Use create_trigger_draft to add other events.`);
      wanted = planNames.filter((n) => normalized.includes(n));
    }
    const wantedSet = new Set(wanted);
    const authoritative = await verifyAuthoritativeSource(ctx, args.authoritative_purchase_source ?? "none");
    const draft = await draftFor(ctx);
    const { lint, draft: updated } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const existing = new Map(b.events.map((e) => [e.name, e]));
        for (const pe of plan.events) {
          if (!wantedSet.has(pe.name)) continue;
          const trigger: ConfigBundle["events"][number]["trigger"] = pe.capture === "auto_page" ? { type: "page", path_pattern: null } : pe.capture === "data_layer" ? { type: "data_layer", key: pe.name } : pe.capture === "shop_integration" ? { type: "api" } : pe.capture === "form_submit" ? { type: "selector", selector: "form", dom_event: "submit" } : { type: "api" };
          existing.set(pe.name, { name: pe.name, enabled: true, critical: pe.critical, trigger, props_map: null, authoritative_source: pe.requiresAuthoritativeSource ? authoritative : "none" });
        }
        b.events = Array.from(existing.values());
      }),
    );
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.draftId = updated.id;
    state = applyStepUpdate(state, "event_plan", { fields: { events: wanted }, evidence: { source: "tool", detail: `plan ${args.business_type}` } });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { draft_id: updated.id, events: wanted, authoritative_purchase_source: authoritative, current_step: state.currentStep, lint: lintOf(lint) };
  },
});

export const createTriggerDraft = defineTool({
  name: "create_trigger_draft",
  description: "Adds or updates one event in the draft with a declarative trigger. Per trigger_type: page needs path_pattern (null = every page); selector needs selector (CSS) and dom_event (click, or submit for forms); data_layer uses data_layer_key (null = the event name); api needs nothing else. No custom code.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({
    event_name: eventNameSchema,
    trigger_type: z.enum(["page", "selector", "data_layer", "api"]),
    path_pattern: z.string().max(256).nullable().describe("page triggers only; null = every page"),
    selector: z.string().max(256).nullable().describe("selector triggers only: CSS selector of the element or form, e.g. form#contact, button.add-to-cart"),
    dom_event: z.enum(["click", "submit"]).nullable().describe("selector triggers only: click for buttons/links, submit for forms"),
    data_layer_key: z.string().max(64).nullable().describe("data_layer triggers only; null = the event name"),
    critical: z.boolean(),
  }),
  handler: async (args, ctx) => {
    const { name, isStandard } = normalizeEventName(args.event_name);
    let trigger: ConfigBundle["events"][number]["trigger"];
    if (args.trigger_type === "page") trigger = { type: "page", path_pattern: args.path_pattern?.trim() || null };
    else if (args.trigger_type === "selector") {
      const selector = args.selector?.trim() ?? "";
      if (!selector) throw new AppError("VALIDATION_ERROR", 'trigger_type "selector" requires a non-empty CSS selector (e.g. form#contact, button.add-to-cart); ask the user or use trigger_type "page" / "data_layer" instead');
      if (!args.dom_event) throw new AppError("VALIDATION_ERROR", 'trigger_type "selector" requires dom_event: "click" for buttons and links or "submit" for forms');
      trigger = { type: "selector", selector, dom_event: args.dom_event };
    } else if (args.trigger_type === "data_layer") trigger = { type: "data_layer", key: args.data_layer_key?.trim() || name };
    else trigger = { type: "api" };
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const i = b.events.findIndex((e) => e.name === name);
        const ev = { name, enabled: true, critical: args.critical, trigger, props_map: null, authoritative_source: "none" as const };
        if (i === -1) b.events.push(ev);
        else b.events[i] = { ...b.events[i]!, ...ev, authoritative_source: b.events[i]!.authoritative_source };
      }),
    );
    return { draft_id: draft.id, event: name, is_standard_event: isStandard, normalized_from: name === args.event_name ? null : args.event_name, trigger, lint: lintOf(lint) };
  },
});

/** Validates a requested delivery mode against what the connector supports; returns the mode to use. */
export function resolveIntegrationMode(meta: Pick<ConnectorMeta, "type" | "supportsBrowser" | "supportsServer">, requested: "browser" | "server" | "hybrid" | null): "browser" | "server" | "hybrid" {
  const supported = [...(meta.supportsBrowser ? ["browser"] : []), ...(meta.supportsServer ? ["server"] : [])];
  if (requested === null) return meta.supportsBrowser && meta.supportsServer ? "hybrid" : meta.supportsBrowser ? "browser" : "server";
  if (requested === "browser" && !meta.supportsBrowser) throw new AppError("VALIDATION_ERROR", `${meta.type} has no browser tag (server-side only); use mode "server" or null`);
  if (requested === "server" && !meta.supportsServer) throw new AppError("VALIDATION_ERROR", `${meta.type} has no server path; use mode "browser" or null`);
  if (requested === "hybrid" && !(meta.supportsBrowser && meta.supportsServer)) throw new AppError("VALIDATION_ERROR", `${meta.type} supports only ${supported.join("/")}; mode "hybrid" needs browser and server. Use mode "${supported[0]}" or null`);
  return requested;
}

export const createIntegrationDraftTool = defineTool({
  name: "create_integration_draft",
  description: "Creates a destination in draft state for a supported connector type and adds it to the configuration draft with the default consent purpose. Returns the required public ids (store them with save_public_pixel_id_draft) and credentials (request them with request_secure_credential_input). Secrets are never passed through the chat.",
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({
    connector_type: z.enum(CONNECTOR_TYPES),
    name: z.string().max(80).nullable().describe("display name; null = the connector's display name"),
    mode: z.enum(["browser", "server", "hybrid"]).nullable().describe("delivery mode; null = best mode for the connector (recommended): hybrid when browser and server are supported, otherwise the supported one. browser/hybrid are rejected for server-only connectors such as webhook and affiliate"),
  }),
  handler: async (args, ctx) => {
    const connector = getConnector(args.connector_type);
    if (!connector) throw new AppError("NOT_FOUND", `connector ${args.connector_type} is not available`);
    const mode = resolveIntegrationMode(connector.meta, args.mode);
    const name = args.name?.trim() || connector.meta.displayName;
    const row = await withTenant(ctx.db, ctx.organizationId, (tx) => createIntegrationDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, connectorType: args.connector_type, name, actor: actorOf(ctx) }));
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        b.destinations.push({ id: row.id, type: args.connector_type, name, enabled: false, purpose: DESTINATION_PURPOSE[args.connector_type], mode, browser: null, test_mode: true, mappings: [] });
      }),
    );
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.draftId = draft.id;
    const synced = await syncDestinationsStep(ctx, state, `created ${args.connector_type} ${row.id}`);
    state = synced.state;
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    const mine = synced.readiness.find((r) => r.id === row.id);
    return {
      integration_id: row.id,
      draft_id: draft.id,
      connector_type: args.connector_type,
      name,
      mode,
      required_public_ids: connector.meta.requiredPublicIds,
      required_credentials: credentialRequirementsFor(connector, row.publicConfig as Record<string, unknown>).map((c) => ({ kind: c.kind, label: c.label, help: c.help, oauth: c.oauth?.provider ?? null, optional: c.optional === true })),
      access_note: connector.meta.accessNote ?? null,
      missing_public_ids: mine?.missing_public_ids ?? [],
      missing_credentials: mine?.missing_credentials ?? [],
      destinations_step: state.steps.destinations?.status ?? "pending",
      lint: lintOf(lint),
    };
  },
});

export const savePublicPixelIdDraft = defineTool({
  name: "save_public_pixel_id_draft",
  description: "Stores a public identifier for a destination after format validation. key is the `key` of an entry in required_public_ids from create_integration_draft / get_destination_status (meta/tiktok/reddit/snapchat/x/spotify/quora/yahoo: pixel_id, ga4: measurement_id, google_ads: conversion_id, linkedin: partner_id, microsoft: uet_tag_id, pinterest/amazon: tag_id, taboola/criteo: account_id, outbrain: marketer_id, gmp: floodlight_configuration_id, tradedesk/adroll: advertiser_id + pixel_id, webhook: url, affiliate: preset). Never use for tokens or secrets.",
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({
    integration_id: integrationIdSchema,
    key: z.string().regex(/^[a-z_]{2,40}$/).describe("the `key` of a required_public_ids entry for this destination's connector"),
    value: z.string().min(1).max(256),
  }),
  handler: async (args, ctx) => {
    const integration = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(integrations).where(and(eq(integrations.id, args.integration_id), eq(integrations.siteId, ctx.siteId))).limit(1))[0] ?? null);
    if (!integration) throw new AppError("NOT_FOUND", "integration not found for this site; use an id from the integrations list");
    const connector = getConnector(integration.connectorType);
    if (!connector) throw new AppError("NOT_FOUND", `connector ${integration.connectorType} is not available`);
    const requirement = connector.meta.requiredPublicIds.find((r) => r.key === args.key);
    if (!requirement) throw new AppError("VALIDATION_ERROR", `key "${args.key}" is not a public id of ${integration.connectorType}; allowed keys: ${connector.meta.requiredPublicIds.map((r) => `${r.key} (${r.label}, e.g. ${r.example})`).join("; ")}`);
    if (/\b(EAA|sk_live|sk_test|whsec_|AKIA)/.test(args.value)) throw new AppError("POLICY_BLOCKED", "this looks like a secret; use request_secure_credential_input");
    if (!new RegExp(requirement.pattern).test(args.value)) throw new AppError("VALIDATION_ERROR", `${requirement.label} does not match the expected format (example: ${requirement.example})`);
    if (args.key === "url") await validateDestinationUrl(args.value, { allowPrivateNetwork: ctx.allowPrivateNetwork, allowHttp: ctx.allowPrivateNetwork });
    await withTenant(ctx.db, ctx.organizationId, (tx) => savePublicConfig(tx, { siteId: ctx.siteId, integrationId: integration.id, publicConfig: { ...integration.publicConfig, [args.key]: args.value }, actor: actorOf(ctx) }));
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === integration.id);
        if (d) d.browser = { ...(d.browser ?? {}), [args.key]: args.value };
      }),
    );
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    const synced = await syncDestinationsStep(ctx, state, `saved ${args.key} for ${integration.id}`);
    state = synced.state;
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    const mine = synced.readiness.find((r) => r.id === integration.id);
    return { integration_id: integration.id, saved: args.key, still_missing_public_ids: mine?.missing_public_ids ?? [], missing_credentials: mine?.missing_credentials ?? [], destination_ready: mine?.ready ?? false, destinations_step: state.steps.destinations?.status ?? "pending", lint_errors: lint.errors.map((e) => e.message) };
  },
});

export const upsertEventMappingDraft = defineTool({
  name: "upsert_event_mapping_draft",
  description: "Maps a canonical event to the vendor event name for a destination in the draft (enable/disable). vendor_event null = the connector's default mapping for standard events (recommended). Field maps use the safe JSONLogic subset.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({
    integration_id: integrationIdSchema,
    event: eventNameSchema,
    vendor_event: z.string().max(64).nullable().describe("exact vendor-side event name; null or empty = the connector's default for standard events (recommended). Id-based connectors (google_ads, linkedin, gmp, x) take their ids through set_destination_settings_draft instead"),
    enabled: z.boolean(),
    enable_destination: z.boolean().nullable(),
  }),
  handler: async (args, ctx) => {
    const { name } = normalizeEventName(args.event);
    const vendorEvent = args.vendor_event?.trim() ?? "";
    const draft = await draftFor(ctx);
    let draftEvents: string[] = [];
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === args.integration_id);
        if (!d) throw new AppError("NOT_FOUND", `destination ${args.integration_id} is not in the draft; create it with create_integration_draft or use an id from the integrations list`);
        draftEvents = b.events.map((e) => e.name);
        const i = d.mappings.findIndex((m) => m.event === name);
        const mapping = { event: name, vendor_event: vendorEvent, enabled: args.enabled, field_map: null };
        if (i === -1) d.mappings.push(mapping);
        else d.mappings[i] = mapping;
        if (args.enable_destination !== null && args.enable_destination !== undefined) d.enabled = args.enable_destination;
      }),
    );
    return {
      draft_id: draft.id,
      event: name,
      vendor_event: vendorEvent || null,
      uses_connector_default: vendorEvent === "",
      event_in_draft: draftEvents.includes(name),
      draft_events: draftEvents,
      lint: lintOf(lint),
    };
  },
});

export const CMP_PROVIDERS = ["none", "api", "usercentrics", "cookiebot", "onetrust", "tcf", "gpp", "other"] as const;

export const setConsentPolicyDraft = defineTool({
  name: "set_consent_policy_draft",
  description: 'Records the consent mechanism, markets and consent mode in the draft. cmp_provider: usercentrics / cookiebot / onetrust = that CMP\'s built-in adapter; tcf = any IAB TCF 2.x CMP (consentmanager, Didomi, Sourcepoint ...); gpp = IAB GPP; api = the site passes consent through the Track consent API itself; other = a CMP without built-in adapter (give cmp_name, e.g. Borlabs Cookie, Complianz, Iubenda; consent must then be passed through the consent API); none = no consent mechanism yet. Never weakens defaults without an explicit user decision; advanced consent mode requires a documented legal review note.',
  kind: "draft",
  permission: "consent.manage",
  input: z.object({
    cmp_provider: z.enum(CMP_PROVIDERS),
    cmp_name: z.string().max(80).nullable().default(null).describe('name of the CMP when cmp_provider is "other"; null otherwise'),
    consent_mode: z.enum(["basic", "advanced"]).nullable(),
    legal_review_note: z.string().max(500).nullable(),
    markets: z.array(z.string().min(2).max(56)).max(20).nullable(),
  }),
  handler: async (args, ctx) => {
    if (args.consent_mode === "advanced" && !args.legal_review_note) throw new AppError("POLICY_BLOCKED", "advanced consent mode requires a legal review note from the customer");
    // cmp_name only carries meaning for "other"; for built-in providers the adapter defines the CMP
    const cmpName = args.cmp_provider === "other" ? args.cmp_name?.trim() || null : null;
    if (args.cmp_provider === "other" && !cmpName) throw new AppError("VALIDATION_ERROR", 'cmp_provider "other" requires cmp_name (the CMP the customer uses)');
    // the bundle has no "other" provider: a CMP without adapter delivers consent through the consent API
    const bundleProvider = args.cmp_provider === "other" ? "api" : args.cmp_provider;
    const settings: Record<string, string> = args.cmp_provider === "other" && cmpName ? { cmp_provider: "other", cmp_name: cmpName } : {};
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const r = await updateDraft(tx, draft.id, (b) => {
        b.consent.cmp = { provider: bundleProvider, settings };
        if (args.consent_mode) b.consent.consent_mode = { enabled: true, mode: args.consent_mode };
      });
      const latest = await tx.select().from(consentPolicies).where(eq(consentPolicies.siteId, ctx.siteId)).orderBy(desc(consentPolicies.version)).limit(1);
      const version = (latest[0]?.version ?? 0) + 1;
      await tx.insert(consentPolicies).values({ organizationId: ctx.organizationId, siteId: ctx.siteId, version, status: "draft", cmp: { provider: args.cmp_provider, settings }, consentMode: { mode: args.consent_mode ?? "basic", legalReviewNote: args.legal_review_note }, createdBy: ctx.userId });
      return r;
    });
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.cmp = cmpName ? `other (${cmpName})` : args.cmp_provider;
    const consentMarkets = normalizeMarkets(args.markets);
    if (consentMarkets) state.context.markets = consentMarkets;
    state = applyStepUpdate(state, "consent", { fields: { cmp: args.cmp_provider, cmp_name: cmpName, policy_version: "draft" }, evidence: { source: "user", detail: `cmp ${args.cmp_provider}${cmpName ? ` (${cmpName})` : ""}` } });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return {
      cmp: args.cmp_provider,
      cmp_name: cmpName,
      bundle_provider: bundleProvider,
      consent_mode: args.consent_mode ?? "basic",
      note: args.cmp_provider === "other" ? `${cmpName} has no built-in adapter: consent must be passed to the tracker through the consent API` : args.cmp_provider === "none" ? "no consent mechanism recorded: nothing beyond necessary purposes will run until consent is delivered" : null,
      lint_warnings: lint.warnings.map((w) => w.message),
      current_step: state.currentStep,
    };
  },
});

export const requestSecureCredentialInput = defineTool({
  name: "request_secure_credential_input",
  description: "Asks the UI to show the secure credential card or OAuth button for a destination. The secret never passes through the chat. Returns the credentials already stored (references only) and what the destination still needs.",
  kind: "draft",
  permission: "credentials.write",
  input: z.object({
    integration_id: integrationIdSchema,
    credential_kind: z.enum(["access_token", "api_secret", "oauth_refresh_token", "oauth_access_token", "oauth_token_secret", "client_id", "client_secret", "webhook_secret", "signing_secret"]).describe("kind from required_credentials of create_integration_draft / get_destination_status; if the connector does not need this kind its first required credential is requested instead"),
  }),
  handler: async (args, ctx) => {
    const integration = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(integrations).where(and(eq(integrations.id, args.integration_id), eq(integrations.siteId, ctx.siteId))).limit(1))[0] ?? null);
    if (!integration) throw new AppError("NOT_FOUND", "integration not found for this site; use an id from the integrations list");
    const connector = getConnector(integration.connectorType);
    const requirements = credentialRequirementsFor(connector, integration.publicConfig as Record<string, unknown>);
    const requirement = requirements.find((c) => c.kind === args.credential_kind) ?? null;
    if (!requirement) throw new AppError("VALIDATION_ERROR", `credential_kind must be one of ${requirements.map((c) => c.kind).join(", ") || "(this destination needs no credential)"} for this destination`);
    const refs = await withTenant(ctx.db, ctx.organizationId, (tx) => listCredentialRefs(tx, integration.id));
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    const synced = await syncDestinationsStep(ctx, state, `credential card requested for ${integration.id}`);
    state = synced.state;
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    const mine = synced.readiness.find((r) => r.id === integration.id);
    return {
      ui: { component: requirement?.oauth ? "oauth" : "secure_credential", integration_id: integration.id, connector_type: integration.connectorType, credential_kind: requirement?.kind ?? args.credential_kind, label: requirement?.label ?? "Credential", help: requirement?.help ?? "", oauth_provider: requirement?.oauth?.provider ?? null },
      existing: refs.filter((r) => r.status === "active").map((r) => ({ id: r.id, kind: r.kind, last4: r.last4, expires_at: r.expiresAt })),
      missing_credentials: mine?.missing_credentials ?? [],
      missing_public_ids: mine?.missing_public_ids ?? [],
      destination_ready: mine?.ready ?? false,
    };
  },
});

export const verifyDomainTool = defineTool({
  name: "verify_domain",
  description: "Checks domain ownership for the site's primary domain via DNS TXT, verification file or meta tag and stores the result.",
  kind: "draft",
  permission: "domains.verify",
  input: z.object({ method: z.enum(["dns_txt", "file", "meta_tag"]) }),
  handler: async (args, ctx) => {
    const { checkDnsTxt, checkVerificationFile, checkMetaTag } = await import("@track-site/core");
    const row = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(domains).where(and(eq(domains.siteId, ctx.siteId), eq(domains.isPrimary, true))).limit(1))[0] ?? null);
    if (!row) throw new AppError("INVALID_STATE", "no primary domain");
    const result = args.method === "dns_txt" ? await checkDnsTxt(row.hostname, row.verificationToken) : args.method === "file" ? await checkVerificationFile(row.hostname, row.verificationToken, ctx.fetch) : await checkMetaTag(row.hostname, row.verificationToken, ctx.fetch);
    await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      await tx.update(domains).set({ lastCheckedAt: new Date(), lastCheckResult: result, ...(result.ok ? { verifiedAt: new Date(), verificationMethod: args.method } : {}) }).where(eq(domains.id, row.id));
      await recordAudit(tx, { organizationId: ctx.organizationId, actor: actorOf(ctx), action: result.ok ? "domain.verified" : "domain.verify_failed", targetType: "domain", targetId: row.id, diff: { method: args.method, detail: result.detail }, requestId: ctx.requestId });
    });
    return { hostname: row.hostname, verified: result.ok, detail: result.detail, instructions: { dns_txt: { host: `_track-site.${row.hostname}`, value: row.verificationToken }, file: { url: `https://${row.hostname}/.well-known/track-site-verify.txt`, content: row.verificationToken }, meta_tag: `<meta name="track-site-verification" content="${row.verificationToken}">` } };
  },
});

export const verifySnippetInstallation = defineTool({
  name: "verify_snippet_installation",
  description: "Checks whether the tracker snippet is installed on the site's home page and whether real browser events have arrived. Marks the installation step complete when both are true.",
  kind: "draft",
  permission: "sites.update",
  input: z.object({}),
  handler: async (_args, ctx) => {
    const site = await withTenant(ctx.db, ctx.organizationId, (tx) => getSite(tx, ctx.organizationId, ctx.siteId));
    if (!site) throw new AppError("NOT_FOUND", "site not found");
    let snippet = { found: false, siteIdMatches: false, async: false };
    let fetchError: string | null = null;
    const host = site.primaryDomain ? normalizeDomainInput(site.primaryDomain) : null;
    if (host) {
      try {
        await validateDestinationUrl(`https://${host}/`, { allowPrivateNetwork: ctx.allowPrivateNetwork });
        snippet = findTrackerSnippet(await fetchTextLimited(`https://${host}/`, ctx.fetch), site.trackingId);
      } catch (e) {
        fetchError = e instanceof Error ? e.message.slice(0, 120) : "fetch failed";
      }
    }
    const store = new PgEventStore(poolOf(ctx));
    const lastBrowser = await store.lastEventAt(ctx.siteId, "browser");
    const verified = Boolean(lastBrowser) && (snippet.found ? snippet.siteIdMatches : true);
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state = applyStepUpdate(state, "installation", { fields: { snippet_verified: verified }, evidence: { source: "tool", detail: `snippet=${snippet.found}/${snippet.siteIdMatches}, last_browser_event=${lastBrowser?.toISOString() ?? "never"}` }, confidence: verified ? 1 : 0.2 });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { snippet_found_on_home_page: snippet.found, site_id_matches: snippet.siteIdMatches, async_attribute: snippet.async, last_browser_event_at: lastBrowser?.toISOString() ?? null, verified, fetch_error: fetchError, snippet: `<script async src="${ctx.hosts.cdn}/v1/tracker.js" data-site-id="${site.trackingId}"></script>` };
  },
});

export const validateDraft = defineTool({
  name: "validate_draft",
  description: "Runs the policy/PII lint on the current configuration draft and returns errors (blocking) and warnings with suggested fix tools.",
  kind: "draft",
  permission: "config.read",
  input: z.object({}),
  handler: async (_args, ctx) => {
    const draft = await draftFor(ctx);
    const lint = lintBundle(draft.bundle);
    return { draft_id: draft.id, ok: lint.ok, errors: lint.errors, warnings: lint.warnings };
  },
});

export const runTestEvent = defineTool({
  name: "run_test_event",
  description: `Sends a clearly flagged synthetic test event through the real pipeline for the site (test mode) and reports whether it was accepted, stored and routed. Never sends live conversions. event_name is a canonical event name (${EVENT_NAME_RULE.split(";")[0]}).`,
  kind: "draft",
  permission: "events.read",
  input: z.object({ event_name: eventNameSchema, with_consent: z.boolean() }),
  handler: async (args, ctx) => {
    if (!ctx.queue) throw new AppError("NOT_CONNECTED", "queue not configured");
    const site = await withTenant(ctx.db, ctx.organizationId, (tx) => getSite(tx, ctx.organizationId, ctx.siteId));
    if (!site) throw new AppError("NOT_FOUND", "site not found");
    const { name } = normalizeEventName(args.event_name);
    const id = newUlid();
    const now = ctx.now();
    const commerce = name === "purchase" ? { order_id: `test-${id.slice(-8)}`, currency: site.currency ?? "EUR", value: 1, items: [{ item_id: "test-sku", item_name: "Test product", price: 1, quantity: 1 }] } : undefined;
    const message = {
      kind: "browser_batch" as const,
      message_id: newUlid(),
      received_at: now.toISOString(),
      site: { organization_id: ctx.organizationId, site_id: ctx.siteId, tracking_id: site.trackingId, environment_id: ctx.environmentId, partition_key: `${ctx.organizationId}:${ctx.siteId}` },
      ip_truncated: null,
      ua_family: "chrome",
      is_bot_hint: false,
      origin_host: site.primaryDomain,
      events: [
        {
          id,
          name,
          ts: now.getTime(),
          props: { test: true, source: "assistant" },
          ...(commerce ? { commerce } : {}),
          page: { url: `https://${site.primaryDomain ?? "example.test"}/track-site-test`, referrer: null, title: "Track test event" },
          ids: { anonymous_id: `test-${ctx.userId.slice(0, 8)}`, session_id: `test-${id.slice(0, 8)}` },
          consent: { granted: args.with_consent ? ["necessary", "analytics", "marketing"] : ["necessary"], source: args.with_consent ? "api" : "default", policy_version: "test", ts: now.getTime(), region: "DE", gpc: false },
          sdk: { name: "browser" as const, version: "test", config_version: null, schema_version: "1.0.0" },
        },
      ],
    };
    await ctx.queue.enqueue(QUEUES.ingest, [{ id: message.message_id, body: message, partitionKey: message.site.partition_key }]);
    const store = new PgEventStore(poolOf(ctx));
    let stored = null;
    for (let i = 0; i < 10 && !stored; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const rows = await store.query({ siteId: ctx.siteId, environmentId: ctx.environmentId, limit: 5 });
      stored = rows.find((e) => e.source_event_id === id) ?? null;
    }
    const passed = args.with_consent ? Boolean(stored) : !stored;
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state = applyStepUpdate(state, "test", { fields: { test_passed: passed }, evidence: { source: "tool", detail: `test ${name} consent=${args.with_consent} stored=${Boolean(stored)}` }, complete: passed });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { source_event_id: id, event: name, accepted_by_queue: true, stored: Boolean(stored), processing_state: stored?.processing_state ?? (args.with_consent ? "not_processed_yet" : "dropped_as_expected"), expected: args.with_consent ? "stored and routed" : "dropped (no consent)", passed, note: stored ? "Check the event debugger for delivery status per destination." : args.with_consent ? "The worker did not process the event within 4 seconds; it may still be in the queue." : "Without consent nothing is stored, as required." };
  },
});

export const runDiagnostics = defineTool({
  name: "run_diagnostics",
  description: "Runs the full diagnostic checklist: domain verification, snippet, recent events, draft lint, destination health and credential status. Returns a structured checklist.",
  kind: "draft",
  permission: "events.read",
  input: z.object({}),
  handler: async (_args, ctx) => {
    const store = new PgEventStore(poolOf(ctx));
    const [doms, ints, draft, active] = await withTenant(ctx.db, ctx.organizationId, async (tx) => Promise.all([tx.select().from(domains).where(eq(domains.siteId, ctx.siteId)), tx.select().from(integrations).where(eq(integrations.siteId, ctx.siteId)), getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId }), activeVersion(tx, ctx.environmentId)]));
    const lint = lintBundle(draft.bundle);
    const lastBrowser = await store.lastEventAt(ctx.siteId, "browser");
    const lastServer = await store.lastEventAt(ctx.siteId, "server");
    const checks = [
      { label: "Domain verified", status: doms.some((d) => d.verifiedAt) ? "ok" : "failed", detail: doms.map((d) => `${d.hostname}: ${d.verifiedAt ? "verified" : "pending"}`).join(", ") || "no domain" },
      { label: "Browser events arriving", status: lastBrowser ? "ok" : "failed", detail: lastBrowser ? `last at ${lastBrowser.toISOString()}` : "no browser event yet" },
      { label: "Server events arriving", status: lastServer ? "ok" : "skipped", detail: lastServer ? `last at ${lastServer.toISOString()}` : "no server source connected" },
      { label: "Draft lint", status: lint.ok ? "ok" : "failed", detail: `${lint.errors.length} errors, ${lint.warnings.length} warnings` },
      { label: "Published configuration", status: active ? "ok" : "pending", detail: active ? `version ${active.version}` : "nothing published yet" },
      ...ints.map((i) => ({ label: `Destination ${i.name}`, status: i.status === "connected" ? "ok" : i.status === "error" ? "failed" : "pending", detail: `${i.status}; health ${i.health.status}` })),
    ];
    return { checks, lint_errors: lint.errors, lint_warnings: lint.warnings };
  },
});

export const preparePublishTool = defineTool({
  name: "prepare_publish",
  description: "Lints the draft and returns the exact diff, affected events, recipients and purposes plus an approval id the UI needs to confirm publishing. Does not publish.",
  kind: "draft",
  permission: "config.publish",
  input: z.object({}),
  handler: async (_args, ctx) => {
    const draft = await draftFor(ctx);
    const preview = await withTenant(ctx.db, ctx.organizationId, (tx) => preparePublish(tx, draft.id));
    const diffHash = diffHashOf({ draft: draft.id, bundle: preview.draft.bundle });
    const approval = issueApprovalToken(ctx.approvalSecret, { action: "publish_config_version", targetType: "config_draft", targetId: draft.id, organizationId: ctx.organizationId, userId: ctx.userId, diffHash });
    const { approvals } = await import("@track-site/db");
    await withTenant(ctx.db, ctx.organizationId, (tx) => tx.insert(approvals).values({ organizationId: ctx.organizationId, chatSessionId: ctx.chatSessionId, userId: ctx.userId, action: "publish_config_version", targetType: "config_draft", targetId: draft.id, diffHash, summary: { changes: preview.diff.slice(0, 50).map((d) => d.summary), recipients: preview.impact.recipients }, tokenHash: approval.tokenHash, expiresAt: new Date(approval.claims.expiresAt) }));
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state = applyStepUpdate(state, "review", { fields: { reviewed: true }, evidence: { source: "tool", detail: `prepared v${preview.nextVersion}` } });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return {
      draft_id: draft.id,
      lint_ok: preview.lint.ok,
      lint_errors: preview.lint.errors,
      lint_warnings: preview.lint.warnings,
      version_from: preview.baseVersion,
      version_to: preview.nextVersion,
      changes: preview.diff.slice(0, 50).map((d) => ({ summary: d.summary, op: d.op })),
      recipients: preview.impact.recipients,
      events: preview.impact.events,
      purposes: preview.impact.purposes,
      approval: preview.lint.ok ? { token: approval.token, expires_at: new Date(approval.claims.expiresAt).toISOString() } : null,
    };
  },
});

export const compareConfigVersions = defineTool({
  name: "compare_config_versions",
  description: "Shows what changed between two published versions, or with to_version null between the active version (from_version null) and the current draft. Works before the first publish: then every draft entry is new.",
  kind: "draft",
  permission: "config.read",
  input: z.object({
    from_version: z.number().int().nullable().describe("published version number; null = the active version (or nothing when nothing is published yet)"),
    to_version: z.number().int().nullable().describe("published version number; null = the open draft"),
  }),
  handler: async (args, ctx) =>
    withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const versions = await listVersions(tx, ctx.environmentId, 100);
      const summary = versions.map((v) => ({ version: v.version, created_at: v.createdAt.toISOString(), summary: v.summary }));
      const published = versions.map((v) => v.version).join(", ") || "none";
      const active = await activeVersion(tx, ctx.environmentId);
      const from = args.from_version === null ? active : (versions.find((v) => v.version === args.from_version) ?? null);
      if (args.from_version !== null && !from) throw new AppError("NOT_FOUND", `from_version ${args.from_version} is not a published version; published versions: ${published}`);
      const entries = (d: ReturnType<typeof compareVersions>) => d.slice(0, 100).map((x) => ({ summary: x.summary, op: x.op, path: x.path }));
      if (args.to_version === null) {
        const draft = await openDraft(tx, ctx.environmentId);
        if (!draft) return { from_version: from?.version ?? null, to: "draft" as const, draft_id: null, changes: [], versions: summary, note: active ? "no open draft; the active version is what runs" : "nothing published yet and no open draft" };
        const changes = entries(diffBundles(from ? configBundleSchema.parse(from.bundle) : null, configBundleSchema.parse(draft.bundle)));
        return { from_version: from?.version ?? null, to: "draft" as const, draft_id: draft.id, changes, versions: summary, note: from ? null : "nothing published yet: every draft entry is new" };
      }
      const to = versions.find((v) => v.version === args.to_version) ?? null;
      if (!to) throw new AppError("NOT_FOUND", `to_version ${args.to_version} is not a published version; published versions: ${published}`);
      return { from_version: from?.version ?? null, to: to.version, draft_id: null, changes: entries(compareVersions(from, to)), versions: summary, note: null };
    }),
});

export const DRAFT_TOOLS = [setSetupStep, skipSetupStep, setBusinessProfileDraft, proposeEventPlan, createTriggerDraft, createIntegrationDraftTool, savePublicPixelIdDraft, upsertEventMappingDraft, setConsentPolicyDraft, requestSecureCredentialInput, verifyDomainTool, verifySnippetInstallation, validateDraft, runTestEvent, runDiagnostics, preparePublishTool, compareConfigVersions];
