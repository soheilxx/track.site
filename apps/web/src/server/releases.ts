import "server-only";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { USAGE_WARNING_THRESHOLDS } from "@track-site/catalog";
import { can, isOrgRole, usagePeriodKey } from "@track-site/core";
import { configBundleSchema, defaultBundle, diffBundles, type ConfigBundle, type DiffEntry, type LintIssue, type LintResult } from "@track-site/config";
import {
  activeVersion,
  compareVersions,
  configApprovals,
  configBundleDigest,
  configDrafts,
  configPublications,
  configVersions,
  dataQualityIssues,
  destinationHealthSnapshots,
  eventAggregates,
  events,
  integrations,
  listVersions,
  member,
  openDraft,
  pgErrorCode,
  preparePublish,
  testLabRuns,
  usagePeriods,
  user,
  type ConfigApprovalDecision,
  type Tx,
} from "@track-site/db";
import { db, logger } from "./db";
import { planLimits } from "./entitlements";
import { SCHEDULE_MAX_DAYS, SCHEDULE_MIN_LEAD_MINUTES, type CriticalReason, type FourEyesState } from "./release-rules";
import { withOrg, type OrgContext } from "./session";
import type { WorkspaceEnvironment, WorkspaceSite } from "./workspace";

// Client-safe constants live in `release-rules.ts` (this module is server-only); re-exported for the server side.
export { CRITICAL_REASONS, SCHEDULE_ERROR_CODES, SCHEDULE_MAX_DAYS, SCHEDULE_MIN_LEAD_MINUTES, type CriticalReason, type FourEyesState } from "./release-rules";

/**
 * Change & Release Center + Change Impact Preview (owner supplement §8, modules 9 and 10).
 *
 * Data access for `/app/releases` and `/app/releases/[versionId]`: the open draft, the active version
 * and the version history per environment, four-eyes approvals, scheduled publications, test evidence
 * and the rule-based impact preview of a draft before it is published. Every query runs inside
 * `withOrg` (RLS as `tracksite_app`); the site and its environments come from the workspace, never
 * from the client. Nothing is invented: a volume without aggregates is `null`, an author without a
 * membership is `null`, and every expectation carries the rule that produced it.
 *
 * The pure helpers (`readableChanges`, `criticalSignals`, `evaluateFourEyes`, `buildImpactPreview`,
 * `parseScheduleInput`) are exported for unit tests and reused by the server actions.
 */

export const IMPACT_WINDOW_DAYS = 30;
/** aggregates older than this count as stale (the worker materialises them hourly) */
export const AGGREGATES_STALE_HOURS = 48;
const DAY = 86_400_000;
const UUID = /^[0-9a-f-]{36}$/i;

export type EnvironmentKind = WorkspaceEnvironment["kind"];
export type ConsentPurpose = ConfigBundle["consent"]["purposes"][number];
const PURPOSE_RANK: Record<ConsentPurpose, number> = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 };

// ---------------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------------

export type ChangeArea = "settings" | "consent" | "events" | "destinations" | "site" | "other";

/** One diff entry, parsed into area / key / field so the UI can group and label it without string surgery. */
export interface ReadableChange {
  op: DiffEntry["op"];
  area: ChangeArea;
  /** event name or destination id (the bracket key of the path), null for scalar settings */
  key: string | null;
  /** remaining path below area and key, e.g. `enabled` or `mappings[purchase].enabled` */
  field: string | null;
  path: string;
  before: unknown;
  after: unknown;
  summary: string;
}

const AREAS: readonly ChangeArea[] = ["settings", "consent", "events", "destinations", "site"];

export function readableChanges(diff: readonly DiffEntry[]): ReadableChange[] {
  return diff.map((d) => {
    const m = /^([a-z_]+)(?:\[([^\]]*)\])?(?:\.(.*))?$/.exec(d.path);
    const root = m?.[1] ?? "";
    const area = (AREAS as readonly string[]).includes(root) ? (root as ChangeArea) : "other";
    return { op: d.op, area, key: m?.[2] ?? null, field: m?.[3] ?? null, path: d.path, before: d.before, after: d.after, summary: d.summary };
  });
}

/**
 * Which critical signals a change carries, independent of the environment. Every rule compares the
 * bundle that is live (`before`, null before the first publish) with the draft (`after`):
 * a critical event stops or changes its trigger, consent gets weaker, a destination stops or needs
 * less consent, an advertising destination starts, the kill switch flips, or verified hosts are removed.
 */
export function criticalSignals(before: ConfigBundle | null, after: ConfigBundle): CriticalReason[] {
  const reasons = new Set<CriticalReason>();
  for (const ev of before?.events ?? []) {
    const next = after.events.find((e) => e.name === ev.name);
    if (!ev.critical && !next?.critical) continue;
    if (!next || (ev.enabled && !next.enabled) || JSON.stringify(ev.trigger) !== JSON.stringify(next.trigger)) reasons.add("critical_event");
  }
  const bc = before?.consent ?? null;
  const ac = after.consent;
  if ((bc ? bc.default_region_mode === "strict_opt_in" : true) && ac.default_region_mode !== "strict_opt_in") reasons.add("consent_weaker");
  if ((bc ? bc.consent_mode.mode !== "advanced" : true) && ac.consent_mode.mode === "advanced") reasons.add("consent_weaker");
  if ((bc ? bc.respect_gpc : true) && !ac.respect_gpc) reasons.add("consent_weaker");
  const beforeDest = new Map((before?.destinations ?? []).map((d) => [d.id, d]));
  for (const [id, d] of beforeDest) {
    const next = after.destinations.find((x) => x.id === id);
    if (!next || (d.enabled && !next.enabled)) {
      if (d.enabled) reasons.add("destination_stopped");
      continue;
    }
    if (PURPOSE_RANK[next.purpose] < PURPOSE_RANK[d.purpose]) reasons.add("destination_purpose_weaker");
  }
  for (const d of after.destinations) {
    const prev = beforeDest.get(d.id);
    if (d.enabled && PURPOSE_RANK[d.purpose] >= PURPOSE_RANK.marketing && (!prev || !prev.enabled)) reasons.add("marketing_destination_added");
  }
  if ((before?.settings.kill_switch ?? false) !== after.settings.kill_switch) reasons.add("kill_switch");
  if (before && before.settings.allowed_hosts.some((h) => !after.settings.allowed_hosts.includes(h))) reasons.add("allowed_hosts_reduced");
  return [...reasons];
}

