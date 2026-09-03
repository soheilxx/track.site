import { and, desc, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError, fetchTextLimited, findTrackerSnippet, newUlid, normalizeDomainInput } from "@track-site/core";
import { PgEventStore } from "@track-site/analytics";
import { getConnector, validateDestinationUrl } from "@track-site/connectors";
import { REQUIRED_BROWSER_IDS, lintBundle, type ConfigBundle } from "@track-site/config";
import { activeVersion, compareVersions, consentPolicies, createIntegrationDraft, domains, getOrCreateDraft, getSite, integrations, listCredentialRefs, listVersions, preparePublish, savePublicConfig, sites, updateDraft, withTenant, recordAudit } from "@track-site/db";
import { MEASUREMENT_PLANS, getStandardEvent, isValidCustomEventName, type BusinessType } from "@track-site/events";
import { CONNECTOR_TYPES, DESTINATION_PURPOSE } from "@track-site/policy";
import { QUEUES } from "@track-site/queue";
import { diffHashOf, issueApprovalToken } from "../approvals.ts";
import type { AgentContext } from "../context.ts";
import { loadSetupState, saveSetupState } from "../setup-store.ts";
import { applyStepUpdate, goToStep, skipStep } from "../state-machine.ts";
import { setupStepSchema } from "../ui-schema.ts";
import { defineTool } from "./registry.ts";
import { normalizeCurrency, normalizeMarkets } from "./normalize.ts";


function poolOf(ctx: AgentContext) {
  return (ctx.db as unknown as { $client: Pool }).$client;
}

function actorOf(ctx: AgentContext) {
  return { kind: "agent" as const, onBehalfOfUserId: ctx.userId, role: ctx.role as "OWNER", chatSessionId: ctx.chatSessionId };
}

async function draftFor(ctx: AgentContext) {
  return withTenant(ctx.db, ctx.organizationId, (tx) => getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId }));
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
  description: "Marks the current or a given optional step as skipped after the user explicitly asked to skip it.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({ step: setupStepSchema, reason: z.string().max(200) }),
  handler: async (args, ctx) => {
    if (["site", "publish"].includes(args.step)) throw new AppError("INVALID_STATE", "this step cannot be skipped");
    const state = skipStep(await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale), args.step);
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { current_step: state.currentStep, skipped: args.step };
  },
});

