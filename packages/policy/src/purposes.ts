import type { ConsentPurpose, ConsentState } from "@track-site/events";

export const PURPOSES: readonly ConsentPurpose[] = ["necessary", "analytics", "marketing", "personalization"];

export const PURPOSE_LABELS: Record<ConsentPurpose, { en: string; de: string }> = {
  necessary: { en: "Strictly necessary", de: "Technisch erforderlich" },
  analytics: { en: "Analytics", de: "Analyse" },
  marketing: { en: "Marketing", de: "Marketing" },
  personalization: { en: "Personalization", de: "Personalisierung" },
};

export function hasPurpose(consent: Pick<ConsentState, "granted">, purpose: ConsentPurpose): boolean {
  if (purpose === "necessary") return true;
  return consent.granted.includes(purpose);
}

/** A consent state is "explicit" when it comes from a real signal, not the default. */
export function isExplicitConsent(consent: Pick<ConsentState, "source">): boolean {
  return consent.source !== "default";
}

/** Global Privacy Control is an opt-out of sale/sharing: treat as no marketing/personalization. */
export function applyGpc(consent: ConsentState): ConsentState {
  if (!consent.gpc) return consent;
  return { ...consent, granted: consent.granted.filter((p) => p !== "marketing" && p !== "personalization") };
}

/** Google Consent Mode v2 flags derived from purposes; never guessed, always set before tags. */
export interface ConsentModeFlags {
  ad_storage: "granted" | "denied";
  analytics_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
  functionality_storage: "granted" | "denied";
  personalization_storage: "granted" | "denied";
  security_storage: "granted";
}

export function toConsentMode(consent: ConsentState): ConsentModeFlags {
  const c = applyGpc(consent);
  const g = (p: ConsentPurpose) => (hasPurpose(c, p) ? "granted" : "denied");
  return {
    ad_storage: g("marketing"),
    analytics_storage: g("analytics"),
    ad_user_data: g("marketing"),
    ad_personalization: g("personalization") === "granted" && g("marketing") === "granted" ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: g("personalization"),
    security_storage: "granted",
  };
}
