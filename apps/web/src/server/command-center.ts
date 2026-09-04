import "server-only";
import { and, desc, eq, gte, inArray, isNull, max, notInArray, sql } from "drizzle-orm";
import { usagePeriodKey } from "@track-site/core";
import {
  activeVersion,
  consentPolicies,
  consentSnapshots,
  credentials,
  dataQualityIssues,
  deadLetterReferences,
  deliveryAttempts,
  domains,
  events,
  integrations,
  oauthConnections,
  orgSettings,
  queueDeadLetters,
  queueMessages,
  siteHealthSnapshots,
  sites,
  usagePeriods,
  withWorker,
  type Tx,
} from "@track-site/db";
import { env } from "@/env";
import { db, logger } from "./db";
import { planLimits } from "./entitlements";
import type { OrgContext } from "./session";
import { withOrg } from "./session";
import { deliveryOutcomesByDay, hourlyEventFlow, type DeliveryDay, type FlowBucket } from "./stats";
import type { Workspace } from "./workspace";

/**
 * Tracking Command Center (redesign supplement §8, module 1): every number on the overview is read
 * from the site's own tables inside one RLS-scoped transaction, each measurement isolated in a
 * savepoint so a failing query yields an honest "unavailable" instead of a broken page. The next
 * action comes from a fixed, ordered rule table (`RULES`) that only fires on measured values —
 * nothing is estimated, an unmeasured input skips the rule and says so.
 */

export type MeasurementStatus = "measured" | "empty" | "stale" | "unavailable" | "not_measurable";

export interface Measurement<T> {
  status: MeasurementStatus;
  /** `null` unless `status` is `measured` or `stale` */
  value: T | null;
  /** ISO time the measurement was taken (query time); data timestamps live inside `value` */
  measuredAt: string | null;
}

export interface SiteStatusFact {
  status: "active" | "paused" | "deleted";
  killSwitch: boolean;
  timezone: string;
}
export interface DomainFact {
  hostname: string;
  verified: boolean;
  verifiedAt: string | null;
}
export interface ConfigFact {
  version: number;
  publishedAt: string;
  summary: string | null;
}
export interface LastEventsFact {
  browserAt: string | null;
  serverAt: string | null;
  /** most recent of both; null when the environment never received an event */
  lastAt: string | null;
}
export interface RecentEvent {
  id: string;
  name: string;
  source: string;
  verified: boolean;
  state: string;
  at: string;
  consentGranted: string[];
  consentSource: string;
  /** destinations that reported a delivery for this event */
  delivered: number;
  /** destinations with any delivery mark (delivered, failed, pending, skipped) */
  deliveries: number;
  test: boolean;
}
export interface HealthFact {
  score: number;
  components: Record<string, { score: number; weight: number; detail: string }>;
  computedAt: string;
}
export interface ConsentFact {
  policy: { version: number; status: string; publishedAt: string | null } | null;
  /** accepted events counted by consent snapshots */
  events: number;
  /** share (0..1) of events whose consent came from an explicit signal rather than the default state */
  explicitShare: number | null;
  /** share (0..1) of events with the marketing purpose granted */
  marketingShare: number | null;
  lastSeenAt: string | null;
}
export type CredentialProblemKind = "expired" | "expiring" | "oauth" | "health";
export interface CredentialProblem {
  integrationId: string;
  name: string;
  kind: CredentialProblemKind;
  at: string | null;
}
export interface DestinationsFact {
  total: number;
  connected: number;
  error: number;
  paused: number;
  notConnected: number;
  draft: number;
  credentialProblems: CredentialProblem[];
  errorNames: string[];
  lastSuccessAt: string | null;
}
export interface DuplicatesFact {
  received: number;
  deduplicated: number;
  rate: number | null;
}
export interface DeliveryFact {
  /** success + failed + dead (retries, pending and policy skips are not outcomes) */
  attempts: number;
  success: number;
  failed: number;
  dead: number;
  retry: number;
  skipped: number;
  failureRate: number | null;
  /** unreplayed dead-letter references of the site */
  deadLetters: number;
  topErrorClass: string | null;
  lastAttemptAt: string | null;
}
export interface QueueFact {
  pending: number;
  inFlight: number;
  /** seconds the oldest ready message has been waiting; null when nothing waits */
  oldestAgeSeconds: number | null;
  deadLetters: number;
}
export interface UsageFact {
  periodKey: string;
  billable: number;
  limit: number | null;
  /** percent of the limit (0..∞); null without a fixed cap */
  pct: number | null;
  planId: string;
  policy: string;
  softLimitHitAt: string | null;
  hardLimitHitAt: string | null;
}
export interface IssueSummary {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  occurrences: number;
  lastSeenAt: string;
  fixTool: string | null;
}
export interface IssuesFact {
  open: number;
  critical: number;
  warning: number;
  info: number;
  top: IssueSummary[];
}

