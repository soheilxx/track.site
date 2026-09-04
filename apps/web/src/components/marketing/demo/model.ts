/**
 * Vocabulary of the interactive hero demo (docs/12 §5, supplement §4). Plain unions only: the copy
 * module (`lib/marketing-copy/types.ts`) keys its labels on them, the fixtures and the reducer use
 * them, and nothing here depends on React or the DOM.
 */

export const DEMO_VIEWS = ["overview", "events", "destinations", "ai", "attribution"] as const;
export type DemoViewId = (typeof DEMO_VIEWS)[number];

export const DEMO_PLATFORMS = ["meta", "google", "tiktok", "linkedin", "reddit"] as const;
export type DemoPlatformId = (typeof DEMO_PLATFORMS)[number];

export const DEMO_EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "BeginCheckout", "Purchase", "Lead"] as const;
export type DemoEventName = (typeof DEMO_EVENT_NAMES)[number];

export type DemoOrigin = "browser" | "server";
export type DemoConsent = "granted" | "denied" | "pending";
/** `paired`: browser + server carried the same event id and were merged; `duplicate`: the second arrival, dropped. */
export type DemoDedup = "unique" | "paired" | "duplicate";
export type DemoOutcome = "delivered" | "blocked" | "held" | "duplicate";
/** Why an event was delivered, blocked, held or dropped — every key has a visible sentence in the copy. */
export type DemoReason = "delivered" | "consent_denied" | "consent_pending" | "missing_currency" | "duplicate" | "released";
export type DemoHealthPart = "consent" | "dedup" | "params" | "delivery";
export const DEMO_HEALTH_PARTS: readonly DemoHealthPart[] = ["consent", "dedup", "params", "delivery"];
export const DEMO_CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type DemoCurrency = (typeof DEMO_CURRENCIES)[number];
export type DemoHealthTone = "ok" | "warn" | "bad";

export function isDemoView(value: unknown): value is DemoViewId {
  return typeof value === "string" && (DEMO_VIEWS as readonly string[]).includes(value);
}
export function isDemoPlatform(value: unknown): value is DemoPlatformId {
  return typeof value === "string" && (DEMO_PLATFORMS as readonly string[]).includes(value);
}
export function isDemoCurrency(value: unknown): value is DemoCurrency {
  return typeof value === "string" && (DEMO_CURRENCIES as readonly string[]).includes(value);
}
