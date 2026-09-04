import { DEMO_CONFIG_VERSION, DEMO_INITIAL_REVEAL, DEMO_MAX_ROWS, DEMO_PLATFORMS_FIXTURE, DEMO_SCRIPT, demoTimeLabel, type DemoScriptEvent } from "./fixtures";
import { DEMO_HEALTH_PARTS, type DemoConsent, type DemoCurrency, type DemoDedup, type DemoEventName, type DemoHealthPart, type DemoHealthTone, type DemoOrigin, type DemoOutcome, type DemoPlatformId, type DemoReason, type DemoViewId } from "./model";

/**
 * State machine of the hero demo. Pure functions only (no React, no DOM, no clock): the player
 * dispatches `advance` on a schedule, the UI dispatches the rest. Every number shown in the demo is
 * derived here from the fixed script, so it is explainable and identical for every visitor.
 */

export interface DemoEventRecord {
  key: string;
  seq: number;
  time: string;
  name: DemoEventName;
  origin: DemoOrigin;
  eventId: string;
  dedup: DemoDedup;
  consent: DemoConsent;
  value?: number;
  currency: DemoCurrency | null;
  orderId?: string;
  routes: readonly DemoPlatformId[];
  outcome: DemoOutcome;
  reason: DemoReason;
  /** Destinations the event actually reached. */
  destinations: readonly DemoPlatformId[];
  clickId?: DemoPlatformId;
}

/** Cumulative counters (they keep counting after old rows fall off the retained window). */
export interface DemoStats {
  accepted: number;
  delivered: number;
  duplicates: number;
  blocked: number;
  heldConsent: number;
  heldCurrency: number;
  conversions: number;
  pairedConversions: number;
  purchases: number;
  purchasesWithCurrency: number;
}

export type DemoSetupStatus = "open" | "chosen" | "confirmed";

export interface DemoState {
  view: DemoViewId;
  platform: DemoPlatformId;
  /** Key of the expanded stream row, if any. */
  expanded: string | null;
  playing: boolean;
  cursor: number;
  cycle: number;
  seq: number;
  events: readonly DemoEventRecord[];
  stats: DemoStats;
  defaultCurrency: DemoCurrency | null;
  setup: { status: DemoSetupStatus; choice: DemoCurrency | null; released: number };
  configVersion: number;
  /** Incremented on every reset so the UI can key one-off announcements. */
  resets: number;
}

export type DemoAction =
  | { type: "view"; view: DemoViewId }
  | { type: "platform"; platform: DemoPlatformId }
  | { type: "expand"; key: string | null }
  | { type: "advance" }
  | { type: "play"; playing: boolean }
  | { type: "choose"; currency: DemoCurrency }
  | { type: "confirm" }
  | { type: "reset" };

const EMPTY_STATS: DemoStats = { accepted: 0, delivered: 0, duplicates: 0, blocked: 0, heldConsent: 0, heldCurrency: 0, conversions: 0, pairedConversions: 0, purchases: 0, purchasesWithCurrency: 0 };

const EMPTY_STATE: DemoState = {
  view: "overview",
  platform: "meta",
  expanded: null,
  playing: true,
  cursor: 0,
  cycle: 0,
  seq: 0,
  events: [],
  stats: EMPTY_STATS,
  defaultCurrency: null,
  setup: { status: "open", choice: null, released: 0 },
  configVersion: DEMO_CONFIG_VERSION,
  resets: 0,
};

function isConversion(name: DemoEventName): boolean {
  return name === "Purchase" || name === "Lead";
}