export interface CommandCenterFacts {
  now: string;
  site: { id: string; name: string; trackingId: string; primaryDomain: string | null; platform: string };
  environment: { id: string; kind: "production" | "staging" | "development"; name: string; testMode: boolean } | null;
  siteStatus: Measurement<SiteStatusFact>;
  domain: Measurement<DomainFact>;
  config: Measurement<ConfigFact>;
  lastEvents: Measurement<LastEventsFact>;
  recentEvents: Measurement<RecentEvent[]>;
  health: Measurement<HealthFact>;
  consent: Measurement<ConsentFact>;
  destinations: Measurement<DestinationsFact>;
  duplicates: Measurement<DuplicatesFact>;
  delivery: Measurement<DeliveryFact>;
  queue: Measurement<QueueFact>;
  usage: Measurement<UsageFact>;
  issues: Measurement<IssuesFact>;
  flow: Measurement<FlowBucket[]>;
  deliveryHistory: Measurement<DeliveryDay[]>;
}

export type MeasurementKey = Exclude<keyof CommandCenterFacts, "now" | "site" | "environment">;

export const MEASUREMENT_KEYS: readonly MeasurementKey[] = ["siteStatus", "domain", "config", "lastEvents", "recentEvents", "health", "consent", "destinations", "duplicates", "delivery", "queue", "usage", "issues", "flow", "deliveryHistory"];

/** Windows and thresholds of the rules; shown to the user as part of every "why". */
export const THRESHOLDS = {
  flowHours: 24,
  deliveryWindowHours: 24,
  deliveryHistoryDays: 7,
  recentEvents: 8,
  /** failure share of delivery outcomes that raises a warning / a critical action */
  deliveryFailureRate: 0.2,
  deliveryFailureCritical: 0.5,
  deliveryMinAttempts: 20,
  duplicateRate: 0.05,
  duplicateMinReceived: 100,
  queueLagSeconds: 300,
  silenceHours: 24,
  credentialExpiryDays: 7,
  consentCoverageMin: 0.5,
  consentMinEvents: 100,
  healthStaleHours: 24,
  usageWarnPct: 70,
  usageSoftPct: 90,
} as const;

export type Severity = "critical" | "warn" | "info";
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

export type ActionId =
  | "site_paused"
  | "usage_hard_limit"
  | "no_config"
  | "no_events"
  | "credentials"
  | "dead_letters"
  | "delivery_failures"
  | "critical_issues"
  | "usage_soft_limit"
  | "destination_errors"
  | "silence"
  | "no_consent_policy"
  | "consent_coverage"
  | "duplicates"
  | "queue_lag"
  | "warning_issues"
  | "usage_warning"
  | "domain_unverified"
  | "no_destinations";

export type ActionParams = Record<string, string | number>;

export interface NextAction {
  id: ActionId;
  severity: Severity;
  href: string;
  /** values for the localized title/why (thresholds included, so the explanation is complete) */
  params: ActionParams;
  measuredAt: string | null;
}

export interface SkippedRule {
  id: ActionId;
  measurement: MeasurementKey;
  status: Exclude<MeasurementStatus, "measured" | "stale">;
}

export interface Prioritisation {
  /** all fired actions, most important first (severity, then rule order) */
  actions: NextAction[];
  /** rules that ran on measured inputs */
  checked: ActionId[];
  /** rules that could not run because an input was not measured */
  skipped: SkippedRule[];
}

export interface CommandCenterData extends Prioritisation {
  facts: CommandCenterFacts;
  /** measurements whose query failed (shown as a partial-data notice) */
  unavailable: MeasurementKey[];
}

interface Rule {
  id: ActionId;
  requires: MeasurementKey[];
  run: (f: CommandCenterFacts, now: Date) => { severity: Severity; href: string; params: ActionParams } | null;
}

const HOUR = 3_600_000;
const pct = (ratio: number) => Math.round(ratio * 1000) / 10;
const hoursBetween = (from: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / HOUR));

/**
 * The rule table, in evaluation order. Severity decides first, then the position here — so two
 * critical findings always rank the same way. Every rule names the measurements it needs; when one
 * of them is not measured the rule is skipped and reported, never guessed.
 */
