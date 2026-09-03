import type { CanonicalEvent, ConsentPurpose, ConsentState } from "@track-site/events";
import { getStandardEvent } from "@track-site/events";
import { DEFAULT_REGION_POLICIES, DESTINATION_CLICK_IDS, DESTINATION_PURPOSE, regionGroupOf, type ConnectorType, type RegionPolicy } from "./matrix.ts";
import { applyGpc, hasPurpose, isExplicitConsent } from "./purposes.ts";

/**
 * Blocking policy engine. Runs before persistence and before every dispatch.
 * Server-side events never bypass a missing browser consent for advertising purposes.
 */
export interface SitePolicy {
  version: string;
  regionPolicies: Record<string, RegionPolicy>;
  /** per destination overrides, may only be stricter than the defaults */
  destinationPurposes: Partial<Record<ConnectorType, ConsentPurpose>>;
  /** events (by name) that are treated as operational and may be persisted without analytics consent (no IDs) */
  operationalEvents: string[];
  /** persist marketing/analytics events without an explicit signal (only lawful in notice_only regions) */
  persistWithoutSignal: boolean;
}

export const DEFAULT_SITE_POLICY: SitePolicy = {
  version: "default-v1",
  regionPolicies: DEFAULT_REGION_POLICIES,
  destinationPurposes: {},
  operationalEvents: ["purchase", "refund"],
  persistWithoutSignal: false,
};

export type PolicyDecision =
  | { allow: true; purposesGranted: ConsentPurpose[]; strippedFields: string[] }
  | { allow: false; reason: PolicyBlockReason; purposesGranted: ConsentPurpose[]; purposeRequired: ConsentPurpose | null };

export type PolicyBlockReason =
  | "consent_missing"
  | "consent_denied"
  | "gpc_opt_out"
  | "purpose_not_granted"
  | "inferred_data_not_exportable"
  | "destination_paused";

const PURPOSE_RANK: Record<ConsentPurpose, number> = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 };

function stricter(a: ConsentPurpose, b: ConsentPurpose | undefined): ConsentPurpose {
  if (!b) return a;
  return PURPOSE_RANK[b] > PURPOSE_RANK[a] ? b : a;
}

function regionPolicyFor(consent: ConsentState, policy: SitePolicy): RegionPolicy {
  const group = regionGroupOf(consent.region);
  return policy.regionPolicies[group] ?? policy.regionPolicies["UNKNOWN"] ?? DEFAULT_REGION_POLICIES["UNKNOWN"]!;
}

/** Minimum purpose an event itself needs to be stored (page views need analytics, purchases are operational). */
export function eventPurpose(event: Pick<CanonicalEvent, "name" | "category">, policy: SitePolicy): ConsentPurpose {
  if (policy.operationalEvents.includes(event.name)) return "necessary";
  const std = getStandardEvent(event.name);
  if (std?.category === "engagement") return "analytics";
  return "analytics";
}

const SHOP_SOURCES = new Set(["shopify", "woocommerce", "shopware"]);
/**
 * Verified order records from a connected shop are the merchant's own contractual data: they are stored as
 * operational records even without a browser consent record. Identifiers and click ids still require their
 * purposes, and dispatch to advertising destinations still requires marketing consent.
 */
export function isVerifiedShopRecord(event: Pick<CanonicalEvent, "source" | "source_verified" | "category">): boolean {
  return event.source_verified === true && SHOP_SOURCES.has(event.source) && event.category === "commerce";
}

/** Persistence gate (worker, before the event store). */
export function evaluatePersistence(event: CanonicalEvent, policy: SitePolicy = DEFAULT_SITE_POLICY): PolicyDecision {
  const consent = applyGpc(event.consent);
  const region = regionPolicyFor(consent, policy);
  const required = isVerifiedShopRecord(event) ? "necessary" : eventPurpose(event, policy);
  const granted = consent.granted;
  const stripped: string[] = [];

  if (required === "necessary") {
    // operational event: allowed, but identifiers/click ids only with the respective purposes
    if (!hasPurpose(consent, "analytics")) stripped.push("anonymous_id", "session_id", "ua_family", "ip_truncated");
    if (!hasPurpose(consent, "marketing")) stripped.push("click_ids", "vendor_ids");
    return { allow: true, purposesGranted: granted, strippedFields: stripped };
  }

  if (!isExplicitConsent(consent)) {
    if (region.mode === "notice_only" && policy.persistWithoutSignal) {
      if (!hasPurpose(consent, "marketing")) stripped.push("click_ids", "vendor_ids");
      return { allow: true, purposesGranted: granted, strippedFields: stripped };
    }
    return { allow: false, reason: "consent_missing", purposesGranted: granted, purposeRequired: required };
  }
  if (!hasPurpose(consent, required)) {
    return { allow: false, reason: "consent_denied", purposesGranted: granted, purposeRequired: required };
  }
  if (!hasPurpose(consent, "marketing")) stripped.push("click_ids", "vendor_ids");
  return { allow: true, purposesGranted: granted, strippedFields: stripped };
}

export interface DestinationRef {
  connectorType: ConnectorType;
  status: "connected" | "paused" | "not_connected" | "draft" | "error";
  /** optional stricter purpose configured by the customer */
  requiredPurpose?: ConsentPurpose;
}

/** Dispatch gate (worker, before every connector call). */
export function evaluateDispatch(
  event: CanonicalEvent,
  destination: DestinationRef,
  policy: SitePolicy = DEFAULT_SITE_POLICY,
): PolicyDecision {
  const consent = applyGpc(event.consent);
  const granted = consent.granted;
  if (destination.status !== "connected") {
    return { allow: false, reason: "destination_paused", purposesGranted: granted, purposeRequired: null };
  }
  const base = DESTINATION_PURPOSE[destination.connectorType];
  const required = stricter(stricter(base, policy.destinationPurposes[destination.connectorType]), destination.requiredPurpose);
  if (event.consent.gpc && (required === "marketing" || required === "personalization")) {
    return { allow: false, reason: "gpc_opt_out", purposesGranted: granted, purposeRequired: required };
  }
  if (!isExplicitConsent(consent) && required !== "necessary") {
    return { allow: false, reason: "consent_missing", purposesGranted: granted, purposeRequired: required };
  }
  if (!hasPurpose(consent, required)) {
    return { allow: false, reason: "purpose_not_granted", purposesGranted: granted, purposeRequired: required };
  }
  // inferred values must never reach ad platforms
  const inferred = Object.entries(event.provenance)
    .filter(([, p]) => p.data_class === "INFERRED")
    .map(([k]) => k);
  if (inferred.length && required === "marketing") {
    return { allow: false, reason: "inferred_data_not_exportable", purposesGranted: granted, purposeRequired: required };
  }
  return { allow: true, purposesGranted: granted, strippedFields: [] };
}

/** Restrict click ids to the ones the destination may receive. */
export function clickIdsForDestination(event: CanonicalEvent, connectorType: ConnectorType, now: Date = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  const allowed = DESTINATION_CLICK_IDS[connectorType];
  for (const [k, v] of Object.entries(event.click_ids ?? {})) {
    if (!allowed.includes(k)) continue;
    if (new Date(v.expires_at).getTime() < now.getTime()) continue;
    out[k] = v.value;
  }
  return out;
}

/** Apply a persistence decision by nulling stripped fields (returns a copy). */
export function applyStrip(event: CanonicalEvent, strippedFields: string[]): CanonicalEvent {
  const copy: CanonicalEvent = { ...event };
  for (const f of strippedFields) {
    if (f in copy) (copy as unknown as Record<string, unknown>)[f] = null;
  }
  return copy;
}