export const setBusinessProfileDraft = defineTool({
  name: "set_business_profile_draft",
  description: "Records the confirmed business type, platform, markets and currency on the site and advances the setup. Markets are ISO 3166-1 alpha-2 codes (DE, AT, CH; country names are accepted and normalised), currency is an ISO 4217 code (EUR). Only call after the user confirmed the values.",
  kind: "draft",
  permission: "sites.update",
  input: z.object({
    business_type: z.enum(["ecommerce", "lead_generation", "saas", "content", "other"]).nullable(),
    platform: z.enum(["shopify", "woocommerce", "shopware", "wordpress", "headless", "custom", "unknown"]).nullable(),
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
    if (args.platform) {
      state.context.platform = args.platform;
      state = applyStepUpdate(state, "platform", { fields: { platform: args.platform }, evidence: { source: "user", detail: args.evidence ?? "confirmed in chat" }, confidence: args.confidence ?? 1 });
    }
    if (markets) state.context.markets = markets;
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { current_step: state.currentStep, business_type: state.context.businessType, platform: state.context.platform, markets: state.context.markets };
  },
});

export const proposeEventPlan = defineTool({
  name: "propose_event_plan",
  description: "Writes the measurement plan for the business type into the configuration draft (events with triggers). Purchase/refund are enabled for ad destinations only with an authoritative server source.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({ business_type: z.enum(["ecommerce", "lead_generation", "saas", "content", "other"]), include_events: z.array(z.string().max(64)).max(50).nullable(), authoritative_purchase_source: z.enum(["none", "shop_integration", "server_api"]).nullable() }),
  handler: async (args, ctx) => {
    const plan = MEASUREMENT_PLANS[args.business_type as BusinessType];
    const wanted = new Set(args.include_events ?? plan.events.map((e) => e.name));
    const draft = await draftFor(ctx);
    const { lint, draft: updated } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const existing = new Map(b.events.map((e) => [e.name, e]));
        for (const pe of plan.events) {
          if (!wanted.has(pe.name)) continue;
          const trigger: ConfigBundle["events"][number]["trigger"] = pe.capture === "auto_page" ? { type: "page", path_pattern: null } : pe.capture === "data_layer" ? { type: "data_layer", key: pe.name } : pe.capture === "shop_integration" ? { type: "api" } : pe.capture === "form_submit" ? { type: "selector", selector: "form", dom_event: "submit" } : { type: "api" };
          const authoritative = pe.requiresAuthoritativeSource ? (args.authoritative_purchase_source ?? "none") : "none";
          existing.set(pe.name, { name: pe.name, enabled: true, critical: pe.critical, trigger, props_map: null, authoritative_source: authoritative });
        }
        b.events = Array.from(existing.values());
      }),
    );
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.draftId = updated.id;
    state = applyStepUpdate(state, "event_plan", { fields: { events: Array.from(wanted) }, evidence: { source: "tool", detail: `plan ${args.business_type}` } });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { draft_id: updated.id, events: Array.from(wanted), lint: { errors: lint.errors.map((e) => e.message), warnings: lint.warnings.map((w) => w.message) } };
  },
});

export const createTriggerDraft = defineTool({
  name: "create_trigger_draft",
  description: "Adds or updates one event in the draft with a declarative trigger (page pattern, CSS selector click/submit, data layer key or API). No custom code.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({
    event_name: z.string().max(64),
    trigger_type: z.enum(["page", "selector", "data_layer", "api"]),
    path_pattern: z.string().max(256).nullable(),
    selector: z.string().max(256).nullable(),
    dom_event: z.enum(["click", "submit"]).nullable(),
    data_layer_key: z.string().max(64).nullable(),
    critical: z.boolean(),
  }),
  handler: async (args, ctx) => {
    const name = args.event_name.toLowerCase();
    if (!getStandardEvent(name) && !isValidCustomEventName(name)) throw new AppError("VALIDATION_ERROR", "invalid event name");
    const trigger: ConfigBundle["events"][number]["trigger"] =
      args.trigger_type === "page" ? { type: "page", path_pattern: args.path_pattern } : args.trigger_type === "selector" ? { type: "selector", selector: args.selector ?? "", dom_event: args.dom_event ?? "click" } : args.trigger_type === "data_layer" ? { type: "data_layer", key: args.data_layer_key ?? name } : { type: "api" };
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const i = b.events.findIndex((e) => e.name === name);
        const ev = { name, enabled: true, critical: args.critical, trigger, props_map: null, authoritative_source: "none" as const };
        if (i === -1) b.events.push(ev);
        else b.events[i] = { ...b.events[i]!, ...ev, authoritative_source: b.events[i]!.authoritative_source };
      }),
    );
    return { draft_id: draft.id, event: name, lint: { errors: lint.errors.map((e) => e.message), warnings: lint.warnings.map((w) => w.message) } };
  },
});

