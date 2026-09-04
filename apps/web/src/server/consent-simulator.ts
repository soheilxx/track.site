import { z } from "zod";
import { STANDARD_EVENTS, consentPurposeSchema, consentSourceSchema, getStandardEvent, type CanonicalEvent, type ConsentPurpose, type ConsentSource, type ConsentState } from "@track-site/events";
import {
  CONNECTOR_TYPES,
  DEFAULT_SITE_POLICY,
  DESTINATION_CLICK_IDS,
  DESTINATION_PURPOSE,
  REGION_GROUPS,
  applyStrip,
  clickIdsForDestination,
  eventPurpose,
  evaluateDispatch,
  evaluatePersistence,
  isConnectorType,
  isVerifiedShopRecord,
  regionGroupOf,
  toConsentMode,
  type ConnectorType,
  type ConsentModeFlags,
  type DestinationRef,
  type PolicyBlockReason,
  type RegionMode,
  type SitePolicy,
} from "@track-site/policy";

/**
 * Consent Impact Simulator (owner supplement §8, module 8). Pure and deterministic: the same URL
 * state, policy, destination list and event list always produce the same result, because the
 * simulated events use fixed identifiers and timestamps and the real policy engine
 * (`@track-site/policy`) makes every decision. Nothing here reads a database or the clock.
 *
 * The simulation answers "what would the engine do with an event like this?" — it is not a legal
 * assessment and it never claims anything about the vendor's own processing.
 */

/** Fixed clock for the simulation so click-id expiry and timestamps never depend on when the page renders. */
export const SIMULATION_NOW = new Date("2026-01-01T12:00:00.000Z");

export const SIMULATOR_SOURCES = ["browser", "server", "shop"] as const;
export type SimulatorSource = (typeof SIMULATOR_SOURCES)[number];

export const SIMULATOR_CATEGORIES = ["all", "engagement", "commerce", "lead", "auth", "subscription", "custom"] as const;
export type SimulatorCategory = (typeof SIMULATOR_CATEGORIES)[number];

export const SIMULATOR_POLICIES = ["published", "draft"] as const;
export type SimulatorPolicyChoice = (typeof SIMULATOR_POLICIES)[number];

/** Purposes a visitor can grant on top of `necessary`. */
export const GRANTABLE_PURPOSES = ["analytics", "marketing", "personalization"] as const satisfies readonly ConsentPurpose[];
export type GrantablePurpose = (typeof GRANTABLE_PURPOSES)[number];

export const REGION_UNKNOWN = "UNKNOWN";

/** Countries offered by the region picker: every mapped country plus a few "other" markets and "unknown". */
export const SIMULATOR_COUNTRIES: readonly string[] = [
  ...REGION_GROUPS["EU"]!,
  ...REGION_GROUPS["UK"]!,
  ...REGION_GROUPS["CH"]!,
  ...REGION_GROUPS["US"]!,
  ...REGION_GROUPS["BR"]!,
  "CA",
  "AU",
  "JP",
  "IN",
  "MX",
  "TR",
  "ZA",
  "KR",
  "SG",
  "AE",
];

export const REGION_GROUP_ORDER = ["EU", "UK", "CH", "US", "BR", "OTHER", "UNKNOWN"] as const;
export type RegionGroup = (typeof REGION_GROUP_ORDER)[number];

export interface SimulatorInput {
  /** ISO 3166-1 alpha-2 country code or `UNKNOWN`. */
  region: string;
  /** Purposes granted on top of `necessary`. */
  granted: GrantablePurpose[];
  /** Where the consent signal comes from (`default` = no signal yet). */
  signal: ConsentSource;
  /** Global Privacy Control header present. */
  gpc: boolean;
  source: SimulatorSource;
  /** `all`, an integration id, or `type:<connector>` for a hypothetical, not yet connected destination. */
  destination: string;
  policy: SimulatorPolicyChoice;
  category: SimulatorCategory;
}

const list = (value: unknown): string[] => (typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : Array.isArray(value) ? value.flatMap((v) => (typeof v === "string" ? v.split(",") : [])).map((s) => s.trim()).filter(Boolean) : []);
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
/** Checkbox pattern `<hidden gpc=0><checkbox gpc=1>`: the last value wins. */
const last = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[value.length - 1] : value);

const purposeList = z.preprocess(list, z.array(z.enum(GRANTABLE_PURPOSES)));

