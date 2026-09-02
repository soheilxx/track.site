import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, eventMillis, failed, missingCredential, mockOrReal, numItems, previewOf, succeeded } from "./shared.ts";

/**
 * Reddit Pixel + Conversions API v3.
 * Verified 2026-09-03: POST https://ads-api.reddit.com/api/v3/pixels/{pixel_id}/conversion_events with a Bearer conversion access token
 * (non-expiring, generated in Reddit Ads → Events Manager → Conversions API). Body { events[≤1000]: { event_at (epoch ms),
 * event_type { tracking_type: PageVisit|ViewContent|Search|AddToCart|AddToWishlist|Purchase|Lead|SignUp|Custom, custom_event_name? },
 * click_id (rdt_cid), user { email, phone_number, external_id (SHA-256), user_agent, uuid (_rdt_uuid), screen_dimensions },
 * event_metadata { conversion_id (dedup with pixel conversionId), currency, value_decimal, item_count, products[{id, name, category}] } }, test_mode? }.
 * At least one attribution signal (click_id, email, external_id, uuid or ip+user_agent) is required per event. The v3 reference lives on
 * ads-api.reddit.com/docs/v3 (blocked for automated fetches); field names cross-checked with the Reddit help center and Tealium reference.
 */
export const REDDIT_EVENT_NAMES: Record<string, string> = {
  page_view: "PageVisit",
  view_item: "ViewContent",
  view_content: "ViewContent",
  search: "Search",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  purchase: "Purchase",
  generate_lead: "Lead",
  sign_up: "SignUp",
};

export const redditMeta: ConnectorMeta = {
  type: "reddit",
  displayName: "Reddit Ads (Pixel + Conversions API)",
  apiVersion: API_VERSIONS.reddit.version,
  verifiedAt: API_VERSIONS.reddit.verifiedAt,
  sunsetWatch: API_VERSIONS.reddit.sunsetWatch,
  docsUrl: API_VERSIONS.reddit.docsUrl,
  requiredPublicIds: [{ key: "pixel_id", label: "Pixel / ad account ID", pattern: "^(a2_|t2_)[a-z0-9]{4,24}$", example: "a2_abcd1234", help: "Reddit Ads → Events Manager → Reddit Pixel → Pixel ID (starts with a2_ or t2_). Public." }],
  requiredCredentials: [{ kind: "access_token", label: "Conversion access token", help: "Events Manager → Conversions API → Generate token (non-expiring). Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "conversion_id",
  transfer: DESTINATION_TRANSFER.reddit,
};

export class RedditConnector implements Connector {
  readonly meta = redditMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return id ? { template: "reddit_pixel", ids: { pixel_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    return mockOrReal(ctx, `/reddit/api/${this.meta.apiVersion}/pixels/${pixel}/conversion_events`, `https://ads-api.reddit.com/api/${this.meta.apiVersion}/pixels/${pixel}/conversion_events`);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.pixel_id) return null;
    const standard = REDDIT_EVENT_NAMES[e.name];
    const custom = mapping.vendorEvent && !Object.values(REDDIT_EVENT_NAMES).includes(mapping.vendorEvent) ? mapping.vendorEvent : null;
    const tracking = custom ? "Custom" : (mapping.vendorEvent || standard || "Custom");
    const c = e.commerce;
    const items = contents(e);
    const ud = e.user_data;
    const event = compact({
      event_at: eventMillis(e),
      event_type: compact({ tracking_type: tracking, custom_event_name: tracking === "Custom" ? (custom ?? e.name).slice(0, 64) : null }),
      click_id: input.clickIds.rdt_cid ?? null,
      user: compact({
        email: ud?.em ?? null,
        phone_number: ud?.ph ?? null,
        external_id: ud?.external_id ?? null,
        uuid: e.vendor_ids?.rdt_uuid ?? null,
      }),
      event_metadata: compact({
        conversion_id: input.dedupId,
        currency: c?.currency ?? null,
        value_decimal: c?.value ?? null,
        item_count: numItems(e),
        products: items.length ? items.map((i) => compact({ id: i.id, name: i.name, category: i.category })) : null,
      }),
    });
    const body = { events: [event], ...(ctx.testMode ? { test_mode: true } : {}) };
    return { vendorEventName: tracking === "Custom" ? `Custom:${custom ?? e.name}` : tracking, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["email", "phone_number", "external_id"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const b = payload.body as { events?: Array<Record<string, unknown>> };
    if (!b.events?.length || b.events.length > 1000) errors.push("1-1000 events per request");
    for (const ev of b.events ?? []) {
      const user = (ev.user ?? {}) as Record<string, unknown>;
      if (!(ev.click_id || user.email || user.external_id || user.uuid || user.phone_number || (user.ip_address && user.user_agent))) errors.push("at least one attribution signal required (click_id, email, phone, external_id, uuid)");
      if (typeof ev.event_at !== "number" || Date.now() - ev.event_at > 7 * 86_400_000) errors.push("event_at must be within 7 days");
      const t = (ev.event_type ?? {}) as { tracking_type?: string; custom_event_name?: string };
      if (!t.tracking_type) errors.push("tracking_type required");
      if (t.tracking_type === "Custom" && !t.custom_event_name) errors.push("custom_event_name required for Custom");
    }
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 1000)) {
      const events = group.map((p) => (p.body as { events: unknown[] }).events[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ events, ...(ctx.testMode ? { test_mode: true } : {}) }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { message?: string; invalid_events?: Array<{ index?: number; error_message?: string; event?: unknown }> } | null;
      group.forEach((p, i) => {
        const invalid = json?.invalid_events?.find((x) => x.index === i);
        if (cls !== "none") results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, json?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        else if (invalid) results.push(failed(p.eventId, "invalid_payload", "invalid_event", invalid.error_message ?? "rejected", res.status, res.durationMs));
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
    if (!token) return { ok: false, status: "not_connected", detail: "No conversion access token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^(a2_|t2_)[a-z0-9]{4,24}$/.test(String(ctx.publicConfig.pixel_id ?? ""))) return { ok: false, status: "invalid", detail: "Pixel ID malformed (expected a2_… or t2_…)", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ test_mode: true, events: [{ event_at: Date.now(), event_type: { tracking_type: "PageVisit" }, user: { external_id: "0000000000000000000000000000000000000000000000000000000000000000" }, event_metadata: { conversion_id: `validate-${Date.now()}` } }] }) });
    if (res.status === 200) return { ok: true, status: "valid", detail: "Conversion access token accepted (test_mode)", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 401) return { ok: false, status: "expired", detail: "Token rejected; generate a new conversion access token", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 403) return { ok: false, status: "invalid", detail: "Token has no access to this pixel", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