/** Decide what happens to the next scripted event given the current configuration. */
function reveal(state: DemoState, script: DemoScriptEvent): { record: DemoEventRecord; stats: DemoStats } {
  const stats = { ...state.stats };
  const seq = state.seq + 1;
  const currency: DemoCurrency | null = script.currency ?? (script.name === "Purchase" ? state.defaultCurrency : null);
  const base = {
    key: `${script.key}#${state.cycle}`,
    seq,
    time: demoTimeLabel(seq),
    name: script.name,
    origin: script.origin,
    eventId: script.eventId,
    dedup: script.dedup,
    consent: script.consent,
    value: script.value,
    currency,
    orderId: script.orderId,
    routes: script.routes,
    clickId: script.clickId,
  };
  let outcome: DemoOutcome;
  let reason: DemoReason;
  let destinations: readonly DemoPlatformId[] = [];
  if (script.dedup === "duplicate") {
    stats.duplicates += 1;
    outcome = "duplicate";
    reason = "duplicate";
  } else {
    stats.accepted += 1;
    if (isConversion(script.name)) {
      stats.conversions += 1;
      if (script.dedup === "paired") stats.pairedConversions += 1;
    }
    if (script.name === "Purchase") {
      stats.purchases += 1;
      if (currency) stats.purchasesWithCurrency += 1;
    }
    if (script.consent === "denied") {
      stats.blocked += 1;
      outcome = "blocked";
      reason = "consent_denied";
    } else if (script.consent === "pending") {
      stats.heldConsent += 1;
      outcome = "held";
      reason = "consent_pending";
    } else if (script.name === "Purchase" && !currency) {
      stats.heldCurrency += 1;
      outcome = "held";
      reason = "missing_currency";
    } else {
      stats.delivered += 1;
      outcome = "delivered";
      reason = "delivered";
      destinations = script.routes;
    }
  }
  return { record: { ...base, outcome, reason, destinations }, stats };
}

function advance(state: DemoState): DemoState {
  const script = DEMO_SCRIPT[state.cursor];
  if (!script) return state;
  const { record, stats } = reveal(state, script);
  const events = [...state.events, record];
  const trimmed = events.length > DEMO_MAX_ROWS ? events.slice(events.length - DEMO_MAX_ROWS) : events;
  const next = state.cursor + 1;
  const wrap = next >= DEMO_SCRIPT.length;
  return { ...state, events: trimmed, stats, seq: record.seq, cursor: wrap ? 0 : next, cycle: wrap ? state.cycle + 1 : state.cycle, expanded: state.expanded && trimmed.some((e) => e.key === state.expanded) ? state.expanded : null };
}

/** Apply the confirmed default currency: held Purchases are released and future ones are complete. */
function confirm(state: DemoState): DemoState {
  const currency = state.setup.choice;
  if (state.setup.status !== "chosen" || !currency) return state;
  const released = state.stats.heldCurrency;
  const events = state.events.map((e) => (e.reason === "missing_currency" ? { ...e, currency, outcome: "delivered" as const, reason: "released" as const, destinations: e.routes } : e));
  const stats: DemoStats = { ...state.stats, heldCurrency: 0, delivered: state.stats.delivered + released, purchasesWithCurrency: state.stats.purchases };
  return { ...state, events, stats, defaultCurrency: currency, setup: { status: "confirmed", choice: currency, released }, configVersion: DEMO_CONFIG_VERSION + 1 };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "view":
      return state.view === action.view ? state : { ...state, view: action.view };
    case "platform":
      return state.platform === action.platform ? state : { ...state, platform: action.platform };
    case "expand":
      return state.expanded === action.key ? state : { ...state, expanded: action.key };
    case "advance":
      return advance(state);
    case "play":
      return state.playing === action.playing ? state : { ...state, playing: action.playing };
    case "choose":
      if (state.setup.status === "confirmed") return state;
      return { ...state, setup: { ...state.setup, status: "chosen", choice: action.currency } };
    case "confirm":
      return confirm(state);
    case "reset":
      return { ...createInitialState(), resets: state.resets + 1 };
    default:
      return state;
  }
}

/** The start state: the first `DEMO_INITIAL_REVEAL` script events are already visible (the static placeholder renders exactly this). */
export function createInitialState(): DemoState {
  let state = EMPTY_STATE;
  for (let i = 0; i < DEMO_INITIAL_REVEAL; i += 1) state = advance(state);
  return state;
}

/* ------------------------------------------------------------------ selectors */

export interface DemoMetrics {
  accepted: number;
  delivered: number;
  duplicates: number;
  blocked: number;
  held: number;
}

export function demoMetrics(state: DemoState): DemoMetrics {
  const s = state.stats;
  return { accepted: s.accepted, delivered: s.delivered, duplicates: s.duplicates, blocked: s.blocked, held: s.heldConsent + s.heldCurrency };
}

export interface HealthPartValue {
  id: DemoHealthPart;
  /** 0–100 */
  value: number;
  tone: DemoHealthTone;
  /** Placeholders for the explanation sentence in the copy. */
  vars: Record<string, number>;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 100 : Math.round((100 * numerator) / denominator);
}

