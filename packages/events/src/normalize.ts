import { newUlid, scrubUrl, sha256Hex, normalizeEmail, normalizePhoneDigits } from "@track-site/core";
import {
  type CanonicalEvent,
  type ConsentState,
  type HashedUserData,
  type IncomingBrowserEvent,
  type IncomingServerEvent,
  type ProvenanceEntry,
  SCHEMA_VERSION,
} from "./schema.ts";
import { LEGACY_NAME_MAP, getStandardEvent, isValidCustomEventName } from "./standard-events.ts";

export interface SiteRef {
  organizationId: string;
  siteId: string;
  trackingId: string;
  environmentId: string;
}

export interface NormalizeContext {
  site: SiteRef;
  serverTs: Date;
  /** truncated IP (/24 or /48) computed by the collector; never the raw IP */
  ipTruncated: string | null;
  uaFamily: string | null;
  clickIdTtlDays?: number;
}

export type NormalizeResult =
  | { ok: true; event: CanonicalEvent; warnings: string[] }
  | { ok: false; reason: string };

const DEFAULT_CLICK_ID_TTL_DAYS = 90;

function observed(source: string, at: string): ProvenanceEntry {
  return {
    data_class: "OBSERVED",
    source,
    at,
    algorithm: null,
    algorithm_version: null,
    inputs: null,
    model: null,
    confidence: null,
    expires_at: null,
    human_confirmed_at: null,
  };
}

function derived(source: string, at: string, algorithm: string, inputs: string[]): ProvenanceEntry {
  return { ...observed(source, at), data_class: "DERIVED", algorithm, algorithm_version: "1", inputs };
}

export function canonicalName(name: string): { name: string; isStandard: boolean } | null {
  const mapped = LEGACY_NAME_MAP[name] ?? name;
  const std = getStandardEvent(mapped);
  if (std) return { name: std.name, isStandard: true };
  const lower = mapped.toLowerCase();
  if (isValidCustomEventName(lower)) return { name: lower, isStandard: false };
  return null;
}

export function hashUserData(raw: IncomingServerEvent["user_data"] | undefined): HashedUserData | null {
  if (!raw) return null;
  const h = (v: string | null | undefined, norm: (s: string) => string = (s) => s.trim().toLowerCase()) =>
    v && v.trim() ? sha256Hex(norm(v)) : null;
  const out: HashedUserData = {
    em: h(raw.email, normalizeEmail),
    ph: h(raw.phone, normalizePhoneDigits),
    fn: h(raw.first_name),
    ln: h(raw.last_name),
    ct: h(raw.city, (s) => s.trim().toLowerCase().replace(/[^a-z]/g, "")),
    zp: h(raw.zip, (s) => s.trim().toLowerCase().replace(/\s/g, "")),
    country: raw.country ? raw.country.trim().toLowerCase().slice(0, 2) : null,
    external_id: h(raw.external_id, (s) => s.trim()),
  };
  return Object.values(out).every((v) => v === null) ? null : out;
}

function clickIdsWithLineage(
  ids: Record<string, string | undefined> | undefined,
  source: string,
  at: Date,
  ttlDays: number,
): CanonicalEvent["click_ids"] {
  if (!ids) return null;
  const out: NonNullable<CanonicalEvent["click_ids"]> = {};
  const expires = new Date(at.getTime() + ttlDays * 86_400_000).toISOString();
  for (const [k, v] of Object.entries(ids)) {
    if (v) out[k] = { value: v, source, captured_at: at.toISOString(), expires_at: expires };
  }
  return Object.keys(out).length ? out : null;
}

function defaultConsent(): ConsentState {
  return { granted: ["necessary"], source: "default", policy_version: null, ts: null, region: null, gpc: null };
}