/** Four-eyes applies to production only; staging and test environments show the signals as information. */
export function isCriticalChange(environmentKind: EnvironmentKind, reasons: readonly CriticalReason[]): boolean {
  return environmentKind === "production" && reasons.length > 0;
}

export interface ApprovalView {
  id: string;
  kind: "publish" | "rollback";
  decision: ConfigApprovalDecision;
  critical: boolean;
  criticalReasons: string[];
  requestedBy: string;
  requestedByName: string | null;
  requestNote: string | null;
  approverId: string | null;
  approverName: string | null;
  reason: string | null;
  /** the approval refers to the draft content that is open right now */
  current: boolean;
  summary: { baseVersion: number | null; nextVersion: number; changes: string[] };
  createdAt: string;
  decidedAt: string | null;
}

export interface FourEyes {
  critical: boolean;
  reasons: CriticalReason[];
  /** members whose role carries `config.publish`; the rule needs at least two */
  publishers: number;
  required: boolean;
  /** approval that satisfies the rule for the current draft content (used as `approval_id` of the publication) */
  approval: ApprovalView | null;
  pending: ApprovalView | null;
  state: FourEyesState;
}

/**
 * The four-eyes rule: a critical production change needs an approval by a second member before it
 * can be published or scheduled. With a single publisher in the organization the rule cannot be
 * satisfied, so the publish is allowed and recorded as a single-person release (never silently).
 * An approval counts only for exactly the draft content it was given for (`current`).
 */
export function evaluateFourEyes(input: { critical: boolean; reasons: CriticalReason[]; publishers: number; approvals: ApprovalView[] }): FourEyes {
  const { critical, reasons, publishers, approvals } = input;
  const required = critical && publishers >= 2;
  const approval = approvals.find((a) => a.decision === "approved" && a.current) ?? null;
  const pending = approvals.find((a) => a.decision === "pending" && a.current) ?? null;
  let state: FourEyesState;
  if (approval) state = "satisfied";
  else if (!critical) state = "not_required";
  else if (publishers < 2) state = "single_publisher";
  else if (pending) state = "pending";
  else if (approvals.some((a) => a.decision === "rejected" && a.current)) state = "rejected";
  else if (approvals.some((a) => a.decision === "approved" && !a.current)) state = "stale";
  else state = "missing";
  return { critical, reasons, publishers, required, approval, pending, state };
}

export type ScheduleError = "invalid" | "too_soon" | "too_far";

/** ISO date-time from the schedule form → Date, or the reason it is refused. */
export function parseScheduleInput(value: string, now: Date): { at: Date; error: null } | { at: null; error: ScheduleError } {
  const ms = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(ms)) return { at: null, error: "invalid" };
  if (ms < now.getTime() + SCHEDULE_MIN_LEAD_MINUTES * 60_000) return { at: null, error: "too_soon" };
  if (ms > now.getTime() + SCHEDULE_MAX_DAYS * DAY) return { at: null, error: "too_far" };
  return { at: new Date(ms), error: null };
}

// ---------------------------------------------------------------------------------------------------
// Change Impact Preview (pure)
// ---------------------------------------------------------------------------------------------------

export type EventChange = "added" | "removed" | "enabled" | "disabled" | "changed";
export type DestinationChange = "added" | "removed" | "enabled" | "disabled" | "changed";

/** Measured facts per event name inside the impact window (`event_aggregates` of the environment). */
export interface EventVolume {
  name: string;
  accepted: number;
  delivered: number;
  failed: number;
  billable: number;
}

export interface EventImpact {
  name: string;
  change: EventChange;
  critical: boolean;
  enabledAfter: boolean;
  /** null = no aggregate row for this event in the window (not measured) */
  accepted: number | null;
  delivered: number | null;
  failed: number | null;
  /** open or acknowledged data-quality issues that reference the event */
  openIssues: number;
  /** enabled destinations that map the event after the change */
  destinations: string[];
}

export interface DestinationHealthFacts {
  errorRate: number | null;
  attemptsSuccess: number;
  attemptsFailed: number;
  lastSuccessAt: string | null;
  computedAt: string;
  windowMinutes: number;
  stale: boolean;
}

export interface DestinationImpact {
  id: string;
  name: string;
  type: string;
  change: DestinationChange;
  purposeBefore: ConsentPurpose | null;
  purposeAfter: ConsentPurpose | null;
  mode: string;
  enabledAfter: boolean;
  mappedEvents: string[];
  /** integration row status (`connected`, `paused`, …); null when the destination row no longer exists */
  status: string | null;
  health: DestinationHealthFacts | null;
}

export interface ConsentImpact {
  purposesBefore: ConsentPurpose[];
  purposesAfter: ConsentPurpose[];
  added: ConsentPurpose[];
  removed: ConsentPurpose[];
  regionMode: { before: string | null; after: string } | null;
  consentMode: { before: string | null; after: string } | null;
  gpc: { before: boolean | null; after: boolean } | null;
  clickIdTtl: { before: number | null; after: number } | null;
  weaker: boolean;
}

export interface VolumeImpact {
  window: { from: string; to: string };
  /** the aggregates table could be read (false = migration not applied; nothing about the volume is known) */
  available: boolean;
  /** at least one aggregate row inside the window */
  measured: boolean;
  /** accepted events (window) of events that stay enabled after the change and were measured */
  baselineAccepted: number | null;
  /** accepted events (window) of events the change disables or removes */
  removedAccepted: number;
  /** events enabled after the change without any measurement (new or never seen) */
  unmeasuredEvents: string[];
  billable: number | null;
  lastBucketAt: string | null;
  stale: boolean;
}

export interface PlanImpact {
  planId: string;
  eventsPerMonth: number | null;
  periodKey: string;
  usedBillable: number | null;
  usedSharePercent: number | null;
  /** the measured window projected to a month (30-day baseline ≈ one month); null without measurement */
  projectedMonthly: number | null;
  projectedSharePercent: number | null;
  /** highest catalogue threshold (70/90/100) the projection crosses; null when none or unknown */
  thresholdCrossed: number | null;
}

export const DQ_CODES = [
  "no_changes",
  "critical_event_stopped",
  "event_removed_open_issues",
  "destination_stopped",
  "destination_failing_stopped",
  "destination_no_mappings",
  "conversion_browser_only",
  "conversion_without_authoritative_source",
  "mapping_unknown_event",
  "consent_weaker",
  "kill_switch_on",
  "kill_switch_off",
  "allowed_hosts_reduced",
  "new_event_unmeasured",
  "lint_errors",
  "no_rule_fired",
] as const;
export type DqCode = (typeof DQ_CODES)[number];

