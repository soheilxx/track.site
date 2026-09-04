import { redactDeep } from "@track-site/core";
import type { LineageOutcome, LineageStage, TestLabJourney, TestLabStep } from "@track-site/db/schema";
import { getStandardEvent, type ConsentPurpose, type IncomingServerEvent } from "@track-site/events";

/**
 * Pure helpers of the Events module (coverage matrix, Live Event Explorer, Live Test Lab): lineage
 * timelines, display redaction, required-parameter checks, freshness cells and the controlled test
 * journeys. No I/O here so everything is unit-tested; `events.ts` does the queries.
 */

// ---------------------------------------------------------------------------------------------------
// Lineage timeline
// ---------------------------------------------------------------------------------------------------

export const STAGE_ORDER: readonly LineageStage[] = ["captured", "accepted", "normalized", "policy", "deduplicated", "routed", "delivered"];

export type StepTone = "ok" | "warn" | "bad" | "info" | "neutral";

export interface LineageRowLike {
  stage: LineageStage;
  outcome: LineageOutcome;
  reason: string | null;
  integrationId: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface EventLike {
  event_id: string;
  server_ts: string;
  processing_state: string;
  drop_reason: string | null;
  deliveries: Record<string, { status: string; at: string; attempts: number }> | null;
}

export interface AttemptLike {
  integrationId: string;
  attempt: number;
  status: string;
  errorClass: string;
  errorCode: string | null;
  httpStatus: number | null;
  at: string;
}

export interface TimelineStep {
  stage: LineageStage | "rejected";
  outcome: LineageOutcome | "pending" | "unknown";
  tone: StepTone;
  /** ISO time; null when the stage is only implied by the stored state (no timestamp recorded) */
  at: string | null;
  reason: string | null;
  integrationId: string | null;
  detail: Record<string, unknown>;
  /** true when derived from the event row / delivery attempts rather than a recorded lineage row */
  derived: boolean;
}

const BAD_OUTCOMES = new Set<string>(["blocked", "rejected", "failed", "dead"]);
const WARN_OUTCOMES = new Set<string>(["duplicate", "skipped", "retry"]);
const OK_OUTCOMES = new Set<string>(["ok", "unique", "delivered"]);

export function toneForOutcome(outcome: string): StepTone {
  if (OK_OUTCOMES.has(outcome)) return "ok";
  if (BAD_OUTCOMES.has(outcome)) return "bad";
  if (WARN_OUTCOMES.has(outcome)) return "warn";
  if (outcome === "none") return "info";
  return "neutral";
}

function step(stage: TimelineStep["stage"], outcome: TimelineStep["outcome"], at: string | null, extra: Partial<TimelineStep> = {}): TimelineStep {
  return { stage, outcome, tone: toneForOutcome(outcome), at, reason: null, integrationId: null, detail: {}, derived: false, ...extra };
}

const STAGE_INDEX = new Map<string, number>(STAGE_ORDER.map((s, i) => [s, i]));

/**
 * Merges recorded lineage rows with what the stored event and its delivery attempts imply. Recorded
 * rows win; stages the state implies but nobody recorded are added as `derived` with `at: null`
 * (never a guessed time). A blocked/rejected/duplicate stage ends the flow with a `rejected` marker.
 */
export function buildTimeline(event: EventLike | null, lineage: LineageRowLike[], attempts: AttemptLike[]): TimelineStep[] {
  const steps: TimelineStep[] = lineage.map((row) => step(row.stage, row.outcome, row.occurredAt, { reason: row.reason, integrationId: row.integrationId, detail: row.detail }));
  const has = (stage: LineageStage) => steps.some((s) => s.stage === stage);

  if (event) {
    const state = event.processing_state;
    const blockedByPolicy = state === "policy_blocked" || state === "rejected";
    const stored = !blockedByPolicy;
    if (!has("captured")) steps.push(step("captured", "ok", event.server_ts, { derived: true }));
    if (!has("accepted")) steps.push(step("accepted", "ok", null, { derived: true }));
    if (!has("normalized")) steps.push(step("normalized", "ok", null, { derived: true }));
    if (!has("policy")) steps.push(step("policy", blockedByPolicy ? "blocked" : "ok", null, { derived: true, reason: blockedByPolicy ? event.drop_reason : null }));
    if (stored && !has("deduplicated")) {
      const dup = state === "deduplicated";
      steps.push(step("deduplicated", dup ? "duplicate" : "unique", null, { derived: true, reason: dup ? event.drop_reason : null }));
    }
    const deliveries = Object.entries(event.deliveries ?? {});
    if (stored && state !== "deduplicated" && !has("routed")) {
      if (deliveries.length === 0) steps.push(step("routed", state === "routed" || state === "delivered" ? "ok" : "none", null, { derived: true }));
      else for (const [integrationId] of deliveries) steps.push(step("routed", "ok", null, { derived: true, integrationId }));
    }
    if (!has("delivered")) {
      if (attempts.length) {
        for (const a of attempts) {
          const outcome: TimelineStep["outcome"] = a.status === "success" ? "delivered" : a.status === "retry" ? "retry" : a.status === "dead" ? "dead" : a.status === "skipped" ? "skipped" : a.status === "pending" ? "pending" : "failed";
          steps.push(step("delivered", outcome, a.at, { derived: true, integrationId: a.integrationId, reason: a.status === "success" ? null : (a.errorCode ?? a.errorClass), detail: { attempt: a.attempt, http_status: a.httpStatus, error_class: a.errorClass } }));
        }
      } else {
        for (const [integrationId, d] of deliveries) {
          const outcome: TimelineStep["outcome"] = d.status === "delivered" ? "delivered" : d.status === "failed" ? "failed" : d.status === "skipped" ? "skipped" : "pending";
          steps.push(step("delivered", outcome, d.at ?? null, { derived: true, integrationId, detail: { attempts: d.attempts } }));
        }
      }
    }
  }

  steps.sort((a, b) => {
    const sa = STAGE_INDEX.get(a.stage) ?? 99;
    const sb = STAGE_INDEX.get(b.stage) ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
    return 0;
  });

  const terminal = steps.find((s) => (s.stage === "accepted" && s.outcome === "rejected") || (s.stage === "policy" && s.outcome === "blocked") || (s.stage === "deduplicated" && s.outcome === "duplicate"));
  if (terminal) {
    const idx = steps.indexOf(terminal);
    const kept = steps.slice(0, idx + 1);
    kept.push(step("rejected", terminal.outcome, terminal.at, { reason: terminal.reason, derived: terminal.derived, detail: terminal.detail }));
    return kept;
  }
  return steps;
}

/** One-line state of a timeline: the last meaningful step. */
export function timelineSummary(steps: TimelineStep[]): { stage: TimelineStep["stage"]; outcome: TimelineStep["outcome"]; tone: StepTone; reason: string | null } {
  const last = steps[steps.length - 1];
  if (!last) return { stage: "captured", outcome: "pending", tone: "neutral", reason: null };
  const delivered = steps.filter((s) => s.stage === "delivered");
  if (delivered.length) {
    const failed = delivered.find((s) => s.tone === "bad");
    const worst = failed ?? delivered.find((s) => s.tone === "warn") ?? delivered[0]!;
    return { stage: "delivered", outcome: worst.outcome, tone: worst.tone, reason: worst.reason };
  }
  return { stage: last.stage, outcome: last.outcome, tone: last.tone, reason: last.reason };
}

// ---------------------------------------------------------------------------------------------------
// Display redaction
// ---------------------------------------------------------------------------------------------------

/** Keeps the last four characters of an identifier: enough to compare, never enough to re-identify. */
export function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? "…" : `…${value.slice(-4)}`;
}

