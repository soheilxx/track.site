import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError, fetchTextLimited, inspectHtml, normalizeDomainInput } from "@track-site/core";
import { PgEventStore, computeHealthScore } from "@track-site/analytics";
import { validateDestinationUrl } from "@track-site/connectors";
import { activeVersion, configDrafts, consentPolicies, dataQualityIssues, deliveryAttempts, domains, eventAggregates, getSite, integrations, openDraft, withTenant } from "@track-site/db";
import { STANDARD_EVENTS, MEASUREMENT_PLANS, type BusinessType } from "@track-site/events";
import { DESTINATION_PURPOSE, DEFAULT_SITE_POLICY } from "@track-site/policy";
import type { AgentContext } from "../context.ts";
import { loadSetupState } from "../setup-store.ts";
import { completedSteps, missingFields, progressPercent } from "../state-machine.ts";
import { defineTool } from "./registry.ts";

function poolOf(ctx: AgentContext) {
  return (ctx.db as unknown as { $client: Pool }).$client;
}

export const getWorkspaceState = defineTool({
  name: "get_workspace_state",
  description: "Returns the current site, environments, domains, integrations, active configuration version and plan limits for the workspace the user is working in.",
  kind: "read",
  permission: "sites.read",
  input: z.object({}),
  handler: async (_args, ctx) =>
    withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const site = await getSite(tx, ctx.organizationId, ctx.siteId);
      if (!site) throw new AppError("NOT_FOUND", "site not found");
      const doms = await tx.select({ hostname: domains.hostname, verifiedAt: domains.verifiedAt }).from(domains).where(eq(domains.siteId, site.id));
      const ints = await tx.select({ id: integrations.id, type: integrations.connectorType, name: integrations.name, status: integrations.status, publicConfig: integrations.publicConfig }).from(integrations).where(eq(integrations.siteId, site.id));
      const active = await activeVersion(tx, ctx.environmentId);
      const draft = await openDraft(tx, ctx.environmentId);
      return {
        site: { id: site.id, name: site.name, tracking_id: site.trackingId, domain: site.primaryDomain, business_type: site.businessType, platform: site.platform, status: site.status },
        domains: doms.map((d) => ({ hostname: d.hostname, verified: Boolean(d.verifiedAt) })),
        integrations: ints.map((i) => ({ id: i.id, type: i.type, name: i.name, status: i.status, public_config: i.publicConfig })),
        active_version: active?.version ?? null,
        open_draft: draft ? { id: draft.id, base_version: draft.baseVersion, lint: draft.lint } : null,
        snippet: `<script async src="${ctx.hosts.cdn}/v1/tracker.js" data-site-id="${site.trackingId}"></script>`,
      };
    }),
});

export const getSetupState = defineTool({
  name: "get_setup_state",
  description: "Returns the authoritative, resumable setup state: current step, completed steps, missing fields, blockers and known context. Always trust this over the chat history.",
  kind: "read",
  permission: "sites.read",
  input: z.object({}),
  handler: async (_args, ctx) => {
    const state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    return { current_step: state.currentStep, progress_percent: progressPercent(state), completed_steps: completedSteps(state), missing_fields: missingFields(state), context: state.context, steps: state.steps };
  },
});

/**
 * Resolves the requested page to a path on the site's own host: null/empty = home page, "checkout" =
 * "/checkout", a full URL is accepted only when it points at the site's host (its path is used);
 * anything on another host is rejected instead of silently falling back to the home page.
 */