export const RULES: readonly Rule[] = [
  {
    id: "site_paused",
    requires: ["siteStatus"],
    run: (f) => {
      const s = f.siteStatus.value;
      if (!s || (s.status !== "paused" && !s.killSwitch)) return null;
      return { severity: "critical", href: `/app/sites/${f.site.id}`, params: { site: f.site.name, reason: s.killSwitch ? "kill_switch" : "paused" } };
    },
  },
  {
    id: "usage_hard_limit",
    requires: ["usage"],
    run: (f) => {
      const u = f.usage.value;
      if (!u?.hardLimitHitAt) return null;
      return { severity: "critical", href: "/app/billing", params: { used: u.billable, limit: u.limit ?? 0, policy: u.policy, period: u.periodKey } };
    },
  },
  {
    id: "no_config",
    requires: ["config"],
    run: (f) => {
      if (f.config.value || !f.environment) return null;
      return { severity: "critical", href: "/app/ai-setup", params: { environment: f.environment.name } };
    },
  },
  {
    id: "no_events",
    requires: ["lastEvents", "config"],
    run: (f) => {
      if (!f.config.value || f.lastEvents.value?.lastAt) return null;
      return { severity: "critical", href: `/app/sites/${f.site.id}`, params: { trackingId: f.site.trackingId, environment: f.environment?.name ?? "" } };
    },
  },
  {
    id: "credentials",
    requires: ["destinations"],
    run: (f) => {
      const d = f.destinations.value;
      const first = d?.credentialProblems[0];
      if (!d || !first) return null;
      return { severity: "critical", href: `/app/sites/${f.site.id}/destinations/${first.integrationId}`, params: { count: d.credentialProblems.length, destination: first.name, kind: first.kind, days: THRESHOLDS.credentialExpiryDays } };
    },
  },
  {
    id: "dead_letters",
    requires: ["delivery"],
    run: (f) => {
      const d = f.delivery.value;
      if (!d || d.deadLetters === 0) return null;
      return { severity: "critical", href: "/app/destinations", params: { count: d.deadLetters } };
    },
  },
  {
    id: "delivery_failures",
    requires: ["delivery"],
    run: (f) => {
      const d = f.delivery.value;
      if (!d || d.failureRate === null || d.attempts < THRESHOLDS.deliveryMinAttempts || d.failureRate < THRESHOLDS.deliveryFailureRate) return null;
      return {
        severity: d.failureRate >= THRESHOLDS.deliveryFailureCritical ? "critical" : "warn",
        href: "/app/destinations",
        params: { pct: pct(d.failureRate), failed: d.failed + d.dead, attempts: d.attempts, thresholdPct: pct(THRESHOLDS.deliveryFailureRate), criticalPct: pct(THRESHOLDS.deliveryFailureCritical), minAttempts: THRESHOLDS.deliveryMinAttempts, hours: THRESHOLDS.deliveryWindowHours, errorClass: d.topErrorClass ?? "none" },
      };
    },
  },
  {
    id: "critical_issues",
    requires: ["issues"],
    run: (f) => {
      const i = f.issues.value;
      if (!i || i.critical === 0) return null;
      const top = i.top.find((x) => x.severity === "critical");
      return { severity: "critical", href: `/app/data-quality?site=${f.site.id}`, params: { count: i.critical, summary: top?.summary ?? "" } };
    },
  },
  {
    id: "usage_soft_limit",
    requires: ["usage"],
    run: (f) => {
      const u = f.usage.value;
      if (!u || u.hardLimitHitAt || u.pct === null || u.pct < THRESHOLDS.usageSoftPct) return null;
      return { severity: "warn", href: "/app/billing", params: { pct: Math.round(u.pct), used: u.billable, limit: u.limit ?? 0, policy: u.policy, thresholdPct: THRESHOLDS.usageSoftPct, period: u.periodKey } };
    },
  },
  {
    id: "destination_errors",
    requires: ["destinations"],
    run: (f) => {
      const d = f.destinations.value;
      if (!d || d.error === 0) return null;
      return { severity: "warn", href: "/app/destinations", params: { count: d.error, name: d.errorNames[0] ?? "" } };
    },
  },
  {
    id: "silence",
    requires: ["lastEvents", "siteStatus"],
    run: (f, now) => {
      const last = f.lastEvents.value?.lastAt;
      if (!last || f.environment?.kind !== "production" || f.siteStatus.value?.status !== "active") return null;
      const hours = hoursBetween(last, now);
      if (hours < THRESHOLDS.silenceHours) return null;
      return { severity: "warn", href: `/app/events?site=${f.site.id}`, params: { hours, threshold: THRESHOLDS.silenceHours, environment: f.environment.name, lastAt: last } };
    },
  },
  {
    id: "no_consent_policy",
    requires: ["consent"],
    run: (f) => {
      const c = f.consent.value;
      if (!c || c.policy?.status === "published") return null;
      return { severity: "warn", href: "/app/consent", params: { status: c.policy?.status ?? "none" } };
    },
  },
  {
    id: "consent_coverage",
    requires: ["consent"],
    run: (f) => {
      const c = f.consent.value;
      if (!c || c.explicitShare === null || c.events < THRESHOLDS.consentMinEvents || c.explicitShare >= THRESHOLDS.consentCoverageMin) return null;
      return { severity: "warn", href: "/app/consent", params: { pct: pct(c.explicitShare), events: c.events, thresholdPct: pct(THRESHOLDS.consentCoverageMin), minEvents: THRESHOLDS.consentMinEvents } };
    },
  },
  {
    id: "duplicates",
    requires: ["duplicates"],
    run: (f) => {
      const d = f.duplicates.value;
      if (!d || d.rate === null || d.received < THRESHOLDS.duplicateMinReceived || d.rate < THRESHOLDS.duplicateRate) return null;
      return { severity: "warn", href: `/app/events?site=${f.site.id}`, params: { pct: pct(d.rate), deduplicated: d.deduplicated, received: d.received, thresholdPct: pct(THRESHOLDS.duplicateRate), minReceived: THRESHOLDS.duplicateMinReceived, hours: THRESHOLDS.flowHours } };
    },
  },
  {
    id: "queue_lag",
    requires: ["queue"],
    run: (f) => {
      const q = f.queue.value;
      if (!q || q.oldestAgeSeconds === null || q.oldestAgeSeconds < THRESHOLDS.queueLagSeconds) return null;
      return { severity: "warn", href: "/app/destinations", params: { seconds: q.oldestAgeSeconds, minutes: Math.round(q.oldestAgeSeconds / 60), pending: q.pending, thresholdMinutes: THRESHOLDS.queueLagSeconds / 60 } };
    },
  },
  {
    id: "warning_issues",
    requires: ["issues"],
    run: (f) => {
      const i = f.issues.value;
      if (!i || i.warning === 0) return null;
      return { severity: "info", href: `/app/data-quality?site=${f.site.id}`, params: { count: i.warning } };
    },
  },
  {
    id: "usage_warning",
    requires: ["usage"],
    run: (f) => {
      const u = f.usage.value;
      if (!u || u.hardLimitHitAt || u.pct === null || u.pct < THRESHOLDS.usageWarnPct || u.pct >= THRESHOLDS.usageSoftPct) return null;
      return { severity: "info", href: "/app/billing", params: { pct: Math.round(u.pct), used: u.billable, limit: u.limit ?? 0, period: u.periodKey, thresholdPct: THRESHOLDS.usageWarnPct, nextPct: THRESHOLDS.usageSoftPct } };
    },
  },
  {
    id: "domain_unverified",
    requires: ["domain"],
    run: (f) => {
      const d = f.domain.value;
      if (!d || d.verified) return null;
      return { severity: "info", href: `/app/sites/${f.site.id}`, params: { hostname: d.hostname } };
    },
  },
  {
    id: "no_destinations",
    requires: ["destinations", "lastEvents"],
    run: (f) => {
      const d = f.destinations.value;
      if (!d || d.total > 0 || !f.lastEvents.value?.lastAt) return null;
      return { severity: "info", href: `/app/sites/${f.site.id}/destinations/new`, params: {} };
    },
  },
];

