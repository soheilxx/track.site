/**
 * URL scrubbing before persistence and vendor dispatch. Removes query parameters that
 * commonly carry personal data or secrets, keeps campaign parameters, and extracts click IDs
 * into a separate structure so the policy engine can decide whether they may be kept.
 */
/** Click-id query parameters and the vendor family they belong to (captured only with marketing consent). */
export const CLICK_ID_PARAMS = {
  gclid: "google",
  gbraid: "google",
  wbraid: "google",
  dclid: "google",
  fbclid: "meta",
  ttclid: "tiktok",
  rdt_cid: "reddit",
  li_fat_id: "linkedin",
  msclkid: "microsoft",
  epik: "pinterest",
  sccid: "snapchat",
  twclid: "x",
  tblci: "taboola",
  obclid: "outbrain",
  dicbo: "outbrain",
  maas: "amazon",
  spclid: "spotify",
  qclid: "quora",
  yclid: "yahoo",
  vmcid: "yahoo",
  ttd_uuid: "tradedesk",
  adroll_clid: "adroll",
  crto_clid: "criteo",
  aff_click_id: "affiliate",
  aff_sub_id: "affiliate",
  awc: "affiliate",
  cjevent: "affiliate",
  irclickid: "affiliate",
  tduid: "affiliate",
} as const;
export type ClickIdParam = keyof typeof CLICK_ID_PARAMS;

export const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"] as const;
export type UtmParam = (typeof UTM_PARAMS)[number];

const BLOCKED_PARAM_PATTERNS = [
  /^(email|e-mail|mail|phone|tel|mobile|name|first_?name|last_?name|address|street|zip|postal|iban|ssn|dob|birth)/i,
  /(token|secret|password|passwd|pwd|auth|session|sid|api_?key|access_?key|signature|otp|code)$/i,
  /^(token|secret|password|passwd|pwd|auth|session|sid|api_?key|access_?key|signature|otp)/i,
];

const EMAIL_LIKE = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i;

export interface ScrubbedUrl {
  url: string;
  host: string;
  path: string;
  clickIds: Partial<Record<ClickIdParam, string>>;
  utm: Partial<Record<UtmParam, string>>;
  removedParams: string[];
}

export function scrubUrl(
  raw: string,
  options: { allowParams?: string[]; blockParams?: string[]; keepClickIdsInUrl?: boolean } = {},
): ScrubbedUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  const clickIds: ScrubbedUrl["clickIds"] = {};
  const utm: ScrubbedUrl["utm"] = {};
  const removed: string[] = [];
  const allow = new Set((options.allowParams ?? []).map((p) => p.toLowerCase()));
  const block = new Set((options.blockParams ?? []).map((p) => p.toLowerCase()));
  const keys = Array.from(new Set(Array.from(parsed.searchParams.keys())));
  for (const key of keys) {
    const lower = key.toLowerCase();
    const value = parsed.searchParams.get(key) ?? "";
    if (lower in CLICK_ID_PARAMS) {
      if (value && value.length <= 256) clickIds[lower as ClickIdParam] = value;
      if (!options.keepClickIdsInUrl) parsed.searchParams.delete(key);
      continue;
    }
    if ((UTM_PARAMS as readonly string[]).includes(lower)) {
      utm[lower as UtmParam] = value.slice(0, 200);
      continue;
    }
    if (allow.has(lower)) continue;
    const blocked =
      block.has(lower) || BLOCKED_PARAM_PATTERNS.some((re) => re.test(lower)) || EMAIL_LIKE.test(value);
    if (blocked) {
      parsed.searchParams.delete(key);
      removed.push(key);
    }
  }
  const path = parsed.pathname
    .split("/")
    .map((seg) => (EMAIL_LIKE.test(safeDecode(seg)) ? "_redacted_" : seg))
    .join("/");
  parsed.pathname = path;
  return {
    url: parsed.toString().slice(0, 2048),
    host: parsed.hostname.toLowerCase(),
    path,
    clickIds,
    utm,
    removedParams: removed,
  };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Compare hostnames including wildcard allow-list entries like `*.example.com`. */
export function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const a = allowed.toLowerCase().replace(/\.$/, "");
  if (a.startsWith("*.")) {
    const base = a.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  return h === a;
}

export function isLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

/** Normalize a customer-entered domain ("https://www.Shop.de/path") to a bare lower-case hostname. */
export function normalizeDomainInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const withScheme = /^[a-z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.replace(/\.$/, "");
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) && !isLocalhost(host)) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}
