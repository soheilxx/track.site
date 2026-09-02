import { DESTINATION_TRANSFER } from "@track-site/policy";
import type {
  BrowserTagConfig,
  Connector,
  ConnectorContext,
  ConnectorMeta,
  CredentialValidation,
  DispatchEvent,
  DispatchResult,
  EventMapping,
  ErrorClass,
  HealthResult,
  ValidationResult,
  VendorPayload,
} from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";

/**
 * Google Analytics 4: gtag.js in the browser plus the Measurement Protocol server-side.
 * Verified 2026-09-02 against https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference:
 * POST https://region1.google-analytics.com/mp/collect?measurement_id=G-…&api_secret=… (EU endpoint),
 * body { client_id, user_id?, timestamp_micros?, consent?, user_data?, events[<=25]{name<=40 chars, params<=25} }.
 * Production returns 2xx regardless of validity; semantic validation uses /debug/mp/collect
 * (validationMessages[]). MP supplements browser tagging; purchase dedup uses transaction_id.
 */
export const GA4_EVENT_NAMES: Record<string, string> = {
  page_view: "page_view",
  view_content: "view_item",
  view_item: "view_item",
  view_item_list: "view_item_list",
  select_item: "select_item",
  search: "search",
  sign_up: "sign_up",
  login: "login",
  generate_lead: "generate_lead",
  add_to_wishlist: "add_to_wishlist",
  add_to_cart: "add_to_cart",
  remove_from_cart: "remove_from_cart",
  view_cart: "view_cart",
  begin_checkout: "begin_checkout",
  add_shipping_info: "add_shipping_info",
  add_payment_info: "add_payment_info",
  purchase: "purchase",
  refund: "refund",
  subscribe: "subscribe",
  start_trial: "start_trial",
  contact: "contact",
  book_appointment: "book_appointment",
  download: "file_download",
};

const RESERVED_PREFIX = /^(google_|ga_|firebase_)/;