const isMeasured = (m: Measurement<unknown>) => m.status === "measured" || m.status === "stale" || m.status === "empty";

/** Runs the rule table over measured facts. Pure and deterministic: same facts and clock, same result. */
export function evaluateActions(facts: CommandCenterFacts, now: Date = new Date(facts.now)): Prioritisation {
  const actions: NextAction[] = [];
  const checked: ActionId[] = [];
  const skipped: SkippedRule[] = [];
  RULES.forEach((rule) => {
    const missing = rule.requires.find((key) => !isMeasured(facts[key]));
    if (missing) {
      skipped.push({ id: rule.id, measurement: missing, status: facts[missing].status as SkippedRule["status"] });
      return;
    }
    checked.push(rule.id);
    const result = rule.run(facts, now);
    if (result) actions.push({ id: rule.id, ...result, measuredAt: facts[rule.requires[0]!].measuredAt });
  });
  const order = new Map(RULES.map((r, i) => [r.id, i]));
  actions.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || order.get(a.id)! - order.get(b.id)!);
  return { actions, checked, skipped };
}

/** ISO string of a Date or database timestamp text; `null` for missing or unparsable values (never an "Invalid Date" crash). */
const iso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const measured = <T>(value: T, at: Date): Measurement<T> => ({ status: "measured", value, measuredAt: at.toISOString() });
const empty = <T>(at: Date): Measurement<T> => ({ status: "empty", value: null, measuredAt: at.toISOString() });
const unavailable = <T>(): Measurement<T> => ({ status: "unavailable", value: null, measuredAt: null });
const notMeasurable = <T>(at: Date): Measurement<T> => ({ status: "not_measurable", value: null, measuredAt: at.toISOString() });