function toneFor(value: number): DemoHealthTone {
  return value >= 90 ? "ok" : value >= 60 ? "warn" : "bad";
}

/** The four explainable parts of the Tracking Health Score, each with the numbers behind it. */
export function healthParts(state: DemoState): HealthPartValue[] {
  const s = state.stats;
  const decided = s.accepted - s.heldConsent;
  const routable = s.delivered + s.heldCurrency;
  const values: Record<DemoHealthPart, HealthPartValue> = {
    consent: { id: "consent", value: ratio(decided, s.accepted), tone: "ok", vars: { decided, accepted: s.accepted, pending: s.heldConsent } },
    dedup: { id: "dedup", value: ratio(s.pairedConversions, s.conversions), tone: "ok", vars: { paired: s.pairedConversions, conversions: s.conversions, single: s.conversions - s.pairedConversions } },
    params: { id: "params", value: ratio(s.purchasesWithCurrency, s.purchases), tone: "ok", vars: { complete: s.purchasesWithCurrency, purchases: s.purchases, missing: s.purchases - s.purchasesWithCurrency } },
    delivery: { id: "delivery", value: ratio(s.delivered, routable), tone: "ok", vars: { delivered: s.delivered, routable, held: s.heldCurrency } },
  };
  return DEMO_HEALTH_PARTS.map((id) => ({ ...values[id], tone: toneFor(values[id].value) }));
}

export function healthScore(parts: readonly HealthPartValue[]): { score: number; tone: DemoHealthTone } {
  if (parts.length === 0) return { score: 100, tone: "ok" };
  const score = Math.round(parts.reduce((sum, p) => sum + p.value, 0) / parts.length);
  return { score, tone: toneFor(score) };
}

export interface DestinationStatus {
  id: DemoPlatformId;
  tone: DemoHealthTone;
  delivered: number;
  heldCurrency: number;
  blocked: number;
  lastDelivery: DemoEventRecord | null;
}

/** Health of one destination derived from the retained rows (delivered = reached it; held = waits for the currency fix). */
export function destinationStatus(state: DemoState, id: DemoPlatformId): DestinationStatus {
  let delivered = 0;
  let heldCurrency = 0;
  let blocked = 0;
  let lastDelivery: DemoEventRecord | null = null;
  for (const e of state.events) {
    if (!e.routes.includes(id)) continue;
    if (e.outcome === "delivered") {
      delivered += 1;
      lastDelivery = e;
    } else if (e.reason === "missing_currency") heldCurrency += 1;
    else if (e.outcome === "blocked") blocked += 1;
  }
  return { id, tone: heldCurrency > 0 ? "warn" : "ok", delivered, heldCurrency, blocked, lastDelivery };
}

export function destinationStatuses(state: DemoState): DestinationStatus[] {
  return DEMO_PLATFORMS_FIXTURE.map((p) => destinationStatus(state, p.id));
}

export interface AttributionRow {
  id: DemoPlatformId;
  captured: boolean;
  consent: DemoConsent | null;
  forwarded: boolean;
}

/** Click-id observations per platform: only what the retained rows actually carried; nothing is modelled. */
export function attributionRows(state: DemoState): AttributionRow[] {
  return DEMO_PLATFORMS_FIXTURE.map((p) => {
    const hit = [...state.events].reverse().find((e) => e.clickId === p.id);
    if (!hit) return { id: p.id, captured: false, consent: null, forwarded: false };
    return { id: p.id, captured: true, consent: hit.consent, forwarded: hit.consent === "granted" && hit.outcome !== "blocked" };
  });
}

export interface AiRecommendation {
  /** Held Purchases without currency (cumulative). */
  count: number;
  /** The retained held rows as evidence. */
  evidence: DemoEventRecord[];
}

/** The one recommendation of the demo, grounded in the fixture: Purchases arrive without `currency`. */
export function aiRecommendation(state: DemoState): AiRecommendation {
  return { count: state.stats.heldCurrency, evidence: state.events.filter((e) => e.reason === "missing_currency") };
}

/** Rows for the stream, newest first, limited to `limit`. */
export function recentEvents(state: DemoState, limit: number): DemoEventRecord[] {
  return state.events.slice(-limit).reverse();
}

export function latestEvent(state: DemoState): DemoEventRecord | null {
  return state.events[state.events.length - 1] ?? null;
}
