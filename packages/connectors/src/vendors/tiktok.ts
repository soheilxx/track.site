import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, eventSeconds, failed, isOffline, marketingGranted, missingCredential, mockOrReal, orderId, previewOf, prop, succeeded } from "./shared.ts";

/**
 * TikTok Pixel + Events API 2.0 (v1.3).
 * Verified 2026-09-03: endpoint POST https://business-api.tiktok.com/open_api/v1.3/event/track/ with `Access-Token` header
 * (TikTok Events API access token from Events Manager). Body { event_source: "web"|"offline"|"crm", event_source_id: <pixel code>,
 * test_event_code?, data[]: { event, event_time (seconds), event_id, user { ttclid, ttp, external_id, email, phone (SHA-256), ip, user_agent, locale },
 * page { url, referrer }, properties { value, currency, content_type, contents[{content_id, content_name, quantity, price, brand}], query, description, order_id, shop_id },
 * limit_data_use_for_advertising } }. Response { code, message, request_id }; code 0 = accepted. Browser pixel + API share event_id for deduplication.
 * The primary developer portal (business-api.tiktok.com/portal/docs?id=1771100865818625) renders client-side; field names were cross-checked
 * against the TikTok help center (standard events), Tealium and Commanders Act connector references, see docs/integrations-matrix.md.
 */
export const TIKTOK_EVENT_NAMES: Record<string, string> = {
  page_view: "Pageview",
  view_item: "ViewContent",
  view_content: "ViewContent",
  search: "Search",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "CompletePayment",
  sign_up: "CompleteRegistration",
  generate_lead: "SubmitForm",
  contact: "Contact",
  book_appointment: "Schedule",
  subscribe: "Subscribe",
  start_trial: "StartTrial",
  download: "Download",
};

