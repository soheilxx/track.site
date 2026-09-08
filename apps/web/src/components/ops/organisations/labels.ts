import type { Tone } from "@track-site/ui";

/**
 * Label helpers of the Organisations module. `t` is the `opsOrganisations` namespace translator
 * (`getTranslations("opsOrganisations")` or `useTranslations("opsOrganisations")`); unknown codes
 * fall back to the raw value so nothing is ever hidden or invented.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

const pick = (t: TranslateFn, key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);

export function errorLabel(t: TranslateFn, code: string | null | undefined): string {
  return pick(t, `errors.${code ?? "generic"}`, t("errors.generic"));
}

export function noticeLabel(t: TranslateFn, code: string): string {
  return pick(t, `notices.${code}`, code);
}

export function subscriptionStatusLabel(t: TranslateFn, status: string): string {
  return pick(t, `subscriptionStatus.${status}`, status);
}

/** Subscription status → tone (the customer's billing state, never decorative). */
export function subscriptionStatusTone(status: string): Tone {
  switch (status) {
    case "active":
      return "ok";
    case "trialing":
      return "info";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "warn";
    case "canceled":
    case "incomplete_expired":
      return "bad";
    default:
      return "neutral";
  }
}

export function siteStatusLabel(t: TranslateFn, status: string): string {
  return pick(t, `detail.sites.statuses.${status}`, status);
}

export function environmentKindLabel(t: TranslateFn, kind: string): string {
  return pick(t, `detail.sites.kinds.${kind}`, kind);
}

export function snippetLabel(t: TranslateFn, state: string): string {
  return pick(t, `detail.sites.snippetStates.${state}`, state);
}

export const SNIPPET_TONE: Record<string, Tone> = { verified: "ok", pending: "warn", none: "neutral" };

export function destinationStatusLabel(t: TranslateFn, status: string): string {
  return pick(t, `detail.destinations.statuses.${status}`, status);
}

export const DESTINATION_STATUS_TONE: Record<string, Tone> = { connected: "ok", paused: "info", error: "bad", not_connected: "warn", draft: "neutral" };

export function destinationHealthLabel(t: TranslateFn, status: string): string {
  return pick(t, `detail.destinations.healthStates.${status}`, status);
}

export const DESTINATION_HEALTH_TONE: Record<string, Tone> = { healthy: "ok", degraded: "warn", unhealthy: "bad", not_connected: "warn", unknown: "neutral" };

export function freshnessLabel(t: TranslateFn, freshness: string): string {
  return pick(t, `detail.destinations.freshness.${freshness}`, freshness);
}

export const FRESHNESS_TONE: Record<string, Tone> = { fresh: "ok", stale: "warn", missing: "neutral" };

export function alertKindLabel(t: TranslateFn, kind: string): string {
  return pick(t, `detail.signals.kinds.${kind}`, kind);
}

export const SEVERITY_TONE: Record<string, Tone> = { critical: "bad", warning: "warn", info: "info" };

/** Alert / issue severity label (`detail.signals.critical|warning|info`); an unknown severity stays raw. */
export function severityLabel(t: TranslateFn, severity: string): string {
  return pick(t, `detail.signals.${severity}`, severity);
}

export function actorKindLabel(t: TranslateFn, kind: string): string {
  return pick(t, `detail.audit.actorKinds.${kind}`, kind);
}

export function overagePolicyLabel(t: TranslateFn, policy: string): string {
  return pick(t, `detail.usage.policies.${policy}`, policy);
}