export const DEFAULT_SIMULATOR_INPUT: SimulatorInput = {
  region: "DE",
  granted: ["analytics", "marketing"],
  signal: "api",
  gpc: false,
  source: "browser",
  destination: "all",
  policy: "published",
  category: "all",
};

const inputSchema = z.object({
  region: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2}|UNKNOWN)$/),
  granted: purposeList,
  signal: consentSourceSchema,
  gpc: z.enum(["1", "0", "true", "false"]).transform((v) => v === "1" || v === "true"),
  source: z.enum(SIMULATOR_SOURCES),
  destination: z.string().trim().min(1).max(80).regex(/^(all|[0-9a-f-]{36}|type:[a-z0-9_]+)$/i),
  policy: z.enum(SIMULATOR_POLICIES),
  category: z.enum(SIMULATOR_CATEGORIES),
});

export type SimulatorQuery = Record<string, string | string[] | undefined>;

/**
 * Parses the URL state. Every field falls back to its default independently, so a shared link with
 * one stale or mistyped parameter still opens (the result of that field is the default, never an error).
 */
export function parseSimulatorInput(query: SimulatorQuery, defaults: SimulatorInput = DEFAULT_SIMULATOR_INPUT): SimulatorInput {
  const pick = <K extends keyof SimulatorInput>(key: K, raw: unknown): SimulatorInput[K] => {
    if (raw === undefined) return defaults[key];
    const parsed = inputSchema.shape[key].safeParse(raw);
    return parsed.success ? (parsed.data as SimulatorInput[K]) : defaults[key];
  };
  const grantedRaw = query.granted;
  return {
    region: pick("region", first(query.region)),
    // `granted=` (empty) is a valid state: nothing beyond necessary
    granted: grantedRaw === undefined ? defaults.granted : pick("granted", grantedRaw),
    signal: pick("signal", first(query.signal)),
    gpc: pick("gpc", last(query.gpc)),
    source: pick("source", first(query.source)),
    destination: pick("destination", first(query.destination)),
    policy: pick("policy", first(query.policy)),
    category: pick("category", first(query.category)),
  };
}

/** Serialises the state for a shareable URL; keys are written in a fixed order so equal states give equal links. */
export function serializeSimulatorInput(input: SimulatorInput): string {
  const params = new URLSearchParams();
  params.set("policy", input.policy);
  params.set("region", input.region);
  params.set("granted", [...input.granted].sort((a, b) => GRANTABLE_PURPOSES.indexOf(a) - GRANTABLE_PURPOSES.indexOf(b)).join(","));
  params.set("signal", input.signal);
  params.set("gpc", input.gpc ? "1" : "0");
  params.set("source", input.source);
  params.set("destination", input.destination);
  params.set("category", input.category);
  return params.toString();
}

/** The columns of `consent_policies` the engine reads (same shape for a draft and a published version). */
export interface PolicyVersionSource {
  version: number;
  regionPolicies: Record<string, { mode: string; allowAdvancedConsentMode: boolean }>;
  destinationPurposes: Record<string, string>;
  operationalEvents: string[];
}

const REGION_MODES: readonly RegionMode[] = ["strict_opt_in", "opt_out", "notice_only"];
const isRegionMode = (v: unknown): v is RegionMode => typeof v === "string" && (REGION_MODES as readonly string[]).includes(v);
const isPurpose = (v: unknown): v is ConsentPurpose => consentPurposeSchema.safeParse(v).success;

/** Builds the runtime policy exactly like the worker's config cache does (defaults merged, only stricter overrides kept). */
export function sitePolicyFrom(row: PolicyVersionSource | null): SitePolicy {
  if (!row) return DEFAULT_SITE_POLICY;
  const regionPolicies: SitePolicy["regionPolicies"] = { ...DEFAULT_SITE_POLICY.regionPolicies };
  for (const [group, value] of Object.entries(row.regionPolicies ?? {})) {
    if (value && isRegionMode(value.mode)) regionPolicies[group] = { mode: value.mode, allowAdvancedConsentMode: Boolean(value.allowAdvancedConsentMode) };
  }
  const destinationPurposes: SitePolicy["destinationPurposes"] = {};
  for (const [type, purpose] of Object.entries(row.destinationPurposes ?? {})) {
    if (isConnectorType(type) && isPurpose(purpose)) destinationPurposes[type] = purpose;
  }
  return {
    version: `v${row.version}`,
    regionPolicies,
    destinationPurposes,
    operationalEvents: Array.isArray(row.operationalEvents) ? row.operationalEvents : DEFAULT_SITE_POLICY.operationalEvents,
    persistWithoutSignal: false,
  };
}