/** Isolates one measurement in a savepoint so a failed statement never aborts the tenant transaction (25P02). */
async function measure<T>(tx: Tx, key: MeasurementKey, fn: (sp: Tx) => Promise<Measurement<T>>): Promise<Measurement<T>> {
  try {
    return await tx.transaction(fn);
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e), key }, "command center measurement failed");
    return unavailable<T>();
  }
}

const ACCEPTED_STATE_EXCLUSIONS = ["rejected", "policy_blocked", "dropped", "deduplicated", "failed"];

/** Loads every measurement for the active workspace site and runs the rule table. `null` when the organization has no site. */
export async function loadCommandCenter(ctx: OrgContext, workspace: Workspace): Promise<CommandCenterData | null> {
  const site = workspace.site;
  if (!site) return null;
  const environment = workspace.environment;
  const now = new Date();
  const orgId = ctx.organization.id;

  // plan limits come from the plans table (no tenant rows); resolved outside the RLS transaction
  let plan: Awaited<ReturnType<typeof planLimits>> | null = null;
  try {
    plan = await planLimits(ctx);
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "command center: plan limits unavailable");
  }

  const facts = await withOrg(ctx, async (tx): Promise<CommandCenterFacts> => {
    const envId = environment?.id ?? null;

    const siteStatus = await measure<SiteStatusFact>(tx, "siteStatus", async (sp) => {
      const [row] = await sp.select({ status: sites.status, killSwitch: sites.killSwitch, timezone: sites.timezone }).from(sites).where(eq(sites.id, site.id)).limit(1);
      return row ? measured(row, now) : empty(now);
    });

    const domain = await measure<DomainFact>(tx, "domain", async (sp) => {
      const [row] = await sp.select({ hostname: domains.hostname, verifiedAt: domains.verifiedAt }).from(domains).where(eq(domains.siteId, site.id)).orderBy(desc(domains.isPrimary), domains.createdAt).limit(1);
      return row ? measured({ hostname: row.hostname, verified: row.verifiedAt !== null, verifiedAt: iso(row.verifiedAt) }, now) : empty(now);
    });

    const config = envId
      ? await measure<ConfigFact>(tx, "config", async (sp) => {
          const v = await activeVersion(sp, envId);
          return v ? measured({ version: v.version, publishedAt: v.createdAt.toISOString(), summary: v.summary }, now) : empty(now);
        })
      : notMeasurable<ConfigFact>(now);

    const lastEvents = envId
      ? await measure<LastEventsFact>(tx, "lastEvents", async (sp) => {
          const rows = await sp
            .select({ browser: sql<boolean>`${events.source} = 'browser'`, at: max(events.serverTs) })
            .from(events)
            .where(and(eq(events.siteId, site.id), eq(events.environmentId, envId)))
            .groupBy(sql`1`);
          const browserAt = iso(rows.find((r) => r.browser)?.at);
          const serverAt = iso(rows.find((r) => !r.browser)?.at);
          const lastAt = [browserAt, serverAt].filter((x): x is string => x !== null).sort().at(-1) ?? null;
          return measured({ browserAt, serverAt, lastAt }, now);
        })
      : notMeasurable<LastEventsFact>(now);

    const recentEvents = envId
      ? await measure<RecentEvent[]>(tx, "recentEvents", async (sp) => {
          const rows = await sp
            .select({ id: events.eventId, name: events.name, source: events.source, verified: events.sourceVerified, state: events.processingState, at: events.serverTs, consent: events.consent, deliveries: events.deliveries, props: events.props })
            .from(events)
            .where(and(eq(events.siteId, site.id), eq(events.environmentId, envId), eq(events.isBot, false), notInArray(events.processingState, ACCEPTED_STATE_EXCLUSIONS)))
            .orderBy(desc(events.serverTs))
            .limit(THRESHOLDS.recentEvents);
          if (rows.length === 0) return empty(now);
          return measured(
            rows.map((r) => {
              const granted = Array.isArray(r.consent?.granted) ? (r.consent.granted as unknown[]).filter((p): p is string => typeof p === "string") : [];
              const marks = Object.values(r.deliveries ?? {});
              return {
                id: r.id,
                name: r.name,
                source: r.source,
                verified: r.verified,
                state: r.state,
                at: new Date(r.at).toISOString(),
                consentGranted: granted,
                consentSource: typeof r.consent?.source === "string" ? r.consent.source : "unknown",
                delivered: marks.filter((m) => m.status === "delivered").length,
                deliveries: marks.length,
                test: r.props?.test === true,
              };
            }),
            now,
          );
        })
      : notMeasurable<RecentEvent[]>(now);

    const health = await measure<HealthFact>(tx, "health", async (sp) => {
      const [row] = await sp.select({ score: siteHealthSnapshots.score, components: siteHealthSnapshots.components, computedAt: siteHealthSnapshots.computedAt }).from(siteHealthSnapshots).where(eq(siteHealthSnapshots.siteId, site.id)).orderBy(desc(siteHealthSnapshots.computedAt)).limit(1);
      if (!row) return empty(now);
      const value = { score: row.score, components: row.components, computedAt: row.computedAt.toISOString() };
      const stale = now.getTime() - row.computedAt.getTime() > THRESHOLDS.healthStaleHours * HOUR;
      return stale ? { status: "stale", value, measuredAt: now.toISOString() } : measured(value, now);
    });

    const consent = await measure<ConsentFact>(tx, "consent", async (sp) => {
      const policies = await sp.select({ version: consentPolicies.version, status: consentPolicies.status, publishedAt: consentPolicies.publishedAt }).from(consentPolicies).where(eq(consentPolicies.siteId, site.id)).orderBy(desc(consentPolicies.version));
      const policyRow = policies.find((p) => p.status === "published") ?? policies[0] ?? null;
      const [agg] = await sp
        .select({
          total: sql<number>`coalesce(sum(${consentSnapshots.eventCount}), 0)::int`,
          explicit: sql<number>`coalesce(sum(${consentSnapshots.eventCount}) filter (where ${consentSnapshots.source} <> 'default'), 0)::int`,
          marketing: sql<number>`coalesce(sum(${consentSnapshots.eventCount}) filter (where ${consentSnapshots.granted} ? 'marketing'), 0)::int`,
          lastSeenAt: max(consentSnapshots.lastSeenAt),
        })
        .from(consentSnapshots)
        .where(eq(consentSnapshots.siteId, site.id));
      const total = agg?.total ?? 0;
      return measured(
        {
          policy: policyRow ? { version: policyRow.version, status: policyRow.status, publishedAt: iso(policyRow.publishedAt) } : null,
          events: total,
          explicitShare: total > 0 ? (agg?.explicit ?? 0) / total : null,
          marketingShare: total > 0 ? (agg?.marketing ?? 0) / total : null,
          lastSeenAt: iso(agg?.lastSeenAt),
        },
        now,
      );
    });

    const destinations = await measure<DestinationsFact>(tx, "destinations", async (sp) => {
      const rows = await sp.select({ id: integrations.id, name: integrations.name, status: integrations.status, health: integrations.health }).from(integrations).where(eq(integrations.siteId, site.id));
      if (rows.length === 0) return measured({ total: 0, connected: 0, error: 0, paused: 0, notConnected: 0, draft: 0, credentialProblems: [], errorNames: [], lastSuccessAt: null }, now);
      const ids = rows.map((r) => r.id);
      // sequential on purpose: one transaction client must not queue concurrent queries (pg deprecates it)
      const creds = await sp.select({ integrationId: credentials.integrationId, status: credentials.status, expiresAt: credentials.expiresAt }).from(credentials).where(and(inArray(credentials.integrationId, ids), inArray(credentials.status, ["active", "expired"])));
      const oauth = await sp.select({ integrationId: oauthConnections.integrationId, status: oauthConnections.status }).from(oauthConnections).where(inArray(oauthConnections.integrationId, ids));
      const success = await sp.select({ at: max(deliveryAttempts.startedAt) }).from(deliveryAttempts).where(and(eq(deliveryAttempts.siteId, site.id), eq(deliveryAttempts.status, "success")));
      const expiryLimit = now.getTime() + THRESHOLDS.credentialExpiryDays * 24 * HOUR;
      const problems: CredentialProblem[] = [];
      for (const r of rows) {
        if (r.status !== "connected" && r.status !== "error") continue;
        const cred = creds.filter((c) => c.integrationId === r.id);
        const expired = cred.find((c) => c.status === "expired" || (c.expiresAt && c.expiresAt.getTime() <= now.getTime()));
        const expiring = cred.find((c) => c.status === "active" && c.expiresAt && c.expiresAt.getTime() > now.getTime() && c.expiresAt.getTime() <= expiryLimit);
        const oauthRow = oauth.find((o) => o.integrationId === r.id);
        const healthStatus = r.health?.status ?? "unknown";
        if (expired) problems.push({ integrationId: r.id, name: r.name, kind: "expired", at: iso(expired.expiresAt) });
        else if (oauthRow && oauthRow.status !== "connected") problems.push({ integrationId: r.id, name: r.name, kind: "oauth", at: null });
        else if (expiring) problems.push({ integrationId: r.id, name: r.name, kind: "expiring", at: iso(expiring.expiresAt) });
        else if (healthStatus === "credential_expired" || healthStatus === "auth") problems.push({ integrationId: r.id, name: r.name, kind: "health", at: r.health?.checkedAt ?? null });
      }
      const count = (status: (typeof rows)[number]["status"]) => rows.filter((r) => r.status === status).length;
      return measured(
        {
          total: rows.length,
          connected: count("connected"),
          error: count("error"),
          paused: count("paused"),
          notConnected: count("not_connected"),
          draft: count("draft"),
          credentialProblems: problems,
          errorNames: rows.filter((r) => r.status === "error").map((r) => r.name),
          lastSuccessAt: iso(success[0]?.at),
        },
        now,
      );
    });

    const flow = envId
      ? await measure<FlowBucket[]>(tx, "flow", async (sp) => {
          const buckets = await hourlyEventFlow(sp, site.id, envId, new Date(now.getTime() - THRESHOLDS.flowHours * HOUR));
          return buckets.length ? measured(buckets, now) : empty(now);
        })
      : notMeasurable<FlowBucket[]>(now);

    const duplicates: Measurement<DuplicatesFact> =
      flow.status === "measured" && flow.value
        ? (() => {
            const received = flow.value.reduce((a, b) => a + b.received, 0);
            const deduplicated = flow.value.reduce((a, b) => a + b.deduplicated, 0);
            return measured({ received, deduplicated, rate: received > 0 ? deduplicated / received : null }, now);
          })()
        : flow.status === "empty"
          ? empty<DuplicatesFact>(now)
          : { status: flow.status, value: null, measuredAt: flow.measuredAt };

    const delivery = await measure<DeliveryFact>(tx, "delivery", async (sp) => {
      const since = new Date(now.getTime() - THRESHOLDS.deliveryWindowHours * HOUR);
      const byStatus = await sp
        .select({ status: deliveryAttempts.status, n: sql<number>`count(*)::int`, last: max(deliveryAttempts.startedAt) })
        .from(deliveryAttempts)
        .where(and(eq(deliveryAttempts.siteId, site.id), gte(deliveryAttempts.startedAt, since)))
        .groupBy(deliveryAttempts.status);
      const [topError] = await sp
        .select({ errorClass: deliveryAttempts.errorClass, n: sql<number>`count(*)::int` })
        .from(deliveryAttempts)
        .where(and(eq(deliveryAttempts.siteId, site.id), gte(deliveryAttempts.startedAt, since), inArray(deliveryAttempts.status, ["failed", "dead", "retry"]), notInArray(deliveryAttempts.errorClass, ["none"])))
        .groupBy(deliveryAttempts.errorClass)
        .orderBy(desc(sql`count(*)`))
        .limit(1);
      const [dead] = await sp.select({ n: sql<number>`count(*)::int` }).from(deadLetterReferences).where(and(eq(deadLetterReferences.siteId, site.id), isNull(deadLetterReferences.replayedAt)));
      const n = (status: (typeof byStatus)[number]["status"]) => byStatus.find((r) => r.status === status)?.n ?? 0;
      const success = n("success");
      const failed = n("failed");
      const deadCount = n("dead");
      const attempts = success + failed + deadCount;
      const lastAttemptAt = byStatus.map((r) => iso(r.last)).filter((x): x is string => x !== null).sort().at(-1) ?? null;
      return measured(
        { attempts, success, failed, dead: deadCount, retry: n("retry"), skipped: n("skipped"), failureRate: attempts > 0 ? (failed + deadCount) / attempts : null, deadLetters: dead?.n ?? 0, topErrorClass: topError?.errorClass ?? null, lastAttemptAt },
        now,
      );
    });

    const deliveryHistory = await measure<DeliveryDay[]>(tx, "deliveryHistory", async (sp) => {
      const days = await deliveryOutcomesByDay(sp, site.id, new Date(now.getTime() - THRESHOLDS.deliveryHistoryDays * 24 * HOUR));
      return days.length ? measured(days, now) : empty(now);
    });

    const usage = plan
      ? await measure<UsageFact>(tx, "usage", async (sp) => {
          const period = usagePeriodKey(now);
          const [row] = await sp.select().from(usagePeriods).where(and(eq(usagePeriods.organizationId, orgId), eq(usagePeriods.periodKey, period))).limit(1);
          const [settings] = await sp.select({ policy: orgSettings.usageOveragePolicy }).from(orgSettings).where(eq(orgSettings.organizationId, orgId)).limit(1);
          const limit = row?.limitEvents ?? plan!.limits.eventsPerMonth ?? null;
          const billable = row?.billableEvents ?? 0;
          return measured(
            {
              periodKey: period,
              billable,
              limit,
              pct: limit && limit > 0 ? (billable / limit) * 100 : null,
              planId: plan!.planId,
              policy: settings?.policy ?? "pause",
              softLimitHitAt: iso(row?.softLimitHitAt),
              hardLimitHitAt: iso(row?.hardLimitHitAt),
            },
            now,
          );
        })
      : unavailable<UsageFact>();

    const issues = await measure<IssuesFact>(tx, "issues", async (sp) => {
      const counts = await sp.select({ severity: dataQualityIssues.severity, n: sql<number>`count(*)::int` }).from(dataQualityIssues).where(and(eq(dataQualityIssues.siteId, site.id), eq(dataQualityIssues.status, "open"))).groupBy(dataQualityIssues.severity);
      const top = await sp
        .select({ id: dataQualityIssues.id, kind: dataQualityIssues.kind, severity: dataQualityIssues.severity, summary: dataQualityIssues.summary, occurrences: dataQualityIssues.occurrences, lastSeenAt: dataQualityIssues.lastSeenAt, fixTool: dataQualityIssues.fixTool })
        .from(dataQualityIssues)
        .where(and(eq(dataQualityIssues.siteId, site.id), eq(dataQualityIssues.status, "open")))
        .orderBy(sql`case ${dataQualityIssues.severity} when 'critical' then 0 when 'warning' then 1 else 2 end`, desc(dataQualityIssues.lastSeenAt))
        .limit(5);
      const n = (severity: (typeof counts)[number]["severity"]) => counts.find((c) => c.severity === severity)?.n ?? 0;
      return measured({ open: counts.reduce((a, c) => a + c.n, 0), critical: n("critical"), warning: n("warning"), info: n("info"), top: top.map((t) => ({ ...t, lastSeenAt: t.lastSeenAt.toISOString() })) }, now);
    });

    return {
      now: now.toISOString(),
      site: { id: site.id, name: site.name, trackingId: site.trackingId, primaryDomain: site.primaryDomain, platform: site.platform },
      environment: environment ? { id: environment.id, kind: environment.kind, name: environment.name, testMode: environment.testMode } : null,
      siteStatus,
      domain,
      config,
      lastEvents,
      recentEvents,
      health,
      consent,
      destinations,
      duplicates,
      delivery,
      queue: notMeasurable<QueueFact>(now),
      usage,
      issues,
      flow,
      deliveryHistory,
    };
  });

  facts.queue = await measureQueue(orgId, now);

  const priority = evaluateActions(facts, now);
  const unavailableKeys = MEASUREMENT_KEYS.filter((key) => facts[key].status === "unavailable");
  return { facts, ...priority, unavailable: unavailableKeys };
}