export function resolveInspectPath(input: string | null | undefined, host: string): string {
  const raw = input?.trim() ?? "";
  if (!raw) return "/";
  if (/^(https?:)?\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    } catch {
      throw new AppError("VALIDATION_ERROR", `path "${raw.slice(0, 80)}" is not a valid URL or path; use a path on ${host} such as /checkout`);
    }
    const target = normalizeDomainInput(url.hostname);
    if (target !== host) throw new AppError("VALIDATION_ERROR", `path must be on the site's primary domain ${host}; ${url.hostname} is a different host`);
    return `${url.pathname}${url.search}`;
  }
  if (/[\s<>"']/.test(raw)) throw new AppError("VALIDATION_ERROR", `path "${raw.slice(0, 80)}" contains characters that are not allowed; use a path such as /checkout`);
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export const inspectSite = defineTool({
  name: "inspect_site",
  description: "Fetches a public page of the site's primary domain (the home page by default) and returns technology signals (platform, CMP, existing tags, data layer). Signals are evidence; the user must confirm.",
  kind: "read",
  trust: "external",
  permission: "sites.read",
  input: z.object({ path: z.string().max(200).nullable().describe("path on the site's primary domain starting with '/', e.g. /checkout; null = home page. Other hosts are rejected") }),
  handler: async (args, ctx) => {
    const site = await withTenant(ctx.db, ctx.organizationId, (tx) => getSite(tx, ctx.organizationId, ctx.siteId));
    if (!site?.primaryDomain) throw new AppError("INVALID_STATE", "the site has no primary domain yet");
    const host = normalizeDomainInput(site.primaryDomain);
    if (!host) throw new AppError("VALIDATION_ERROR", "invalid primary domain");
    const path = resolveInspectPath(args.path, host);
    const url = `https://${host}${path}`;
    try {
      await validateDestinationUrl(url, { allowPrivateNetwork: ctx.allowPrivateNetwork });
      const html = await fetchTextLimited(url, ctx.fetch);
      const inspection = inspectHtml(html);
      return { url, fetched: true, ...inspection };
    } catch (e) {
      return { url, fetched: false, error: e instanceof Error ? e.message.slice(0, 160) : "fetch failed", platform: "unknown", confidence: 0, signals: [], cmp: "unknown", existingTags: [], hasDataLayer: false, isEcommerceLikely: false, title: null, language: null };
    }
  },
});

export const detectSiteStack = defineTool({
  name: "detect_site_stack",
  description: "Combines the site inspection with the recorded platform/business type and returns a recommendation with confidence and the simplest installation method (snippet, app/plugin or server API).",
  kind: "read",
  trust: "external",
  permission: "sites.read",
  input: z.object({}),
  handler: async (_args, ctx) => {
    const inspection = (await inspectSite.run({ path: null }, ctx)) as { ok: boolean; data: { platform: string; confidence: number; cmp: string; isEcommerceLikely: boolean; existingTags: string[]; hasDataLayer: boolean } };
    const d = inspection.ok ? inspection.data : { platform: "unknown", confidence: 0, cmp: "unknown", isEcommerceLikely: false, existingTags: [], hasDataLayer: false };
    const business: BusinessType = d.isEcommerceLikely ? "ecommerce" : "other";
    const method = d.platform === "shopify" ? "shopify_app" : d.platform === "woocommerce" ? "woocommerce_plugin" : d.platform === "shopware" ? "shopware_app" : "snippet";
    return {
      platform: d.platform,
      platform_confidence: d.confidence,
      business_type_suggestion: business,
      cmp_detected: d.cmp,
      existing_tags: d.existingTags,
      has_data_layer: d.hasDataLayer,
      recommended_installation: method,
      recommended_plan: MEASUREMENT_PLANS[business].events.map((e) => e.name),
      note: "Suggestions only; ask the user to confirm business type and platform.",
    };
  },
});

export const listIntegrations = defineTool({
  name: "list_integrations",
  description: "Lists the site's destinations with status, public identifiers, health and consent purpose (never secrets).",
  kind: "read",
  permission: "integrations.read",
  input: z.object({}),
  handler: async (_args, ctx) =>
    withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const rows = await tx.select().from(integrations).where(eq(integrations.siteId, ctx.siteId));
      return rows.map((r) => ({ id: r.id, type: r.connectorType, name: r.name, status: r.status, public_config: r.publicConfig, purpose: r.requiredPurpose ?? DESTINATION_PURPOSE[r.connectorType], health: r.health, test_mode: r.testMode }));
    }),
});