/** Click ids: parameter name + the first six characters, the rest masked. */
export function maskClickId(value: string): string {
  return value.length <= 6 ? "…" : `${value.slice(0, 6)}…`;
}

/** Redacts every string of a JSON-like value (payload previews, vendor responses, error messages). */
export function redactForDisplay<T>(value: T): T {
  return redactDeep(value);
}

/** Hashed user data is never shown; only which fields were present. */
export function presentUserDataFields(userData: Record<string, string | null> | null | undefined): string[] {
  if (!userData) return [];
  return Object.entries(userData)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k]) => k);
}

// ---------------------------------------------------------------------------------------------------
// Coverage helpers
// ---------------------------------------------------------------------------------------------------

export type CellStatus = "ok" | "warn" | "bad" | "info" | "none" | "unknown";

export const CELL_TONE: Record<CellStatus, StepTone> = { ok: "ok", warn: "warn", bad: "bad", info: "info", none: "neutral", unknown: "neutral" };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Freshness of a source: seen within a day → ok, within the window → stale, never → bad when expected, otherwise none. */
export function freshnessStatus(lastAt: string | null, now: Date, expected: boolean, windowMs = 7 * DAY): { status: CellStatus; message: "fresh" | "stale" | "missing" | "notExpected" } {
  if (lastAt) {
    const age = now.getTime() - new Date(lastAt).getTime();
    if (age <= DAY) return { status: "ok", message: "fresh" };
    if (age <= windowMs) return { status: "warn", message: "stale" };
    return { status: "warn", message: "stale" };
  }
  return expected ? { status: "bad", message: "missing" } : { status: "none", message: "notExpected" };
}

