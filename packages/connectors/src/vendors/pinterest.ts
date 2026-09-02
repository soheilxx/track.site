import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, eventSeconds, failed, isOffline, marketingGranted, missingCredential, mockOrReal, numItems, orderId, previewOf, prop, succeeded } from "./shared.ts";

/**
 * Pinterest Tag + Conversions API (v5).
 * Verified 2026-09-03 against https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/
 * POST https://api.pinterest.com/v5/ad_accounts/{ad_account_id}/events[?test=true], Bearer conversion access token,
 * body { data: [≤1000] } with event_name (checkout, add_to_cart, page_visit, signup, watch_video, lead, search, view_category, custom),
 * action_source web|app_android|app_ios|offline, event_time seconds, event_id (dedup with the tag), user_data (em[], ph[], external_id[] SHA-256;
 * click_id = _epik cookie; client_ip_address + client_user_agent pair), custom_data (currency, value as string, content_ids[], contents[], num_items, order_id, search_string),
 * response { num_events_received, num_events_processed, events[{status, error_message, warning_message}] }. test=true is limited to 20 events.
 */
export const PINTEREST_EVENT_NAMES: Record<string, string> = {
  page_view: "page_visit",
  view_item: "page_visit",
  view_content: "page_visit",
  view_item_list: "view_category",
  search: "search",
  add_to_cart: "add_to_cart",
  purchase: "checkout",
  sign_up: "signup",
  generate_lead: "lead",
  video_start: "watch_video",
};

export const pinterestMeta: ConnectorMeta = {
  type: "pinterest",
  displayName: "Pinterest Ads (Tag + Conversions API)",
  apiVersion: API_VERSIONS.pinterest.version,
  verifiedAt: API_VERSIONS.pinterest.verifiedAt,
  sunsetWatch: API_VERSIONS.pinterest.sunsetWatch,
  docsUrl: API_VERSIONS.pinterest.docsUrl,
  requiredPublicIds: [
    { key: "tag_id", label: "Pinterest tag ID", pattern: "^[0-9]{10,20}$", example: "2613456789012", help: "Ads Manager → Conversions → Pinterest tag. Public." },
    { key: "ad_account_id", label: "Ad account ID", pattern: "^[0-9]{6,20}$", example: "549755885175", help: "Ads Manager URL /advertiser/{id}." },
  ],
  requiredCredentials: [{ kind: "access_token", label: "Conversions API access token", help: "Ads Manager → Conversions → Conversion access token → Generate. Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "event_id",
  transfer: DESTINATION_TRANSFER.pinterest,
};

export class PinterestConnector implements Connector {
  readonly meta = pinterestMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.tag_id === "string" ? publicConfig.tag_id : null;
    return id ? { template: "pinterest_tag", ids: { tag_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext, test: boolean): string {
    const account = String(ctx.publicConfig.ad_account_id ?? "");
    return mockOrReal(ctx, `/pinterest/v5/ad_accounts/${account}/events`, `https://api.pinterest.com/v5/ad_accounts/${account}/events`) + (test ? "?test=true" : "");
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.ad_account_id) return null;
    const name = mapping.vendorEvent || PINTEREST_EVENT_NAMES[e.name] || "custom";
    const c = e.commerce;
    const items = contents(e).map((i) => compact({ id: i.id, item_price: i.item_price != null ? String(i.item_price) : null, quantity: i.quantity }));
    const ud = e.user_data;
    const event = compact({
      event_name: name,
      action_source: isOffline(e) ? "offline" : "web",
      event_time: eventSeconds(e),
      event_id: input.dedupId,
      event_source_url: e.url,
      partner_name: "ss-tracksite",
      opt_out: !marketingGranted(e),
      user_data: compact({
        em: ud?.em ? [ud.em] : null,
        ph: ud?.ph ? [ud.ph] : null,
        fn: ud?.fn ? [ud.fn] : null,
        ln: ud?.ln ? [ud.ln] : null,
        external_id: ud?.external_id ? [ud.external_id] : null,
        click_id: input.clickIds.epik ?? e.vendor_ids?.epik ?? null,
      }),
      custom_data: compact({
        currency: c?.currency ?? null,
        value: c?.value != null ? String(c.value) : null,
        content_ids: items.length ? items.map((i) => i.id) : null,
        contents: items.length ? items : null,
        num_items: numItems(e),
        order_id: orderId(e),
        search_string: prop(e, "search_term"),
      }),
    });
    const body = { data: [event] };
    return { vendorEventName: name, dedupKey: input.dedupId, endpoint: this.endpoint(ctx, ctx.testMode), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["em", "ph", "fn", "ln", "external_id"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const ev = (payload.body as { data: Array<Record<string, unknown>> }).data[0]!;
    const ud = (ev.user_data ?? {}) as Record<string, unknown>;
    if (!ev.event_name || String(ev.event_name).length > 100) errors.push("event_name required (≤100 chars)");
    if (!ev.event_id) errors.push("event_id required");
    if (!(ud.em || ud.ph || ud.external_id || ud.click_id || ud.hashed_maids || (ud.client_ip_address && ud.client_user_agent))) errors.push("user_data needs em, ph, external_id, click_id, hashed_maids or ip+user_agent");
    if (ev.action_source === "web" && !ev.event_source_url) errors.push("event_source_url recommended for web events");
    return { ok: errors.filter((m) => !m.includes("recommended")).length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, ctx.testMode ? 20 : 1000)) {
      const data = group.map((p) => (p.body as { data: unknown[] }).data[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { num_events_received?: number; num_events_processed?: number; events?: Array<{ status?: string; error_message?: string | null; warning_message?: string | null }>; code?: number; message?: string } | null;
      group.forEach((p, i) => {
        const ev = json?.events?.[i];
        if (cls === "none" && ev && ev.status && ev.status !== "processed") results.push(failed(p.eventId, "invalid_payload", "event_rejected", ev.error_message ?? "rejected", res.status, res.durationMs));
        else if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, ev?.warning_message ? `processed with warning: ${ev.warning_message}`.slice(0, 300) : excerpt(res.text)));
        else results.push(failed(p.eventId, cls, json?.code ? `pin_${json.code}` : `http_${res.status ?? res.error}`, json?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      });
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch({ ...ctx, testMode: true }, [{ ...payload, endpoint: this.endpoint(ctx, true) }]);
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
    if (!token) return { ok: false, status: "not_connected", detail: "No conversion access token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[0-9]{6,20}$/.test(String(ctx.publicConfig.ad_account_id ?? ""))) return { ok: false, status: "invalid", detail: "Ad account ID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    // test=true does not affect reporting; a minimal test event proves token + account binding
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx, true), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data: [{ event_name: "custom", action_source: "web", event_time: Math.floor(Date.now() / 1000), event_id: `validate-${Date.now()}`, partner_name: "ss-tracksite", user_data: { external_id: ["0000000000000000000000000000000000000000000000000000000000000000"] } }] }) });
    if (res.status === 200) return { ok: true, status: "valid", detail: "Conversion access token accepted (test mode)", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 401) return { ok: false, status: "expired", detail: "Token invalid or expired", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 403) return { ok: false, status: "invalid", detail: "Token has no access to this ad account", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