export const ga4Meta: ConnectorMeta = {
  type: "ga4",
  displayName: "Google Analytics 4",
  apiVersion: API_VERSIONS.ga4.version,
  verifiedAt: API_VERSIONS.ga4.verifiedAt,
  sunsetWatch: null,
  docsUrl: API_VERSIONS.ga4.docsUrl,
  requiredPublicIds: [{ key: "measurement_id", label: "Measurement ID", pattern: "^G-[A-Z0-9]{4,14}$", example: "G-ABC123DEF4", help: "Admin → Data streams → your web stream. Public." }],
  requiredCredentials: [{ kind: "api_secret", label: "Measurement Protocol API secret", help: "Admin → Data streams → web stream → Measurement Protocol API secrets → Create. Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "transaction_id",
  transfer: DESTINATION_TRANSFER.ga4,
};

function baseUrl(ctx: ConnectorContext, debug: boolean): string {
  if (ctx.baseUrlOverride) return `${ctx.baseUrlOverride.replace(/\/$/, "")}/ga4${debug ? "/debug" : ""}/mp/collect`;
  return debug ? "https://www.google-analytics.com/debug/mp/collect" : "https://region1.google-analytics.com/mp/collect";
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  return out as Partial<T>;
}

function clientIdOf(input: DispatchEvent): string {
  const ga = input.event.vendor_ids?.ga_client_id;
  if (ga) return ga;
  const anon = input.event.anonymous_id ?? input.event.session_id ?? input.dedupId;
  // GA4 expects "<random>.<timestamp>"; derive a stable pseudo client id from the anonymous id
  let h = 0;
  for (const ch of anon) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${h}.${Math.floor(new Date(input.event.server_ts).getTime() / 1000)}`;
}

export class Ga4Connector implements Connector {
  readonly meta = ga4Meta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.measurement_id === "string" ? publicConfig.measurement_id : null;
    return id ? { template: "gtag", ids: { measurement_id: id }, consentPurpose: "analytics" } : null;
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const measurementId = String(ctx.publicConfig.measurement_id ?? "");
    if (!measurementId) return null;
    const name = (mapping.vendorEvent || GA4_EVENT_NAMES[e.name] || e.name).slice(0, 40);
    const c = e.commerce;
    const items = (c?.items ?? []).slice(0, 200).map((i) => compact({ item_id: i.item_id, item_name: i.item_name ?? null, price: i.price ?? null, quantity: i.quantity ?? null, item_brand: i.brand ?? null, item_category: i.category ?? null, item_variant: i.variant ?? null }));
    const params: Record<string, unknown> = compact({
      engagement_time_msec: 100,
      page_location: e.url,
      page_referrer: e.referrer,
      page_title: e.title,
      currency: c?.currency ?? null,
      value: c?.value ?? null,
      transaction_id: name === "purchase" || name === "refund" ? (c?.order_id ?? c?.transaction_id ?? null) : null,
      tax: c?.tax ?? null,
      shipping: c?.shipping ?? null,
      coupon: c?.coupon ?? null,
      items: items.length ? items : null,
      search_term: typeof e.props?.search_term === "string" ? e.props.search_term : null,
      method: typeof e.props?.method === "string" ? e.props.method : null,
      file_name: typeof e.props?.file_name === "string" ? e.props.file_name : null,
    });
    for (const [k, v] of Object.entries(e.props ?? {})) {
      if (Object.keys(params).length >= 25) break;
      if (k in params || RESERVED_PREFIX.test(k) || typeof v === "object") continue;
      if (typeof v === "string") params[k.slice(0, 40)] = v.slice(0, 100);
      else if (typeof v === "number" || typeof v === "boolean") params[k.slice(0, 40)] = v;
    }
    const granted = e.consent.granted;
    const body = compact({
      client_id: clientIdOf(input),
      user_id: e.user_id,
      timestamp_micros: e.client_ts ? new Date(e.client_ts).getTime() * 1000 : null,
      non_personalized_ads: !granted.includes("marketing"),
      consent: { ad_user_data: granted.includes("marketing") ? "GRANTED" : "DENIED", ad_personalization: granted.includes("personalization") && granted.includes("marketing") ? "GRANTED" : "DENIED" },
      user_data: e.user_data?.em || e.user_data?.ph ? compact({ sha256_email_address: e.user_data.em ? [e.user_data.em] : null, sha256_phone_number: e.user_data.ph ? [e.user_data.ph] : null }) : null,
      events: [{ name, params }],
    });
    return {
      vendorEventName: name,
      dedupKey: name === "purchase" ? (c?.order_id ?? input.dedupId) : input.dedupId,
      endpoint: `${baseUrl(ctx, false)}?measurement_id=${encodeURIComponent(measurementId)}`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      preview: { ...body, user_data: body.user_data ? "[hashed]" : undefined },
      eventId: e.event_id,
    };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const body = payload.body as { client_id?: string; events?: Array<{ name: string; params?: Record<string, unknown> }>; timestamp_micros?: number };
    if (!body.client_id) errors.push("client_id required");
    if (!body.events?.length || body.events.length > 25) errors.push("1-25 events per request");
    for (const ev of body.events ?? []) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(ev.name)) errors.push(`invalid event name ${ev.name}`);
      if (RESERVED_PREFIX.test(ev.name)) errors.push(`reserved event name ${ev.name}`);
      if (ev.params && Object.keys(ev.params).length > 25) errors.push("max 25 params per event");
    }
    if (body.timestamp_micros && Date.now() * 1000 - body.timestamp_micros > 72 * 3_600_000 * 1000) errors.push("timestamp older than 72 hours");
    if (JSON.stringify(payload.body).length > 130_000) errors.push("body exceeds 130 kB");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const secret = await ctx.getCredential("api_secret");
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      if (!secret) {
        results.push({ ok: false, httpStatus: null, errorClass: "credential_expired", errorCode: "missing_api_secret", message: "Measurement Protocol API secret missing", retryAfterMs: null, vendorEventId: null, responseExcerpt: null, durationMs: 0, eventId: p.eventId });
        continue;
      }
      // semantic validation first when running in test mode: production returns 2xx for anything
      if (ctx.testMode) {
        const debug = await this.debugValidate(ctx, p, secret);
        if (!debug.ok) {
          results.push({ ok: false, httpStatus: debug.status, errorClass: "invalid_payload", errorCode: "mp_validation", message: debug.messages.join("; ").slice(0, 500), retryAfterMs: null, vendorEventId: null, responseExcerpt: excerpt(debug.messages.join("; ")), durationMs: debug.durationMs, eventId: p.eventId });
          continue;
        }
      }
      const res = await vendorRequest(ctx, { url: `${p.endpoint}&api_secret=${encodeURIComponent(secret)}`, method: "POST", headers: p.headers, body: JSON.stringify(p.body) });
      const cls = this.classifyError(res.status, res.json, res.error);
      results.push({ ok: cls === "none", httpStatus: res.status, errorClass: cls, errorCode: cls === "none" ? null : `http_${res.status ?? res.error}`, message: cls === "none" ? null : (excerpt(res.text, 200) ?? res.error), retryAfterMs: null, vendorEventId: null, responseExcerpt: res.status === 204 ? "accepted (2xx does not prove semantic acceptance; use debug validation)" : excerpt(res.text), durationMs: res.durationMs, eventId: p.eventId });
    }
    return results;
  }

  private async debugValidate(ctx: ConnectorContext, p: VendorPayload, secret: string): Promise<{ ok: boolean; status: number | null; messages: string[]; durationMs: number }> {
    const mid = String(ctx.publicConfig.measurement_id ?? "");
    const res = await vendorRequest(ctx, { url: `${baseUrl(ctx, true)}?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`, method: "POST", headers: p.headers, body: JSON.stringify({ ...(p.body as Record<string, unknown>), validation_behavior: "ENFORCE_RECOMMENDATIONS" }) });
    const json = res.json as { validationMessages?: Array<{ fieldPath?: string; description?: string; validationCode?: string }> } | null;
    const messages = (json?.validationMessages ?? []).map((m) => `${m.fieldPath ?? ""}: ${m.description ?? m.validationCode ?? "invalid"}`);
    return { ok: res.status === 200 && messages.length === 0, status: res.status, messages: messages.length ? messages : res.status === 200 ? [] : [`debug endpoint HTTP ${res.status ?? res.error}`], durationMs: res.durationMs };
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch({ ...ctx, testMode: true }, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, _body: unknown, error?: unknown): ErrorClass {
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const secret = await ctx.getCredential("api_secret");
    const mid = String(ctx.publicConfig.measurement_id ?? "");
    if (!secret) return { ok: false, status: "not_connected", detail: "No API secret stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^G-[A-Z0-9]{4,14}$/.test(mid)) return { ok: false, status: "invalid", detail: "Measurement ID missing or malformed", apiVersion: this.meta.apiVersion, checkedAt };
    // The debug endpoint validates payload structure; a wrong secret is not detectable without sending real data, which is documented honestly.
    const probe: VendorPayload = { vendorEventName: "page_view", dedupKey: null, endpoint: "", method: "POST", headers: { "content-type": "application/json" }, body: { client_id: "validation.1", events: [{ name: "page_view", params: { engagement_time_msec: 1 } }] }, preview: {}, eventId: "probe" };
    const debug = await this.debugValidate(ctx, probe, secret);
    if (debug.ok) return { ok: true, status: "valid", detail: "Measurement Protocol accepted a validation payload (note: GA4 does not reject wrong API secrets at the debug endpoint; verify events in DebugView)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "invalid", detail: debug.messages.join("; ") || "validation failed", apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: null };
  }
}
