import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, failed, isOffline, marketingGranted, missingCredential, mockOrReal, numItems, orderId, previewOf, succeeded } from "./shared.ts";

/**
 * Amazon Ads: Amazon Ad Tag (browser) + Amazon Ads Events API (server, successor of the Conversions API).
 * Reference (2026-09-03): the Amazon Ads API portal (advertising.amazon.com/API/docs) renders client-side only; endpoint hosts come from the
 * public API overview (NA https://advertising-api.amazon.com, EU https://advertising-api-eu.amazon.com, FE https://advertising-api-fe.amazon.com),
 * the body shape from the Commanders Act / MetaRouter Events API references: POST /events/v1 with headers Authorization: Bearer <LwA token>,
 * Amazon-Advertising-API-ClientId, Amazon-Ads-AccountId (or Amazon-Advertising-API-Scope profile id); body { events[]: { eventTime, eventId (dedup),
 * eventDescription { name (conversion definition), dataSetName, conversionType, eventIngestionMethod: SERVER_TO_SERVER }, eventActionSource, countryCode,
 * matchKeys[{ type: EMAIL|PHONE|FIRST_NAME|LAST_NAME|ADDRESS|CITY|STATE|POSTAL|MAID|MATCH_ID, values[] }], consent { amazonConsent { amznAdStorage, amznUserData } },
 * value, currencyCode, unitsSold, clientDedupeId, dataProcessingOptions, customAttributes } }. Conversion definitions must exist in the account first.
 */
export const AMAZON_CONVERSION_TYPES: Record<string, string> = {
  page_view: "PAGE_VIEW",
  search: "SEARCH",
  add_to_cart: "ADD_TO_SHOPPING_CART",
  begin_checkout: "CHECKOUT",
  purchase: "OFF_AMAZON_PURCHASES",
  generate_lead: "LEAD",
  contact: "CONTACT",
  sign_up: "SIGN_UP",
  subscribe: "SUBSCRIBE",
  start_trial: "SUBSCRIBE",
  download: "OTHER",
  book_appointment: "OTHER",
};

const HOSTS: Record<string, string> = { NA: "https://advertising-api.amazon.com", EU: "https://advertising-api-eu.amazon.com", FE: "https://advertising-api-fe.amazon.com" };