export const tiktokMeta: ConnectorMeta = {
  type: "tiktok",
  displayName: "TikTok Ads (Pixel + Events API)",
  apiVersion: API_VERSIONS.tiktok.version,
  verifiedAt: API_VERSIONS.tiktok.verifiedAt,
  sunsetWatch: API_VERSIONS.tiktok.sunsetWatch,
  docsUrl: API_VERSIONS.tiktok.docsUrl,
  requiredPublicIds: [{ key: "pixel_id", label: "Pixel code", pattern: "^[A-Z0-9]{16,32}$", example: "CABCDEFGHIJKLMNOPQRS", help: "Events Manager → Web events → your pixel → Pixel code. Public." }],
  requiredCredentials: [{ kind: "access_token", label: "Events API access token", help: "Events Manager → pixel → Settings → Generate access token. Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "event_id",
  transfer: DESTINATION_TRANSFER.tiktok,
};

export class TikTokConnector implements Connector {
  readonly meta = tiktokMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return id ? { template: "tiktok_pixel", ids: { pixel_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    return mockOrReal(ctx, `/tiktok/open_api/${this.meta.apiVersion}/event/track/`, `https://business-api.tiktok.com/open_api/${this.meta.apiVersion}/event/track/`);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    if (!pixel) return null;
    const name = mapping.vendorEvent || TIKTOK_EVENT_NAMES[e.name] || e.name;
    const c = e.commerce;
    const items = contents(e);
    const ud = e.user_data;
    const event = compact({
      event: name,
      event_time: eventSeconds(e),
      event_id: input.dedupId,
      user: compact({
        ttclid: input.clickIds.ttclid ?? null,
        ttp: e.vendor_ids?.ttp ?? null,
        external_id: ud?.external_id ?? null,
        email: ud?.em ?? null,
        phone: ud?.ph ?? null,
        locale: e.locale,
      }),
      page: compact({ url: e.url, referrer: e.referrer }),
      properties: compact({
        value: c?.value ?? null,
        currency: c?.currency ?? null,
        content_type: items.length ? "product" : null,
        contents: items.length ? items.map((i) => compact({ content_id: i.id, content_name: i.name, quantity: i.quantity, price: i.item_price })) : null,
        query: prop(e, "search_term"),
        description: prop(e, "description"),
        order_id: orderId(e),
      }),
      limit_data_use_for_advertising: marketingGranted(e) ? null : true,
    });
    const body = compact({
      event_source: isOffline(e) ? "offline" : "web",
      event_source_id: pixel,
      test_event_code: ctx.testMode && typeof ctx.settings.test_event_code === "string" && ctx.settings.test_event_code ? ctx.settings.test_event_code : null,
      data: [event],
    }) as Record<string, unknown>;
    return { vendorEventName: name, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["email", "phone", "external_id"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const b = payload.body as { event_source?: string; event_source_id?: string; data?: Array<Record<string, unknown>> };
    if (!b.event_source_id) errors.push("event_source_id (pixel code) required");
    if (!b.data?.length || b.data.length > 1000) errors.push("1-1000 events per request");
    for (const ev of b.data ?? []) {
      if (!ev.event) errors.push("event required");
      if (typeof ev.event_time !== "number" || Date.now() / 1000 - ev.event_time > 7 * 86_400) errors.push("event_time must be within the last 7 days");
      if (!ev.event_id) errors.push("event_id required for deduplication with the pixel");
      const ud = (ev.user ?? {}) as Record<string, unknown>;
      if (!(ud.ttclid || ud.ttp || ud.email || ud.phone || ud.external_id || (ud.ip && ud.user_agent))) errors.push("user needs ttclid, ttp, email, phone, external_id or ip+user_agent for matching");
    }
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    // group by event_source (web/offline share the token but not the batch)
    const groups = new Map<string, VendorPayload[]>();
    for (const p of payloads) {
      const src = String((p.body as { event_source?: string }).event_source ?? "web");
      groups.set(src, [...(groups.get(src) ?? []), p]);
    }
    for (const [source, list] of groups) {
      for (const group of chunk(list, 1000)) {
        const first = group[0]!.body as Record<string, unknown>;
        const body = compact({ event_source: source, event_source_id: first.event_source_id, test_event_code: ctx.testMode ? (first.test_event_code ?? null) : null, data: group.map((p) => (p.body as { data: unknown[] }).data[0]) });
        const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", "access-token": token }, body: JSON.stringify(body) });
        const cls = this.classifyError(res.status, res.json, res.error);
        const json = res.json as { code?: number; message?: string; request_id?: string } | null;
        for (const p of group) {
          if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, json?.request_id ?? null, excerpt(res.text)));
          else results.push(failed(p.eventId, cls, json?.code != null ? `tt_${json.code}` : `http_${res.status ?? res.error}`, json?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        }
      }
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch({ ...ctx, testMode: true }, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass {
    const code = (body as { code?: number } | null)?.code;
    if (httpStatus !== null && httpStatus >= 500) return "temporary";
    if (code === 0 && httpStatus !== null && httpStatus < 400) return "none";
    if (httpStatus === 401 || code === 40001 || code === 40104 || code === 40105) return "auth";
    if (code === 40100 || httpStatus === 429) return "rate_limited";
    if (code === 40002 || code === 40000 || httpStatus === 400) return "invalid_payload";
    if (typeof code === "number" && code !== 0) return "permanent";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const token = await ctx.getCredential("access_token");
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    if (!token) return { ok: false, status: "not_connected", detail: "No Events API access token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[A-Z0-9]{16,32}$/.test(pixel)) return { ok: false, status: "invalid", detail: "Pixel code malformed", apiVersion: this.meta.apiVersion, checkedAt };
    // a test_event_code keeps the probe out of reporting (visible only under Events Manager → Test events)
    const code = typeof ctx.settings.test_event_code === "string" && ctx.settings.test_event_code ? ctx.settings.test_event_code : "TRACKSITE_VALIDATION";
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json", "access-token": token }, body: JSON.stringify({ event_source: "web", event_source_id: pixel, test_event_code: code, data: [{ event: "Pageview", event_time: Math.floor(Date.now() / 1000), event_id: `validate-${Date.now()}`, user: { external_id: "0000000000000000000000000000000000000000000000000000000000000000" }, page: { url: "https://track.site/validate" } }] }) });
    const cls = this.classifyError(res.status, res.json, res.error);
    const json = res.json as { code?: number; message?: string } | null;
    if (cls === "none") return { ok: true, status: "valid", detail: `Token accepted for pixel ${pixel} (test event code ${code})`, apiVersion: this.meta.apiVersion, checkedAt };
    if (cls === "auth") return { ok: false, status: "expired", detail: json?.message ?? "Access token rejected", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: json?.message ?? `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
