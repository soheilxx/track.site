import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { configBundleSchema, type ConfigBundle } from "@track-site/config";
import { activeVersion, dataQualityIssues, deadLetterReferences, deliveryAttempts, eventAggregates, eventDefinitions, eventLineage, eventMappings, events, integrations, pgErrorCode, testLabRuns, type LineageOutcome, type LineageStage, type TestLabStep, type Tx } from "@track-site/db";
import { getStandardEvent, MEASUREMENT_PLANS } from "@track-site/events";
import { EXPLORER_SOURCES, EXPLORER_STATUSES, EXPLORER_WINDOWS, type ExplorerFilters, type ExplorerSource, type ExplorerStatus, type ExplorerWindow } from "@/components/app/events/filters";
import { logger } from "./db";
import { CONSENT_DROP_REASONS, buildTimeline, checkRequiredParams, consentStatus, freshnessStatus, maskClickId, maskId, presentUserDataFields, redactForDisplay, requiredParamsStatus, timelineSummary, type CellStatus, type RequiredParamsCheck, type StepTone, type TimelineStep } from "./events-lineage";
import { withOrg, type OrgContext } from "./session";
import type { WorkspaceEnvironment, WorkspaceSite } from "./workspace";

/**
 * Data access of the Events module (overview, Event Coverage Matrix, Live Event Explorer, Live Test
 * Lab). Every query runs inside `withOrg` (RLS as `tracksite_app`); the site and environment always
 * come from the workspace (`activeSite(ctx)`), never from the client. Payloads leave this module
 * redacted (`redactForDisplay`, masked identifiers, hashed user data as field names only). Nothing is
 * invented: a metric without a measurement is `null`, an unknown stage has `at: null`.
 */