export const amazonMeta: ConnectorMeta = {
  type: "amazon",
  displayName: "Amazon Ads (Ad Tag + Events API)",
  apiVersion: API_VERSIONS.amazon.version,
  verifiedAt: API_VERSIONS.amazon.verifiedAt,
  sunsetWatch: API_VERSIONS.amazon.sunsetWatch,
  docsUrl: API_VERSIONS.amazon.docsUrl,
  requiredPublicIds: [
    { key: "tag_id", label: "Amazon Ad Tag ID", pattern: "^[0-9a-f]{20,40}$", example: "1234567890abcdef1234567890abcdef", help: "Amazon DSP / Ads console → Amazon Ad Tag. Public." },
    { key: "account_id", label: "Amazon Ads account ID", pattern: "^[A-Za-z0-9._-]{6,60}$", example: "amzn1.ads-account.g.abc123", help: "Ads console → Account settings (Amazon-Ads-AccountId)." },
    { key: "region", label: "API region", pattern: "^(NA|EU|FE)$", example: "EU", help: "NA, EU or FE — the marketplace region of the Ads account." },
    { key: "data_set_name", label: "Data set name", pattern: "^[A-Za-z][A-Za-z0-9_-]{4,99}$", example: "tracksite_web_events", help: "Events API data set (created on first use)." },
  ],
  requiredCredentials: [{ kind: "oauth_refresh_token", label: "Login with Amazon (advertising::campaign_management)", help: "Connect the Amazon account that owns the Ads account; refresh tokens stored encrypted, access tokens minted server-side.", secret: true, oauth: { provider: "amazon", scopes: ["advertising::campaign_management"] } }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "eventId",
  transfer: DESTINATION_TRANSFER.amazon,
  accessNote: "Amazon Ads API access requires an approved Login with Amazon application (platform-level) and conversion definitions created in the Ads account before events are accepted.",
};

export class AmazonConnector implements Connector {
  readonly meta = amazonMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.tag_id === "string" ? publicConfig.tag_id : null;
    return id ? { template: "amazon_tag", ids: { tag_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const region = String(ctx.publicConfig.region ?? "EU");
    return mockOrReal(ctx, `/amazon/${region}/events/v1`, `${HOSTS[region] ?? HOSTS.EU}/events/v1`);
  }

  private async auth(ctx: ConnectorContext): Promise<{ token: string | null; clientId: string | null; headers: Record<string, string> }> {
    const token = (await ctx.getCredential("oauth_access_token")) ?? (ctx.oauth ? await ctx.oauth.accessToken("amazon") : null);
    const clientId = ctx.platform?.amazon_ads_client_id ?? null;
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (clientId) headers["amazon-advertising-api-clientid"] = clientId;
    if (ctx.publicConfig.account_id) headers["amazon-ads-accountid"] = String(ctx.publicConfig.account_id);
    if (ctx.publicConfig.profile_id) headers["amazon-advertising-api-scope"] = String(ctx.publicConfig.profile_id);
    return { token, clientId, headers };
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.account_id) return null;
    const conversionType = AMAZON_CONVERSION_TYPES[e.name] ?? "OTHER";
    const name = mapping.vendorEvent || e.name;
    const c = e.commerce;
    const matchKeys: Array<{ type: string; values: string[] }> = [];
    if (e.user_data?.em) matchKeys.push({ type: "EMAIL", values: [e.user_data.em] });
    if (e.user_data?.ph) matchKeys.push({ type: "PHONE", values: [e.user_data.ph] });
    if (e.user_data?.fn) matchKeys.push({ type: "FIRST_NAME", values: [e.user_data.fn] });
    if (e.user_data?.ln) matchKeys.push({ type: "LAST_NAME", values: [e.user_data.ln] });
    if (e.user_data?.zp) matchKeys.push({ type: "POSTAL", values: [e.user_data.zp] });
    if (!matchKeys.length && (input.clickIds.maas || e.anonymous_id)) matchKeys.push({ type: "MATCH_ID", values: [input.clickIds.maas ?? e.anonymous_id!] });
    const granted = marketingGranted(e);
    const event = compact({
      eventTime: new Date(e.client_ts ?? e.server_ts).toISOString(),
      eventId: input.dedupId,
      clientDedupeId: input.dedupId,
      eventDescription: compact({ name, dataSetName: ctx.publicConfig.data_set_name ?? null, conversionType, eventIngestionMethod: "SERVER_TO_SERVER" }),
      eventActionSource: isOffline(e) ? "OFFLINE" : "WEBSITE",
      countryCode: e.consent.region && /^[A-Z]{2}$/.test(e.consent.region) ? e.consent.region : null,
      matchKeys,
      consent: { amazonConsent: { amznAdStorage: granted ? "GRANTED" : "DENIED", amznUserData: granted ? "GRANTED" : "DENIED" } },
      value: c?.value ?? null,
      currencyCode: c?.currency ?? null,
      unitsSold: numItems(e),
      customAttributes: orderId(e) ? [{ name: "order_id", dataType: "STRING", value: orderId(e) }] : null,
    });
    const body = { events: [event] };
    return { vendorEventName: `${conversionType}:${name}`, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["values"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const ev = (payload.body as { events: Array<Record<string, unknown>> }).events[0]!;
    const desc = (ev.eventDescription ?? {}) as Record<string, unknown>;
    if (!desc.name || !desc.conversionType) errors.push("eventDescription.name and conversionType required");
    if (!desc.dataSetName) errors.push("dataSetName required");
    if (!Array.isArray(ev.matchKeys) || !ev.matchKeys.length) errors.push("matchKeys need at least one identifier (hashed email/phone or MATCH_ID)");
    if (!ev.eventTime) errors.push("eventTime required");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const { token, clientId, headers } = await this.auth(ctx);
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "oauth_access_token"));
    if (!clientId) return payloads.map((p) => failed(p.eventId, "auth", "client_id_missing", "Platform Login-with-Amazon client id not configured (AMAZON_ADS_CLIENT_ID)"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 500)) {
      const events = group.map((p) => (p.body as { events: unknown[] }).events[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers, body: JSON.stringify({ events }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { success?: Array<{ index?: number }>; error?: Array<{ index?: number; httpStatusCode?: number; subErrors?: Array<{ errorMessage?: string; errorCode?: string }> }> } | null;
      group.forEach((p, i) => {
        const err = json?.error?.find((x) => x.index === i);
        if (cls !== "none") results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        else if (err) results.push(failed(p.eventId, "invalid_payload", err.subErrors?.[0]?.errorCode ?? "event_rejected", err.subErrors?.map((s) => s.errorMessage).join("; ") ?? "rejected", res.status, res.durationMs));
        else results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, excerpt(res.text)));
      });
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
    if (httpStatus === 429) return "rate_limited";
    if (httpStatus === 400 || httpStatus === 422) return "invalid_payload";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const { token, clientId, headers } = await this.auth(ctx);
    if (!token) return { ok: false, status: "not_connected", detail: "Amazon account not connected", apiVersion: this.meta.apiVersion, checkedAt };
    if (!clientId) return { ok: false, status: "invalid", detail: "Platform Login-with-Amazon client id missing (operator configuration)", apiVersion: this.meta.apiVersion, checkedAt };
    if (!ctx.publicConfig.account_id) return { ok: false, status: "invalid", detail: "Ads account ID missing", apiVersion: this.meta.apiVersion, checkedAt };
    // an empty events array is rejected with 400 when auth succeeds and 401/403 otherwise
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers, body: JSON.stringify({ events: [] }) });
    if (res.status === 401) return { ok: false, status: "expired", detail: "Access token rejected; reconnect Amazon", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 403) return { ok: false, status: "invalid", detail: "Client id not authorised for this account/region", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status !== null && res.status < 500) return { ok: true, status: "valid", detail: "Events API reachable with the connected credentials", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
