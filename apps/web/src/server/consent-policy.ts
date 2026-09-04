import type { ConsentPurpose } from "@track-site/events";
import { DEFAULT_REGION_POLICIES, DESTINATION_PURPOSE, isConnectorType, type ConnectorType, type RegionMode } from "@track-site/policy";

/**
 * Editable part of a consent policy version (the columns the engine reads) and the rules that keep
 * edits honest: a customer can always make a policy stricter; making it less restrictive is a
 * confirmed decision with a documented legal basis, never a default. Pure module, shared by the
 * server actions, the page and the tests.
 */
export const EDITABLE_REGION_GROUPS = ["EU", "UK", "CH", "US", "BR", "OTHER", "UNKNOWN"] as const;
export type EditableRegionGroup = (typeof EDITABLE_REGION_GROUPS)[number];

export const REGION_MODES = ["strict_opt_in", "opt_out", "notice_only"] as const satisfies readonly RegionMode[];
const REGION_MODE_RANK: Record<RegionMode, number> = { strict_opt_in: 0, opt_out: 1, notice_only: 2 };

/** Only events that are the merchant's own contractual records may be treated as operational. */
export const OPERATIONAL_EVENT_OPTIONS = ["purchase", "refund"] as const;

export const PURPOSES: readonly ConsentPurpose[] = ["necessary", "analytics", "marketing", "personalization"];
const PURPOSE_RANK: Record<ConsentPurpose, number> = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 };

export const LEGAL_NOTE_MIN_LENGTH = 20;
export const LEGAL_NOTE_MAX_LENGTH = 1000;

export interface PolicyFields {
  regionPolicies: Record<string, { mode: string; allowAdvancedConsentMode: boolean }>;
  destinationPurposes: Record<string, string>;
  operationalEvents: string[];
}

export const DEFAULT_POLICY_FIELDS: PolicyFields = {
  regionPolicies: {},
  destinationPurposes: {},
  operationalEvents: ["purchase", "refund"],
};

export function isRegionMode(v: unknown): v is RegionMode {
  return typeof v === "string" && (REGION_MODES as readonly string[]).includes(v);
}

export function isPurpose(v: unknown): v is ConsentPurpose {
  return typeof v === "string" && (PURPOSES as readonly string[]).includes(v);
}

/** Mode that applies to a region group: the stored override or the platform default (strict opt-in). */
export function effectiveRegionMode(fields: PolicyFields, group: string): RegionMode {
  const stored = fields.regionPolicies[group]?.mode;
  if (isRegionMode(stored)) return stored;
  return DEFAULT_REGION_POLICIES[group]?.mode ?? "strict_opt_in";
}

/** Purpose a destination type requires under these fields (base purpose or a stricter override). */
export function effectiveDestinationPurpose(fields: PolicyFields, connectorType: ConnectorType): ConsentPurpose {
  const override = fields.destinationPurposes[connectorType];
  const base = DESTINATION_PURPOSE[connectorType];
  return isPurpose(override) && PURPOSE_RANK[override] > PURPOSE_RANK[base] ? override : base;
}

export type PolicyChange =
  | { kind: "region"; key: string; from: RegionMode; to: RegionMode; weaker: boolean }
  | { kind: "destination"; key: ConnectorType; from: ConsentPurpose; to: ConsentPurpose; weaker: boolean }
  | { kind: "operational"; key: string; added: boolean; weaker: boolean };

/** Every difference between two policy versions that changes what the engine decides. */
export function diffPolicyFields(from: PolicyFields, to: PolicyFields): PolicyChange[] {
  const changes: PolicyChange[] = [];
  const groups = new Set([...EDITABLE_REGION_GROUPS, ...Object.keys(from.regionPolicies), ...Object.keys(to.regionPolicies)]);
  for (const group of groups) {
    const a = effectiveRegionMode(from, group);
    const b = effectiveRegionMode(to, group);
    if (a !== b) changes.push({ kind: "region", key: group, from: a, to: b, weaker: REGION_MODE_RANK[b] > REGION_MODE_RANK[a] });
  }
  const types = new Set([...Object.keys(from.destinationPurposes), ...Object.keys(to.destinationPurposes)].filter(isConnectorType));
  for (const type of types) {
    const a = effectiveDestinationPurpose(from, type);
    const b = effectiveDestinationPurpose(to, type);
    if (a !== b) changes.push({ kind: "destination", key: type, from: a, to: b, weaker: PURPOSE_RANK[b] < PURPOSE_RANK[a] });
  }
  const before = new Set(from.operationalEvents);
  const after = new Set(to.operationalEvents);
  for (const name of [...before, ...after].filter((n, i, all) => all.indexOf(n) === i)) {
    if (before.has(name) && !after.has(name)) changes.push({ kind: "operational", key: name, added: false, weaker: false });
    if (!before.has(name) && after.has(name)) changes.push({ kind: "operational", key: name, added: true, weaker: true });
  }
  return changes;
}