const COMMERCE_PARAMS = new Set(["order_id", "currency", "value", "items", "transaction_id", "tax", "shipping", "coupon", "quantity", "discount"]);

export function requiredParamsFor(name: string): string[] {
  return getStandardEvent(name)?.requiredParams ?? [];
}

export interface ParamSample {
  props: Record<string, unknown> | null;
  commerce: Record<string, unknown> | null;
}

export interface RequiredParamsCheck {
  required: string[];
  sampled: number;
  /** param → number of sampled events where it was missing or empty */
  missing: Record<string, number>;
}

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Checks the standard event's required parameters against recent stored events (props or commerce block). */
export function checkRequiredParams(name: string, samples: ParamSample[]): RequiredParamsCheck {
  const required = requiredParamsFor(name);
  const missing: Record<string, number> = {};
  for (const p of required) {
    let n = 0;
    for (const s of samples) {
      const inCommerce = COMMERCE_PARAMS.has(p) && present(s.commerce?.[p]);
      const inProps = present(s.props?.[p]);
      if (!inCommerce && !inProps) n++;
    }
    if (n > 0) missing[p] = n;
  }
  return { required, sampled: samples.length, missing };
}

export function requiredParamsStatus(check: RequiredParamsCheck): CellStatus {
  if (check.required.length === 0) return "none";
  if (check.sampled === 0) return "unknown";
  const missing = Object.keys(check.missing);
  if (missing.length === 0) return "ok";
  const allMissing = missing.some((p) => check.missing[p] === check.sampled);
  return allMissing ? "bad" : "warn";
}

/** Consent cell: blocked share of received events (0 → ok, some → info, majority → warn, nothing measured → unknown). */
export function consentStatus(received: number, blocked: number): CellStatus {
  if (received <= 0) return "unknown";
  if (blocked === 0) return "ok";
  return blocked / received > 0.5 ? "warn" : "info";
}

export const CONSENT_DROP_REASONS = ["consent_missing", "consent_denied", "gpc_opt_out", "purpose_not_granted"] as const;

// ---------------------------------------------------------------------------------------------------
// Live Test Lab journeys
// ---------------------------------------------------------------------------------------------------

export type TestConsentChoice = "all" | "analytics" | "none";
export const TEST_CONSENT_CHOICES: readonly TestConsentChoice[] = ["all", "analytics", "none"];

export interface JourneyStepSpec {
  /** step label key; `duplicate_purchase` re-sends the order id with a fresh event id */
  kind: string;
  name: string;
}

