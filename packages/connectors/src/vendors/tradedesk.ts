import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, failed, mockOrReal, orderId, succeeded } from "./shared.ts";

/**
 * The Trade Desk: Universal Pixel (browser) + Real-Time Conversion Events API (server).
 * Reference (2026-09-03): POST https://insight.adsrvr.org/track/realtimeconversion — the partner-portal reference
 * (partner.thetradedesk.com/v3/portal/data/doc/DataConversionEventsApi) requires a login, so the field set was cross-checked against the
 * Tealium, Adobe and RudderStack connector references: { data: [{ adv (advertiser id), upixel_id (universal pixel id, URL mapping) |
 * tracker_id + merchant_id (event mapping), event_name (purchase, addtocart, viewitem, searchitem, startcheckout, viewcart, sitevisit, wishlistitem, login, …),
 * value (decimal string), currency (ISO 4217, required for purchase), order_id, referrer_url (required for URL mapping), items[{item_code, name, qty, price, cat}],
 * td1..td10, adid + adid_type (TDID|IDFA|AAID|DAID|NAID|IDL|EUID|UID2), uid2_token, imp (impression id), ip, privacy_type/is_applicable/consent_string }] }.
 * The API is unauthenticated (advertiser + tag ids identify the account); events for tags not defined in the platform return 402.
 */
export const TTD_EVENT_NAMES: Record<string, string> = {
  page_view: "sitevisit",
  view_item: "viewitem",
  view_content: "viewitem",
  search: "searchitem",
  add_to_cart: "addtocart",
  view_cart: "viewcart",
  add_to_wishlist: "wishlistitem",
  begin_checkout: "startcheckout",
  purchase: "purchase",
  login: "login",
  contact: "messagebusiness",
};

export const tradedeskMeta: ConnectorMeta = {
  type: "tradedesk",
  displayName: "The Trade Desk (Universal Pixel + Real-Time Conversions)",
  apiVersion: API_VERSIONS.tradedesk.version,
  verifiedAt: API_VERSIONS.tradedesk.verifiedAt,
  sunsetWatch: API_VERSIONS.tradedesk.sunsetWatch,
  docsUrl: API_VERSIONS.tradedesk.docsUrl,
  requiredPublicIds: [
    { key: "advertiser_id", label: "Advertiser ID", pattern: "^[a-z0-9]{6,12}$", example: "abcd123", help: "The Trade Desk → Advertiser → Advertiser ID. Public." },
    { key: "pixel_id", label: "Universal pixel ID", pattern: "^[0-9a-f-]{20,40}$", example: "0f6b8f1e-2c4d-4e7a-9b1c-3d5e7f9a1b2c", help: "Data → Universal Pixel → Pixel ID (used for the browser tag and URL-mapped server events)." },
    { key: "tracker_id", label: "Event tracker ID (optional)", pattern: "^([0-9a-z-]{6,40})?$", example: "", help: "Data → Event tracking → Tracker ID, when event-mapped conversions are configured." },
  ],
  requiredCredentials: [],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "order_id",
  transfer: DESTINATION_TRANSFER.tradedesk,
  accessNote: "Server events are accepted only for pixels / event trackers defined in The Trade Desk platform for this advertiser; unknown tags return HTTP 402.",
};

export class TradeDeskConnector implements Connector {
  readonly meta = tradedeskMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const adv = typeof publicConfig.advertiser_id === "string" ? publicConfig.advertiser_id : null;
    const pixel = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return adv && pixel ? { template: "ttd_pixel", ids: { advertiser_id: adv, pixel_id: pixel }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    return mockOrReal(ctx, "/tradedesk/track/realtimeconversion", "https://insight.adsrvr.org/track/realtimeconversion");
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const adv = String(ctx.publicConfig.advertiser_id ?? "");
    if (!adv) return null;
    const name = mapping.vendorEvent || TTD_EVENT_NAMES[e.name];
    if (!name) return null;
    const c = e.commerce;
    const tracker = typeof ctx.publicConfig.tracker_id === "string" && ctx.publicConfig.tracker_id ? ctx.publicConfig.tracker_id : null;
    const record = compact({
      adv,
      upixel_id: tracker ? null : (ctx.publicConfig.pixel_id ?? null),
      tracker_id: tracker,
      event_name: name,
      value: c?.value != null ? String(c.value) : null,
      currency: c?.currency ?? null,
      order_id: orderId(e),
      referrer_url: e.url,
      items: contents(e).length ? contents(e).map((i) => compact({ item_code: i.id, name: i.name, qty: i.quantity, price: i.item_price, cat: i.category })) : null,
      tdid: e.vendor_ids?.tdid ?? null,
      uid2_token: e.vendor_ids?.uid2_token ?? null,
      imp: input.clickIds.ttd_uuid ?? null,
      td1: input.dedupId,
      privacy_type: e.consent.gpc ? "GPP" : null,
      is_applicable: e.consent.gpc ? true : null,
    });
    const body = { data: [record] };
    return { vendorEventName: name, dedupKey: orderId(e) ?? input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: body, eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const r = (payload.body as { data: Array<Record<string, unknown>> }).data[0]!;
    if (!r.adv) errors.push("adv (advertiser id) required");
    if (!r.upixel_id && !r.tracker_id) errors.push("upixel_id or tracker_id required");
    if (!r.event_name) errors.push("event_name required");
    if (r.event_name === "purchase" && !r.currency) errors.push("currency required for purchase events");
    if (!r.tdid && !r.uid2_token && !r.imp && !r.referrer_url) errors.push("an identifier (tdid, uid2_token, imp) or referrer_url is required");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 500)) {
      const data = group.map((p) => (p.body as { data: unknown[] }).data[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      for (const p of group) {
        if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, excerpt(res.text)));
        else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, res.status === 402 ? "Pixel or event tracker not defined for this advertiser in The Trade Desk (402)" : (excerpt(res.text, 200) ?? String(res.error)), res.status, res.durationMs));
      }
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch(ctx, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, _body: unknown, error?: unknown): ErrorClass {
    if (httpStatus === 402) return "invalid_payload";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    if (!/^[a-z0-9]{6,12}$/.test(String(ctx.publicConfig.advertiser_id ?? ""))) return { ok: false, status: "invalid", detail: "Advertiser ID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    if (!ctx.publicConfig.pixel_id && !ctx.publicConfig.tracker_id) return { ok: false, status: "invalid", detail: "Universal pixel ID or event tracker ID required", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: [compact({ adv: ctx.publicConfig.advertiser_id, upixel_id: ctx.publicConfig.tracker_id ? null : ctx.publicConfig.pixel_id, tracker_id: ctx.publicConfig.tracker_id || null, event_name: "sitevisit", referrer_url: "https://track.site/validate", td1: "validation" })] }) });
    if (res.status === 200) return { ok: true, status: "valid", detail: "Real-time conversion endpoint accepted the advertiser + tag ids", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 402) return { ok: false, status: "invalid", detail: "Tag not defined for this advertiser in The Trade Desk (402)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