export const createIntegrationDraftTool = defineTool({
  name: "create_integration_draft",
  description: "Creates a destination in draft state for a supported connector type and adds it to the configuration draft with the default consent purpose. Secrets are requested separately.",
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({ connector_type: z.enum(CONNECTOR_TYPES), name: z.string().max(80).nullable(), mode: z.enum(["browser", "server", "hybrid"]).nullable() }),
  handler: async (args, ctx) => {
    const connector = getConnector(args.connector_type);
    const name = args.name ?? (connector?.meta.displayName ?? args.connector_type);
    const row = await withTenant(ctx.db, ctx.organizationId, (tx) => createIntegrationDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, connectorType: args.connector_type, name, actor: actorOf(ctx) }));
    const draft = await draftFor(ctx);
    const mode = args.mode ?? (connector?.meta.supportsBrowser && connector.meta.supportsServer ? "hybrid" : connector?.meta.supportsBrowser ? "browser" : "server");
    await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        b.destinations.push({ id: row.id, type: args.connector_type, name, enabled: false, purpose: DESTINATION_PURPOSE[args.connector_type], mode, browser: null, test_mode: true, mappings: [] });
      }),
    );
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.draftId = draft.id;
    const ids = Array.isArray(state.steps.destinations?.fields.destination_ids) ? (state.steps.destinations!.fields.destination_ids as string[]) : [];
    state = applyStepUpdate(state, "destinations", { fields: { destination_ids: [...ids, row.id] }, evidence: { source: "tool", detail: `created ${args.connector_type}` }, complete: false });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return {
      integration_id: row.id,
      connector_type: args.connector_type,
      name,
      required_public_ids: connector?.meta.requiredPublicIds ?? [],
      required_credentials: (connector?.meta.requiredCredentials ?? []).map((c) => ({ kind: c.kind, label: c.label, oauth: c.oauth?.provider ?? null })),
      access_note: null,
    };
  },
});

export const savePublicPixelIdDraft = defineTool({
  name: "save_public_pixel_id_draft",
  description: "Stores a public identifier (pixel id, measurement id, partner id, conversion id, tag id, endpoint url) for a destination after format validation. Never use for tokens or secrets.",
  kind: "draft",
  permission: "integrations.manage",
  input: z.object({ integration_id: z.string().uuid(), key: z.string().regex(/^[a-z_]{2,40}$/), value: z.string().min(1).max(256) }),
  handler: async (args, ctx) => {
    if (/token|secret|password|key$/i.test(args.key) || /\b(EAA|sk_live|sk_test|whsec_|AKIA)/.test(args.value)) throw new AppError("POLICY_BLOCKED", "this looks like a secret; use request_secure_credential_input");
    const integration = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(integrations).where(and(eq(integrations.id, args.integration_id), eq(integrations.siteId, ctx.siteId))).limit(1))[0] ?? null);
    if (!integration) throw new AppError("NOT_FOUND", "integration not found");
    const connector = getConnector(integration.connectorType);
    const requirement = connector?.meta.requiredPublicIds.find((r) => r.key === args.key);
    if (requirement && !new RegExp(requirement.pattern).test(args.value)) throw new AppError("VALIDATION_ERROR", `${requirement.label} does not match the expected format (example: ${requirement.example})`);
    if (args.key === "url") await validateDestinationUrl(args.value, { allowPrivateNetwork: ctx.allowPrivateNetwork, allowHttp: ctx.allowPrivateNetwork });
    await withTenant(ctx.db, ctx.organizationId, (tx) => savePublicConfig(tx, { siteId: ctx.siteId, integrationId: integration.id, publicConfig: { ...integration.publicConfig, [args.key]: args.value }, actor: actorOf(ctx) }));
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === integration.id);
        if (d) d.browser = { ...(d.browser ?? {}), [args.key]: args.value };
      }),
    );
    const missing = (REQUIRED_BROWSER_IDS[integration.connectorType] ?? []).filter((k) => !(k === args.key) && !integration.publicConfig[k]);
    return { integration_id: integration.id, saved: args.key, still_missing_public_ids: missing, lint_errors: lint.errors.map((e) => e.message) };
  },
});