export interface SimDestination {
  id: string;
  name: string;
  connectorType: ConnectorType;
  status: DestinationRef["status"];
  requiredPurpose: ConsentPurpose | null;
  /** Not connected on this site: evaluated as if it were connected, clearly labelled. */
  hypothetical: boolean;
}

export interface SimEvent {
  name: string;
  category: SimulatorCategory;
  isStandard: boolean;
  commerce: boolean;
  requiredParams: string[];
  authoritativeSourceRecommended: boolean;
}

/** Standard catalogue plus the site's own (custom) event names, custom events last. */
export function simulatorEvents(customNames: readonly string[] = []): SimEvent[] {
  const standard: SimEvent[] = STANDARD_EVENTS.map((e) => ({ name: e.name, category: e.category, isStandard: true, commerce: e.commerce, requiredParams: e.requiredParams, authoritativeSourceRecommended: e.authoritativeSourceRecommended }));
  const known = new Set(standard.map((e) => e.name));
  const custom = Array.from(new Set(customNames))
    .filter((n) => !known.has(n))
    .sort()
    .map<SimEvent>((name) => ({ name, category: "custom", isStandard: false, commerce: false, requiredParams: [], authoritativeSourceRecommended: false }));
  return [...standard, ...custom];
}

export function filterEvents(events: SimEvent[], category: SimulatorCategory): SimEvent[] {
  return category === "all" ? events : events.filter((e) => e.category === category);
}

/** Resolves the destination selector to the list that is evaluated. */
export function selectDestinations(input: SimulatorInput, connected: SimDestination[]): SimDestination[] {
  if (input.destination === "all") return connected;
  if (input.destination.startsWith("type:")) {
    const type = input.destination.slice(5);
    if (!isConnectorType(type)) return connected;
    return [{ id: `type:${type}`, name: type, connectorType: type, status: "connected", requiredPurpose: null, hypothetical: true }];
  }
  const match = connected.find((d) => d.id === input.destination);
  return match ? [match] : connected;
}

/** Field groups the simulator reports on (what the policy lets through *if the event carries it*). */
export const FIELD_GROUPS = ["event", "page", "commerce", "analytics_ids", "network", "click_ids", "vendor_ids", "user_data"] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

const FIELD_GROUP_OF: Record<string, FieldGroup> = {
  anonymous_id: "analytics_ids",
  session_id: "analytics_ids",
  ua_family: "network",
  ip_truncated: "network",
  click_ids: "click_ids",
  vendor_ids: "vendor_ids",
};

export type PersistenceStatus = "allowed" | "reduced" | "blocked";
export type DispatchStatus = "forwarded" | "blocked";
export type DispatchBlockReason = PolicyBlockReason | "not_persisted";

export interface PersistenceOutcome {
  status: PersistenceStatus;
  reason: PolicyBlockReason | null;
  /** Purpose the event itself needs to be stored. */
  purposeRequired: ConsentPurpose;
  /** Field groups an event of this kind can carry from this source. */
  applicable: FieldGroup[];
  kept: FieldGroup[];
  withheld: FieldGroup[];
}

export interface DispatchOutcome {
  destinationId: string;
  status: DispatchStatus;
  reason: DispatchBlockReason | null;
  /** Purpose the destination requires (base purpose, made stricter by policy or destination settings). */
  purposeRequired: ConsentPurpose | null;
  /** Click ids this destination may receive from the (already reduced) event. */
  clickIds: string[];
  /** The destination could use click ids, but persistence withheld them (no marketing consent). */
  clickIdsWithheld: boolean;
  forwarded: FieldGroup[];
}

export interface SimulationRow {
  event: SimEvent;
  persistence: PersistenceOutcome;
  dispatch: DispatchOutcome[];
}

export interface SimulationSummary {
  events: number;
  allowed: number;
  reduced: number;
  blocked: number;
  forwarded: number;
  dispatchBlocked: number;
}

export interface SimulationResult {
  input: SimulatorInput;
  regionGroup: string;
  regionMode: RegionMode;
  /** Purposes after GPC is applied — what the engine actually sees. */
  effectiveGranted: ConsentPurpose[];
  explicitSignal: boolean;
  consentMode: ConsentModeFlags;
  destinations: SimDestination[];
  rows: SimulationRow[];
  summary: SimulationSummary;
}

