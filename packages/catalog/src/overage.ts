import { CURRENCY, type Currency, type Label, type PaidPlanId, type PlanId } from "./types.ts";

/** Additional events beyond the plan's monthly limit are sold in packs (owner supplement §5 "Mehrverbrauch"). */
export interface OveragePack {
  planId: PaidPlanId;
  /** events per pack */
  events: number;
  /** list price per pack, integer cents */
  priceCents: number;
  currency: Currency;
}

export const OVERAGE_PACKS: Readonly<Record<PaidPlanId, OveragePack>> = {
  starter: { planId: "starter", events: 100_000, priceCents: 600, currency: CURRENCY },
  growth: { planId: "growth", events: 1_000_000, priceCents: 1_800, currency: CURRENCY },
  pro: { planId: "pro", events: 5_000_000, priceCents: 3_000, currency: CURRENCY },
};

/** Enterprise overage is contractual: no pack. */
export function overagePackFor(planId: PlanId): OveragePack | null {
  return planId === "enterprise" ? null : OVERAGE_PACKS[planId];
}

/**
 * Overage is never activated without an explicit choice. The customer picks one of:
 * `allow` (packs are billed), `cost_limit` (packs up to a monthly cost limit), `pause` (processing
 * pauses at the limit after the communicated grace window). Default: pause.
 */
export const OVERAGE_POLICIES = ["allow", "cost_limit", "pause"] as const;
export type OveragePolicy = (typeof OVERAGE_POLICIES)[number];
export const DEFAULT_OVERAGE_POLICY: OveragePolicy = "pause";

export function isOveragePolicy(value: unknown): value is OveragePolicy {
  return typeof value === "string" && (OVERAGE_POLICIES as readonly string[]).includes(value);
}

export const OVERAGE_POLICY_LABELS: Readonly<Record<OveragePolicy, Label>> = {
  allow: { en: "Allow overage (event packs are billed)", de: "Mehrverbrauch erlauben (Eventpakete werden berechnet)" },
  cost_limit: { en: "Allow overage up to a monthly cost limit", de: "Mehrverbrauch bis zu einem monatlichen Kostenlimit erlauben" },
  pause: { en: "Pause processing at the limit after the grace window", de: "Verarbeitung beim Limit nach der Grace Period pausieren" },
};

/** Percent of the monthly event limit at which the customer is warned. */
export const USAGE_WARNING_THRESHOLDS = [70, 90, 100] as const;
export type UsageWarningThreshold = (typeof USAGE_WARNING_THRESHOLDS)[number];

/**
 * Grace window of the `pause` policy, as percent of the monthly limit: processing continues up to
 * limit × (1 + grace) before it is paused. This keeps the platform's existing behaviour (the worker
 * marked the hard limit at 120 % before the catalogue existed); the owner can change the value here.
 */
export const USAGE_PAUSE_GRACE_PERCENT = 20;

/** Trial (owner supplement §5 "Testphase"). */
export const TRIAL = {
  planId: "growth" as const satisfies PlanId,
  days: 14,
  cardRequired: false,
  /** hard cap of accepted events during the trial */
  maxEvents: 100_000,
  /** never converts into a paid subscription on its own */
  autoConvert: false,
  /** after expiry the workspace is readable and exportable; nothing is deleted by surprise */
  afterExpiry: "read_only_export" as const,
} as const;

/**
 * Definition of a billable event (owner supplement §5). An event is counted exactly once when the
 * ingestion accepted it; forwarding it to several destinations never increases usage.
 */
export const NON_BILLABLE_REASONS = ["invalid_or_rejected", "duplicate", "retry", "test_or_debug", "internal", "consent_dropped"] as const;
export type NonBillableReason = (typeof NON_BILLABLE_REASONS)[number];

export const BILLABLE_EVENT_RULES = {
  countedWhen: "accepted_by_ingestion" as const,
  countedOncePerEvent: true,
  destinationFanOutCounts: false,
  notCounted: NON_BILLABLE_REASONS,
} as const;

export const NON_BILLABLE_REASON_LABELS: Readonly<Record<NonBillableReason, Label>> = {
  invalid_or_rejected: { en: "Invalid or rejected events", de: "Ungültige oder abgelehnte Events" },
  duplicate: { en: "Detected duplicates", de: "Erkannte Duplikate" },
  retry: { en: "Technical retries", de: "Technische Retries" },
  test_or_debug: { en: "Test and debug events", de: "Test- und Debug-Events" },
  internal: { en: "Internal system events", de: "Interne Systemereignisse" },
  consent_dropped: { en: "Events dropped before acceptance because consent was missing", de: "Events, die vor Annahme aufgrund fehlender Einwilligung verworfen wurden" },
};

export interface BillableEventInput {
  /** the ingestion accepted (validated, policy-passed and stored) the event */
  accepted: boolean;
  /** event id already seen (event store or conversion dedup) */
  duplicate?: boolean;
  /** a technical retry of a message that was already processed */
  retry?: boolean;
  /** environment in test/debug mode */
  testMode?: boolean;
  /** internal system event, not customer traffic */
  internal?: boolean;
  /** dropped before acceptance because consent was missing */
  consentDropped?: boolean;
}

/** Applies BILLABLE_EVENT_RULES: returns the reason an event is not billed, or `null` when it is. */
export function nonBillableReason(input: BillableEventInput): NonBillableReason | null {
  if (input.consentDropped) return "consent_dropped";
  if (!input.accepted) return "invalid_or_rejected";
  if (input.duplicate) return "duplicate";
  if (input.retry) return "retry";
  if (input.testMode) return "test_or_debug";
  if (input.internal) return "internal";
  return null;
}

export function isBillableEvent(input: BillableEventInput): boolean {
  return nonBillableReason(input) === null;
}