export const inspectEventSchema = defineTool({
  name: "inspect_event_schema",
  description: "Returns the canonical standard events with required and optional parameters and the measurement plan templates.",
  kind: "read",
  permission: "events.read",
  input: z.object({ business_type: z.enum(["ecommerce", "lead_generation", "saas", "content", "other"]).nullable() }),
  handler: async (args) => ({
    standard_events: STANDARD_EVENTS.map((e) => ({ name: e.name, category: e.category, required: e.requiredParams, optional: e.optionalParams, needs_authoritative_source: e.authoritativeSourceRecommended })),
    plan: args.business_type ? MEASUREMENT_PLANS[args.business_type] : null,
  }),
});

export const analyzeRecentEventHealth = defineTool({
  name: "analyze_recent_event_health",
  description: "Aggregated event health for the last 24 hours: received, accepted, dropped by reason, duplicates, deliveries, last browser/server event and the tracking health score. No raw events.",
  kind: "read",
  trust: "external",
  permission: "events.read",
  input: z.object({ hours: z.number().int().min(1).max(168).nullable() }),
  handler: async (args, ctx) => {
    const hours = args.hours ?? 24;
    const since = new Date(ctx.now().getTime() - hours * 3_600_000);
    const store = new PgEventStore(poolOf(ctx));
    const [browserAt, serverAt] = await Promise.all([store.lastEventAt(ctx.siteId, "browser"), store.lastEventAt(ctx.siteId, "server")]);
    const agg = await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const rows = await tx.select({ name: eventAggregates.eventName, received: sql<number>`sum(${eventAggregates.received})::int`, accepted: sql<number>`sum(${eventAggregates.accepted})::int`, dedup: sql<number>`sum(${eventAggregates.deduplicated})::int`, delivered: sql<number>`sum(${eventAggregates.delivered})::int`, failed: sql<number>`sum(${eventAggregates.failed})::int` }).from(eventAggregates).where(and(eq(eventAggregates.siteId, ctx.siteId), gte(eventAggregates.bucketStart, since))).groupBy(eventAggregates.eventName);
      const drops = await tx.execute(sql`SELECT k AS reason, sum((dropped->>k)::int)::int AS n FROM event_aggregates, jsonb_object_keys(dropped) k WHERE site_id = ${ctx.siteId} AND bucket_start >= ${since} GROUP BY k`);
      const issues = await tx.select({ kind: dataQualityIssues.kind, severity: dataQualityIssues.severity, summary: dataQualityIssues.summary }).from(dataQualityIssues).where(and(eq(dataQualityIssues.siteId, ctx.siteId), eq(dataQualityIssues.status, "open"))).limit(10);
      return { rows, drops: (drops as unknown as { rows: Array<{ reason: string; n: number }> }).rows, issues };
    });
    const totals = agg.rows.reduce((a, r) => ({ received: a.received + r.received, accepted: a.accepted + r.accepted, dedup: a.dedup + r.dedup, delivered: a.delivered + r.delivered, failed: a.failed + r.failed }), { received: 0, accepted: 0, dedup: 0, delivered: 0, failed: 0 });
    const consentDrops = agg.drops.filter((d) => d.reason.startsWith("consent")).reduce((a, d) => a + d.n, 0);
    const health = computeHealthScore({
      consentCoverage: totals.received ? Math.max(0, 1 - consentDrops / totals.received) : null,
      criticalEventsSeen: agg.rows.filter((r) => ["purchase", "generate_lead", "sign_up", "subscribe"].includes(r.name) && r.accepted > 0).length,
      criticalEventsPlanned: 1,
      schemaQuality: totals.received ? Math.max(0, 1 - agg.drops.filter((d) => d.reason === "pii_blocked" || d.reason === "invalid_event_name").reduce((a, d) => a + d.n, 0) / totals.received) : null,
      duplicateRate: totals.received ? totals.dedup / totals.received : null,
      deliverySuccess: totals.delivered + totals.failed ? totals.delivered / (totals.delivered + totals.failed) : null,
      unhealthyIntegrations: 0,
      totalIntegrations: 0,
      minutesSinceLastBrowserEvent: browserAt ? Math.round((ctx.now().getTime() - browserAt.getTime()) / 60_000) : null,
    });
    return { hours, totals, by_event: agg.rows, drops: agg.drops, last_browser_event_at: browserAt?.toISOString() ?? null, last_server_event_at: serverAt?.toISOString() ?? null, health_score: health.score, health_components: health.components, open_issues: agg.issues };
  },
});

