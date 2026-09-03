import type { FeatureKey } from "./features.ts";
import { PLANS, planHasFeature, type Plan } from "./plans.ts";
import type { PlanId } from "./types.ts";

/**
 * Shape of the `plans.limits` JSON column in the database. It mirrors the catalogue so that
 * entitlements, the usage job and the dashboard read one consistent record per plan; the seed
 * writes it, nothing else does. `null` = no fixed cap in this plan (fair use or contract).
 */
export interface PlanRecordLimits {
  sites: number | null;
  eventsPerMonth: number | null;
  /** `null`: all standard destinations, no cap */
  destinations: number | null;
  retentionDays: number | null;
  teamMembers: number | null;
  serverSide: boolean;
  /** warehouse / streaming / scheduled exports (privacy exports and DSAR reports exist in every plan) */
  exports: boolean;
  /** SAML SSO */
  sso: boolean;
}

export interface PlanRecord {
  id: PlanId;
  name: string;
  sortOrder: number;
  limits: PlanRecordLimits;
  /** feature keys (see FEATURES for labels) */
  features: FeatureKey[];
  stripePriceEnv: { monthly: string | null; yearly: string | null };
  contactSales: boolean;
  isPublic: boolean;
}

export function toPlanRecord(plan: Plan): PlanRecord {
  return {
    id: plan.id,
    name: plan.name,
    sortOrder: plan.sortOrder,
    limits: {
      sites: plan.limits.sites,
      eventsPerMonth: plan.limits.eventsPerMonth,
      destinations: null,
      retentionDays: plan.limits.retentionDays,
      teamMembers: plan.limits.teamMembers,
      serverSide: planHasFeature(plan.id, "server_side_tracking"),
      exports: planHasFeature(plan.id, "warehouse_exports") || planHasFeature(plan.id, "scheduled_exports"),
      sso: planHasFeature(plan.id, "saml_sso"),
    },
    features: [...plan.features],
    stripePriceEnv: plan.stripePriceEnv ? { ...plan.stripePriceEnv } : { monthly: null, yearly: null },
    contactSales: plan.contactSales,
    isPublic: true,
  };
}

/** Database records for every catalogue plan (what the seed writes). */
export function planRecords(): PlanRecord[] {
  return PLANS.map(toPlanRecord);
}

export function planRecord(id: PlanId): PlanRecord {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan ${id}`);
  return toPlanRecord(plan);
}
