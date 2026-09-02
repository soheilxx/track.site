import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { oauth1Header, type OAuth1Credentials } from "../oauth1.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, failed, missingCredential, mockOrReal, numItems, orderId, previewOf, prop, succeeded } from "./shared.ts";

/**
 * X (Twitter) Pixel + Conversion API.
 * Verified 2026-09-03 against https://docs.x.com/x-ads-api/measurement/web-conversions:
 * POST https://ads-api.x.com/{version}/measurement/conversions/{pixel_id} (OAuth 1.0a user context; AD_MANAGER or ACCOUNT_ADMIN),
 * body { conversions[]: { conversion_time (ISO 8601), event_id (Events Manager event id), identifiers[{twclid}|{hashed_email}|{hashed_phone_number}|{ip_address}|{user_agent}],
 * conversion_id (dedup with the pixel), value, price_currency, number_items, description, contents[{content_id, content_name, content_price, num_items, content_group_id}], search_string } }.
 * Response 200 { data: { conversions_processed, debug_id } }. Rate limit 60,000 events / account / 15 min.
 */
export const xMeta: ConnectorMeta = {
  type: "x",
  displayName: "X Ads (Pixel + Conversion API)",
  apiVersion: API_VERSIONS.x.version,
  verifiedAt: API_VERSIONS.x.verifiedAt,
  sunsetWatch: API_VERSIONS.x.sunsetWatch,
  docsUrl: API_VERSIONS.x.docsUrl,
  requiredPublicIds: [{ key: "pixel_id", label: "X Pixel ID", pattern: "^o[a-z0-9]{3,12}$", example: "o8abc", help: "Events Manager → your pixel → Pixel ID (starts with o). Public." }],
  requiredCredentials: [
    { kind: "oauth_access_token", label: "X Ads OAuth 1.0a access token", help: "Connect the X account with AD_MANAGER access; token + secret are stored encrypted.", secret: true, oauth: { provider: "x", scopes: ["ads"] } },
    { kind: "oauth_token_secret", label: "X Ads OAuth 1.0a token secret", help: "Issued together with the access token during the OAuth handshake.", secret: true, oauth: { provider: "x", scopes: ["ads"] } },
  ],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "conversion_id",
  transfer: DESTINATION_TRANSFER.x,
};

function xEventId(e: DispatchEvent["event"], mapping: EventMapping, ctx: ConnectorContext): string | null {
  const m = mapping.vendorEvent?.trim();
  if (m && /^tw-[a-z0-9]+-[a-z0-9]+$/i.test(m)) return m;
  const ids = ctx.settings.event_ids as Record<string, unknown> | undefined;
  const v = ids?.[e.name];
  return typeof v === "string" && /^tw-[a-z0-9]+-[a-z0-9]+$/i.test(v) ? v : null;
}

export class XConnector implements Connector {
  readonly meta = xMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return id ? { template: "x_pixel", ids: { pixel_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    return mockOrReal(ctx, `/x/${this.meta.apiVersion}/measurement/conversions/${pixel}`, `https://ads-api.x.com/${this.meta.apiVersion}/measurement/conversions/${pixel}`);
  }

  private async creds(ctx: ConnectorContext): Promise<OAuth1Credentials | null> {
    const token = await ctx.getCredential("oauth_access_token");
    const tokenSecret = await ctx.getCredential("oauth_token_secret");
    const consumerKey = ctx.platform?.x_consumer_key ?? null;
    const consumerSecret = ctx.platform?.x_consumer_secret ?? null;
    if (!token || !tokenSecret || !consumerKey || !consumerSecret) return null;
    return { consumerKey, consumerSecret, token, tokenSecret };
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.pixel_id) return null;
    const eventId = xEventId(e, mapping, ctx);
    if (!eventId) return null;
    const identifiers: Array<Record<string, string>> = [];
    if (input.clickIds.twclid) identifiers.push({ twclid: input.clickIds.twclid });
    if (e.user_data?.em) identifiers.push({ hashed_email: e.user_data.em });
    if (e.user_data?.ph) identifiers.push({ hashed_phone_number: e.user_data.ph });
    const c = e.commerce;
    const items = contents(e);
    const conversion = compact({
      conversion_time: new Date(e.client_ts ?? e.server_ts).toISOString(),
      event_id: eventId,
      identifiers,
      conversion_id: input.dedupId,
      value: c?.value ?? null,
      price_currency: c?.currency ?? null,
      number_items: numItems(e),
      description: orderId(e) ? `order ${orderId(e)}` : null,
      contents: items.length ? items.map((i) => compact({ content_id: i.id, content_name: i.name, content_price: i.item_price, num_items: i.quantity })) : null,
      search_string: prop(e, "search_term"),
    });
    const body = { conversions: [conversion] };
    return { vendorEventName: eventId, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["hashed_email", "hashed_phone_number"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const conv = (payload.body as { conversions: Array<Record<string, unknown>> }).conversions[0]!;
    if (!conv.event_id) errors.push("event_id (X Events Manager event) required");
    if (!Array.isArray(conv.identifiers) || conv.identifiers.length === 0) errors.push("at least one identifier (twclid, hashed_email, hashed_phone_number) required");
    if (typeof conv.conversion_time !== "string" || Date.now() - new Date(conv.conversion_time).getTime() > 7 * 86_400_000) errors.push("conversion_time must be within 7 days");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const creds = await this.creds(ctx);
    if (!creds) return payloads.map((p) => missingCredential(p.eventId, "oauth_access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 500)) {
      const url = group[0]!.endpoint;
      const conversions = group.map((p) => (p.body as { conversions: unknown[] }).conversions[0]);
      const res = await vendorRequest(ctx, { url, method: "POST", headers: { "content-type": "application/json", authorization: oauth1Header("POST", url, creds, ctx.now) }, body: JSON.stringify({ conversions }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { data?: { conversions_processed?: number; debug_id?: string }; errors?: Array<{ code?: string; message?: string }> } | null;
      for (const p of group) {
        if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, json?.data?.debug_id ?? null, excerpt(res.text)));
        else results.push(failed(p.eventId, cls, json?.errors?.[0]?.code ?? `http_${res.status ?? res.error}`, json?.errors?.[0]?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      }
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch(ctx, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass {
    const code = (body as { errors?: Array<{ code?: string }> } | null)?.errors?.[0]?.code;
    if (httpStatus === 401 || code === "UNAUTHORIZED_ACCESS" || code === "UNAUTHORIZED_CLIENT_APPLICATION") return "credential_expired";
    if (httpStatus === 403) return "auth";
    if (code === "INVALID_PARAMETER" || code === "MISSING_PARAMETER" || httpStatus === 400) return "invalid_payload";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const creds = await this.creds(ctx);
    if (!creds) return { ok: false, status: "not_connected", detail: "X Ads account not connected (or platform consumer key missing)", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^o[a-z0-9]{3,12}$/.test(String(ctx.publicConfig.pixel_id ?? ""))) return { ok: false, status: "invalid", detail: "Pixel ID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    const url = mockOrReal(ctx, `/x/${this.meta.apiVersion}/accounts`, `https://ads-api.x.com/${this.meta.apiVersion}/accounts`);
    const res = await vendorRequest(ctx, { url, method: "GET", headers: { authorization: oauth1Header("GET", url, creds, ctx.now) } });
    if (res.status === 200) return { ok: true, status: "valid", detail: "OAuth credentials accepted by the Ads API", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 401) return { ok: false, status: "expired", detail: "OAuth token rejected; reconnect X", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 403) return { ok: false, status: "invalid", detail: "App lacks Ads API access or user lacks AD_MANAGER role", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
