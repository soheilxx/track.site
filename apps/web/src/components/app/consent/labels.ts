import { consentSourceSchema } from "@track-site/events";
import { isConnectorType } from "@track-site/policy";
import type { PolicyChange } from "@/server/consent-policy";
import { REGION_GROUP_ORDER } from "@/server/consent-simulator";

/**
 * Label helpers shared by the server and client components of the module. `t` is the `consent`
 * namespace translator (from `getTranslations` or `useTranslations`); unknown codes fall back to the
 * raw value so nothing is ever hidden.
 */
export type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

const KNOWN_SIGNALS = new Set(consentSourceSchema.options.map((s) => s.replace(":", "_")));

export function regionGroupLabel(t: TranslateFn, group: string): string {
  return (REGION_GROUP_ORDER as readonly string[]).includes(group) ? t(`regionGroups.${group}`) : group;
}

export function connectorLabel(t: TranslateFn, connectorType: string): string {
  return isConnectorType(connectorType) ? t(`connectors.${connectorType}`) : connectorType;
}

export function signalLabel(t: TranslateFn, source: string): string {
  const key = source.replace(":", "_");
  return KNOWN_SIGNALS.has(key) ? t(`signals.${key}`) : source;
}

export function purposeLabel(t: TranslateFn, purpose: string): string {
  return t(`purposes.${purpose}`);
}

export function regionModeLabel(t: TranslateFn, mode: string): string {
  return t(`regionModes.${mode}`);
}

/** One readable sentence per policy change (the diff shown before publishing and in the editor's confirmation). */
export function describeChange(t: TranslateFn, change: PolicyChange): string {
  switch (change.kind) {
    case "region":
      return t("policy.change.region", { group: regionGroupLabel(t, change.key), from: regionModeLabel(t, change.from), to: regionModeLabel(t, change.to) });
    case "destination":
      return t("policy.change.destination", { destination: connectorLabel(t, change.key), from: purposeLabel(t, change.from), to: purposeLabel(t, change.to) });
    case "operational":
      return change.added ? t("policy.change.operationalAdded", { event: change.key }) : t("policy.change.operationalRemoved", { event: change.key });
  }
}

const KNOWN_ERRORS = new Set(["generic", "email", "notFound", "draftExists", "notDraft", "confirmWeaker", "confirmRequired", "legalNote", "purposeTooWeak", "invalid", "tooLong", "fields"]);

/** Maps an action error code to its message; unknown codes read as the generic error. */
export function errorLabel(t: TranslateFn, code: string | null | undefined, values?: Record<string, string | number>): string {
  return t(`errors.${code && KNOWN_ERRORS.has(code) ? code : "generic"}`, values);
}