export interface DataQualityExpectation {
  code: DqCode;
  tone: "ok" | "warn" | "bad" | "info";
  params: Record<string, string | number>;
}

export interface ImpactPreview {
  events: EventImpact[];
  destinations: DestinationImpact[];
  consent: ConsentImpact;
  volume: VolumeImpact;
  plan: PlanImpact;
  dataQuality: DataQualityExpectation[];
  lint: { ok: boolean; errors: LintIssue[]; warnings: LintIssue[] };
  generatedAt: string;
}

export interface ImpactInput {
  before: ConfigBundle | null;
  after: ConfigBundle;
  lint: LintResult;
  window: { from: Date; to: Date };
  /** null = aggregates table unavailable; empty = no rows in the window */
  volumes: EventVolume[] | null;
  lastBucketAt: Date | null;
  /** integration rows of the site (status per destination id) */
  integrations: Array<{ id: string; name: string; connectorType: string; status: string }>;
  /** latest destination health snapshot per integration id (null = not measured) */
  health: Record<string, DestinationHealthFacts>;
  /** open/acknowledged data-quality issues: the event each refers to (null when unknown) */
  openIssues: Array<{ event: string | null; severity: string }>;
  plan: { planId: string; eventsPerMonth: number | null };
  usage: { periodKey: string; billable: number | null };
  now: Date;
}

const pct = (n: number, limit: number | null): number | null => (limit && limit > 0 ? Math.round((n / limit) * 1000) / 10 : null);