export function normalizeBrowserEvent(input: IncomingBrowserEvent, ctx: NormalizeContext): NormalizeResult {
  const named = canonicalName(input.name);
  if (!named) return { ok: false, reason: "invalid_event_name" };
  const warnings: string[] = [];
  const serverTs = ctx.serverTs.toISOString();
  const clientTs = new Date(input.ts);
  if (Math.abs(clientTs.getTime() - ctx.serverTs.getTime()) > 48 * 3_600_000) return { ok: false, reason: "timestamp_out_of_window" };
  const scrubbed = scrubUrl(input.page.url);
  if (!scrubbed) return { ok: false, reason: "invalid_url" };
  const referrer = input.page.referrer ? (scrubUrl(input.page.referrer)?.url ?? null) : null;
  const clickIds = { ...scrubbed.clickIds, ...(input.click_ids ?? {}) };
  const std = named.isStandard ? getStandardEvent(named.name) : undefined;
  const provenance: Record<string, ProvenanceEntry> = {
    name: observed("browser", serverTs),
    url: derived("browser", serverTs, "url_scrub", ["page.url"]),
  };
  if (input.commerce) provenance.commerce = observed("browser", serverTs);
  const commerce = input.commerce ?? null;
  if (std?.commerce && std.requiredParams.length && !commerce) warnings.push("commerce_params_missing");
  const event: CanonicalEvent = {
    event_id: newUlid(),
    source_event_id: input.id,
    organization_id: ctx.site.organizationId,
    site_id: ctx.site.siteId,
    site_tracking_id: ctx.site.trackingId,
    environment_id: ctx.site.environmentId,
    name: named.name,
    is_standard: named.isStandard,
    category: std?.category ?? "custom",
    client_ts: clientTs.toISOString(),
    server_ts: serverTs,
    anonymous_id: input.ids.anonymous_id ?? null,
    session_id: input.ids.session_id ?? null,
    user_id: input.ids.user_id ?? null,
    url: scrubbed.url,
    host: scrubbed.host,
    path: scrubbed.path,
    referrer,
    title: input.page.title ?? null,
    utm: Object.keys(scrubbed.utm).length ? (scrubbed.utm as Record<string, string>) : null,
    click_ids: clickIdsWithLineage(clickIds, "browser", ctx.serverTs, ctx.clickIdTtlDays ?? DEFAULT_CLICK_ID_TTL_DAYS),
    vendor_ids: input.vendor_ids ?? null,
    consent: input.consent,
    consent_snapshot_id: null,
    props: input.props ?? null,
    commerce,
    user_data: null,
    ip_truncated: ctx.ipTruncated,
    ua_family: ctx.uaFamily,
    locale: input.locale ?? null,
    source: "browser",
    source_verified: false,
    sdk_version: input.sdk.version,
    config_version: input.sdk.config_version,
    schema_version: SCHEMA_VERSION,
    provenance,
    processing_state: "normalized",
    drop_reason: null,
    is_billable: false,
    is_bot: false,
  };
  return { ok: true, event, warnings };
}

export function normalizeServerEvent(input: IncomingServerEvent, ctx: NormalizeContext): NormalizeResult {
  const named = canonicalName(input.name);
  if (!named) return { ok: false, reason: "invalid_event_name" };
  const warnings: string[] = [];
  const serverTs = ctx.serverTs.toISOString();
  const clientTs = input.ts ? new Date(input.ts) : null;
  if (clientTs && Math.abs(clientTs.getTime() - ctx.serverTs.getTime()) > 7 * 86_400_000) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }
  const scrubbed = input.page?.url ? scrubUrl(input.page.url) : null;
  const std = named.isStandard ? getStandardEvent(named.name) : undefined;
  const source = input.source;
  const provenance: Record<string, ProvenanceEntry> = { name: observed(source, serverTs) };
  const userData = hashUserData(input.user_data);
  if (userData) provenance.user_data = derived(source, serverTs, "sha256_normalized", ["user_data"]);
  if (input.commerce) provenance.commerce = observed(input.source_verified ? `${source}:verified` : source, serverTs);
  if (std?.name === "purchase" && !input.commerce?.order_id) warnings.push("purchase_without_order_id");
  const consent: ConsentState = { ...defaultConsent(), ...(input.consent ?? {}), source: input.consent?.source ?? "server" };
  const event: CanonicalEvent = {
    event_id: newUlid(),
    source_event_id: input.id ?? newUlid(),
    organization_id: ctx.site.organizationId,
    site_id: ctx.site.siteId,
    site_tracking_id: ctx.site.trackingId,
    environment_id: ctx.site.environmentId,
    name: named.name,
    is_standard: named.isStandard,
    category: std?.category ?? "custom",
    client_ts: clientTs ? clientTs.toISOString() : null,
    server_ts: serverTs,
    anonymous_id: input.ids?.anonymous_id ?? null,
    session_id: input.ids?.session_id ?? null,
    user_id: input.ids?.user_id ?? null,
    url: scrubbed?.url ?? null,
    host: scrubbed?.host ?? null,
    path: scrubbed?.path ?? null,
    referrer: input.page?.referrer ? (scrubUrl(input.page.referrer)?.url ?? null) : null,
    title: input.page?.title ?? null,
    utm: scrubbed && Object.keys(scrubbed.utm).length ? (scrubbed.utm as Record<string, string>) : null,
    click_ids: clickIdsWithLineage({ ...(scrubbed?.clickIds ?? {}), ...(input.click_ids ?? {}) }, source, ctx.serverTs, ctx.clickIdTtlDays ?? DEFAULT_CLICK_ID_TTL_DAYS),
    vendor_ids: input.vendor_ids ?? null,
    consent,
    consent_snapshot_id: null,
    props: input.props ?? null,
    commerce: input.commerce ?? null,
    user_data: userData,
    ip_truncated: ctx.ipTruncated,
    ua_family: ctx.uaFamily,
    locale: null,
    source,
    source_verified: input.source_verified,
    sdk_version: "server",
    config_version: null,
    schema_version: SCHEMA_VERSION,
    provenance,
    processing_state: "normalized",
    drop_reason: null,
    is_billable: false,
    is_bot: false,
  };
  return { ok: true, event, warnings };
}

/** Truncate an IP for geo/bot purposes: IPv4 /24, IPv6 /48. Raw IPs are never persisted. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 3).join(":")}::`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

/** Coarse UA family only (no full UA string persisted). */
export function uaFamily(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|preview/i.test(ua)) return "bot";
  if (/Edg\//.test(ua)) return "edge";
  if (/OPR\//.test(ua)) return "opera";
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "other";
}
