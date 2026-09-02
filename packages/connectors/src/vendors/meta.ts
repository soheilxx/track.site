import { sha256Hex } from "@track-site/core";
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
import { classifyHttpStatus, excerpt, resultFromResponse, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";

/**
 * Meta Pixel + Conversions API.
 * Verified 2026-09-02 against https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api:
 * POST https://graph.facebook.com/{version}/{pixel_id}/events?access_token=... with { data: [...], test_event_code? }
 * user_data em/ph/fn/ln/ct/st/zp/country/external_id SHA-256 hashed (normalized), client_ip_address /
 * client_user_agent / fbc / fbp NOT hashed. Browser event `eventID` == server `event_id` for dedup.
 */
export const META_EVENT_NAMES: Record<string, string> = {
  page_view: "PageView",
  view_content: "ViewContent",
  view_item: "ViewContent",
  search: "Search",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  generate_lead: "Lead",
  contact: "Contact",
  book_appointment: "Schedule",
  sign_up: "CompleteRegistration",
  subscribe: "Subscribe",
  start_trial: "StartTrial",
  download: "Download",
};

export const metaMeta: ConnectorMeta = {
  type: "meta",
  displayName: "Meta Ads (Facebook & Instagram)",
  apiVersion: API_VERSIONS.meta.version,
  verifiedAt: API_VERSIONS.meta.verifiedAt,
  sunsetWatch: API_VERSIONS.meta.sunsetWatch,
  docsUrl: API_VERSIONS.meta.docsUrl,
  requiredPublicIds: [{ key: "pixel_id", label: "Pixel / Dataset ID", pattern: "^[0-9]{10,20}$", example: "123456789012345", help: "Events Manager → Data sources → your dataset. Public, not a secret." }],
  requiredCredentials: [{ kind: "access_token", label: "Conversions API access token", help: "Generate a system user token in Events Manager → Settings → Conversions API. Stored encrypted; never shown again.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "event_id",
  transfer: DESTINATION_TRANSFER.meta,
};

function baseUrl(ctx: ConnectorContext): string {
  return ctx.baseUrlOverride ? `${ctx.baseUrlOverride.replace(/\/$/, "")}/meta` : "https://graph.facebook.com";
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  return out as Partial<T>;
}

export class MetaConnector implements Connector {
  readonly meta = metaMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const pixel = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return pixel ? { template: "meta_pixel", ids: { pixel_id: pixel }, consentPurpose: "marketing" } : null;
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const pixelId = String(ctx.publicConfig.pixel_id ?? "");
    if (!pixelId) return null;
    const vendorEvent = mapping.vendorEvent || META_EVENT_NAMES[e.name] || e.name;
    const ts = Math.floor(new Date(e.client_ts ?? e.server_ts).getTime() / 1000);
    const ud = e.user_data;
    const fbc = e.vendor_ids?.fbc ?? (input.clickIds.fbclid ? `fb.1.${new Date(e.server_ts).getTime()}.${input.clickIds.fbclid}` : null);
    const user_data = compact({
      em: ud?.em ? [ud.em] : null,
      ph: ud?.ph ? [ud.ph] : null,
      fn: ud?.fn ? [ud.fn] : null,
      ln: ud?.ln ? [ud.ln] : null,
      ct: ud?.ct ? [ud.ct] : null,
      zp: ud?.zp ? [ud.zp] : null,
      country: ud?.country ? [sha256Hex(ud.country.toLowerCase())] : null,
      external_id: ud?.external_id ? [ud.external_id] : e.anonymous_id ? [sha256Hex(e.anonymous_id)] : null,
      fbc,
      fbp: e.vendor_ids?.fbp ?? null,
    });
    const c = e.commerce;
    const items = c?.items ?? [];
    const custom_data = compact({
      value: c?.value ?? null,
      currency: c?.currency ?? null,
      content_ids: items.length ? items.map((i) => i.item_id) : null,
      contents: items.length ? items.map((i) => compact({ id: i.item_id, quantity: i.quantity ?? 1, item_price: i.price ?? null })) : null,
      content_type: items.length ? "product" : null,
      order_id: c?.order_id ?? c?.transaction_id ?? null,
      num_items: items.length ? items.reduce((n, i) => n + (i.quantity ?? 1), 0) : null,
      search_string: typeof e.props?.search_term === "string" ? e.props.search_term : null,
    });
    const body = {
      data: [
        compact({
          event_name: vendorEvent,
          event_time: ts,
          event_id: input.dedupId,
          event_source_url: e.url,
          action_source: "website",
          user_data,
          custom_data: Object.keys(custom_data).length ? custom_data : null,
        }),
      ],
      ...(ctx.testMode && typeof ctx.settings.test_event_code === "string" && ctx.settings.test_event_code ? { test_event_code: ctx.settings.test_event_code } : {}),
    };
    return {
      vendorEventName: vendorEvent,
      dedupKey: input.dedupId,
      endpoint: `${baseUrl(ctx)}/${this.meta.apiVersion}/${pixelId}/events`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      preview: { ...body, data: body.data.map((d) => ({ ...d, user_data: Object.fromEntries(Object.entries(d.user_data ?? {}).map(([k, v]) => [k, k === "fbc" || k === "fbp" ? v : "[hashed]"])) })) },
      eventId: e.event_id,
    };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const body = payload.body as { data: Array<{ event_name?: string; event_time?: number; action_source?: string; user_data?: Record<string, unknown> }> };
    if (!Array.isArray(body.data) || body.data.length === 0 || body.data.length > 1000) errors.push("data must contain 1-1000 events");
    for (const d of body.data ?? []) {
      if (!d.event_name) errors.push("event_name required");
      if (!d.event_time || d.event_time < Math.floor(Date.now() / 1000) - 7 * 86_400) errors.push("event_time must be within the last 7 days");
      if (d.action_source !== "website") errors.push("action_source must be website");
      if (!d.user_data || Object.keys(d.user_data).length === 0) errors.push("at least one user_data parameter is required for matching");
    }
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      if (!token) {
        results.push({ ok: false, httpStatus: null, errorClass: "credential_expired", errorCode: "missing_token", message: "access token missing", retryAfterMs: null, vendorEventId: null, responseExcerpt: null, durationMs: 0, eventId: p.eventId });
        continue;
      }
      const res = await vendorRequest(ctx, { url: `${p.endpoint}?access_token=${encodeURIComponent(token)}`, method: "POST", headers: p.headers, body: JSON.stringify(p.body) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { events_received?: number; fbtrace_id?: string; error?: { message?: string; code?: number; error_subcode?: number } } | null;
      results.push(resultFromResponse(p.eventId, res, cls, { vendorEventId: json?.fbtrace_id ?? null, errorCode: cls === "none" ? null : json?.error?.code ? `fb_${json.error.code}${json.error.error_subcode ? `_${json.error.error_subcode}` : ""}` : `http_${res.status ?? res.error}`, message: cls === "none" ? null : (json?.error?.message ?? excerpt(res.text, 200) ?? res.error), responseExcerpt: token ? excerpt(res.text.replace(token, "[token]")) : excerpt(res.text) }));
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const body = payload.body as Record<string, unknown>;
    const test: VendorPayload = { ...payload, body: { ...body, ...(typeof ctx.settings.test_event_code === "string" && ctx.settings.test_event_code ? { test_event_code: ctx.settings.test_event_code } : {}) } };
    const [r] = await this.dispatchBatch(ctx, [test]);
    return r!;
  }

  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass {
    const err = (body as { error?: { code?: number; type?: string } } | null)?.error;
    if (httpStatus !== null && httpStatus >= 500) return "temporary";
    if (err?.code === 190 || (err?.type === "OAuthException" && httpStatus === 401)) return "auth";
    if (err?.code === 4 || err?.code === 17 || err?.code === 32 || err?.code === 613) return "rate_limited";
    if (err?.code === 100 || err?.code === 2804) return "invalid_payload";
    if (err?.code === 1 || err?.code === 2) return "temporary";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const token = await ctx.getCredential("access_token");
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    if (!token) return { ok: false, status: "not_connected", detail: "No Conversions API token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!pixel) return { ok: false, status: "invalid", detail: "Pixel ID missing", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: `${baseUrl(ctx)}/${this.meta.apiVersion}/${pixel}?fields=id,name&access_token=${encodeURIComponent(token)}`, method: "GET", headers: {} });
    const json = res.json as { id?: string; name?: string; error?: { message?: string; code?: number } } | null;
    if (res.status === 200 && json?.id) return { ok: true, status: "valid", detail: `Dataset ${json.name ?? json.id} reachable`, apiVersion: this.meta.apiVersion, checkedAt };
    if (json?.error?.code === 190) return { ok: false, status: "expired", detail: "Access token invalid or expired", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "invalid", detail: json?.error?.message ?? `HTTP ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }

  async deleteSubjectData(): Promise<{ supported: boolean; submitted: boolean; reference: string | null; detail: string }> {
    return { supported: false, submitted: false, reference: null, detail: "Meta offers no per-event deletion API for Conversions API data; document the request in the DSAR record." };
  }
}
