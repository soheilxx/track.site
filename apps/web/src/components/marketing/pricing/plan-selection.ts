import { isBillingInterval, isPaidPlanId, type BillingInterval, type PaidPlanId } from "@track-site/catalog";

/**
 * Plan hand-over from the pricing page (supplement §5): every pricing CTA sends the chosen plan and
 * billing period as `?plan=<paid plan id>&interval=<monthly|yearly>` to `/signup`. The signup flow
 * carries that selection on — like the domain hand-over in `components/auth/domain.ts` — through the
 * verification callback and onboarding into a preselected checkout. Every hop re-validates the
 * candidate here, so an untrusted query string can only ever become a catalogue plan with a list
 * price plus a known billing interval, or nothing. Contact-sales plans never enter this flow.
 *
 * `@track-site/catalog` is a pure module (no Node APIs), so this file is safe in client components,
 * server components and `"use server"` actions alike.
 */

export const PLAN_PARAM = "plan";
export const INTERVAL_PARAM = "interval";
/** The billing period assumed when a link carries a plan but no (valid) interval: the toggle default. */
export const DEFAULT_INTERVAL: BillingInterval = "monthly";

export interface PlanSelection {
  planId: PaidPlanId;
  interval: BillingInterval;
}

/**
 * Validated selection from untrusted candidates (query params, form values). An unknown or
 * contact-sales plan yields null; an unknown interval falls back to monthly so a link that only names
 * the plan still lands on the right one.
 */
export function safePlanSelection(plan: unknown, interval: unknown): PlanSelection | null {
  if (!isPaidPlanId(plan)) return null;
  return { planId: plan, interval: isBillingInterval(interval) ? interval : DEFAULT_INTERVAL };
}

/** A Next.js `searchParams` record (already awaited) or a `URLSearchParams`. */
export type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function param(params: SearchParamsLike, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  return typeof value === "string" ? value : null; // a repeated param (string[]) is not a selection
}

/** Selection from a request's search params, or null when they carry none (or an invalid one). */
export function planSelectionFromSearchParams(params: SearchParamsLike): PlanSelection | null {
  return safePlanSelection(param(params, PLAN_PARAM), param(params, INTERVAL_PARAM));
}

/** `?plan=…&interval=…` (or `&plan=…&interval=…` when appended) for a selection; empty when there is none. */
export function planSelectionQuery(selection: PlanSelection | null, first = true): string {
  if (!selection) return "";
  return `${first ? "?" : "&"}${PLAN_PARAM}=${encodeURIComponent(selection.planId)}&${INTERVAL_PARAM}=${selection.interval}`;
}

/* ------------------------------------------------------------- storage */

/** Session-storage key of the selection remembered for the rest of the signup flow in this tab. */
export const PLAN_SELECTION_KEY = "ts-plan-selection";

/** Validated selection from the raw storage value (null for a missing, unreadable or unknown one). */
export function parseStoredPlanSelection(raw: string | null): PlanSelection | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { planId, interval } = parsed as Record<string, unknown>;
    return safePlanSelection(planId, interval);
  } catch {
    return null;
  }
}

/** Raw storage value; null without storage (SSR, private mode). A stable primitive, so `useSyncExternalStore` can read it. */
export function readStoredPlanSelectionRaw(): string | null {
  try {
    return sessionStorage.getItem(PLAN_SELECTION_KEY);
  } catch {
    return null; // no storage: the URL is the only source
  }
}

/** Selection remembered in this tab, if it is still a catalogue plan with a list price. */
export function readStoredPlanSelection(): PlanSelection | null {
  return parseStoredPlanSelection(readStoredPlanSelectionRaw());
}

/** Remember a validated selection for the rest of the flow in this tab (no-op without a selection). */
export function storePlanSelection(selection: PlanSelection | null): void {
  if (!selection) return;
  try {
    sessionStorage.setItem(PLAN_SELECTION_KEY, JSON.stringify({ planId: selection.planId, interval: selection.interval }));
  } catch {
    /* storage unavailable: the selection still travels in the URL */
  }
}
