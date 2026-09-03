import { AppError } from "@track-site/core";
import { LEGACY_NAME_MAP, STANDARD_EVENT_NAMES, getStandardEvent, isValidCustomEventName } from "@track-site/events";

/**
 * Tolerant normalisation for values the model tends to phrase in natural language. Tool schemas stay
 * simple (plain strings), the handler maps names to ISO codes and rejects only what cannot be mapped —
 * with a message the model can act on.
 */
const COUNTRY_NAMES: Record<string, string> = {
  germany: "DE", deutschland: "DE", de: "DE",
  austria: "AT", österreich: "AT", oesterreich: "AT", at: "AT",
  switzerland: "CH", schweiz: "CH", ch: "CH",
  netherlands: "NL", niederlande: "NL", holland: "NL", nl: "NL",
  belgium: "BE", belgien: "BE", be: "BE",
  france: "FR", frankreich: "FR", fr: "FR",
  italy: "IT", italien: "IT", it: "IT",
  spain: "ES", spanien: "ES", es: "ES",
  portugal: "PT", pt: "PT",
  poland: "PL", polen: "PL", pl: "PL",
  czechia: "CZ", "czech republic": "CZ", tschechien: "CZ", cz: "CZ",
  denmark: "DK", dänemark: "DK", daenemark: "DK", dk: "DK",
  sweden: "SE", schweden: "SE", se: "SE",
  norway: "NO", norwegen: "NO", no: "NO",
  finland: "FI", finnland: "FI", fi: "FI",
  ireland: "IE", irland: "IE", ie: "IE",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB", großbritannien: "GB", grossbritannien: "GB", gb: "GB",
  luxembourg: "LU", luxemburg: "LU", lu: "LU",
  liechtenstein: "LI", li: "LI",
  "united states": "US", usa: "US", "vereinigte staaten": "US", us: "US",
  canada: "CA", kanada: "CA", ca: "CA",
  australia: "AU", australien: "AU", au: "AU",
  "new zealand": "NZ", neuseeland: "NZ", nz: "NZ",
  japan: "JP", jp: "JP",
  brazil: "BR", brasilien: "BR", br: "BR",
  mexico: "MX", mexiko: "MX", mx: "MX",
  india: "IN", indien: "IN", in: "IN",
  turkey: "TR", türkei: "TR", tuerkei: "TR", tr: "TR",
  greece: "GR", griechenland: "GR", gr: "GR",
  hungary: "HU", ungarn: "HU", hu: "HU",
  romania: "RO", rumänien: "RO", rumaenien: "RO", ro: "RO",
  croatia: "HR", kroatien: "HR", hr: "HR",
  slovakia: "SK", slowakei: "SK", sk: "SK",
  slovenia: "SI", slowenien: "SI", si: "SI",
  bulgaria: "BG", bulgarien: "BG", bg: "BG",
  estonia: "EE", estland: "EE", ee: "EE",
  latvia: "LV", lettland: "LV", lv: "LV",
  lithuania: "LT", litauen: "LT", lt: "LT",
  eu: "EU", "european union": "EU", "europäische union": "EU", europa: "EU", europe: "EU",
};

const CURRENCY_NAMES: Record<string, string> = {
  eur: "EUR", euro: "EUR", euros: "EUR", "€": "EUR",
  usd: "USD", dollar: "USD", dollars: "USD", "us dollar": "USD", "us-dollar": "USD", "$": "USD",
  gbp: "GBP", pound: "GBP", pounds: "GBP", pfund: "GBP", "british pound": "GBP", "£": "GBP",
  chf: "CHF", franken: "CHF", "swiss franc": "CHF", "schweizer franken": "CHF",
  sek: "SEK", dkk: "DKK", nok: "NOK", pln: "PLN", czk: "CZK", huf: "HUF", jpy: "JPY", yen: "JPY", cad: "CAD", aud: "AUD", nzd: "NZD", brl: "BRL", mxn: "MXN", inr: "INR", try: "TRY", ron: "RON", bgn: "BGN",
};

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Maps country names or codes (any language of the table, any case) to ISO 3166-1 alpha-2; throws a VALIDATION_ERROR naming what could not be mapped. */
export function normalizeMarkets(values: readonly string[] | null | undefined): string[] | null {
  if (!values) return null;
  const out: string[] = [];
  const unknown: string[] = [];
  for (const raw of values) {
    const k = key(raw);
    if (!k) continue;
    const mapped = /^[a-z]{2}$/.test(k) ? k.toUpperCase() : COUNTRY_NAMES[k];
    if (!mapped) unknown.push(raw.trim().slice(0, 40));
    else if (!out.includes(mapped)) out.push(mapped);
  }
  if (unknown.length) throw new AppError("VALIDATION_ERROR", `markets must be ISO 3166-1 alpha-2 codes such as DE, AT, CH; could not map: ${unknown.join(", ")}`);
  return out;
}

/** Mirrors the reserved prefixes enforced by `isValidCustomEventName` in @track-site/events (documentation for the model). */
export const RESERVED_EVENT_PREFIXES = ["track_", "ts_", "internal_", "system_", "google_", "gtm_", "ga_", "fb_", "meta_"];

/** One sentence the model can act on; used in field descriptions and validation errors. */
export const EVENT_NAME_RULE = `canonical lower snake_case matching ^[a-z][a-z0-9_]{1,63}$ and not starting with ${RESERVED_EVENT_PREFIXES.join("/")}; standard events: ${STANDARD_EVENT_NAMES.join(", ")}. Vendor spellings (AddToCart, Lead, PageView) and names with spaces are normalised automatically.`;

const compactKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const COMPACT_LOOKUP = new Map<string, string>([
  ...STANDARD_EVENT_NAMES.map((n): [string, string] => [compactKey(n), n]),
  ...Object.entries(LEGACY_NAME_MAP).map(([k, v]): [string, string] => [compactKey(k), v]),
]);

/**
 * Maps vendor, camelCase or spaced event names to the canonical snake_case name shared by
 * create_trigger_draft, run_test_event, upsert_event_mapping_draft and propose_event_plan.
 * Standard events win over custom names; anything that cannot be mapped throws a VALIDATION_ERROR
 * that states the rule and the standard vocabulary.
 */
export function normalizeEventName(raw: string): { name: string; isStandard: boolean } {
  const trimmed = raw.trim();
  const snake = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-.]+/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const candidate = LEGACY_NAME_MAP[trimmed] ?? COMPACT_LOOKUP.get(compactKey(trimmed)) ?? snake;
  if (candidate && getStandardEvent(candidate)) return { name: candidate, isStandard: true };
  if (candidate && isValidCustomEventName(candidate)) return { name: candidate, isStandard: false };
  throw new AppError("VALIDATION_ERROR", `event name "${trimmed.slice(0, 40)}" is not valid: event names are ${EVENT_NAME_RULE}`);
}

/** Maps currency names or codes to ISO 4217; throws a VALIDATION_ERROR the model can act on. */
export function normalizeCurrency(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const k = key(value);
  if (!k) return null;
  const mapped = CURRENCY_NAMES[k] ?? (/^[a-z]{3}$/.test(k) ? k.toUpperCase() : null);
  if (!mapped) throw new AppError("VALIDATION_ERROR", `currency must be an ISO 4217 code such as EUR or USD; could not map: ${value.trim().slice(0, 40)}`);
  return mapped;
}