export const upsertEventMappingDraft = defineTool({
  name: "upsert_event_mapping_draft",
  description: "Maps a canonical event to the vendor event name for a destination in the draft (enable/disable). Field maps use the safe JSONLogic subset.",
  kind: "draft",
  permission: "config.draft",
  input: z.object({ integration_id: z.string().uuid(), event: z.string().max(64), vendor_event: z.string().max(64), enabled: z.boolean(), enable_destination: z.boolean().nullable() }),
  handler: async (args, ctx) => {
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, (tx) =>
      updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === args.integration_id);
        if (!d) throw new AppError("NOT_FOUND", "destination not in draft");
        const i = d.mappings.findIndex((m) => m.event === args.event);
        const mapping = { event: args.event, vendor_event: args.vendor_event, enabled: args.enabled, field_map: null };
        if (i === -1) d.mappings.push(mapping);
        else d.mappings[i] = mapping;
        if (args.enable_destination !== null && args.enable_destination !== undefined) d.enabled = args.enable_destination;
      }),
    );
    return { draft_id: draft.id, lint: { errors: lint.errors.map((e) => e.message), warnings: lint.warnings.map((w) => w.message) } };
  },
});

export const setConsentPolicyDraft = defineTool({
  name: "set_consent_policy_draft",
  description: "Records the consent mechanism (CMP or API), markets and consent mode in the draft. Never weakens defaults without an explicit user decision; advanced consent mode requires a documented legal review note.",
  kind: "draft",
  permission: "consent.manage",
  input: z.object({ cmp_provider: z.enum(["none", "api", "usercentrics", "cookiebot", "onetrust", "tcf", "gpp"]), consent_mode: z.enum(["basic", "advanced"]).nullable(), legal_review_note: z.string().max(500).nullable(), markets: z.array(z.string().min(2).max(56)).max(20).nullable() }),
  handler: async (args, ctx) => {
    if (args.consent_mode === "advanced" && !args.legal_review_note) throw new AppError("POLICY_BLOCKED", "advanced consent mode requires a legal review note from the customer");
    const draft = await draftFor(ctx);
    const { lint } = await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const r = await updateDraft(tx, draft.id, (b) => {
        b.consent.cmp = { provider: args.cmp_provider === "none" ? "api" : args.cmp_provider, settings: {} };
        if (args.consent_mode) b.consent.consent_mode = { enabled: true, mode: args.consent_mode };
      });
      const latest = await tx.select().from(consentPolicies).where(eq(consentPolicies.siteId, ctx.siteId)).orderBy(desc(consentPolicies.version)).limit(1);
      const version = (latest[0]?.version ?? 0) + 1;
      await tx.insert(consentPolicies).values({ organizationId: ctx.organizationId, siteId: ctx.siteId, version, status: "draft", cmp: { provider: args.cmp_provider, settings: {} }, consentMode: { mode: args.consent_mode ?? "basic", legalReviewNote: args.legal_review_note }, createdBy: ctx.userId });
      return r;
    });
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.cmp = args.cmp_provider;
    const consentMarkets = normalizeMarkets(args.markets);
    if (consentMarkets) state.context.markets = consentMarkets;
    state = applyStepUpdate(state, "consent", { fields: { cmp: args.cmp_provider, policy_version: "draft" }, evidence: { source: "user", detail: `cmp ${args.cmp_provider}` } });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { cmp: args.cmp_provider, consent_mode: args.consent_mode ?? "basic", lint_warnings: lint.warnings.map((w) => w.message), current_step: state.currentStep };
  },
});