export { EXPLORER_SOURCES, EXPLORER_STATUSES, EXPLORER_WINDOWS, type ExplorerFilters, type ExplorerSource, type ExplorerStatus, type ExplorerWindow } from "@/components/app/events/filters";
const WINDOW_MS: Record<ExplorerWindow, number> = { "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };

const DAY = 86_400_000;

/** Runs `fn` in a savepoint; a missing table (migration 0007 not applied) yields `null` instead of aborting the transaction. */
async function optional<T>(tx: Tx, what: string, fn: (sp: Tx) => Promise<T>): Promise<T | null> {
  try {
    return await tx.transaction(fn);
  } catch (e) {
    if (pgErrorCode(e) !== "42P01") throw e;
    logger.warn(`${what} missing: apply migration 0007_event_lineage`);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------------

export interface OverviewByEvent {
  name: string;
  sources: string[];
  received: number;
  accepted: number;
  dropped: number;
  deduplicated: number;
  delivered: number;
  failed: number;
  lastAt: string | null;
}

export interface EventsOverview {
  /** last 24 h, from the hourly aggregates of the active environment */
  day: { received: number; accepted: number; dropped: number; deduplicated: number; delivered: number; failed: number; billable: number; droppedReasons: Record<string, number> } | null;
  lastBrowserAt: string | null;
  lastServerAt: string | null;
  /** dead-lettered deliveries of the site not replayed yet */
  deadLetters: number;
  lineageAvailable: boolean;
  byEvent: OverviewByEvent[];
  generatedAt: string;
}

interface AggregateRow {
  eventName: string;
  source: string;
  bucketStart: Date;
  received: number;
  accepted: number;
  dropped: Record<string, number>;
  deduplicated: number;
  delivered: number;
  failed: number;
  billable: number;
}

async function aggregatesSince(tx: Tx, siteId: string, environmentId: string, since: Date): Promise<AggregateRow[]> {
  return tx
    .select({ eventName: eventAggregates.eventName, source: eventAggregates.source, bucketStart: eventAggregates.bucketStart, received: eventAggregates.received, accepted: eventAggregates.accepted, dropped: eventAggregates.dropped, deduplicated: eventAggregates.deduplicated, delivered: eventAggregates.delivered, failed: eventAggregates.failed, billable: eventAggregates.billable })
    .from(eventAggregates)
    .where(and(eq(eventAggregates.siteId, siteId), eq(eventAggregates.environmentId, environmentId), gte(eventAggregates.bucketStart, since)))
    .limit(20_000);
}

async function lastSeenByNameAndSource(tx: Tx, siteId: string, environmentId: string, since: Date): Promise<Map<string, string>> {
  const rows = await tx
    .select({ name: events.name, source: events.source, lastAt: sql<Date>`max(${events.serverTs})` })
    .from(events)
    .where(and(eq(events.siteId, siteId), eq(events.environmentId, environmentId), gte(events.serverTs, since)))
    .groupBy(events.name, events.source);
  return new Map(rows.map((r) => [`${r.name}|${r.source}`, new Date(r.lastAt).toISOString()]));
}

const sumDropped = (rows: AggregateRow[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.dropped ?? {})) out[k] = (out[k] ?? 0) + Number(v);
  return out;
};

export async function loadEventsOverview(ctx: OrgContext, site: WorkspaceSite, environment: WorkspaceEnvironment): Promise<EventsOverview> {
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * DAY);
  const since24h = new Date(now.getTime() - DAY);
  return withOrg(ctx, async (tx) => {
    const rows = await aggregatesSince(tx, site.id, environment.id, since7d);
    const lastSeen = await lastSeenByNameAndSource(tx, site.id, environment.id, since7d);
    const [last] = await tx
      .select({ browser: sql<Date | null>`max(${events.serverTs}) FILTER (WHERE ${events.source} = 'browser')`, server: sql<Date | null>`max(${events.serverTs}) FILTER (WHERE ${events.source} <> 'browser')` })
      .from(events)
      .where(and(eq(events.siteId, site.id), eq(events.environmentId, environment.id), gte(events.serverTs, new Date(now.getTime() - 90 * DAY))));
    const [dead] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(deadLetterReferences)
      .where(and(eq(deadLetterReferences.siteId, site.id), isNull(deadLetterReferences.replayedAt)));
    const lineage = await optional(tx, "event_lineage", async (sp) => {
      const [r] = await sp.select({ n: sql<number>`count(*)::int` }).from(eventLineage).where(and(eq(eventLineage.siteId, site.id), gte(eventLineage.occurredAt, since7d)));
      return r?.n ?? 0;
    });
    const dayRows = rows.filter((r) => r.bucketStart.getTime() >= since24h.getTime());
    const total = (list: AggregateRow[], key: keyof Omit<AggregateRow, "eventName" | "source" | "bucketStart" | "dropped">) => list.reduce((a, r) => a + Number(r[key]), 0);
    const day =
      dayRows.length === 0
        ? null
        : {
            received: total(dayRows, "received"),
            accepted: total(dayRows, "accepted"),
            dropped: Object.values(sumDropped(dayRows)).reduce((a, b) => a + b, 0),
            deduplicated: total(dayRows, "deduplicated"),
            delivered: total(dayRows, "delivered"),
            failed: total(dayRows, "failed"),
            billable: total(dayRows, "billable"),
            droppedReasons: sumDropped(dayRows),
          };
    const byName = new Map<string, OverviewByEvent>();
    for (const r of rows) {
      const cur = byName.get(r.eventName) ?? { name: r.eventName, sources: [], received: 0, accepted: 0, dropped: 0, deduplicated: 0, delivered: 0, failed: 0, lastAt: null };
      if (!cur.sources.includes(r.source)) cur.sources.push(r.source);
      cur.received += r.received;
      cur.accepted += r.accepted;
      cur.dropped += Object.values(r.dropped ?? {}).reduce((a, b) => a + Number(b), 0);
      cur.deduplicated += r.deduplicated;
      cur.delivered += r.delivered;
      cur.failed += r.failed;
      byName.set(r.eventName, cur);
    }
    for (const [key, at] of lastSeen) {
      const name = key.split("|")[0]!;
      const cur = byName.get(name);
      if (cur && (!cur.lastAt || cur.lastAt < at)) cur.lastAt = at;
    }
    return {
      day,
      lastBrowserAt: last?.browser ? new Date(last.browser).toISOString() : null,
      lastServerAt: last?.server ? new Date(last.server).toISOString() : null,
      deadLetters: dead?.n ?? 0,
      lineageAvailable: lineage !== null,
      byEvent: Array.from(byName.values()).sort((a, b) => b.received - a.received),
      generatedAt: now.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// Event Coverage Matrix
// ---------------------------------------------------------------------------------------------------

export type CoverageActionKey = "installSnippet" | "openSetup" | "createSourceKey" | "openShop" | "openConsent" | "openDataQuality" | "openDestination" | "addDestination" | "mapEvent" | "openExplorer";

export interface CoverageAction {
  key: CoverageActionKey;
  href: string;
}

export interface CoverageCell {
  status: CellStatus;
  /** message key under `events.coverage.messages` */
  message: string;
  params?: Record<string, string | number>;
  lastAt: string | null;
  action: CoverageAction | null;
}

export interface CoverageDestination {
  id: string;
  name: string;
  type: string;
  integrationStatus: string;
  status: CellStatus;
  delivered: number;
  failed: number;
  skipped: number;
  lastDeliveredAt: string | null;
  lastFailedAt: string | null;
  href: string;
}

export interface CoverageRow {
  name: string;
  critical: boolean;
  standard: boolean;
  origin: Array<"definition" | "plan" | "observed">;
  browser: CoverageCell;
  server: CoverageCell;
  consent: CoverageCell & { received: number; blocked: number; skippedDeliveries: number };
  params: CoverageCell & RequiredParamsCheck;
  quality: CoverageCell & { open: number; critical: number };
  destinations: CoverageCell & { list: CoverageDestination[] };
}

export interface CoverageMatrix {
  rows: CoverageRow[];
  windowDays: 7;
  configVersion: number | null;
  hasDefinitions: boolean;
  hasPlan: boolean;
  integrationsCount: number;
  generatedAt: string;
}

const BROWSER_CAPTURES = new Set(["auto_page", "data_layer", "form_submit", "click_selector"]);
const SERVER_CAPTURES = new Set(["shop_integration", "manual_api"]);
const BROWSER_TRIGGERS = new Set(["page", "selector", "data_layer"]);
const SERVER_TRIGGERS = new Set(["api", "shop_integration"]);
const SHOP_PLATFORMS = new Set(["shopify", "woocommerce", "shopware"]);

export async function loadCoverageMatrix(ctx: OrgContext, site: WorkspaceSite, environment: WorkspaceEnvironment): Promise<CoverageMatrix> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * DAY);
  return withOrg(ctx, async (tx) => {
    const definitions = await tx.select().from(eventDefinitions).where(and(eq(eventDefinitions.siteId, site.id), sql`${eventDefinitions.status} <> 'disabled'`));
    const version = await activeVersion(tx, environment.id);
    const parsed = version ? configBundleSchema.safeParse(version.bundle) : null;
    const bundle: ConfigBundle | null = parsed?.success ? parsed.data : null;
    const aggregates = await aggregatesSince(tx, site.id, environment.id, since);
    const lastSeen = await lastSeenByNameAndSource(tx, site.id, environment.id, since);
    const integrationRows = await tx.select({ id: integrations.id, name: integrations.name, type: integrations.connectorType, status: integrations.status }).from(integrations).where(eq(integrations.siteId, site.id));
    const mappingRows = await tx.select({ integrationId: eventMappings.integrationId, eventName: eventMappings.eventName, enabled: eventMappings.enabled }).from(eventMappings).where(eq(eventMappings.siteId, site.id));
    const attemptRows = await tx
      .select({
        eventName: deliveryAttempts.eventName,
        integrationId: deliveryAttempts.integrationId,
        status: deliveryAttempts.status,
        errorClass: deliveryAttempts.errorClass,
        n: sql<number>`count(*)::int`,
        lastAt: sql<Date>`max(${deliveryAttempts.startedAt})`,
      })
      .from(deliveryAttempts)
      .where(and(eq(deliveryAttempts.siteId, site.id), gte(deliveryAttempts.startedAt, since)))
      .groupBy(deliveryAttempts.eventName, deliveryAttempts.integrationId, deliveryAttempts.status, deliveryAttempts.errorClass);
    const issues = await tx
      .select({ kind: dataQualityIssues.kind, severity: dataQualityIssues.severity, summary: dataQualityIssues.summary, details: dataQualityIssues.details })
      .from(dataQualityIssues)
      .where(and(eq(dataQualityIssues.siteId, site.id), eq(dataQualityIssues.status, "open")))
      .limit(500);

    // rows = plan/definition events ∪ observed names (7 d); critical first
    const names = new Map<string, { origin: Set<CoverageRow["origin"][number]>; critical: boolean }>();
    const add = (name: string, origin: CoverageRow["origin"][number], critical = false) => {
      const cur = names.get(name) ?? { origin: new Set(), critical: false };
      cur.origin.add(origin);
      cur.critical = cur.critical || critical;
      names.set(name, cur);
    };
    for (const d of definitions) add(d.name, "definition", d.critical);
    for (const e of bundle?.events ?? []) if (e.enabled) add(e.name, "plan", e.critical);
    for (const a of aggregates) add(a.eventName, "observed");
    const rowNames = Array.from(names.keys())
      .sort((a, b) => Number(names.get(b)!.critical) - Number(names.get(a)!.critical) || a.localeCompare(b))
      .slice(0, 60);

    // required-parameter samples: latest 20 stored events per name (one window query)
    const withRequired = rowNames.filter((n) => (getStandardEvent(n)?.requiredParams.length ?? 0) > 0);
    const samples = new Map<string, Array<{ props: Record<string, unknown> | null; commerce: Record<string, unknown> | null }>>();
    if (withRequired.length) {
      const sampled = await tx.execute(sql`SELECT name, props, commerce FROM (
          SELECT ${events.name} AS name, ${events.props} AS props, ${events.commerce} AS commerce, row_number() OVER (PARTITION BY ${events.name} ORDER BY ${events.serverTs} DESC) AS rn
          FROM ${events} WHERE ${events.siteId} = ${site.id} AND ${events.environmentId} = ${environment.id} AND ${events.serverTs} >= ${since} AND ${events.name} = ANY(${withRequired}::text[])
        ) s WHERE rn <= 20`);
      for (const r of sampled.rows as Array<{ name: string; props: Record<string, unknown> | null; commerce: Record<string, unknown> | null }>) {
        const list = samples.get(r.name) ?? [];
        list.push({ props: r.props, commerce: r.commerce });
        samples.set(r.name, list);
      }
    }

    const integrationById = new Map(integrationRows.map((i) => [i.id, i]));
    const plan = site.platform && SHOP_PLATFORMS.has(site.platform) ? MEASUREMENT_PLANS.ecommerce : null;

    const rows: CoverageRow[] = rowNames.map((name) => {
      const meta = names.get(name)!;
      const def = definitions.find((d) => d.name === name) ?? null;
      const planEvent = bundle?.events.find((e) => e.name === name && e.enabled) ?? null;
      const std = getStandardEvent(name);
      const agg = aggregates.filter((a) => a.eventName === name);
      const browserAgg = agg.filter((a) => a.source === "browser");
      const serverAgg = agg.filter((a) => a.source !== "browser");
      const lastBrowser = lastSeen.get(`${name}|browser`) ?? null;
      const lastServer = Array.from(lastSeen.entries())
        .filter(([k]) => k.startsWith(`${name}|`) && !k.endsWith("|browser"))
        .map(([, v]) => v)
        .sort()
        .at(-1) ?? null;

      const browserExpected = (def ? BROWSER_CAPTURES.has(def.capture) : false) || (planEvent ? BROWSER_TRIGGERS.has(planEvent.trigger.type) : false) || (!def && !planEvent && browserAgg.length > 0);
      const shopExpected = (def?.capture === "shop_integration") || planEvent?.trigger.type === "shop_integration" || planEvent?.authoritative_source === "shop_integration";
      const serverExpected =
        (def ? SERVER_CAPTURES.has(def.capture) || Boolean(def.sourceOfTruth) : false) ||
        (planEvent ? SERVER_TRIGGERS.has(planEvent.trigger.type) || planEvent.authoritative_source !== "none" : false) ||
        (Boolean(std?.authoritativeSourceRecommended) && Boolean(plan?.events.some((e) => e.name === name && e.requiresAuthoritativeSource))) ||
        (!def && !planEvent && serverAgg.length > 0);

      const browserFresh = freshnessStatus(lastBrowser, now, browserExpected);
      const serverFresh = freshnessStatus(lastServer, now, serverExpected);
      const browser: CoverageCell = {
        status: browserFresh.status,
        message: browserFresh.message,
        lastAt: lastBrowser,
        action: browserFresh.status === "bad" ? { key: "installSnippet", href: `/app/sites/${site.id}` } : browserFresh.status === "warn" ? { key: "openExplorer", href: `/app/events/explorer?name=${encodeURIComponent(name)}&source=browser&window=7d` } : null,
      };
      const server: CoverageCell = {
        status: serverFresh.status,
        message: serverFresh.message,
        lastAt: lastServer,
        action: serverFresh.status === "bad" ? (shopExpected ? { key: "openShop", href: `/app/sites/${site.id}/shop` } : { key: "createSourceKey", href: "/app/settings" }) : serverFresh.status === "warn" ? { key: "openExplorer", href: `/app/events/explorer?name=${encodeURIComponent(name)}&source=server&window=7d` } : null,
      };

      const received = agg.reduce((a, r) => a + r.received, 0);
      const droppedAll = sumDropped(agg);
      const blocked = CONSENT_DROP_REASONS.reduce((a, k) => a + (droppedAll[k] ?? 0), 0);
      const skippedDeliveries = attemptRows.filter((r) => r.eventName === name && r.status === "skipped" && r.errorClass === "policy_blocked").reduce((a, r) => a + r.n, 0);
      const consentState = consentStatus(received, blocked);
      const consent: CoverageRow["consent"] = {
        status: consentState,
        message: consentState === "unknown" ? "noData" : blocked === 0 && skippedDeliveries === 0 ? "consentClean" : blocked > 0 ? "consentBlocked" : "consentSkipped",
        params: { blocked, received, skipped: skippedDeliveries },
        lastAt: null,
        action: consentState === "unknown" ? null : { key: "openConsent", href: "/app/consent" },
        received,
        blocked,
        skippedDeliveries,
      };

      const check = checkRequiredParams(name, samples.get(name) ?? []);
      const paramsState = requiredParamsStatus(check);
      const params: CoverageRow["params"] = {
        ...check,
        status: paramsState,
        message: paramsState === "none" ? "noRequired" : paramsState === "unknown" ? "noSamples" : paramsState === "ok" ? "paramsComplete" : "paramsMissing",
        params: { sampled: check.sampled, missing: Object.keys(check.missing).join(", ") },
        lastAt: null,
        action: paramsState === "bad" || paramsState === "warn" ? { key: "openSetup", href: "/app/ai-setup" } : null,
      };

      const rowIssues = issues.filter((i) => {
        const d = i.details as Record<string, unknown>;
        return d.event_name === name || d.event === name || d.eventName === name || i.summary.includes(name);
      });
      const criticalIssues = rowIssues.filter((i) => i.severity === "critical").length;
      const qualityState: CellStatus = rowIssues.length === 0 ? (received > 0 ? "ok" : "unknown") : criticalIssues > 0 ? "bad" : "warn";
      const quality: CoverageRow["quality"] = {
        status: qualityState,
        message: qualityState === "unknown" ? "noData" : rowIssues.length === 0 ? "noIssues" : "openIssues",
        params: { open: rowIssues.length, critical: criticalIssues },
        lastAt: null,
        action: rowIssues.length ? { key: "openDataQuality", href: `/app/data-quality?site=${site.id}` } : null,
        open: rowIssues.length,
        critical: criticalIssues,
      };

      const mappedIds = new Set<string>();
      for (const d of bundle?.destinations ?? []) if (d.enabled && d.mappings.some((m) => m.enabled && m.event === name)) mappedIds.add(d.id);
      for (const m of mappingRows) if (m.enabled && m.eventName === name) mappedIds.add(m.integrationId);
      for (const a of attemptRows) if (a.eventName === name) mappedIds.add(a.integrationId);
      const list: CoverageDestination[] = Array.from(mappedIds)
        .map((id) => {
          const integ = integrationById.get(id);
          const rows = attemptRows.filter((r) => r.eventName === name && r.integrationId === id);
          const delivered = rows.filter((r) => r.status === "success").reduce((a, r) => a + r.n, 0);
          const failed = rows.filter((r) => r.status === "failed" || r.status === "dead").reduce((a, r) => a + r.n, 0);
          const skipped = rows.filter((r) => r.status === "skipped").reduce((a, r) => a + r.n, 0);
          const lastDeliveredAt = rows.filter((r) => r.status === "success").map((r) => new Date(r.lastAt).toISOString()).sort().at(-1) ?? null;
          const lastFailedAt = rows.filter((r) => r.status === "failed" || r.status === "dead").map((r) => new Date(r.lastAt).toISOString()).sort().at(-1) ?? null;
          let status: CellStatus = "unknown";
          if (integ && integ.status !== "connected") status = "warn";
          else if (delivered > 0 && lastDeliveredAt && now.getTime() - new Date(lastDeliveredAt).getTime() <= DAY && failed === 0) status = "ok";
          else if (delivered > 0 && failed === 0) status = "ok";
          else if (failed > 0 && delivered === 0) status = "bad";
          else if (failed > 0) status = "warn";
          else if (skipped > 0 && delivered === 0) status = "info";
          return { id, name: integ?.name ?? id, type: integ?.type ?? "unknown", integrationStatus: integ?.status ?? "unknown", status, delivered, failed, skipped, lastDeliveredAt, lastFailedAt, href: `/app/sites/${site.id}/destinations/${id}` };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const worst = (statuses: CellStatus[]): CellStatus => (statuses.includes("bad") ? "bad" : statuses.includes("warn") ? "warn" : statuses.includes("unknown") ? "unknown" : statuses.includes("info") ? "info" : "ok");
      const destinations: CoverageRow["destinations"] = {
        status: list.length === 0 ? "none" : worst(list.map((d) => d.status)),
        message: list.length === 0 ? (integrationRows.length === 0 ? "noDestinations" : "notMapped") : "mapped",
        params: { n: list.length },
        lastAt: list.map((d) => d.lastDeliveredAt).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null,
        action: list.length === 0 ? (integrationRows.length === 0 ? { key: "addDestination", href: `/app/sites/${site.id}/destinations/new` } : { key: "mapEvent", href: `/app/sites/${site.id}/destinations/${integrationRows[0]!.id}` }) : null,
        list,
      };

      return { name, critical: meta.critical, standard: Boolean(std), origin: Array.from(meta.origin), browser, server, consent, params, quality, destinations };
    });

    return { rows, windowDays: 7, configVersion: version?.version ?? null, hasDefinitions: definitions.length > 0, hasPlan: Boolean(bundle), integrationsCount: integrationRows.length, generatedAt: now.toISOString() };
  });
}

// ---------------------------------------------------------------------------------------------------
// Live Event Explorer
// ---------------------------------------------------------------------------------------------------

export function parseExplorerFilters(q: Record<string, string | string[] | undefined>): ExplorerFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const name = one(q.name).trim().slice(0, 64);
  const source = one(q.source) as ExplorerSource;
  const status = one(q.status) as ExplorerStatus;
  const window = one(q.window) as ExplorerWindow;
  const before = one(q.before);
  return {
    name: /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) ? name : null,
    source: EXPLORER_SOURCES.includes(source) ? source : "all",
    status: EXPLORER_STATUSES.includes(status) ? status : "all",
    window: EXPLORER_WINDOWS.includes(window) ? window : "24h",
    before: /^[0-9A-HJKMNP-TV-Z]{26}$/.test(before) ? before : null,
  };
}

export interface ExplorerEventRow {
  eventId: string;
  name: string;
  source: string;
  sourceVerified: boolean;
  serverTs: string;
  state: string;
  dropReason: string | null;
  test: boolean;
  configVersion: number | null;
  deliveries: { delivered: number; failed: number; skipped: number; pending: number };
  tone: StepTone;
}

export interface ExplorerRejectedRow {
  eventId: string;
  name: string;
  source: string;
  occurredAt: string;
  stage: LineageStage;
  outcome: LineageOutcome;
  reason: string | null;
}

export interface ExplorerList {
  events: ExplorerEventRow[];
  /** events the pipeline dropped before storing them (lineage rows only) */
  rejected: ExplorerRejectedRow[];
  lineageAvailable: boolean;
  nextBefore: string | null;
  updatedAt: string;
}

const PAGE = 50;

function stateTone(state: string, deliveries: ExplorerEventRow["deliveries"]): StepTone {
  if (state === "rejected" || state === "policy_blocked") return "bad";
  if (deliveries.failed > 0) return "bad";
  if (state === "deduplicated") return "warn";
  if (state === "delivered") return "ok";
  if (state === "routed") return deliveries.pending > 0 ? "info" : "ok";
  return "neutral";
}

export async function loadExplorerList(ctx: OrgContext, site: WorkspaceSite, environment: WorkspaceEnvironment, filters: ExplorerFilters): Promise<ExplorerList> {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS[filters.window]);
  return withOrg(ctx, async (tx) => {
    const where = [eq(events.siteId, site.id), eq(events.environmentId, environment.id), gte(events.serverTs, since)];
    if (filters.name) where.push(eq(events.name, filters.name));
    if (filters.source === "server") where.push(sql`${events.source} <> 'browser'`);
    else if (filters.source !== "all") where.push(eq(events.source, filters.source));
    if (filters.status === "stored") where.push(eq(events.processingState, "policy_passed"));
    else if (filters.status === "routed") where.push(eq(events.processingState, "routed"));
    else if (filters.status === "delivered") where.push(eq(events.processingState, "delivered"));
    else if (filters.status === "deduplicated") where.push(eq(events.processingState, "deduplicated"));
    else if (filters.status === "rejected") where.push(inArray(events.processingState, ["rejected", "policy_blocked"]));
    else if (filters.status === "failed") where.push(sql`EXISTS (SELECT 1 FROM jsonb_each(coalesce(${events.deliveries}, '{}'::jsonb)) d WHERE d.value->>'status' = 'failed')`);
    if (filters.before) where.push(sql`${events.eventId} < ${filters.before}`);
    const rows = await tx
      .select({ eventId: events.eventId, name: events.name, source: events.source, sourceVerified: events.sourceVerified, serverTs: events.serverTs, state: events.processingState, dropReason: events.dropReason, test: sql<boolean>`coalesce((${events.props}->>'test')::boolean, false)`, configVersion: events.configVersion, deliveries: events.deliveries })
      .from(events)
      .where(and(...where))
      .orderBy(desc(events.serverTs), desc(events.eventId))
      .limit(PAGE + 1);
    const page = rows.slice(0, PAGE).map((r): ExplorerEventRow => {
      const d = { delivered: 0, failed: 0, skipped: 0, pending: 0 };
      for (const v of Object.values(r.deliveries ?? {})) {
        if (v.status === "delivered") d.delivered++;
        else if (v.status === "failed") d.failed++;
        else if (v.status === "skipped") d.skipped++;
        else d.pending++;
      }
      return { eventId: r.eventId, name: r.name, source: r.source, sourceVerified: r.sourceVerified, serverTs: r.serverTs.toISOString(), state: r.state, dropReason: r.dropReason, test: Boolean(r.test), configVersion: r.configVersion, deliveries: d, tone: stateTone(r.state, d) };
    });

    let rejected: ExplorerRejectedRow[] = [];
    let lineageAvailable = true;
    if (filters.status === "all" || filters.status === "rejected") {
      const lineageWhere = [eq(eventLineage.siteId, site.id), eq(eventLineage.environmentId, environment.id), gte(eventLineage.occurredAt, since), inArray(eventLineage.outcome, ["rejected", "blocked"])];
      if (filters.name) lineageWhere.push(eq(eventLineage.eventName, filters.name));
      if (filters.source === "server") lineageWhere.push(sql`${eventLineage.source} <> 'browser'`);
      else if (filters.source !== "all") lineageWhere.push(eq(eventLineage.source, filters.source));
      const found = await optional(tx, "event_lineage", (sp) =>
        sp
          .select({ eventId: eventLineage.eventId, name: eventLineage.eventName, source: eventLineage.source, occurredAt: eventLineage.occurredAt, stage: eventLineage.stage, outcome: eventLineage.outcome, reason: eventLineage.reason })
          .from(eventLineage)
          .where(and(...lineageWhere))
          .orderBy(desc(eventLineage.occurredAt))
          .limit(filters.status === "rejected" ? PAGE : 20),
      );
      if (found === null) lineageAvailable = false;
      else rejected = found.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
    } else {
      lineageAvailable = (await optional(tx, "event_lineage", (sp) => sp.select({ one: sql<number>`1` }).from(eventLineage).limit(1))) !== null;
    }
    return { events: page, rejected, lineageAvailable, nextBefore: rows.length > PAGE ? page[page.length - 1]!.eventId : null, updatedAt: now.toISOString() };
  });
}

export interface RedactedEvent {
  eventId: string;
  sourceEventId: string;
  name: string;
  category: string;
  standard: boolean;
  source: string;
  sourceVerified: boolean;
  sdkVersion: string;
  configVersion: number | null;
  schemaVersion: string;
  serverTs: string;
  clientTs: string | null;
  environmentId: string;
  state: string;
  dropReason: string | null;
  test: boolean;
  consent: { granted: string[]; source: string; region: string | null; gpc: boolean | null; policyVersion: string | null };
  consentSnapshotId: string | null;
  clickIds: Array<{ key: string; value: string; source: string; capturedAt: string; expiresAt: string }>;
  vendorIdKeys: string[];
  page: { url: string | null; host: string | null; path: string | null; title: string | null; referrer: string | null };
  utm: Record<string, string> | null;
  commerce: { orderId: string | null; value: number | null; currency: string | null; items: number; coupon: string | null } | null;
  props: Record<string, unknown> | null;
  userDataFields: string[];
  identity: { anonymousId: string | null; sessionId: string | null; userId: string | null };
  ipTruncated: string | null;
  uaFamily: string | null;
  locale: string | null;
  isBillable: boolean;
  isBot: boolean;
  provenance: Record<string, { dataClass: string; source: string }>;
  deliveries: Record<string, { status: string; at: string; attempts: number }> | null;
}

export interface RedactedAttempt {
  id: string;
  integrationId: string;
  connectorType: string;
  attempt: number;
  status: string;
  errorClass: string;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  vendorEventId: string | null;
  payloadPreview: Record<string, unknown> | null;
  responseExcerpt: string | null;
  durationMs: number | null;
  nextRetryAt: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface RelatedEvent {
  eventId: string;
  name: string;
  source: string;
  serverTs: string;
  state: string;
  via: "order_id" | "session";
}

export interface ExplorerDetail {
  event: RedactedEvent;
  timeline: TimelineStep[];
  summary: ReturnType<typeof timelineSummary>;
  attempts: RedactedAttempt[];
  related: RelatedEvent[];
  integrations: Record<string, { name: string; type: string }>;
  lineageRecorded: boolean;
  updatedAt: string;
}

type EventRow = typeof events.$inferSelect;

function redactEvent(e: EventRow): RedactedEvent {
  const consent = e.consent as { granted?: string[]; source?: string; region?: string | null; gpc?: boolean | null; policy_version?: string | null };
  return {
    eventId: e.eventId,
    sourceEventId: e.sourceEventId,
    name: e.name,
    category: e.category,
    standard: e.isStandard,
    source: e.source,
    sourceVerified: e.sourceVerified,
    sdkVersion: e.sdkVersion,
    configVersion: e.configVersion,
    schemaVersion: e.schemaVersion,
    serverTs: e.serverTs.toISOString(),
    clientTs: e.clientTs ? e.clientTs.toISOString() : null,
    environmentId: e.environmentId,
    state: e.processingState,
    dropReason: e.dropReason,
    test: Boolean((e.props as Record<string, unknown> | null)?.test),
    consent: { granted: consent.granted ?? [], source: consent.source ?? "default", region: consent.region ?? null, gpc: consent.gpc ?? null, policyVersion: consent.policy_version ?? null },
    consentSnapshotId: e.consentSnapshotId,
    clickIds: Object.entries(e.clickIds ?? {}).map(([key, v]) => ({ key, value: maskClickId(v.value), source: v.source, capturedAt: v.captured_at, expiresAt: v.expires_at })),
    vendorIdKeys: Object.keys(e.vendorIds ?? {}),
    page: { url: e.url ? redactForDisplay(e.url) : null, host: e.host, path: e.path ? redactForDisplay(e.path) : null, title: e.title ? redactForDisplay(e.title) : null, referrer: e.referrer ? redactForDisplay(e.referrer) : null },
    utm: e.utm ? redactForDisplay(e.utm) : null,
    commerce: e.commerce
      ? {
          orderId: typeof e.commerce.order_id === "string" ? e.commerce.order_id : null,
          value: typeof e.commerce.value === "number" ? e.commerce.value : null,
          currency: typeof e.commerce.currency === "string" ? e.commerce.currency : null,
          items: Array.isArray(e.commerce.items) ? e.commerce.items.length : 0,
          coupon: typeof e.commerce.coupon === "string" ? redactForDisplay(e.commerce.coupon) : null,
        }
      : null,
    props: e.props ? redactForDisplay(e.props) : null,
    userDataFields: presentUserDataFields(e.userData),
    identity: { anonymousId: maskId(e.anonymousId), sessionId: maskId(e.sessionId), userId: maskId(e.userId) },
    ipTruncated: e.ipTruncated,
    uaFamily: e.uaFamily,
    locale: e.locale,
    isBillable: e.isBillable,
    isBot: e.isBot,
    provenance: Object.fromEntries(Object.entries(e.provenance ?? {}).map(([k, v]) => [k, { dataClass: String((v as { data_class?: string }).data_class ?? "OBSERVED"), source: String((v as { source?: string }).source ?? "") }])),
    deliveries: e.deliveries,
  };
}

type AttemptRow = typeof deliveryAttempts.$inferSelect;

function redactAttempt(a: AttemptRow): RedactedAttempt {
  return {
    id: a.id,
    integrationId: a.integrationId,
    connectorType: a.connectorType,
    attempt: a.attempt,
    status: a.status,
    errorClass: a.errorClass,
    errorCode: a.errorCode,
    errorMessage: a.errorMessage ? redactForDisplay(a.errorMessage) : null,
    httpStatus: a.httpStatus,
    vendorEventId: a.vendorEventId ? maskId(a.vendorEventId) : null,
    payloadPreview: a.payloadPreview ? redactForDisplay(a.payloadPreview) : null,
    responseExcerpt: a.responseExcerpt ? redactForDisplay(a.responseExcerpt) : null,
    durationMs: a.durationMs,
    nextRetryAt: a.nextRetryAt ? a.nextRetryAt.toISOString() : null,
    startedAt: a.startedAt.toISOString(),
    finishedAt: a.finishedAt ? a.finishedAt.toISOString() : null,
  };
}

async function lineageRowsFor(tx: Tx, siteId: string, where: ReturnType<typeof and>) {
  return optional(tx, "event_lineage", (sp) =>
    sp
      .select({ eventId: eventLineage.eventId, sourceEventId: eventLineage.sourceEventId, stage: eventLineage.stage, outcome: eventLineage.outcome, reason: eventLineage.reason, integrationId: eventLineage.integrationId, detail: eventLineage.detail, occurredAt: eventLineage.occurredAt })
      .from(eventLineage)
      .where(and(eq(eventLineage.siteId, siteId), where))
      .orderBy(eventLineage.occurredAt)
      .limit(500),
  );
}

async function integrationNames(tx: Tx, siteId: string): Promise<Record<string, { name: string; type: string }>> {
  const rows = await tx.select({ id: integrations.id, name: integrations.name, type: integrations.connectorType }).from(integrations).where(eq(integrations.siteId, siteId));
  return Object.fromEntries(rows.map((r) => [r.id, { name: r.name, type: r.type }]));
}

export async function loadExplorerDetail(ctx: OrgContext, site: WorkspaceSite, eventId: string): Promise<ExplorerDetail | null> {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(eventId)) return null;
  const now = new Date();
  return withOrg(ctx, async (tx) => {
    const [row] = await tx.select().from(events).where(and(eq(events.siteId, site.id), eq(events.eventId, eventId))).limit(1);
    if (!row) return null;
    const attempts = await tx.select().from(deliveryAttempts).where(and(eq(deliveryAttempts.siteId, site.id), eq(deliveryAttempts.eventId, eventId))).orderBy(deliveryAttempts.startedAt).limit(100);
    const lineage = (await lineageRowsFor(tx, site.id, eq(eventLineage.eventId, eventId))) ?? [];
    const names = await integrationNames(tx, site.id);
    const related: RelatedEvent[] = [];
    const orderId = typeof row.commerce?.order_id === "string" ? row.commerce.order_id : null;
    if (orderId) {
      const byOrder = await tx
        .select({ eventId: events.eventId, name: events.name, source: events.source, serverTs: events.serverTs, state: events.processingState })
        .from(events)
        .where(and(eq(events.siteId, site.id), sql`${events.commerce}->>'order_id' = ${orderId}`, sql`${events.eventId} <> ${eventId}`, gte(events.serverTs, new Date(row.serverTs.getTime() - 30 * DAY))))
        .orderBy(desc(events.serverTs))
        .limit(5);
      for (const r of byOrder) related.push({ eventId: r.eventId, name: r.name, source: r.source, serverTs: r.serverTs.toISOString(), state: r.state, via: "order_id" });
    }
    if (row.sessionId) {
      const bySession = await tx
        .select({ eventId: events.eventId, name: events.name, source: events.source, serverTs: events.serverTs, state: events.processingState })
        .from(events)
        .where(and(eq(events.siteId, site.id), eq(events.sessionId, row.sessionId), sql`${events.eventId} <> ${eventId}`, gte(events.serverTs, new Date(row.serverTs.getTime() - 6 * 3_600_000)), sql`${events.serverTs} <= ${new Date(row.serverTs.getTime() + 6 * 3_600_000)}`))
        .orderBy(desc(events.serverTs))
        .limit(8);
      for (const r of bySession) if (!related.some((x) => x.eventId === r.eventId)) related.push({ eventId: r.eventId, name: r.name, source: r.source, serverTs: r.serverTs.toISOString(), state: r.state, via: "session" });
    }
    const event = redactEvent(row);
    const timeline = buildTimeline(
      { event_id: row.eventId, server_ts: event.serverTs, processing_state: row.processingState, drop_reason: row.dropReason, deliveries: row.deliveries },
      lineage.map((l) => ({ stage: l.stage, outcome: l.outcome, reason: l.reason, integrationId: l.integrationId, detail: redactForDisplay(l.detail), occurredAt: l.occurredAt.toISOString() })),
      attempts.map((a) => ({ integrationId: a.integrationId, attempt: a.attempt, status: a.status, errorClass: a.errorClass, errorCode: a.errorCode, httpStatus: a.httpStatus, at: a.startedAt.toISOString() })),
    );
    return { event, timeline, summary: timelineSummary(timeline), attempts: attempts.map(redactAttempt), related, integrations: names, lineageRecorded: lineage.length > 0, updatedAt: now.toISOString() };
  });
}

// ---------------------------------------------------------------------------------------------------
// Live Test Lab
// ---------------------------------------------------------------------------------------------------

export interface TestLabRunSummary {
  id: string;
  journey: string;
  consent: { granted: string[]; source: string; region: string | null };
  status: string;
  collectorStatus: number | null;
  collectorReason: string | null;
  batchId: string | null;
  steps: TestLabStep[];
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  environmentId: string;
}

type RunRow = typeof testLabRuns.$inferSelect;

const toRun = (r: RunRow): TestLabRunSummary => ({ id: r.id, journey: r.journey, consent: r.consent, status: r.status, collectorStatus: r.collectorStatus, collectorReason: r.collectorReason, batchId: r.batchId, steps: r.steps, error: r.error, createdAt: r.createdAt.toISOString(), sentAt: r.sentAt ? r.sentAt.toISOString() : null, environmentId: r.environmentId });

/** The environment a test run goes through: the site's test-mode environment (staging first). */
export function testEnvironmentOf(environments: WorkspaceEnvironment[]): WorkspaceEnvironment | null {
  return environments.find((e) => e.testMode && e.kind === "staging") ?? environments.find((e) => e.testMode) ?? null;
}

export async function loadTestLabRuns(ctx: OrgContext, site: WorkspaceSite, limit = 20): Promise<{ runs: TestLabRunSummary[]; available: boolean }> {
  return withOrg(ctx, async (tx) => {
    const rows = await optional(tx, "test_lab_runs", (sp) => sp.select().from(testLabRuns).where(eq(testLabRuns.siteId, site.id)).orderBy(desc(testLabRuns.createdAt)).limit(limit));
    return { runs: (rows ?? []).map(toRun), available: rows !== null };
  });
}

export interface TestLabStepResult {
  step: TestLabStep;
  event: RedactedEvent | null;
  timeline: TimelineStep[];
  summary: ReturnType<typeof timelineSummary>;
  attempts: RedactedAttempt[];
  /** nothing recorded for this step yet (worker has not processed the batch) */
  pending: boolean;
}

export interface TestLabTimeline {
  run: TestLabRunSummary;
  steps: TestLabStepResult[];
  integrations: Record<string, { name: string; type: string }>;
  /** every step reached a terminal stage (rejected, duplicate, not routed, or all deliveries finished) */
  complete: boolean;
  updatedAt: string;
}

const TERMINAL_DELIVERY = new Set(["delivered", "failed", "dead", "skipped"]);

export async function loadTestLabTimeline(ctx: OrgContext, site: WorkspaceSite, runId: string): Promise<TestLabTimeline | null> {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(runId)) return null;
  const now = new Date();
  return withOrg(ctx, async (tx) => {
    const rows = await optional(tx, "test_lab_runs", (sp) => sp.select().from(testLabRuns).where(and(eq(testLabRuns.siteId, site.id), eq(testLabRuns.id, runId))).limit(1));
    const run = rows?.[0];
    if (!run) return null;
    const sourceIds = run.steps.map((s) => s.sourceEventId);
    const since = new Date(run.createdAt.getTime() - 60_000);
    const eventRows = sourceIds.length ? await tx.select().from(events).where(and(eq(events.siteId, site.id), inArray(events.sourceEventId, sourceIds), gte(events.serverTs, since))).limit(50) : [];
    const eventIds = eventRows.map((e) => e.eventId);
    const attempts = eventIds.length ? await tx.select().from(deliveryAttempts).where(and(eq(deliveryAttempts.siteId, site.id), inArray(deliveryAttempts.eventId, eventIds))).orderBy(deliveryAttempts.startedAt).limit(200) : [];
    const ids = eventIds.length ? eventIds : ["-"];
    const lineageWhere = run.batchId
      ? sourceIds.length
        ? sql`(${eventLineage.batchId} = ${run.batchId} OR ${eventLineage.sourceEventId} = ANY(${sourceIds}::text[]) OR ${eventLineage.eventId} = ANY(${ids}::text[]))`
        : eq(eventLineage.batchId, run.batchId)
      : sourceIds.length
        ? sql`(${eventLineage.sourceEventId} = ANY(${sourceIds}::text[]) OR ${eventLineage.eventId} = ANY(${ids}::text[]))`
        : sql`false`;
    const lineage = (await lineageRowsFor(tx, site.id, and(lineageWhere, gte(eventLineage.occurredAt, since)))) ?? [];
    const names = await integrationNames(tx, site.id);
    const steps: TestLabStepResult[] = run.steps.map((step) => {
      const row = eventRows.find((e) => e.sourceEventId === step.sourceEventId) ?? null;
      const rowsForStep = lineage.filter((l) => l.sourceEventId === step.sourceEventId || (row && l.eventId === row.eventId));
      const stepAttempts = row ? attempts.filter((a) => a.eventId === row.eventId) : [];
      const timeline = buildTimeline(
        row ? { event_id: row.eventId, server_ts: row.serverTs.toISOString(), processing_state: row.processingState, drop_reason: row.dropReason, deliveries: row.deliveries } : null,
        rowsForStep.map((l) => ({ stage: l.stage, outcome: l.outcome, reason: l.reason, integrationId: l.integrationId, detail: redactForDisplay(l.detail), occurredAt: l.occurredAt.toISOString() })),
        stepAttempts.map((a) => ({ integrationId: a.integrationId, attempt: a.attempt, status: a.status, errorClass: a.errorClass, errorCode: a.errorCode, httpStatus: a.httpStatus, at: a.startedAt.toISOString() })),
      );
      return { step, event: row ? redactEvent(row) : null, timeline, summary: timelineSummary(timeline), attempts: stepAttempts.map(redactAttempt), pending: timeline.length === 0 };
    });
    const complete =
      run.status !== "pending" &&
      (run.status !== "sent" ||
        steps.every((s) => {
          if (s.pending) return false;
          if (s.timeline.some((t) => t.stage === "rejected")) return true;
          const routed = s.timeline.filter((t) => t.stage === "routed");
          if (routed.length === 0) return false;
          if (routed.every((t) => t.outcome !== "ok")) return true;
          const routedOk = routed.filter((t) => t.outcome === "ok");
          return routedOk.every((r) => s.timeline.some((t) => t.stage === "delivered" && t.integrationId === r.integrationId && TERMINAL_DELIVERY.has(t.outcome)));
        }));
    return { run: toRun(run), steps, integrations: names, complete, updatedAt: now.toISOString() };
  });
}