/** Delivery statuses that count as failures for show_delivery_errors (pending and success are excluded in SQL). */
export const FAILED_DELIVERY_STATUSES = ["retry", "failed", "dead", "skipped"] as const;

export const showDeliveryErrors = defineTool({
  name: "show_delivery_errors",
  description: "Most recent failed, retrying, dead or skipped deliveries (newest first) with error class, code and redacted message; successes are excluded before the limit is applied (no payloads, no secrets).",
  kind: "read",
  trust: "external",
  permission: "events.read",
  input: z.object({
    integration_id: z.string().uuid().nullable().describe("integration id (UUID) from the integrations list in the context block or list_integrations; null = all destinations of the site"),
    limit: z.number().int().min(1).max(50).nullable().describe("maximum number of failed attempts to return; null = 20"),
  }),
  handler: async (args, ctx) =>
    withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const limit = args.limit ?? 20;
      const failures = await tx
        .select({ id: deliveryAttempts.id, integrationId: deliveryAttempts.integrationId, connector: deliveryAttempts.connectorType, event: deliveryAttempts.eventName, status: deliveryAttempts.status, errorClass: deliveryAttempts.errorClass, code: deliveryAttempts.errorCode, message: deliveryAttempts.errorMessage, http: deliveryAttempts.httpStatus, at: deliveryAttempts.startedAt })
        .from(deliveryAttempts)
        .where(and(eq(deliveryAttempts.siteId, ctx.siteId), inArray(deliveryAttempts.status, [...FAILED_DELIVERY_STATUSES]), ...(args.integration_id ? [eq(deliveryAttempts.integrationId, args.integration_id)] : [])))
        .orderBy(desc(deliveryAttempts.startedAt))
        .limit(limit);
      return { integration_id: args.integration_id, limit, count: failures.length, failures, note: failures.length ? null : `no failed, retrying, dead or skipped delivery attempts recorded${args.integration_id ? " for this destination" : ""}` };
    }),
});

export const explainConsentState = defineTool({
  name: "explain_consent_state",
  description: "Explains the site's consent policy: purposes, region mode, which destinations need which purpose, CMP integration and what happens without consent.",
  kind: "read",
  permission: "consent.read",
  input: z.object({}),
  handler: async (_args, ctx) =>
    withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const policy = await tx.select().from(consentPolicies).where(eq(consentPolicies.siteId, ctx.siteId)).orderBy(desc(consentPolicies.version)).limit(1);
      const ints = await tx.select({ type: integrations.connectorType, name: integrations.name, purpose: integrations.requiredPurpose }).from(integrations).where(eq(integrations.siteId, ctx.siteId));
      const draft = await tx.select({ bundle: configDrafts.bundle }).from(configDrafts).where(and(eq(configDrafts.environmentId, ctx.environmentId), eq(configDrafts.status, "open"))).limit(1);
      const p = policy[0];
      return {
        policy_version: p ? `v${p.version} (${p.status})` : "default (strict opt-in, not published)",
        region_mode: p?.regionPolicies ?? DEFAULT_SITE_POLICY.regionPolicies,
        cmp: p?.cmp ?? (draft[0]?.bundle as { consent?: { cmp?: unknown } } | undefined)?.consent?.cmp ?? { provider: "api", settings: {} },
        consent_mode: p?.consentMode ?? { mode: "basic" },
        destinations: ints.map((i) => ({ name: i.name, type: i.type, requires: i.purpose ?? DESTINATION_PURPOSE[i.type] })),
        without_consent: "No cookies, no identifiers, no analytics or marketing persistence, no pixels, no server-side dispatch and no replay after consent. Server purchases are processed operationally but never sent to advertising destinations.",
      };
    }),
});

export const READ_TOOLS = [getWorkspaceState, getSetupState, inspectSite, detectSiteStack, listIntegrations, inspectEventSchema, analyzeRecentEventHealth, showDeliveryErrors, explainConsentState];
