import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, eventMillis, failed, isOffline, missingCredential, mockOrReal, numItems, orderId, previewOf, prop, succeeded } from "./shared.ts";

/**
 * Snap Pixel + Conversions API (v3).
 * Verified 2026-09-03 against https://developers.snap.com/api/marketing-api/Conversions-API/Parameters
 * POST https://tr.snapchat.com/v3/{pixel_id}/events (Bearer Conversions API token); validation endpoint /v3/{pixel_id}/events/validate.
 * data[]: event_name (PURCHASE, SAVE, START_CHECKOUT, ADD_CART, VIEW_CONTENT, ADD_BILLING, SIGN_UP, SEARCH, PAGE_VIEW, SUBSCRIBE, LOGIN,
 * RESERVE, ADD_TO_WISHLIST, START_TRIAL, LIST_VIEW, CUSTOM_EVENT_1..5), event_time ms, event_id (dedup against pixel client_dedup_id),
 * event_source_url, action_source WEB|MOBILE_APP|OFFLINE, user_data (em/ph/fn/ln/ct/zp SHA-256 lowercase; external_id; sc_click_id = ScCid; sc_cookie1 = _scid),
 * custom_data (currency, value, content_ids[], contents[], num_items, order_id, search_string).
 */
export const SNAP_EVENT_NAMES: Record<string, string> = {
  page_view: "PAGE_VIEW",
  view_item: "VIEW_CONTENT",
  view_content: "VIEW_CONTENT",
  view_item_list: "LIST_VIEW",
  search: "SEARCH",
  add_to_cart: "ADD_CART",
  add_to_wishlist: "ADD_TO_WISHLIST",
  begin_checkout: "START_CHECKOUT",
  add_payment_info: "ADD_BILLING",
  purchase: "PURCHASE",
  sign_up: "SIGN_UP",
  login: "LOGIN",
  subscribe: "SUBSCRIBE",
  start_trial: "START_TRIAL",
  book_appointment: "RESERVE",
  generate_lead: "CUSTOM_EVENT_1",
  contact: "CUSTOM_EVENT_2",
  download: "CUSTOM_EVENT_3",
};

export const snapchatMeta: ConnectorMeta = {
  type: "snapchat",
  displayName: "Snapchat Ads (Snap Pixel + Conversions API)",
  apiVersion: API_VERSIONS.snapchat.version,
  verifiedAt: API_VERSIONS.snapchat.verifiedAt,
  sunsetWatch: API_VERSIONS.snapchat.sunsetWatch,
  docsUrl: API_VERSIONS.snapchat.docsUrl,
  requiredPublicIds: [{ key: "pixel_id", label: "Snap Pixel ID", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", example: "6a1f0b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b", help: "Ads Manager → Events Manager → Snap Pixel. Public." }],
  requiredCredentials: [{ kind: "access_token", label: "Conversions API token", help: "Events Manager → Snap Pixel → Conversions API → Generate token. Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "event_id",
  transfer: DESTINATION_TRANSFER.snapchat,
};

export class SnapchatConnector implements Connector {
  readonly meta = snapchatMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return id ? { template: "snap_pixel", ids: { pixel_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext, validate: boolean): string {
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    const suffix = validate ? "/validate" : "";
    return mockOrReal(ctx, `/snapchat/v3/${pixel}/events${suffix}`, `https://tr.snapchat.com/v3/${pixel}/events${suffix}`);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.pixel_id) return null;
    const name = mapping.vendorEvent || SNAP_EVENT_NAMES[e.name] || "CUSTOM_EVENT_5";
    const c = e.commerce;
    const items = contents(e);
    const ud = e.user_data;
    const event = compact({
      event_name: name,
      event_time: eventMillis(e),
      event_id: input.dedupId,
      event_source_url: e.url,
      action_source: isOffline(e) ? "OFFLINE" : "WEB",
      user_data: compact({
        em: ud?.em ?? null,
        ph: ud?.ph ?? null,
        fn: ud?.fn ?? null,
        ln: ud?.ln ?? null,
        ct: ud?.ct ?? null,
        zp: ud?.zp ?? null,
        external_id: ud?.external_id ?? null,
        sc_click_id: input.clickIds.ScCid ?? input.clickIds.sccid ?? null,
        sc_cookie1: e.vendor_ids?.scid ?? null,
      }),
      custom_data: compact({
        currency: c?.currency ?? null,
        value: c?.value ?? null,
        content_ids: items.length ? items.map((i) => i.id) : null,
        contents: items.length ? items.map((i) => compact({ id: i.id, item_price: i.item_price, quantity: i.quantity })) : null,
        num_items: numItems(e),
        order_id: orderId(e),
        search_string: prop(e, "search_term"),
      }),
    });
    const body = { data: [event] };
    return { vendorEventName: name, dedupKey: input.dedupId, endpoint: this.endpoint(ctx, false), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["em", "ph", "fn", "ln", "ct", "zp", "external_id"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const ev = (payload.body as { data: Array<Record<string, unknown>> }).data[0]!;
    const ud = (ev.user_data ?? {}) as Record<string, unknown>;
    if (!ev.event_name) errors.push("event_name required");
    if (typeof ev.event_time !== "number" || Date.now() - ev.event_time > 28 * 86_400_000) errors.push("event_time must be within 28 days");
    if (!ev.event_id) errors.push("event_id required");
    if (!Object.keys(ud).length) errors.push("user_data needs at least one identifier (em, ph, external_id, sc_click_id, sc_cookie1)");
    if (ev.action_source === "WEB" && !ev.event_source_url) errors.push("event_source_url required for WEB events");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 2000)) {
      const data = group.map((p) => (p.body as { data: unknown[] }).data[0]);
      const url = ctx.testMode ? this.endpoint(ctx, true) : group[0]!.endpoint;
      const res = await vendorRequest(ctx, { url, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { status?: string; reason?: string; error_records?: Array<{ index?: number; reason?: string }> } | null;
      group.forEach((p, i) => {
        const rec = json?.error_records?.find((r) => r.index === i);
        if (cls !== "none") results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, json?.reason ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        else if (rec || json?.status === "FAILED") results.push(failed(p.eventId, "invalid_payload", "snap_rejected", rec?.reason ?? json?.reason ?? "rejected", res.status, res.durationMs));
        else results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, excerpt(res.text)));
      });
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch({ ...ctx, testMode: true }, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, _body: unknown, error?: unknown): ErrorClass {
    if (httpStatus === 401) return "credential_expired";
    if (httpStatus === 403) return "auth";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const token = await ctx.getCredential("access_token");
    if (!token) return { ok: false, status: "not_connected", detail: "No Conversions API token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[0-9a-f-]{36}$/.test(String(ctx.publicConfig.pixel_id ?? ""))) return { ok: false, status: "invalid", detail: "Pixel ID must be a UUID", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx, true), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data: [{ event_name: "PAGE_VIEW", event_time: Date.now(), event_id: `validate-${Date.now()}`, action_source: "WEB", event_source_url: "https://track.site/validate", user_data: { external_id: "0000000000000000000000000000000000000000000000000000000000000000" } }] }) });
    if (res.status === 200) return { ok: true, status: "valid", detail: "Token accepted by the validation endpoint", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 401) return { ok: false, status: "expired", detail: "Token invalid or expired", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 403) return { ok: false, status: "invalid", detail: "Token not authorised for this pixel", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
