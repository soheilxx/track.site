import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { compact, eventMillis, failed, missingCredential, mockOrReal, orderId, previewOf, succeeded } from "./shared.ts";

/**
 * Quora Pixel + Conversion API.
 * Reference (2026-09-03): https://www.quora.com/ads/conversion_api_doc (OpenAPI: POST /conversion, Authentication section; the page is
 * only readable when signed in to Quora Ads, so field names were cross-checked with the Quora help center
 * https://quoraadsupport.zendesk.com/hc/en-us/articles/23065751885069-Conversion-API-Overview and the Commanders Act reference).
 * Request: POST https://api.quora.com/_/ad/conversion (Bearer API access token from Ads Manager → Conversion API → Generate Token), body
 * { account_id, conversion { event_id (dedup with the pixel), event_name (Generic|AppInstall|Purchase|GenerateLead|CompleteRegistration|AddPaymentInfo|
 * AddToCart|AddToWishlist|InitiateCheckout|Search), click_id (qclid), timestamp (µs), value, currency }, user { email sha256, ip, country, region, city, postal_code },
 * device { user_agent, language } }. The endpoint host is overridable via QUORA_CAPI_ENDPOINT should Quora publish a different base URL.
 */
export const QUORA_EVENT_NAMES: Record<string, string> = {
  page_view: "Generic",
  view_item: "Generic",
  view_content: "Generic",
  search: "Search",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  sign_up: "CompleteRegistration",
  generate_lead: "GenerateLead",
  contact: "GenerateLead",
  book_appointment: "GenerateLead",
  subscribe: "CompleteRegistration",
  start_trial: "CompleteRegistration",
  download: "Generic",
};

export const quoraMeta: ConnectorMeta = {
  type: "quora",
  displayName: "Quora Ads (Pixel + Conversion API)",
  apiVersion: API_VERSIONS.quora.version,
  verifiedAt: API_VERSIONS.quora.verifiedAt,
  sunsetWatch: API_VERSIONS.quora.sunsetWatch,
  docsUrl: API_VERSIONS.quora.docsUrl,
  requiredPublicIds: [
    { key: "pixel_id", label: "Quora pixel ID", pattern: "^[0-9a-f]{20,40}$", example: "0123456789abcdef0123456789abcdef", help: "Ads Manager → Pixels & Conversions → Quora Pixel. Public." },
    { key: "account_id", label: "Ad account ID", pattern: "^[0-9a-zA-Z_-]{4,40}$", example: "12345678", help: "Ads Manager → Settings → Account." },
  ],
  requiredCredentials: [{ kind: "access_token", label: "Conversion API access token", help: "Ads Manager → Conversion API → Generate Token (one token per ad account). Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "event_id",
  transfer: DESTINATION_TRANSFER.quora,
};

export class QuoraConnector implements Connector {
  readonly meta = quoraMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return id ? { template: "quora_pixel", ids: { pixel_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    return mockOrReal(ctx, "/quora/_/ad/conversion", process.env.QUORA_CAPI_ENDPOINT ?? "https://api.quora.com/_/ad/conversion");
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const account = String(ctx.publicConfig.account_id ?? "");
    if (!account) return null;
    const name = mapping.vendorEvent || QUORA_EVENT_NAMES[e.name] || "Generic";
    const c = e.commerce;
    const body = compact({
      account_id: account,
      conversion: compact({
        event_id: input.dedupId,
        event_name: name,
        click_id: input.clickIds.qclid ?? null,
        timestamp: eventMillis(e) * 1000,
        value: c?.value ?? null,
        currency: c?.currency ?? null,
        order_id: orderId(e),
        url: e.url,
      }),
      user: compact({ email: e.user_data?.em ?? null, country: e.consent.region && /^[A-Z]{2}$/.test(e.consent.region) ? e.consent.region : null }),
      device: compact({ language: e.locale }),
    }) as Record<string, unknown>;
    return { vendorEventName: name, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["email"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const b = payload.body as { account_id?: string; conversion?: Record<string, unknown>; user?: Record<string, unknown> };
    if (!b.account_id) errors.push("account_id required");
    if (!b.conversion?.event_id) errors.push("conversion.event_id required");
    if (!b.conversion?.event_name) errors.push("conversion.event_name required");
    if (!b.conversion?.click_id && !b.user?.email) errors.push("conversion.click_id (qclid) or user.email required for matching");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      const res = await vendorRequest(ctx, { url: p.endpoint, method: "POST", headers: { ...p.headers, authorization: `Bearer ${token}` }, body: JSON.stringify(p.body) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { error?: string | { message?: string }; message?: string } | null;
      const msg = typeof json?.error === "string" ? json.error : (json?.error?.message ?? json?.message);
      if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, excerpt(res.text)));
      else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, msg ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch(ctx, [payload]);
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
    if (!token) return { ok: false, status: "not_connected", detail: "No Conversion API token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!ctx.publicConfig.account_id) return { ok: false, status: "invalid", detail: "Ad account ID missing", apiVersion: this.meta.apiVersion, checkedAt };
    // Quora has no read endpoint for tokens; a Generic event without matching keys is rejected as invalid (400) when the token is valid, 401 otherwise
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ account_id: ctx.publicConfig.account_id, conversion: { event_id: `validate-${Date.now()}`, event_name: "Generic", timestamp: Date.now() * 1000 }, user: {}, device: {} }) });
    if (res.status === 401 || res.status === 403) return { ok: false, status: "expired", detail: "Token rejected by Quora", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status !== null && res.status < 500) return { ok: true, status: "valid", detail: "Token accepted for this ad account", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