/**
 * Delivery-queue lag of the organization: age of the oldest message that is ready but not picked up
 * by a worker. The queue tables are data-plane only (revoked for the app role), so this runs as the
 * worker role with the organization id from the session; only the PostgreSQL driver keeps its
 * messages in these tables — with SQS or the in-memory queue the lag is reported as not measurable.
 */
async function measureQueue(organizationId: string, now: Date): Promise<Measurement<QueueFact>> {
  if (env().QUEUE_DRIVER !== "pg") return notMeasurable(now);
  try {
    return await withWorker(db(), async (tx) => {
      const ready = sql`${queueMessages.availableAt} <= now() and (${queueMessages.lockedUntil} is null or ${queueMessages.lockedUntil} < now())`;
      const [row] = await tx
        .select({
          pending: sql<number>`count(*) filter (where ${ready})::int`,
          inFlight: sql<number>`count(*) filter (where ${queueMessages.lockedUntil} >= now())::int`,
          oldest: sql<number | null>`extract(epoch from now() - (min(${queueMessages.availableAt}) filter (where ${ready})))::int`,
        })
        .from(queueMessages)
        .where(and(eq(queueMessages.organizationId, organizationId), sql`${queueMessages.queue} like 'dest.%'`));
      const [dead] = await tx.select({ n: sql<number>`count(*)::int` }).from(queueDeadLetters).where(and(eq(queueDeadLetters.organizationId, organizationId), isNull(queueDeadLetters.replayedAt)));
      return measured({ pending: row?.pending ?? 0, inFlight: row?.inFlight ?? 0, oldestAgeSeconds: row?.oldest ?? null, deadLetters: dead?.n ?? 0 }, now);
    });
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "command center: queue measurement failed");
    return unavailable();
  }
}