/** Rule-based preview of what publishing `after` instead of `before` changes; deterministic for the same input. */
export function buildImpactPreview(input: ImpactInput): ImpactPreview {
  const { before, after, lint, volumes, integrations: integrationRows, health, openIssues, plan, usage, now } = input;
  const measured = volumes !== null && volumes.length > 0;
  const volumeByName = new Map((volumes ?? []).map((v) => [v.name, v]));
  const issuesByEvent = new Map<string, number>();
  for (const issue of openIssues) if (issue.event) issuesByEvent.set(issue.event, (issuesByEvent.get(issue.event) ?? 0) + 1);
  const destinationsForEvent = (name: string): string[] => after.destinations.filter((d) => d.enabled && d.mappings.some((m) => m.enabled && m.event === name)).map((d) => d.name);

  // events
  const eventsOut: EventImpact[] = [];
  const beforeEvents = new Map((before?.events ?? []).map((e) => [e.name, e]));
  const pushEvent = (name: string, change: EventChange, critical: boolean, enabledAfter: boolean) => {
    const v = volumeByName.get(name) ?? null;
    eventsOut.push({ name, change, critical, enabledAfter, accepted: v ? v.accepted : null, delivered: v ? v.delivered : null, failed: v ? v.failed : null, openIssues: issuesByEvent.get(name) ?? 0, destinations: enabledAfter ? destinationsForEvent(name) : [] });
  };
  for (const ev of after.events) {
    const prev = beforeEvents.get(ev.name);
    if (!prev) pushEvent(ev.name, "added", ev.critical, ev.enabled);
    else if (prev.enabled !== ev.enabled) pushEvent(ev.name, ev.enabled ? "enabled" : "disabled", ev.critical || prev.critical, ev.enabled);
    else if (JSON.stringify(prev) !== JSON.stringify(ev)) pushEvent(ev.name, "changed", ev.critical || prev.critical, ev.enabled);
  }
  for (const [name, prev] of beforeEvents) if (!after.events.some((e) => e.name === name)) pushEvent(name, "removed", prev.critical, false);

  // destinations
  const destinationsOut: DestinationImpact[] = [];
  const beforeDest = new Map((before?.destinations ?? []).map((d) => [d.id, d]));
  const integrationById = new Map(integrationRows.map((i) => [i.id, i]));
  const pushDestination = (d: ConfigBundle["destinations"][number], change: DestinationChange, prev: ConfigBundle["destinations"][number] | null) => {
    destinationsOut.push({
      id: d.id,
      name: d.name,
      type: d.type,
      change,
      purposeBefore: prev?.purpose ?? null,
      purposeAfter: change === "removed" ? null : d.purpose,
      mode: d.mode,
      enabledAfter: change !== "removed" && d.enabled,
      mappedEvents: change === "removed" ? [] : d.mappings.filter((m) => m.enabled).map((m) => m.event),
      status: integrationById.get(d.id)?.status ?? null,
      health: health[d.id] ?? null,
    });
  };
  for (const d of after.destinations) {
    const prev = beforeDest.get(d.id) ?? null;
    if (!prev) pushDestination(d, "added", null);
    else if (prev.enabled !== d.enabled) pushDestination(d, d.enabled ? "enabled" : "disabled", prev);
    else if (JSON.stringify(prev) !== JSON.stringify(d)) pushDestination(d, "changed", prev);
  }
  for (const [id, prev] of beforeDest) if (!after.destinations.some((d) => d.id === id)) pushDestination(prev, "removed", prev);

  // consent
  const purposesBefore = before ? [...before.consent.purposes] : [];
  const purposesAfter = [...after.consent.purposes];
  const regionMode = !before || before.consent.default_region_mode !== after.consent.default_region_mode ? { before: before?.consent.default_region_mode ?? null, after: after.consent.default_region_mode } : null;
  const consentMode = !before || before.consent.consent_mode.mode !== after.consent.consent_mode.mode ? { before: before?.consent.consent_mode.mode ?? null, after: after.consent.consent_mode.mode } : null;
  const gpc = !before || before.consent.respect_gpc !== after.consent.respect_gpc ? { before: before?.consent.respect_gpc ?? null, after: after.consent.respect_gpc } : null;
  const clickIdTtl = !before || before.consent.click_ids.ttl_days !== after.consent.click_ids.ttl_days ? { before: before?.consent.click_ids.ttl_days ?? null, after: after.consent.click_ids.ttl_days } : null;
  const signals = criticalSignals(before, after);
  const consent: ConsentImpact = {
    purposesBefore,
    purposesAfter,
    added: purposesAfter.filter((p) => !purposesBefore.includes(p)),
    removed: purposesBefore.filter((p) => !purposesAfter.includes(p)),
    regionMode,
    consentMode,
    gpc,
    clickIdTtl,
    weaker: signals.includes("consent_weaker") || signals.includes("destination_purpose_weaker"),
  };

  // volume
  let baseline = 0;
  let removed = 0;
  let baselineMeasured = false;
  const unmeasured: string[] = [];
  for (const ev of after.events) {
    if (!ev.enabled) continue;
    const v = volumeByName.get(ev.name);
    if (v) {
      baseline += v.accepted;
      baselineMeasured = true;
    } else unmeasured.push(ev.name);
  }
  for (const ev of before?.events ?? []) {
    const next = after.events.find((e) => e.name === ev.name);
    if (ev.enabled && (!next || !next.enabled)) removed += volumeByName.get(ev.name)?.accepted ?? 0;
  }
  const billable = measured ? (volumes ?? []).reduce((s, v) => s + v.billable, 0) : null;
  const lastBucketAt = input.lastBucketAt;
  const volume: VolumeImpact = {
    window: { from: input.window.from.toISOString(), to: input.window.to.toISOString() },
    available: volumes !== null,
    measured,
    baselineAccepted: measured && baselineMeasured ? baseline : null,
    removedAccepted: removed,
    unmeasuredEvents: unmeasured,
    billable,
    lastBucketAt: lastBucketAt ? lastBucketAt.toISOString() : null,
    stale: measured && lastBucketAt !== null && now.getTime() - lastBucketAt.getTime() > AGGREGATES_STALE_HOURS * 3_600_000,
  };

  // plan
  const projectedMonthly = volume.baselineAccepted;
  const projectedShare = projectedMonthly === null ? null : pct(projectedMonthly, plan.eventsPerMonth);
  const planOut: PlanImpact = {
    planId: plan.planId,
    eventsPerMonth: plan.eventsPerMonth,
    periodKey: usage.periodKey,
    usedBillable: usage.billable,
    usedSharePercent: usage.billable === null ? null : pct(usage.billable, plan.eventsPerMonth),
    projectedMonthly,
    projectedSharePercent: projectedShare,
    thresholdCrossed: projectedShare === null ? null : ([...USAGE_WARNING_THRESHOLDS].reverse().find((th) => projectedShare >= th) ?? null),
  };

  // data quality (rule-based, each entry explained by its code)
  const dq: DataQualityExpectation[] = [];
  const noChanges = eventsOut.length === 0 && destinationsOut.length === 0 && !regionMode && !consentMode && !gpc && !clickIdTtl && (before ? JSON.stringify(before.settings) === JSON.stringify(after.settings) : false);
  if (noChanges) dq.push({ code: "no_changes", tone: "info", params: {} });
  if (!lint.ok) dq.push({ code: "lint_errors", tone: "bad", params: { count: lint.errors.length } });
  for (const ev of eventsOut) {
    if (ev.critical && (ev.change === "removed" || ev.change === "disabled")) dq.push({ code: "critical_event_stopped", tone: "bad", params: { event: ev.name, accepted: ev.accepted ?? 0, measured: ev.accepted === null ? "no" : "yes" } });
    if ((ev.change === "removed" || ev.change === "disabled") && ev.openIssues > 0) dq.push({ code: "event_removed_open_issues", tone: "warn", params: { event: ev.name, issues: ev.openIssues } });
    if (ev.change === "added" && ev.enabledAfter && ev.accepted === null) dq.push({ code: "new_event_unmeasured", tone: "info", params: { event: ev.name } });
  }
  for (const d of destinationsOut) {
    if (d.change === "removed" || d.change === "disabled") {
      if (d.health && d.health.errorRate !== null && d.health.errorRate >= 0.5) dq.push({ code: "destination_failing_stopped", tone: "info", params: { destination: d.name, errorRate: Math.round(d.health.errorRate * 100) } });
      else dq.push({ code: "destination_stopped", tone: "warn", params: { destination: d.name, delivered: d.health?.attemptsSuccess ?? 0, measured: d.health ? "yes" : "no" } });
    }
  }
  for (const w of lint.warnings) {
    if (w.code === "no_mappings") dq.push({ code: "destination_no_mappings", tone: "warn", params: { destination: destinationNameAt(after, w.path) } });
    if (w.code === "conversion_browser_only") dq.push({ code: "conversion_browser_only", tone: "warn", params: { event: eventNameAt(after, w.path) } });
    if (w.code === "mapping_unknown_event") dq.push({ code: "mapping_unknown_event", tone: "warn", params: { destination: destinationNameAt(after, w.path), event: /"([^"]+)"/.exec(w.message)?.[1] ?? "" } });
  }
  for (const e of lint.errors) {
    if (e.code === "conversion_without_authoritative_source") dq.push({ code: "conversion_without_authoritative_source", tone: "bad", params: { event: eventNameAt(after, e.path) } });
  }
  if (consent.weaker) dq.push({ code: "consent_weaker", tone: "warn", params: {} });
  if (signals.includes("kill_switch")) dq.push({ code: after.settings.kill_switch ? "kill_switch_on" : "kill_switch_off", tone: after.settings.kill_switch ? "bad" : "info", params: {} });
  if (signals.includes("allowed_hosts_reduced") && before) dq.push({ code: "allowed_hosts_reduced", tone: "warn", params: { hosts: before.settings.allowed_hosts.filter((h) => !after.settings.allowed_hosts.includes(h)).join(", ") } });
  if (dq.length === 0) dq.push({ code: "no_rule_fired", tone: "ok", params: {} });

  return { events: eventsOut, destinations: destinationsOut, consent, volume, plan: planOut, dataQuality: dq, lint: { ok: lint.ok, errors: lint.errors, warnings: lint.warnings }, generatedAt: now.toISOString() };
}

function destinationNameAt(bundle: ConfigBundle, path: string): string {
  const i = Number(/^destinations\[(\d+)\]/.exec(path)?.[1]);
  return Number.isInteger(i) ? (bundle.destinations[i]?.name ?? path) : path;
}

function eventNameAt(bundle: ConfigBundle, path: string): string {
  const i = Number(/^events\[(\d+)\]/.exec(path)?.[1]);
  return Number.isInteger(i) ? (bundle.events[i]?.name ?? path) : path;
}

/** Destination names by id from both bundles, for labelling `destinations[<id>]` diff entries. */
export function destinationNames(before: ConfigBundle | null, after: ConfigBundle): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of before?.destinations ?? []) out[d.id] = d.name;
  for (const d of after.destinations) out[d.id] = d.name;
  return out;
}

/** Counts shown in the version detail: what a bundle switches on. */
export interface BundleFacts {
  eventsEnabled: number;
  eventsCritical: number;
  destinationsEnabled: string[];
  consentRegionMode: string;
  consentMode: string;
  respectGpc: boolean;
  clickIdTtlDays: number;
  allowedHosts: string[];
  killSwitch: boolean;
}