function consentStateFor(input: SimulatorInput, policyVersion: string): ConsentState {
  return {
    granted: ["necessary", ...input.granted],
    source: input.signal,
    policy_version: policyVersion,
    ts: SIMULATION_NOW.getTime(),
    region: input.region === REGION_UNKNOWN ? null : input.region,
    gpc: input.gpc,
  };
}

const ALL_CLICK_ID_PARAMS = Array.from(new Set(Object.values(DESTINATION_CLICK_IDS).flat())).sort();

/** A hypothetical event: fixed ids, fixed timestamps, placeholder values — never confused with real traffic. */
function syntheticEvent(ev: SimEvent, input: SimulatorInput, consent: ConsentState): CanonicalEvent {
  const now = SIMULATION_NOW.toISOString();
  const expires = new Date(SIMULATION_NOW.getTime() + 86_400_000).toISOString();
  const browser = input.source === "browser";
  const clickIds: NonNullable<CanonicalEvent["click_ids"]> = {};
  for (const param of ALL_CLICK_ID_PARAMS) clickIds[param] = { value: "simulated", source: browser ? "browser" : "server", captured_at: now, expires_at: expires };
  return {
    event_id: "01SIMULATED0000000000000000",
    source_event_id: "simulated",
    organization_id: "00000000-0000-4000-8000-000000000000",
    site_id: "00000000-0000-4000-8000-000000000001",
    site_tracking_id: "SIMULA",
    environment_id: "00000000-0000-4000-8000-000000000002",
    name: ev.name,
    is_standard: ev.isStandard,
    category: ev.category === "custom" ? "custom" : ev.category,
    client_ts: now,
    server_ts: now,
    anonymous_id: "simulated",
    session_id: "simulated",
    user_id: null,
    url: browser ? "https://example.invalid/" : null,
    host: browser ? "example.invalid" : null,
    path: browser ? "/" : null,
    referrer: null,
    title: null,
    utm: null,
    click_ids: clickIds,
    vendor_ids: browser ? { fbp: "simulated" } : null,
    consent,
    consent_snapshot_id: null,
    props: null,
    commerce: ev.commerce ? { currency: "EUR", value: 0, order_id: "simulated", items: null } : null,
    user_data: null,
    ip_truncated: "0.0.0.0",
    ua_family: "simulated",
    locale: null,
    source: input.source === "shop" ? "shopify" : input.source,
    source_verified: input.source === "shop",
    sdk_version: "simulator",
    config_version: null,
    schema_version: "1.0.0",
    provenance: {},
    processing_state: "normalized",
    drop_reason: null,
    is_billable: false,
    is_bot: false,
  };
}

function applicableGroups(ev: SimEvent, source: SimulatorSource): FieldGroup[] {
  const groups: FieldGroup[] = ["event"];
  if (source === "browser") groups.push("page");
  if (ev.commerce) groups.push("commerce");
  groups.push("analytics_ids", "network", "click_ids");
  if (source === "browser") groups.push("vendor_ids");
  if (source !== "browser") groups.push("user_data");
  return groups;
}

const DISPATCHABLE: readonly FieldGroup[] = ["event", "page", "commerce", "analytics_ids", "click_ids", "vendor_ids", "user_data"];