export function isWeaker(changes: PolicyChange[]): boolean {
  return changes.some((c) => c.weaker);
}

export interface DraftFormResult {
  fields: PolicyFields;
  legalBasisNote: string | null;
  /** Field-level problems keyed by form field name. */
  fieldErrors: Record<string, string>;
}

/**
 * Reads the draft editor's form values. Region modes come as `region_<GROUP>`, destination overrides as
 * `dest_<connectorType>` (empty = base purpose), operational events as `op_<name>` checkboxes. An
 * override weaker than the destination's base purpose is rejected (the engine would ignore it anyway,
 * and a customer must not believe it took effect).
 */
export function parseDraftForm(get: (name: string) => string | null, connectorTypes: readonly ConnectorType[]): DraftFormResult {
  const fieldErrors: Record<string, string> = {};
  const regionPolicies: PolicyFields["regionPolicies"] = {};
  for (const group of EDITABLE_REGION_GROUPS) {
    const raw = get(`region_${group}`);
    if (raw === null || raw === "") continue;
    if (!isRegionMode(raw)) {
      fieldErrors[`region_${group}`] = "invalid";
      continue;
    }
    // only non-default modes are stored; the default (strict opt-in) stays implicit like the worker expects
    if (raw !== (DEFAULT_REGION_POLICIES[group]?.mode ?? "strict_opt_in")) regionPolicies[group] = { mode: raw, allowAdvancedConsentMode: false };
  }
  const destinationPurposes: PolicyFields["destinationPurposes"] = {};
  for (const type of connectorTypes) {
    const raw = get(`dest_${type}`);
    if (raw === null || raw === "") continue;
    if (!isPurpose(raw)) {
      fieldErrors[`dest_${type}`] = "invalid";
      continue;
    }
    const base = DESTINATION_PURPOSE[type];
    if (PURPOSE_RANK[raw] < PURPOSE_RANK[base]) {
      fieldErrors[`dest_${type}`] = "purposeTooWeak";
      continue;
    }
    if (raw !== base) destinationPurposes[type] = raw;
  }
  const operationalEvents = OPERATIONAL_EVENT_OPTIONS.filter((name) => {
    const raw = get(`op_${name}`);
    return raw === "1" || raw === "on" || raw === "true";
  });
  const noteRaw = (get("legalBasisNote") ?? "").trim();
  if (noteRaw.length > LEGAL_NOTE_MAX_LENGTH) fieldErrors["legalBasisNote"] = "tooLong";
  return { fields: { regionPolicies, destinationPurposes, operationalEvents: [...operationalEvents] }, legalBasisNote: noteRaw.length ? noteRaw : null, fieldErrors };
}

/** Normalises stored JSON columns to the editable shape (unknown values are ignored, never invented). */
export function policyFieldsFrom(row: { regionPolicies: unknown; destinationPurposes: unknown; operationalEvents: unknown } | null): PolicyFields {
  if (!row) return DEFAULT_POLICY_FIELDS;
  const regionPolicies: PolicyFields["regionPolicies"] = {};
  if (row.regionPolicies && typeof row.regionPolicies === "object") {
    for (const [group, value] of Object.entries(row.regionPolicies as Record<string, unknown>)) {
      const mode = (value as { mode?: unknown } | null)?.mode;
      if (isRegionMode(mode)) regionPolicies[group] = { mode, allowAdvancedConsentMode: Boolean((value as { allowAdvancedConsentMode?: unknown }).allowAdvancedConsentMode) };
    }
  }
  const destinationPurposes: PolicyFields["destinationPurposes"] = {};
  if (row.destinationPurposes && typeof row.destinationPurposes === "object") {
    for (const [type, purpose] of Object.entries(row.destinationPurposes as Record<string, unknown>)) {
      if (isConnectorType(type) && isPurpose(purpose)) destinationPurposes[type] = purpose;
    }
  }
  const operationalEvents = Array.isArray(row.operationalEvents) ? row.operationalEvents.filter((v): v is string => typeof v === "string") : DEFAULT_POLICY_FIELDS.operationalEvents;
  return { regionPolicies, destinationPurposes, operationalEvents };
}