export const requestSecureCredentialInput = defineTool({
  name: "request_secure_credential_input",
  description: "Asks the UI to show the secure credential card or OAuth button for a destination. The secret never passes through the chat. Returns the credentials already stored (references only).",
  kind: "draft",
  permission: "credentials.write",
  input: z.object({ integration_id: z.string().uuid(), credential_kind: z.enum(["access_token", "api_secret", "oauth_refresh_token", "oauth_access_token", "oauth_token_secret", "client_id", "client_secret", "webhook_secret", "signing_secret"]) }),
  handler: async (args, ctx) => {
    const integration = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(integrations).where(and(eq(integrations.id, args.integration_id), eq(integrations.siteId, ctx.siteId))).limit(1))[0] ?? null);
    if (!integration) throw new AppError("NOT_FOUND", "integration not found");
    const connector = getConnector(integration.connectorType);
    const requirement = connector?.meta.requiredCredentials.find((c) => c.kind === args.credential_kind) ?? connector?.meta.requiredCredentials[0] ?? null;
    const refs = await withTenant(ctx.db, ctx.organizationId, (tx) => listCredentialRefs(tx, integration.id));
    return {
      ui: { component: requirement?.oauth ? "oauth" : "secure_credential", integration_id: integration.id, connector_type: integration.connectorType, credential_kind: requirement?.kind ?? args.credential_kind, label: requirement?.label ?? "Credential", help: requirement?.help ?? "", oauth_provider: requirement?.oauth?.provider ?? null },
      existing: refs.filter((r) => r.status === "active").map((r) => ({ id: r.id, kind: r.kind, last4: r.last4, expires_at: r.expiresAt })),
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
  description: "Sends a clearly flagged synthetic test event through the real pipeline for the site (test mode) and reports whether it was accepted, stored and routed. Never sends live conversions.",
  kind: "draft",
  permission: "events.read",
  input: z.object({ event_name: z.string().max(64), with_consent: z.boolean() }),
  handler: async (args, ctx) => {
    if (!ctx.queue) throw new AppError("NOT_CONNECTED", "queue not configured");
    const site = await withTenant(ctx.db, ctx.organizationId, (tx) => getSite(tx, ctx.organizationId, ctx.siteId));
    if (!site) throw new AppError("NOT_FOUND", "site not found");
    const name = args.event_name.toLowerCase();
    if (!getStandardEvent(name) && !isValidCustomEventName(name)) throw new AppError("VALIDATION_ERROR", "invalid event name");
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
          page: { url: `https://${site.primaryDomain ?? "example.test"}/track-site-test`, referrer: null, title: "track.site test event" },
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
    return { source_event_id: id, accepted_by_queue: true, stored: Boolean(stored), processing_state: stored?.processing_state ?? (args.with_consent ? "not_processed_yet" : "dropped_as_expected"), expected: args.with_consent ? "stored and routed" : "dropped (no consent)", passed, note: stored ? "Check the event debugger for delivery status per destination." : args.with_consent ? "The worker did not process the event within 4 seconds; it may still be in the queue." : "Without consent nothing is stored, as required." };
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
  description: "Shows what changed between two published versions (or the active version and the draft).",
  kind: "draft",
  permission: "config.read",
  input: z.object({ from_version: z.number().int().nullable(), to_version: z.number().int().nullable() }),
  handler: async (args, ctx) =>
    withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const versions = await listVersions(tx, ctx.environmentId, 100);
      const from = args.from_version === null ? null : (versions.find((v) => v.version === args.from_version) ?? null);
      const to = args.to_version === null ? (versions[0] ?? null) : (versions.find((v) => v.version === args.to_version) ?? null);
      if (!to) throw new AppError("NOT_FOUND", "no published version");
      return { from: from?.version ?? null, to: to.version, changes: compareVersions(from, to).slice(0, 100).map((d) => ({ summary: d.summary, op: d.op, path: d.path })), versions: versions.map((v) => ({ version: v.version, created_at: v.createdAt.toISOString(), summary: v.summary })) };
    }),
});

export const DRAFT_TOOLS = [setSetupStep, skipSetupStep, setBusinessProfileDraft, proposeEventPlan, createTriggerDraft, createIntegrationDraftTool, savePublicPixelIdDraft, upsertEventMappingDraft, setConsentPolicyDraft, requestSecureCredentialInput, verifyDomainTool, verifySnippetInstallation, validateDraft, runTestEvent, runDiagnostics, preparePublishTool, compareConfigVersions];