/** Runs the policy engine over every event for every selected destination. */
export function simulate(input: SimulatorInput, policy: SitePolicy, destinations: SimDestination[], events: SimEvent[]): SimulationResult {
  const consent = consentStateFor(input, policy.version);
  const regionGroup = regionGroupOf(consent.region);
  const regionMode = (policy.regionPolicies[regionGroup] ?? policy.regionPolicies["UNKNOWN"] ?? DEFAULT_SITE_POLICY.regionPolicies["UNKNOWN"]!).mode;
  const consentMode = toConsentMode(consent);
  const effectiveGranted = consent.gpc ? consent.granted.filter((p) => p !== "marketing" && p !== "personalization") : consent.granted;
  const summary: SimulationSummary = { events: 0, allowed: 0, reduced: 0, blocked: 0, forwarded: 0, dispatchBlocked: 0 };

  const rows = events.map<SimulationRow>((ev) => {
    const event = syntheticEvent(ev, input, consent);
    const applicable = applicableGroups(ev, input.source);
    const purposeRequired = isVerifiedShopRecord(event) ? "necessary" : eventPurpose(event, policy);
    const decision = evaluatePersistence(event, policy);
    summary.events += 1;

    let persistence: PersistenceOutcome;
    let stored: CanonicalEvent | null = null;
    if (!decision.allow) {
      summary.blocked += 1;
      persistence = { status: "blocked", reason: decision.reason, purposeRequired, applicable, kept: [], withheld: applicable };
    } else {
      const withheldSet = new Set<FieldGroup>();
      for (const f of decision.strippedFields) {
        const g = FIELD_GROUP_OF[f];
        if (g && applicable.includes(g)) withheldSet.add(g);
      }
      const withheld = applicable.filter((g) => withheldSet.has(g));
      const kept = applicable.filter((g) => !withheldSet.has(g));
      const status: PersistenceStatus = withheld.length ? "reduced" : "allowed";
      if (status === "reduced") summary.reduced += 1;
      else summary.allowed += 1;
      persistence = { status, reason: null, purposeRequired, applicable, kept, withheld };
      stored = applyStrip(event, decision.strippedFields);
    }

    const dispatch = destinations.map<DispatchOutcome>((d) => {
      const ref: DestinationRef = { connectorType: d.connectorType, status: d.status, requiredPurpose: d.requiredPurpose ?? undefined };
      if (!stored) {
        summary.dispatchBlocked += 1;
        return { destinationId: d.id, status: "blocked", reason: "not_persisted", purposeRequired: null, clickIds: [], clickIdsWithheld: false, forwarded: [] };
      }
      const out = evaluateDispatch(stored, ref, policy);
      if (!out.allow) {
        summary.dispatchBlocked += 1;
        return { destinationId: d.id, status: "blocked", reason: out.reason, purposeRequired: out.purposeRequired, clickIds: [], clickIdsWithheld: false, forwarded: [] };
      }
      summary.forwarded += 1;
      const clickIds = Object.keys(clickIdsForDestination(stored, d.connectorType, SIMULATION_NOW)).sort();
      const usable = DESTINATION_CLICK_IDS[d.connectorType].length > 0;
      const withheldClickIds = persistence.withheld.includes("click_ids");
      const forwarded = persistence.kept.filter((g) => DISPATCHABLE.includes(g)).filter((g) => g !== "click_ids" || clickIds.length > 0);
      return {
        destinationId: d.id,
        status: "forwarded",
        reason: null,
        purposeRequired: requiredPurposeFor(d, policy),
        clickIds,
        clickIdsWithheld: usable && withheldClickIds,
        forwarded,
      };
    });

    return { event: ev, persistence, dispatch };
  });

  return { input, regionGroup, regionMode, effectiveGranted, explicitSignal: consent.source !== "default", consentMode, destinations, rows, summary };
}

const PURPOSE_RANK: Record<ConsentPurpose, number> = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 };

/** Strictest of the base purpose, the policy override and the destination's own setting (mirrors the engine). */
export function requiredPurposeFor(destination: Pick<SimDestination, "connectorType" | "requiredPurpose">, policy: SitePolicy): ConsentPurpose {
  const candidates: ConsentPurpose[] = [DESTINATION_PURPOSE[destination.connectorType]];
  const override = policy.destinationPurposes[destination.connectorType];
  if (override) candidates.push(override);
  if (destination.requiredPurpose) candidates.push(destination.requiredPurpose);
  return candidates.reduce((a, b) => (PURPOSE_RANK[b] > PURPOSE_RANK[a] ? b : a));
}

/** Connector types that can be simulated as hypothetical destinations (everything the platform supports). */
export const HYPOTHETICAL_CONNECTORS: readonly ConnectorType[] = CONNECTOR_TYPES;

/** Default signal for a site: its CMP provider when the SDK has an adapter for it, otherwise the consent API. */
export function defaultSignalFor(cmpProvider: string | null | undefined): ConsentSource {
  switch (cmpProvider) {
    case "usercentrics":
      return "cmp:usercentrics";
    case "cookiebot":
      return "cmp:cookiebot";
    case "onetrust":
      return "cmp:onetrust";
    case "tcf":
      return "tcf";
    case "gpp":
      return "gpp";
    case "none":
      return "default";
    default:
      return "api";
  }
}

export function isSimulatorCategory(v: unknown): v is SimulatorCategory {
  return typeof v === "string" && (SIMULATOR_CATEGORIES as readonly string[]).includes(v);
}

/** Whether a name belongs to the vendor-neutral standard catalogue. */
export function isStandardEventName(name: string): boolean {
  return getStandardEvent(name) !== undefined;
}
