import { and, desc, eq, sql } from "drizzle-orm";
import { configBundleSchema, type ConfigBundle } from "@track-site/config";
import { activeVersion, dataQualityIssues, environments, revenueReconciliationSnapshots, shopConnections, type DbOrTx, type IssueEvidence } from "@track-site/db";
import { isValidCustomEventName } from "@track-site/events";

/**
 * Data Quality Inbox (redesign supplement §8 module 7): reads `data_quality_issues` for the active site,
 * prioritises them by impact, groups them by category and derives the fix draft each issue can offer.
 * Pure helpers (ranking, grouping, fix plans) are exported for unit tests; the loader takes an RLS-scoped
 * transaction from `withOrg` so the tenant never comes from anywhere but the session.
 */
export const ISSUE_CATEGORIES = ["required_fields", "schema", "values", "duplicates", "drops", "spikes", "revenue", "usage", "delivery", "other"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

/** Inbox statuses; the legacy `ignored` value of the first inbox is shown as `muted`. */
export const INBOX_STATUSES = ["open", "acknowledged", "resolved", "muted"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export type IssueSeverity = "info" | "warning" | "critical";

/** An issue is stale when the scan has not observed it for this many days (it is not auto-resolved). */
export const STALE_AFTER_DAYS = 7;

export type IssueRow = typeof dataQualityIssues.$inferSelect;

export const FIX_CODES = ["authoritative_shop", "add_event", "destination_hybrid", "enable_event"] as const;
export type FixCode = (typeof FIX_CODES)[number];

export const FIX_UNAVAILABLE_REASONS = ["no_bundle", "connect_shop", "site_change", "needs_mapping", "destination_health", "consent", "billing", "not_applicable", "already_drafted"] as const;
export type FixUnavailableReason = (typeof FIX_UNAVAILABLE_REASONS)[number];

/** What "prepare fix draft" would change — serialisable so the client can show it before confirming. */
export interface FixPlan {
  code: FixCode | null;
  reason: FixUnavailableReason | null;
  /** parameters shown in the confirmation (event name, destination name, platform …) */
  params: Record<string, string>;
}

export interface FixContext {
  bundle: ConfigBundle | null;
  /** first connected shop platform of the site, if any */
  shopPlatform: "shopify" | "woocommerce" | "shopware" | null;
  siteCurrency: string | null;
  /** destination names by integration id (for the confirmation text) */
  destinationNames: Record<string, string>;
}

export interface InboxIssue {
  id: string;
  kind: string;
  /** first segment of `kind`, e.g. `missing_required_field` */
  kindPrefix: string;
  /** remaining segments of `kind`, e.g. ["purchase", "currency"] */
  kindParts: string[];
  category: IssueCategory;
  severity: IssueSeverity;
  status: InboxStatus;
  summary: string;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  acknowledgedAt: Date | null;
  mutedUntil: Date | null;
  muteReason: string | null;
  statusNote: string | null;
  environmentId: string | null;
  environmentKind: "production" | "staging" | "development" | null;
  impact: number;
  stale: boolean;
  evidence: IssueEvidence | null;
  details: Record<string, unknown>;
  fixTool: string | null;
  fixDraftId: string | null;
  fixDraftAt: Date | null;
  fixPlan: FixPlan;
}

export interface InboxGroup {
  category: IssueCategory;
  issues: InboxIssue[];
  maxImpact: number;
  critical: number;
}

export interface InboxCounts {
  open: number;
  acknowledged: number;
  resolved: number;
  muted: number;
  /** open or acknowledged issues with severity critical */
  critical: number;
}

export interface Inbox {
  issues: InboxIssue[];
  groups: InboxGroup[];
  counts: InboxCounts;
  /** open + acknowledged issues per category (for the filter chips) */
  byCategory: Record<IssueCategory, number>;
  /** newest observation across every issue of the site */
  lastObservedAt: Date | null;
  /** newest reconciliation snapshot of the site = last run of the worker's data quality jobs; null = never */
  lastScanAt: Date | null;
  /** the last scan is older than a day: the inbox may be behind the live data */
  scanStale: boolean;
  fixContext: FixContext;
}

export interface InboxFilters {
  status: InboxStatus | "all";
  category: IssueCategory | "all";
}

const STATUS_ORDER: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function parseKind(kind: string): { prefix: string; parts: string[] } {
  const [prefix = kind, ...parts] = kind.split(":");
  return { prefix, parts };
}

/** Category from the kind's prefix; the stored category wins for kinds this module does not know. */
export function categoryOf(kind: string, stored: string | null): IssueCategory {
  const { prefix } = parseKind(kind);
  switch (prefix) {
    case "missing_required_field":
      return "required_fields";
    case "unplanned_event":
    case "schema_error":
      return "schema";
    case "invalid_value":
    case "currency_mismatch":
      return "values";
    case "duplicate_conversion":
      return "duplicates";
    case "ingest_drop":
    case "event_drop":
      return "drops";
    case "conversion_spike":
      return "spikes";
    case "revenue_leak":
    case "signal_gap":
      return "revenue";
    case "delivery_failed":
      return "delivery";
    default:
      if (prefix.startsWith("usage_limit")) return "usage";
      return (ISSUE_CATEGORIES as readonly string[]).includes(stored ?? "") ? (stored as IssueCategory) : "other";
  }
}

export function normalizeStatus(status: string): InboxStatus {
  if (status === "ignored") return "muted";
  return (INBOX_STATUSES as readonly string[]).includes(status) ? (status as InboxStatus) : "open";
}

/** Same formula as the worker scan (`apps/worker/src/jobs/reconciliation.ts`); used for rows without a stored score. */
export function impactScore(input: { severity: IssueSeverity; affected: number | null; total: number | null; valueAmount: number | null }): number {
  const base = input.severity === "critical" ? 60 : input.severity === "warning" ? 35 : 10;
  let volume = 0;
  if (input.affected != null && input.total != null && input.total > 0) volume = 25 * Math.min(1, input.affected / input.total);
  else if (input.affected != null && input.affected > 0) volume = Math.min(15, Math.log10(input.affected + 1) * 5);
  const value = input.valueAmount != null && input.valueAmount > 0 ? Math.min(15, Math.log10(input.valueAmount + 1) * 3) : 0;
  return Math.max(0, Math.min(100, Math.round(base + volume + value)));
}

export function isStale(lastSeenAt: Date, now: Date, days = STALE_AFTER_DAYS): boolean {
  return now.getTime() - lastSeenAt.getTime() > days * 86_400_000;
}

/** Impact first, then severity, then the newest observation. */
export function rankIssues<T extends { impact: number; severity: IssueSeverity; lastSeenAt: Date }>(issues: T[]): T[] {
  return [...issues].sort((a, b) => b.impact - a.impact || STATUS_ORDER[a.severity] - STATUS_ORDER[b.severity] || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

export function groupIssues(issues: InboxIssue[]): InboxGroup[] {
  const map = new Map<IssueCategory, InboxGroup>();
  for (const issue of rankIssues(issues)) {
    const group = map.get(issue.category) ?? { category: issue.category, issues: [], maxImpact: 0, critical: 0 };
    group.issues.push(issue);
    group.maxImpact = Math.max(group.maxImpact, issue.impact);
    if (issue.severity === "critical") group.critical++;
    map.set(issue.category, group);
  }
  return [...map.values()].sort((a, b) => b.maxImpact - a.maxImpact || b.critical - a.critical);
}

const factString = (facts: Record<string, unknown> | undefined, key: string): string | null => {
  const v = facts?.[key];
  return typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null;
};

/**
 * The config draft an issue can offer. Only real, config-level fixes are drafted; everything else names the
 * place where the fix actually lives (site code, shop connection, destination health, consent, billing).
 */
export function fixPlanFor(issue: Pick<InboxIssue, "kind" | "evidence" | "fixDraftId">, ctx: FixContext): FixPlan {
  const { prefix, parts } = parseKind(issue.kind);
  const facts = issue.evidence?.facts;
  if (issue.fixDraftId) return { code: null, reason: "already_drafted", params: {} };
  if (prefix.startsWith("usage_limit")) return { code: null, reason: "billing", params: {} };
  if (!ctx.bundle) return { code: null, reason: "no_bundle", params: {} };
  const bundle = ctx.bundle;
  const purchase = bundle.events.find((e) => e.name === "purchase");
  const shopAuthoritative = (): FixPlan => {
    if (!ctx.shopPlatform) return { code: null, reason: "connect_shop", params: {} };
    if (purchase?.authoritative_source === "shop_integration") return { code: null, reason: "not_applicable", params: {} };
    return { code: "authoritative_shop", reason: null, params: { platform: ctx.shopPlatform } };
  };
  switch (prefix) {
    case "missing_required_field":
    case "invalid_value": {
      if (parts[0] !== "purchase") return { code: null, reason: "site_change", params: { event: parts[0] ?? "", field: parts[1] ?? "" } };
      const plan = shopAuthoritative();
      return plan.code ? plan : { code: null, reason: plan.reason === "not_applicable" ? "site_change" : plan.reason, params: { event: "purchase", field: parts[1] ?? "" } };
    }
    case "duplicate_conversion":
      return shopAuthoritative();
    case "currency_mismatch":
      return { code: null, reason: "site_change", params: { event: parts[0] ?? "purchase", field: "currency" } };
    case "unplanned_event": {
      const name = parts[0] ?? "";
      if (!isValidCustomEventName(name)) return { code: null, reason: "not_applicable", params: { event: name } };
      if (bundle.events.some((e) => e.name === name)) return { code: null, reason: "not_applicable", params: { event: name } };
      return { code: "add_event", reason: null, params: { event: name } };
    }
    case "event_drop": {
      const name = parts[0] ?? "";
      const event = bundle.events.find((e) => e.name === name);
      if (event && !event.enabled) return { code: "enable_event", reason: null, params: { event: name } };
      return { code: null, reason: "destination_health", params: { event: name } };
    }
    case "ingest_drop": {
      const reason = parts[0] ?? "";
      return { code: null, reason: reason.startsWith("consent") ? "consent" : "site_change", params: { reason } };
    }
    case "conversion_spike":
      return { code: null, reason: "not_applicable", params: { event: parts[0] ?? "" } };
    case "signal_gap": {
      const plan = shopAuthoritative();
      return plan.code ? plan : { code: null, reason: plan.reason === "not_applicable" ? "site_change" : plan.reason, params: {} };
    }
    case "revenue_leak": {
      const integrationId = parts[0] ?? factString(facts, "integration_id") ?? "";
      const destination = bundle.destinations.find((d) => d.id === integrationId);
      const name = ctx.destinationNames[integrationId] ?? destination?.name ?? integrationId;
      const eventName = parts[1] === "lead" ? "generate_lead" : "purchase";
      const noConsent = Number(facts?.no_consent ?? 0);
      const failed = Number(facts?.delivery_failed ?? 0);
      const notCaptured = Number(facts?.not_captured ?? 0);
      if (destination && destination.mode === "browser" && destination.enabled) {
        if (destination.mappings.some((m) => m.enabled && m.event === eventName)) return { code: "destination_hybrid", reason: null, params: { destination: name, event: eventName } };
        return { code: null, reason: "needs_mapping", params: { destination: name, event: eventName } };
      }
      if (noConsent >= failed && noConsent >= notCaptured && noConsent > 0) return { code: null, reason: "consent", params: { destination: name } };
      if (notCaptured > failed && notCaptured > 0) {
        const plan = shopAuthoritative();
        return plan.code ? plan : { code: null, reason: plan.reason === "not_applicable" ? "site_change" : plan.reason, params: { destination: name } };
      }
      return { code: null, reason: "destination_health", params: { destination: name } };
    }
    default:
      return { code: null, reason: "not_applicable", params: {} };
  }
}

/** Applies a fix plan to a bundle (pure; the caller re-lints through `updateDraft`). */
export function applyFixPlan(bundle: ConfigBundle, plan: FixPlan): ConfigBundle {
  const next = structuredClone(bundle);
  switch (plan.code) {
    case "authoritative_shop": {
      const platform = plan.params.platform as "shopify" | "woocommerce" | "shopware";
      const purchase = next.events.find((e) => e.name === "purchase");
      if (purchase) {
        purchase.authoritative_source = "shop_integration";
        purchase.enabled = true;
        purchase.critical = true;
      } else {
        next.events.push({ name: "purchase", enabled: true, critical: true, trigger: { type: "shop_integration", platform }, props_map: null, authoritative_source: "shop_integration" });
      }
      return next;
    }
    case "add_event": {
      const name = plan.params.event ?? "";
      if (name && !next.events.some((e) => e.name === name)) next.events.push({ name, enabled: true, critical: false, trigger: { type: "api" }, props_map: null, authoritative_source: "none" });
      return next;
    }
    case "enable_event": {
      const event = next.events.find((e) => e.name === plan.params.event);
      if (event) event.enabled = true;
      return next;
    }
    case "destination_hybrid": {
      const destination = next.destinations.find((d) => d.name === plan.params.destination || d.id === plan.params.destination);
      if (destination && destination.mode === "browser") destination.mode = "hybrid";
      return next;
    }
    default:
      return next;
  }
}

export function toInboxIssue(row: IssueRow, envKinds: Map<string, "production" | "staging" | "development">, fixContext: FixContext, now: Date): InboxIssue {
  const { prefix, parts } = parseKind(row.kind);
  const evidence = row.evidence ?? null;
  const impact = row.impactScore ?? impactScore({ severity: row.severity, affected: evidence?.affected ?? null, total: evidence?.total ?? null, valueAmount: evidence?.value?.amount ?? null });
  const partial = { kind: row.kind, evidence, fixDraftId: row.fixDraftId ?? null };
  return {
    id: row.id,
    kind: row.kind,
    kindPrefix: prefix,
    kindParts: parts,
    category: categoryOf(row.kind, row.category ?? null),
    severity: row.severity,
    status: normalizeStatus(row.status),
    summary: row.summary,
    occurrences: row.occurrences,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt ?? null,
    acknowledgedAt: row.acknowledgedAt ?? null,
    mutedUntil: row.mutedUntil ?? null,
    muteReason: row.muteReason ?? null,
    statusNote: row.statusNote ?? null,
    environmentId: row.environmentId ?? null,
    environmentKind: row.environmentId ? (envKinds.get(row.environmentId) ?? null) : null,
    impact,
    stale: isStale(row.lastSeenAt, now),
    evidence,
    details: row.details ?? {},
    fixTool: row.fixTool ?? null,
    fixDraftId: row.fixDraftId ?? null,
    fixDraftAt: row.fixDraftAt ?? null,
    fixPlan: fixPlanFor(partial, fixContext),
  };
}

export const EMPTY_CATEGORY_COUNTS: Record<IssueCategory, number> = { required_fields: 0, schema: 0, values: 0, duplicates: 0, drops: 0, spikes: 0, revenue: 0, usage: 0, delivery: 0, other: 0 };

/** Fix context of a site: the active bundle of the environment, the connected shop platform and the site currency. */
export async function loadFixContext(tx: DbOrTx, input: { siteId: string; environmentId: string | null; siteCurrency: string | null; destinationNames: Record<string, string> }): Promise<FixContext> {
  const version = input.environmentId ? await activeVersion(tx, input.environmentId) : null;
  const parsed = version ? configBundleSchema.safeParse(version.bundle) : null;
  const shops = await tx.select({ platform: shopConnections.platform, status: shopConnections.status }).from(shopConnections).where(eq(shopConnections.siteId, input.siteId)).orderBy(shopConnections.createdAt);
  const connected = shops.find((s) => s.status === "connected");
  return { bundle: parsed?.success ? parsed.data : null, shopPlatform: connected?.platform ?? null, siteCurrency: input.siteCurrency, destinationNames: input.destinationNames };
}

/** Reads the inbox of one site inside an RLS-scoped transaction. */
export async function loadInbox(tx: DbOrTx, input: { siteId: string; filters: InboxFilters; fixContext: FixContext; now?: Date; limit?: number }): Promise<Inbox> {
  const now = input.now ?? new Date();
  const rows = await tx.select().from(dataQualityIssues).where(eq(dataQualityIssues.siteId, input.siteId)).orderBy(desc(dataQualityIssues.impactScore), desc(dataQualityIssues.lastSeenAt)).limit(input.limit ?? 500);
  const envRows = await tx.select({ id: environments.id, kind: environments.kind }).from(environments).where(eq(environments.siteId, input.siteId));
  const envKinds = new Map(envRows.map((e) => [e.id, e.kind]));
  const all = rows.map((r) => toInboxIssue(r, envKinds, input.fixContext, now));
  const counts: InboxCounts = { open: 0, acknowledged: 0, resolved: 0, muted: 0, critical: 0 };
  const byCategory: Record<IssueCategory, number> = { ...EMPTY_CATEGORY_COUNTS };
  let lastObservedAt: Date | null = null;
  for (const issue of all) {
    counts[issue.status]++;
    if ((issue.status === "open" || issue.status === "acknowledged") && issue.severity === "critical") counts.critical++;
    if (issue.status === "open" || issue.status === "acknowledged") byCategory[issue.category]++;
    if (!lastObservedAt || issue.lastSeenAt > lastObservedAt) lastObservedAt = issue.lastSeenAt;
  }
  const filtered = all.filter((i) => (input.filters.status === "all" || i.status === input.filters.status) && (input.filters.category === "all" || i.category === input.filters.category));
  const scan = await tx
    .select({ at: sql<Date | null>`max(${revenueReconciliationSnapshots.computedAt})` })
    .from(revenueReconciliationSnapshots)
    .where(and(eq(revenueReconciliationSnapshots.siteId, input.siteId)));
  const lastScanAt = scan[0]?.at ? new Date(scan[0].at) : null;
  const ranked = rankIssues(filtered);
  return { issues: ranked, groups: groupIssues(ranked), counts, byCategory, lastObservedAt, lastScanAt, scanStale: lastScanAt ? now.getTime() - lastScanAt.getTime() > 86_400_000 : false, fixContext: input.fixContext };
}

/** One issue of the organization (for the actions); null when it belongs to another tenant (RLS) or does not exist. */
export async function getIssue(tx: DbOrTx, organizationId: string, issueId: string): Promise<IssueRow | null> {
  const rows = await tx
    .select()
    .from(dataQualityIssues)
    .where(and(eq(dataQualityIssues.id, issueId), eq(dataQualityIssues.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}