export function bundleFacts(bundle: ConfigBundle): BundleFacts {
  return {
    eventsEnabled: bundle.events.filter((e) => e.enabled).length,
    eventsCritical: bundle.events.filter((e) => e.enabled && e.critical).length,
    destinationsEnabled: bundle.destinations.filter((d) => d.enabled).map((d) => d.name),
    consentRegionMode: bundle.consent.default_region_mode,
    consentMode: bundle.consent.consent_mode.mode,
    respectGpc: bundle.consent.respect_gpc,
    clickIdTtlDays: bundle.consent.click_ids.ttl_days,
    allowedHosts: bundle.settings.allowed_hosts,
    killSwitch: bundle.settings.kill_switch,
  };
}

// ---------------------------------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------------------------------

/** Runs `fn` in a savepoint; a missing table or column (migration 0010 / 0007 / 0008 not applied) yields `null`. */
async function optional<T>(tx: Tx, what: string, fn: (sp: Tx) => Promise<T>): Promise<T | null> {
  try {
    return await tx.transaction(fn);
  } catch (e) {
    const code = pgErrorCode(e);
    if (code !== "42P01" && code !== "42703") throw e;
    logger.warn(`${what} unavailable (${code}): apply the pending migrations`);
    return null;
  }
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Names of the organization's members (author labels); ids outside the organization resolve to null. */
export async function memberDirectory(ctx: OrgContext): Promise<{ names: Record<string, string>; publishers: number }> {
  const rows = await db()
    .select({ id: member.userId, role: member.role, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.organization.id));
  const names: Record<string, string> = {};
  let publishers = 0;
  for (const r of rows) {
    names[r.id] = r.name;
    if (isOrgRole(r.role) && can(r.role, "config.publish")) publishers += 1;
  }
  return { names, publishers };
}

export interface ActiveVersionView {
  id: string;
  version: number;
  summary: string | null;
  publishedAt: string;
  publishedBy: string | null;
  publishedByName: string | null;
  kind: "publish" | "rollback";
}

export interface DraftSummaryView {
  id: string;
  baseVersion: number | null;
  nextVersion: number;
  lintOk: boolean;
  lintErrors: number;
  lintWarnings: number;
  changes: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  scheduleError: string | null;
  pendingApprovals: number;
}

export interface EnvironmentReleaseState {
  environment: WorkspaceEnvironment;
  active: ActiveVersionView | null;
  draft: DraftSummaryView | null;
  versions: number;
  /** false when migration 0010 is not applied (draft and approval data cannot be read) */
  available: boolean;
}

async function activePublication(tx: Tx, environmentId: string) {
  const rows = await tx
    .select({ version: configVersions, publishedAt: configPublications.publishedAt, publishedBy: configPublications.publishedBy, kind: configPublications.kind })
    .from(configPublications)
    .innerJoin(configVersions, eq(configVersions.id, configPublications.versionId))
    .where(and(eq(configPublications.environmentId, environmentId), eq(configPublications.isActive, true)))
    .orderBy(desc(configPublications.publishedAt))
    .limit(1);
  return rows[0] ?? null;
}

function toActive(row: NonNullable<Awaited<ReturnType<typeof activePublication>>>, names: Record<string, string>): ActiveVersionView {
  return { id: row.version.id, version: row.version.version, summary: row.version.summary, publishedAt: row.publishedAt.toISOString(), publishedBy: row.publishedBy, publishedByName: row.publishedBy ? (names[row.publishedBy] ?? null) : null, kind: row.kind };
}

/** Per environment of the site: what is live, what is being prepared, how many versions exist. */
export async function loadEnvironmentStates(ctx: OrgContext, site: WorkspaceSite, environments: WorkspaceEnvironment[], names: Record<string, string>): Promise<EnvironmentReleaseState[]> {
  return withOrg(ctx, async (tx) => {
    // one probe per request: the draft columns and the approvals table exist once migration 0010 is applied
    const available =
      (await optional(tx, "config_drafts (0010)", async (sp) => {
        await sp.select({ id: configDrafts.id, scheduledAt: configDrafts.scheduledAt }).from(configDrafts).limit(1);
        await sp.select({ id: configApprovals.id }).from(configApprovals).limit(1);
        return true;
      })) === true;
    const out: EnvironmentReleaseState[] = [];
    for (const environment of environments) {
      const active = await activePublication(tx, environment.id);
      const versionRows = await tx.select({ n: sql<number>`count(*)::int` }).from(configVersions).where(eq(configVersions.environmentId, environment.id));
      const versions = versionRows[0]?.n ?? 0;
      const draftRow = available ? await openDraft(tx, environment.id) : null;
      let draft: DraftSummaryView | null = null;
      if (draftRow) {
        const activeVersionNumber = active?.version.version ?? null;
        const [pendingRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(configApprovals).where(and(eq(configApprovals.draftId, draftRow.id), eq(configApprovals.decision, "pending")));
        const bundle = configBundleSchema.safeParse(draftRow.bundle);
        const before = active ? configBundleSchema.safeParse(active.version.bundle) : null;
        const changes = bundle.success ? diffBundles(before?.success ? before.data : null, bundle.data).length : 0;
        draft = {
          id: draftRow.id,
          baseVersion: activeVersionNumber,
          nextVersion: (activeVersionNumber ?? 0) + 1,
          lintOk: draftRow.lint ? draftRow.lint.errors.length === 0 : false,
          lintErrors: draftRow.lint?.errors.length ?? 0,
          lintWarnings: draftRow.lint?.warnings.length ?? 0,
          changes,
          createdBy: draftRow.createdBy,
          createdByName: draftRow.createdBy ? (names[draftRow.createdBy] ?? null) : null,
          createdAt: draftRow.createdAt.toISOString(),
          updatedAt: draftRow.updatedAt.toISOString(),
          scheduledAt: iso(draftRow.scheduledAt),
          scheduleError: draftRow.scheduleError,
          pendingApprovals: pendingRow?.n ?? 0,
        };
      }
      out.push({ environment, active: active ? toActive(active, names) : null, draft, versions, available });
    }
    return out;
  });
}

export interface TestRunView {
  id: string;
  journey: string;
  status: string;
  environmentId: string;
  environmentKind: EnvironmentKind | null;
  createdAt: string;
  sentAt: string | null;
  steps: number;
  error: string | null;
}

async function testRunsBetween(tx: Tx, site: WorkspaceSite, environments: WorkspaceEnvironment[], from: Date, to: Date | null, limit = 10): Promise<{ runs: TestRunView[]; available: boolean }> {
  const rows = await optional(tx, "test_lab_runs", (sp) =>
    sp
      .select()
      .from(testLabRuns)
      .where(and(eq(testLabRuns.siteId, site.id), gte(testLabRuns.createdAt, from), ...(to ? [lt(testLabRuns.createdAt, to)] : [])))
      .orderBy(desc(testLabRuns.createdAt))
      .limit(limit),
  );
  const envKind = new Map(environments.map((e) => [e.id, e.kind]));
  return {
    available: rows !== null,
    runs: (rows ?? []).map((r) => ({ id: r.id, journey: r.journey, status: r.status, environmentId: r.environmentId, environmentKind: envKind.get(r.environmentId) ?? null, createdAt: r.createdAt.toISOString(), sentAt: iso(r.sentAt), steps: r.steps.length, error: r.error })),
  };
}

export type ApprovalRow = typeof configApprovals.$inferSelect;

/** Serialisable approval for the UI and the four-eyes rule; `current` compares the frozen digest with the open draft. */
export function approvalView(a: ApprovalRow, names: Record<string, string>, currentDigest: string | null): ApprovalView {
  return {
    id: a.id,
    kind: a.kind,
    decision: a.decision,
    critical: a.critical,
    criticalReasons: a.criticalReasons,
    requestedBy: a.requestedBy,
    requestedByName: names[a.requestedBy] ?? null,
    requestNote: a.requestNote,
    approverId: a.approverId,
    approverName: a.approverId ? (names[a.approverId] ?? null) : null,
    reason: a.reason,
    current: currentDigest !== null && a.bundleDigest === currentDigest,
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
    decidedAt: iso(a.decidedAt),
  };
}

export interface DraftDetail {
  draft: DraftSummaryView & { scheduledBy: string | null; scheduledByName: string | null; scheduleAttemptedAt: string | null; scheduleApprovalId: string | null };
  digest: string;
  changes: ReadableChange[];
  destinationNames: Record<string, string>;
  lint: LintResult;
  impact: ImpactPreview;
  approvals: ApprovalView[];
  fourEyes: FourEyes;
  evidence: { runs: TestRunView[]; available: boolean };
  /** bundle parse failed (corrupt draft): nothing can be published */
  invalid: boolean;
}

/** Everything the draft panel and the impact preview need for the open draft of one environment. */
export async function loadDraftDetail(ctx: OrgContext, site: WorkspaceSite, environment: WorkspaceEnvironment, environments: WorkspaceEnvironment[], directory: { names: Record<string, string>; publishers: number }): Promise<DraftDetail | null> {
  const now = new Date();
  const plan = await planLimits(ctx);
  return withOrg(ctx, async (tx) => {
    const draftRow = await optional(tx, "config_drafts (0010)", (sp) => openDraft(sp, environment.id));
    if (!draftRow) return null;
    const parsed = configBundleSchema.safeParse(draftRow.bundle);
    const active = await activeVersion(tx, environment.id);
    const before = active ? configBundleSchema.parse(active.bundle) : null;
    const digest = configBundleDigest(draftRow.bundle);
    const approvalRows = (await optional(tx, "config_approvals", (sp) => sp.select().from(configApprovals).where(eq(configApprovals.draftId, draftRow.id)).orderBy(desc(configApprovals.createdAt)).limit(20))) ?? [];
    const approvals = approvalRows.map((a) => approvalView(a, directory.names, digest));
    const evidence = await testRunsBetween(tx, site, environments, draftRow.createdAt, null);
    const base = {
      id: draftRow.id,
      baseVersion: active?.version ?? null,
      nextVersion: (active?.version ?? 0) + 1,
      createdBy: draftRow.createdBy,
      createdByName: draftRow.createdBy ? (directory.names[draftRow.createdBy] ?? null) : null,
      createdAt: draftRow.createdAt.toISOString(),
      updatedAt: draftRow.updatedAt.toISOString(),
      scheduledAt: iso(draftRow.scheduledAt),
      scheduledBy: draftRow.scheduledBy,
      scheduledByName: draftRow.scheduledBy ? (directory.names[draftRow.scheduledBy] ?? null) : null,
      scheduleError: draftRow.scheduleError,
      scheduleAttemptedAt: iso(draftRow.scheduleAttemptedAt),
      scheduleApprovalId: draftRow.scheduleApprovalId,
      pendingApprovals: approvals.filter((a) => a.decision === "pending").length,
    };
    if (!parsed.success) {
      const lint: LintResult = { ok: false, errors: parsed.error.issues.map((i) => ({ code: "schema", path: i.path.join("."), message: i.message })), warnings: [] };
      const impact = buildImpactPreview({ before, after: before ?? defaultBundle(site.trackingId, environment.kind, site.primaryDomain), lint, window: { from: new Date(now.getTime() - IMPACT_WINDOW_DAYS * DAY), to: now }, volumes: null, lastBucketAt: null, integrations: [], health: {}, openIssues: [], plan: { planId: plan.planId, eventsPerMonth: plan.limits.eventsPerMonth }, usage: { periodKey: usagePeriodKey(now), billable: null }, now });
      return { draft: { ...base, lintOk: false, lintErrors: lint.errors.length, lintWarnings: 0, changes: 0 }, digest, changes: [], destinationNames: {}, lint, impact, approvals, fourEyes: evaluateFourEyes({ critical: false, reasons: [], publishers: directory.publishers, approvals }), evidence, invalid: true };
    }
    const preview = await preparePublish(tx, draftRow.id);
    const after = parsed.data;
    const reasons = criticalSignals(before, after);
    const critical = isCriticalChange(environment.kind, reasons);
    const fourEyes = evaluateFourEyes({ critical, reasons, publishers: directory.publishers, approvals });
    const impact = await impactFor(tx, ctx, site, environment, before, after, preview.lint, plan, now);
    return {
      draft: { ...base, lintOk: preview.lint.ok, lintErrors: preview.lint.errors.length, lintWarnings: preview.lint.warnings.length, changes: preview.diff.length },
      digest,
      changes: readableChanges(preview.diff),
      destinationNames: destinationNames(before, after),
      lint: preview.lint,
      impact,
      approvals,
      fourEyes,
      evidence,
      invalid: false,
    };
  });
}

async function impactFor(tx: Tx, ctx: OrgContext, site: WorkspaceSite, environment: WorkspaceEnvironment, before: ConfigBundle | null, after: ConfigBundle, lint: LintResult, plan: Awaited<ReturnType<typeof planLimits>>, now: Date): Promise<ImpactPreview> {
  const from = new Date(now.getTime() - IMPACT_WINDOW_DAYS * DAY);
  const aggregateRows = await optional(tx, "event_aggregates", (sp) =>
    sp
      .select({
        name: eventAggregates.eventName,
        accepted: sql<number>`coalesce(sum(${eventAggregates.accepted}), 0)::int`,
        delivered: sql<number>`coalesce(sum(${eventAggregates.delivered}), 0)::int`,
        failed: sql<number>`coalesce(sum(${eventAggregates.failed}), 0)::int`,
        billable: sql<number>`coalesce(sum(${eventAggregates.billable}), 0)::int`,
        lastEpoch: sql<number>`extract(epoch from max(${eventAggregates.bucketStart}))::double precision`,
      })
      .from(eventAggregates)
      .where(and(eq(eventAggregates.siteId, site.id), eq(eventAggregates.environmentId, environment.id), gte(eventAggregates.bucketStart, from)))
      .groupBy(eventAggregates.eventName),
  );
  const volumes: EventVolume[] | null = aggregateRows ? aggregateRows.map((r) => ({ name: r.name, accepted: Number(r.accepted), delivered: Number(r.delivered), failed: Number(r.failed), billable: Number(r.billable) })) : null;
  const lastEpoch = aggregateRows ? Math.max(0, ...aggregateRows.map((r) => Number(r.lastEpoch) || 0)) : 0;
  const integrationRows = await tx.select({ id: integrations.id, name: integrations.name, connectorType: integrations.connectorType, status: integrations.status }).from(integrations).where(eq(integrations.siteId, site.id));
  const healthRows = (await optional(tx, "destination_health_snapshots", (sp) => sp.select().from(destinationHealthSnapshots).where(eq(destinationHealthSnapshots.siteId, site.id)))) ?? [];
  const health: Record<string, DestinationHealthFacts> = {};
  for (const h of healthRows) {
    health[h.integrationId] = {
      errorRate: h.errorRate,
      attemptsSuccess: h.attemptsSuccess,
      attemptsFailed: h.attemptsFailed,
      lastSuccessAt: iso(h.lastSuccessAt),
      computedAt: h.computedAt.toISOString(),
      windowMinutes: h.windowMinutes,
      stale: now.getTime() - h.computedAt.getTime() > 3 * 60 * 60_000,
    };
  }
  const issueRows = await tx
    .select({ kind: dataQualityIssues.kind, severity: dataQualityIssues.severity, evidence: dataQualityIssues.evidence })
    .from(dataQualityIssues)
    .where(and(eq(dataQualityIssues.siteId, site.id), inArray(dataQualityIssues.status, ["open", "acknowledged"])))
    .limit(500);
  const eventNames = new Set([...after.events.map((e) => e.name), ...(before?.events ?? []).map((e) => e.name)]);
  const openIssues = issueRows.map((r) => {
    const fact = r.evidence?.facts?.event;
    const fromFacts = typeof fact === "string" ? fact : null;
    const fromKind = r.kind.split(":").find((part) => eventNames.has(part)) ?? null;
    return { event: fromFacts ?? fromKind, severity: r.severity };
  });
  const periodKey = usagePeriodKey(now);
  const usageRows = await tx.select({ billable: usagePeriods.billableEvents }).from(usagePeriods).where(and(eq(usagePeriods.organizationId, ctx.organization.id), eq(usagePeriods.periodKey, periodKey))).limit(1);
  return buildImpactPreview({
    before,
    after,
    lint,
    window: { from, to: now },
    volumes,
    lastBucketAt: lastEpoch > 0 ? new Date(lastEpoch * 1000) : null,
    integrations: integrationRows,
    health,
    openIssues,
    plan: { planId: plan.planId, eventsPerMonth: plan.limits.eventsPerMonth },
    usage: { periodKey, billable: usageRows[0] ? Number(usageRows[0].billable) : null },
    now,
  });
}

export interface VersionRowView {
  id: string;
  version: number;
  summary: string | null;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  changes: number;
  status: "active" | "superseded";
  /** a rollback was made away from this version at some point */
  rolledBack: boolean;
  /** this version was activated again by a rollback at some point */
  restored: boolean;
  publications: number;
  lastPublishedAt: string | null;
  scheduled: boolean;
  approved: boolean;
}

/** Version history of one environment (newest first) with publication facts from `config_publications`. */
export async function loadVersionHistory(ctx: OrgContext, site: WorkspaceSite, environment: WorkspaceEnvironment, names: Record<string, string>, limit = 50): Promise<VersionRowView[]> {
  return withOrg(ctx, async (tx) => {
    const versions = await listVersions(tx, environment.id, limit);
    if (versions.length === 0) return [];
    const ids = versions.map((v) => v.id);
    const pubs = await tx.select().from(configPublications).where(and(eq(configPublications.environmentId, environment.id), inArray(configPublications.versionId, ids))).orderBy(desc(configPublications.publishedAt));
    const draftIds = versions.map((v) => v.draftId).filter((d): d is string => Boolean(d));
    const drafts = draftIds.length ? ((await optional(tx, "config_drafts (0010)", (sp) => sp.select({ id: configDrafts.id, scheduledAt: configDrafts.scheduledAt }).from(configDrafts).where(inArray(configDrafts.id, draftIds)))) ?? []) : [];
    const scheduledDrafts = new Set(drafts.filter((d) => d.scheduledAt).map((d) => d.id));
    return versions.map((v) => {
      const own = pubs.filter((p) => p.versionId === v.id);
      return {
        id: v.id,
        version: v.version,
        summary: v.summary,
        createdAt: v.createdAt.toISOString(),
        createdBy: v.createdBy,
        createdByName: v.createdBy ? (names[v.createdBy] ?? null) : null,
        changes: Array.isArray(v.diff) ? v.diff.length : 0,
        status: own.some((p) => p.isActive) ? "active" : "superseded",
        rolledBack: pubs.some((p) => p.kind === "rollback" && p.rollbackOfVersionId === v.id),
        restored: own.some((p) => p.kind === "rollback"),
        publications: own.length,
        lastPublishedAt: iso(own[0]?.publishedAt),
        scheduled: v.draftId ? scheduledDrafts.has(v.draftId) : false,
        approved: own.some((p) => p.approvalId !== null),
      };
    });
  });
}

export interface PublicationView {
  id: string;
  kind: "publish" | "rollback";
  isActive: boolean;
  publishedAt: string;
  supersededAt: string | null;
  publishedBy: string | null;
  publishedByName: string | null;
  approvalId: string | null;
  rollbackOfVersion: number | null;
}

export interface ObservedAfterPublish {
  /** events stored with this config version since its first publication (capped at the last 30 days) */
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  since: string;
}

export interface VersionDetail {
  id: string;
  version: number;
  summary: string | null;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  digest: string;
  keyId: string;
  environment: WorkspaceEnvironment;
  status: "active" | "superseded";
  activeVersion: number | null;
  previousVersion: number | null;
  changes: ReadableChange[];
  destinationNames: Record<string, string>;
  facts: BundleFacts;
  publications: PublicationView[];
  approvals: ApprovalView[];
  evidence: { runs: TestRunView[]; available: boolean; observed: ObservedAfterPublish | null };
  scheduledAt: string | null;
  fourEyesReasons: CriticalReason[];
}

/** One published version: readable diff against its predecessor, publications, approvals and evidence. */
export async function loadVersionDetail(ctx: OrgContext, site: WorkspaceSite, environments: WorkspaceEnvironment[], versionId: string, names: Record<string, string>): Promise<VersionDetail | null> {
  if (!UUID.test(versionId)) return null;
  const now = new Date();
  return withOrg(ctx, async (tx) => {
    const [row] = await tx.select().from(configVersions).where(and(eq(configVersions.id, versionId), eq(configVersions.siteId, site.id))).limit(1);
    if (!row) return null;
    const environment = environments.find((e) => e.id === row.environmentId);
    if (!environment) return null;
    const bundle = configBundleSchema.parse(row.bundle);
    const [previous] = await tx.select().from(configVersions).where(and(eq(configVersions.environmentId, row.environmentId), lt(configVersions.version, row.version))).orderBy(desc(configVersions.version)).limit(1);
    const before = previous ? configBundleSchema.parse(previous.bundle) : null;
    const diff = (Array.isArray(row.diff) && row.diff.length ? (row.diff as DiffEntry[]) : compareVersions(previous ?? null, row)) as DiffEntry[];
    const active = await activeVersion(tx, row.environmentId);
    const pubs = await tx.select().from(configPublications).where(and(eq(configPublications.environmentId, row.environmentId), eq(configPublications.versionId, row.id))).orderBy(desc(configPublications.publishedAt));
    const rollbackOf = new Map<string, number>();
    const rollbackIds = pubs.map((p) => p.rollbackOfVersionId).filter((x): x is string => Boolean(x));
    if (rollbackIds.length) for (const v of await tx.select({ id: configVersions.id, version: configVersions.version }).from(configVersions).where(inArray(configVersions.id, rollbackIds))) rollbackOf.set(v.id, v.version);
    const approvalRows =
      (await optional(tx, "config_approvals", (sp) =>
        sp
          .select()
          .from(configApprovals)
          .where(row.draftId ? or(eq(configApprovals.versionId, row.id), eq(configApprovals.draftId, row.draftId)) : eq(configApprovals.versionId, row.id))
          .orderBy(desc(configApprovals.createdAt))
          .limit(20),
      )) ?? [];
    const draft = row.draftId ? await optional(tx, "config_drafts (0010)", async (sp) => (await sp.select({ createdAt: configDrafts.createdAt, scheduledAt: configDrafts.scheduledAt }).from(configDrafts).where(eq(configDrafts.id, row.draftId!)).limit(1))[0] ?? null) : null;
    const evidenceFrom = draft?.createdAt ?? previous?.createdAt ?? new Date(row.createdAt.getTime() - 7 * DAY);
    const evidence = await testRunsBetween(tx, site, environments, evidenceFrom, row.createdAt);
    const firstPublishedAt = pubs.length ? pubs[pubs.length - 1]!.publishedAt : row.createdAt;
    const since = new Date(Math.max(firstPublishedAt.getTime(), now.getTime() - 30 * DAY));
    const observedRows = await optional(tx, "events", (sp) =>
      sp
        .select({ n: sql<number>`count(*)::int`, first: sql<number>`extract(epoch from min(${events.serverTs}))::double precision`, last: sql<number>`extract(epoch from max(${events.serverTs}))::double precision` })
        .from(events)
        .where(and(eq(events.siteId, site.id), eq(events.environmentId, row.environmentId), eq(events.configVersion, row.version), gte(events.serverTs, since))),
    );
    const observedRow = observedRows?.[0] ?? null;
    const observed: ObservedAfterPublish | null = observedRow ? { count: Number(observedRow.n), firstAt: observedRow.first ? new Date(Number(observedRow.first) * 1000).toISOString() : null, lastAt: observedRow.last ? new Date(Number(observedRow.last) * 1000).toISOString() : null, since: since.toISOString() } : null;
    return {
      id: row.id,
      version: row.version,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      createdByName: row.createdBy ? (names[row.createdBy] ?? null) : null,
      digest: row.digest,
      keyId: row.keyId,
      environment,
      status: active?.id === row.id ? "active" : "superseded",
      activeVersion: active?.version ?? null,
      previousVersion: previous?.version ?? null,
      changes: readableChanges(diff),
      destinationNames: destinationNames(before, bundle),
      facts: bundleFacts(bundle),
      publications: pubs.map((p) => ({ id: p.id, kind: p.kind, isActive: p.isActive, publishedAt: p.publishedAt.toISOString(), supersededAt: iso(p.supersededAt), publishedBy: p.publishedBy, publishedByName: p.publishedBy ? (names[p.publishedBy] ?? null) : null, approvalId: p.approvalId, rollbackOfVersion: p.rollbackOfVersionId ? (rollbackOf.get(p.rollbackOfVersionId) ?? null) : null })),
      // a published version has no "current draft content": approvals are shown as history, never as current
      approvals: approvalRows.map((a) => approvalView(a, names, null)),
      evidence: { ...evidence, observed },
      scheduledAt: iso(draft?.scheduledAt),
      fourEyesReasons: criticalSignals(before, bundle),
    };
  });
}

/** The environment the release center focuses on: `?env=` when it belongs to the site, else the workspace environment. */
export function selectEnvironment(environments: WorkspaceEnvironment[], preferred: WorkspaceEnvironment | null, requested: string | undefined): WorkspaceEnvironment | null {
  if (requested && UUID.test(requested)) {
    const match = environments.find((e) => e.id === requested);
    if (match) return match;
  }
  return preferred ?? environments.find((e) => e.isDefault) ?? environments[0] ?? null;
}
