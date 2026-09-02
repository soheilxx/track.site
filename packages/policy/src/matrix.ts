import type { ConsentPurpose } from "@track-site/events";

/**
 * Connector types known to the platform. All of them are part of the first production release
 * (owner supplement 2026-09-03): ad platforms with browser tag + server API, affiliate postbacks
 * and the generic signed webhook.
 */
export const CONNECTOR_TYPES = [
  "webhook",
  "meta",
  "google_ads",
  "ga4",
  "tiktok",
  "microsoft",
  "linkedin",
  "reddit",
  "pinterest",
  "snapchat",
  "x",
  "taboola",
  "outbrain",
  "amazon",
  "spotify",
  "quora",
  "yahoo",
  "tradedesk",
  "gmp",
  "adroll",
  "criteo",
  "affiliate",
] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export function isConnectorType(v: unknown): v is ConnectorType {
  return typeof v === "string" && (CONNECTOR_TYPES as readonly string[]).includes(v);
}

/**
 * Purpose each destination type requires by default. Customers can only make this stricter.
 * A generic webhook targets the customer's own systems (controller-side processing), so it may run
 * under `necessary`; analytics products need `analytics`; every advertising platform and affiliate
 * network requires `marketing`.
 */
export const DESTINATION_PURPOSE: Record<ConnectorType, ConsentPurpose> = {
  webhook: "necessary",
  ga4: "analytics",
  meta: "marketing",
  google_ads: "marketing",
  tiktok: "marketing",
  microsoft: "marketing",
  linkedin: "marketing",
  reddit: "marketing",
  pinterest: "marketing",
  snapchat: "marketing",
  x: "marketing",
  taboola: "marketing",
  outbrain: "marketing",
  amazon: "marketing",
  spotify: "marketing",
  quora: "marketing",
  yahoo: "marketing",
  tradedesk: "marketing",
  gmp: "marketing",
  adroll: "marketing",
  criteo: "marketing",
  affiliate: "marketing",
};

/** Which click ids a destination may receive (never cross-vendor). */
export const DESTINATION_CLICK_IDS: Record<ConnectorType, string[]> = {
  webhook: [],
  ga4: ["gclid", "gbraid", "wbraid"],
  meta: ["fbclid"],
  google_ads: ["gclid", "gbraid", "wbraid"],
  tiktok: ["ttclid"],
  microsoft: ["msclkid"],
  linkedin: ["li_fat_id"],
  reddit: ["rdt_cid"],
  pinterest: ["epik"],
  snapchat: ["sccid"],
  x: ["twclid"],
  taboola: ["tblci"],
  outbrain: ["ob_click_id", "dicbo"],
  amazon: ["maas"],
  spotify: ["spclid"],
  quora: ["qclid"],
  yahoo: ["yclid", "vmcid"],
  tradedesk: ["ttd_uuid"],
  gmp: ["gclid", "dclid", "gbraid", "wbraid"],
  adroll: ["adroll_clid"],
  criteo: ["crto_clid"],
  affiliate: ["aff_click_id", "aff_sub_id", "awc", "cjevent", "irclickid", "tduid", "ttl", "utm_term"],
};

/** Vendor-side third-country transfer info for the privacy center (documentation, not a decision). */
export const DESTINATION_TRANSFER: Record<ConnectorType, { recipient: string; region: string; basis: string }> = {
  webhook: { recipient: "customer-defined endpoint", region: "customer-defined", basis: "customer contract" },
  ga4: { recipient: "Google Ireland Ltd.", region: "EU/US", basis: "SCC / DPF" },
  meta: { recipient: "Meta Platforms Ireland Ltd.", region: "EU/US", basis: "SCC / DPF" },
  google_ads: { recipient: "Google Ireland Ltd.", region: "EU/US", basis: "SCC / DPF" },
  tiktok: { recipient: "TikTok Technology Ltd.", region: "EU/US/SG", basis: "SCC" },
  microsoft: { recipient: "Microsoft Ireland Operations Ltd.", region: "EU/US", basis: "SCC / DPF" },
  linkedin: { recipient: "LinkedIn Ireland Unlimited Company", region: "EU/US", basis: "SCC / DPF" },
  reddit: { recipient: "Reddit, Inc.", region: "US", basis: "SCC / DPF" },
  pinterest: { recipient: "Pinterest Europe Ltd.", region: "EU/US", basis: "SCC / DPF" },
  snapchat: { recipient: "Snap Inc.", region: "US", basis: "SCC / DPF" },
  x: { recipient: "X Corp.", region: "US", basis: "SCC" },
  taboola: { recipient: "Taboola, Inc.", region: "US/EU", basis: "SCC" },
  outbrain: { recipient: "Outbrain Inc.", region: "US/EU", basis: "SCC" },
  amazon: { recipient: "Amazon Advertising LLC", region: "US/EU", basis: "SCC / DPF" },
  spotify: { recipient: "Spotify AB", region: "EU/US", basis: "SCC" },
  quora: { recipient: "Quora, Inc.", region: "US", basis: "SCC" },
  yahoo: { recipient: "Yahoo EMEA Ltd.", region: "EU/US", basis: "SCC / DPF" },
  tradedesk: { recipient: "The Trade Desk, Inc.", region: "US/EU", basis: "SCC / DPF" },
  gmp: { recipient: "Google Ireland Ltd.", region: "EU/US", basis: "SCC / DPF" },
  adroll: { recipient: "NextRoll, Inc.", region: "US", basis: "SCC / DPF" },
  criteo: { recipient: "Criteo SA", region: "EU", basis: "EU controller" },
  affiliate: { recipient: "affiliate network (customer-selected)", region: "network-specific", basis: "customer contract" },
};

export type RegionMode = "strict_opt_in" | "opt_out" | "notice_only";

/** Region groups; the default is strict opt-in everywhere until the customer documents a legal review. */
export const REGION_GROUPS: Record<string, string[]> = {
  EU: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO"],
  UK: ["GB"],
  CH: ["CH"],
  BR: ["BR"],
  US: ["US"],
};

export function regionGroupOf(countryCode: string | null | undefined): string {
  if (!countryCode) return "UNKNOWN";
  const cc = countryCode.toUpperCase();
  for (const [group, list] of Object.entries(REGION_GROUPS)) if (list.includes(cc)) return group;
  return "OTHER";
}

export interface RegionPolicy {
  mode: RegionMode;
  /** advanced consent mode (cookieless pings) only after explicit legal review */
  allowAdvancedConsentMode: boolean;
}

export const DEFAULT_REGION_POLICIES: Record<string, RegionPolicy> = {
  EU: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
  UK: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
  CH: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
  BR: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
  US: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
  OTHER: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
  UNKNOWN: { mode: "strict_opt_in", allowAdvancedConsentMode: false },
};
