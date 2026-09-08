import type { Tone } from "@track-site/ui";

/**
 * Label helpers of the Platform users module. `t` is the `opsUsers` namespace translator
 * (`getTranslations("opsUsers")` / `useTranslations("opsUsers")`); unknown codes fall back to the raw
 * value so nothing is hidden or invented.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

const pick = (t: TranslateFn, key: string, fallback: string, values?: Record<string, string | number | Date>): string => (t.has(key) ? t(key, values) : fallback);

export function errorLabel(t: TranslateFn, code: string | null | undefined): string {
  return pick(t, `errors.${code ?? "generic"}`, t("errors.generic"));
}

export function roleLabel(t: TranslateFn, role: string): string {
  return pick(t, `roles.${role}`, role);
}

/** Platform role → badge tone: admin stands out, support is informational, no role is neutral. */
export function roleTone(role: string): "primary" | "info" | "neutral" {
  return role === "PLATFORM_ADMIN" ? "primary" : role === "PLATFORM_SUPPORT" ? "info" : "neutral";
}

export function requestStateLabel(t: TranslateFn, state: string): string {
  return pick(t, `requests.states.${state}`, state);
}

export const REQUEST_STATE_TONE: Record<string, Tone> = { pending: "info", stale: "warn", expired: "neutral" };

export function historyActionLabel(t: TranslateFn, action: string): string {
  const key = action.replace(/^platform\.role\./, "");
  return pick(t, `history.actions.${key}`, action);
}

export function actorKindLabel(t: TranslateFn, kind: string): string {
  return pick(t, `history.actorKinds.${kind}`, kind);
}