/** Canonical events per guided journey (supplement §8 module 5: PageView, Lead, AddToCart, Checkout, Purchase). */
export const JOURNEY_STEPS: Record<TestLabJourney, readonly JourneyStepSpec[]> = {
  page_view: [{ kind: "page_view", name: "page_view" }],
  lead: [
    { kind: "page_view", name: "page_view" },
    { kind: "generate_lead", name: "generate_lead" },
  ],
  add_to_cart: [
    { kind: "page_view", name: "page_view" },
    { kind: "view_item", name: "view_item" },
    { kind: "add_to_cart", name: "add_to_cart" },
  ],
  checkout: [
    { kind: "page_view", name: "page_view" },
    { kind: "view_item", name: "view_item" },
    { kind: "add_to_cart", name: "add_to_cart" },
    { kind: "begin_checkout", name: "begin_checkout" },
  ],
  purchase: [
    { kind: "page_view", name: "page_view" },
    { kind: "begin_checkout", name: "begin_checkout" },
    { kind: "purchase", name: "purchase" },
    { kind: "duplicate_purchase", name: "purchase" },
  ],
};

export function consentForChoice(choice: TestConsentChoice): { granted: ConsentPurpose[]; source: "api" | "default"; region: string } {
  if (choice === "all") return { granted: ["necessary", "analytics", "marketing"], source: "api", region: "DE" };
  if (choice === "analytics") return { granted: ["necessary", "analytics"], source: "api", region: "DE" };
  return { granted: ["necessary"], source: "default", region: "DE" };
}

export interface JourneyBuildOptions {
  runId: string;
  /** host of the site (primary domain) used for the synthetic page URLs */
  host: string;
  currency: string;
  now: Date;
  /** ULID factory (injected for deterministic tests) */
  ids: () => string;
}

const TEST_ITEM = (currency: string) => ({ item_id: "TRACK-TEST-SKU-1", item_name: "Track test product", price: 19.9, quantity: 1, currency });

/**
 * Builds the controlled server events of a journey. Everything is synthetic and clearly marked
 * (`props.test`, `props.test_lab_run`): no user data, a test order id derived from the run, one test
 * product. The duplicate purchase keeps the order id and gets a new event id so the conversion dedup
 * (order id) — not the event-id dedup — is exercised.
 */
export function buildJourneyEvents(journey: TestLabJourney, choice: TestConsentChoice, opts: JourneyBuildOptions): { steps: TestLabStep[]; events: IncomingServerEvent[] } {
  const consent = consentForChoice(choice);
  const orderId = `TESTLAB-${opts.runId.slice(-8)}`;
  const item = TEST_ITEM(opts.currency);
  const steps: TestLabStep[] = [];
  const events: IncomingServerEvent[] = [];
  const ts = opts.now.getTime();
  JOURNEY_STEPS[journey].forEach((spec, i) => {
    const id = opts.ids();
    steps.push({ sourceEventId: id, name: spec.name, kind: spec.kind });
    const base: IncomingServerEvent = {
      id,
      name: spec.name,
      ts: ts + i,
      props: { test: true, test_lab_run: opts.runId, journey, step: spec.kind },
      page: { url: `https://${opts.host}/track-test-lab/${spec.kind}`, title: "Track Live Test Lab" },
      ids: { anonymous_id: `testlab_${opts.runId}` },
      consent: { granted: consent.granted, source: consent.source, policy_version: null, ts, region: consent.region, gpc: false },
      source: "server",
      source_verified: false,
    };
    if (spec.name === "generate_lead") base.props = { ...base.props, lead_type: "test" };
    if (spec.name === "view_item" || spec.name === "add_to_cart" || spec.name === "begin_checkout") base.commerce = { currency: opts.currency, value: 19.9, items: [item] };
    if (spec.name === "purchase") base.commerce = { order_id: orderId, currency: opts.currency, value: 19.9, items: [item] };
    events.push(base);
  });
  return { steps, events };
}
