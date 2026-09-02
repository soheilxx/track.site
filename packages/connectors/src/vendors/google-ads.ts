import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, failed, isOffline, marketingGranted, missingCredential, mockOrReal, orderId, previewOf, succeeded } from "./shared.ts";

/**
 * Google Ads: Google tag (gtag.js, AW- conversion tracking + Enhanced Conversions in the browser) and
 * the Google Ads API ConversionUploadService for online click conversions / Enhanced Conversions for Leads
 * and offline conversion imports.
 * Verified 2026-09-03 against https://developers.google.com/google-ads/api/docs/conversions/upload-clicks (v25 = latest, released 2026-07-22):
 * POST https://googleads.googleapis.com/{version}/customers/{customerId}:uploadClickConversions with headers
 * Authorization: Bearer <OAuth2>, developer-token, login-customer-id (MCC). Body { conversions[≤2000], partialFailure: true, validateOnly?, jobId? }.
 * ClickConversion: gclid|gbraid|wbraid, conversionAction customers/{cid}/conversionActions/{id}, conversionDateTime "yyyy-mm-dd hh:mm:ss+|-hh:mm",
 * conversionValue, currencyCode, orderId, userIdentifiers[{hashedEmail|hashedPhoneNumber, userIdentifierSource FIRST_PARTY}], consent{adUserData, adPersonalization},
 * conversionEnvironment WEB|APP. Failures per row come back in partialFailureError.details[].errors[].location.fieldPathElements[].index.
 * Conversion must fall inside the click-through lookback window and not precede the click.
 */
export const googleAdsMeta: ConnectorMeta = {
  type: "google_ads",
  displayName: "Google Ads (Google tag + Conversions upload)",
  apiVersion: API_VERSIONS.google_ads.version,
  verifiedAt: API_VERSIONS.google_ads.verifiedAt,
  sunsetWatch: API_VERSIONS.google_ads.sunsetWatch,
  docsUrl: API_VERSIONS.google_ads.docsUrl,
  requiredPublicIds: [
    { key: "conversion_id", label: "Google tag conversion ID", pattern: "^AW-[0-9]{6,12}$", example: "AW-123456789", help: "Goals → Conversions → Google tag → Tag ID. Public." },
    { key: "customer_id", label: "Google Ads customer ID", pattern: "^[0-9]{10}$", example: "1234567890", help: "Top right in Google Ads, digits only (no dashes)." },
    { key: "login_customer_id", label: "Manager (MCC) customer ID", pattern: "^([0-9]{10})?$", example: "", help: "Only if the account is accessed through a manager account." },
  ],
  requiredCredentials: [{ kind: "oauth_refresh_token", label: "Google Ads OAuth (adwords scope)", help: "Connect the Google account that manages the Ads account. Refresh tokens are stored encrypted; access tokens are minted server-side.", secret: true, oauth: { provider: "google", scopes: ["https://www.googleapis.com/auth/adwords"] } }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "orderId",
  transfer: DESTINATION_TRANSFER.google_ads,
};

function conversionDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`;
}

function conversionActionId(e: DispatchEvent["event"], mapping: EventMapping, ctx: ConnectorContext): string | null {
  const m = mapping.vendorEvent?.trim();
  if (m && /^[0-9]+$/.test(m)) return m;
  const actions = ctx.settings.conversion_actions as Record<string, unknown> | undefined;
  const v = actions?.[e.name];
  return typeof v === "string" && /^[0-9]+$/.test(v) ? v : typeof v === "number" ? String(v) : null;
}

export class GoogleAdsConnector implements Connector {
  readonly meta = googleAdsMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.conversion_id === "string" ? publicConfig.conversion_id : null;
    return id ? { template: "gtag", ids: { conversion_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const cid = String(ctx.publicConfig.customer_id ?? "");
    return mockOrReal(ctx, `/google-ads/${this.meta.apiVersion}/customers/${cid}:uploadClickConversions`, `https://googleads.googleapis.com/${this.meta.apiVersion}/customers/${cid}:uploadClickConversions`);
  }

  private async auth(ctx: ConnectorContext): Promise<{ token: string | null; developerToken: string | null; headers: Record<string, string> }> {
    const token = (await ctx.getCredential("oauth_access_token")) ?? (ctx.oauth ? await ctx.oauth.accessToken("google") : null);
    const developerToken = ctx.platform?.google_ads_developer_token ?? null;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (developerToken) headers["developer-token"] = developerToken;
    const mcc = String(ctx.publicConfig.login_customer_id ?? "");
    if (mcc) headers["login-customer-id"] = mcc;
    return { token, developerToken, headers };
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const cid = String(ctx.publicConfig.customer_id ?? "");
    const action = conversionActionId(e, mapping, ctx);
    if (!cid || !action) return null;
    const c = e.commerce;
    const identifiers: Array<Record<string, unknown>> = [];
    if (e.user_data?.em) identifiers.push({ hashedEmail: e.user_data.em, userIdentifierSource: "FIRST_PARTY" });
    if (e.user_data?.ph) identifiers.push({ hashedPhoneNumber: e.user_data.ph, userIdentifierSource: "FIRST_PARTY" });
    const granted = marketingGranted(e);
    const conversion = compact({
      gclid: input.clickIds.gclid ?? null,
      gbraid: input.clickIds.gbraid ?? null,
      wbraid: input.clickIds.wbraid ?? null,
      conversionAction: `customers/${cid}/conversionActions/${action}`,
      conversionDateTime: conversionDateTime(e.client_ts ?? e.server_ts),
      conversionValue: c?.value ?? null,
      currencyCode: c?.currency ?? null,
      orderId: orderId(e),
      userIdentifiers: identifiers.length ? identifiers : null,
      conversionEnvironment: isOffline(e) ? null : "WEB",
      consent: { adUserData: granted ? "GRANTED" : "DENIED", adPersonalization: granted && e.consent.granted.includes("personalization") ? "GRANTED" : "DENIED" },
    });
    const body = { conversions: [conversion], partialFailure: true };
    return { vendorEventName: `conversionAction:${action}`, dedupKey: orderId(e) ?? input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["hashedEmail", "hashedPhoneNumber"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const conv = (payload.body as { conversions: Array<Record<string, unknown>> }).conversions[0]!;
    if (!conv.gclid && !conv.gbraid && !conv.wbraid && !conv.userIdentifiers) errors.push("gclid, gbraid, wbraid or hashed user identifiers (Enhanced Conversions for Leads) required");
    if (!conv.conversionAction) errors.push("conversionAction required");
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(conv.conversionDateTime))) errors.push("conversionDateTime format yyyy-mm-dd hh:mm:ss+|-hh:mm");
    if (conv.conversionValue != null && !conv.currencyCode) errors.push("currencyCode required with conversionValue");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const { token, developerToken, headers } = await this.auth(ctx);
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "oauth_access_token"));
    if (!developerToken) return payloads.map((p) => failed(p.eventId, "auth", "developer_token_missing", "Platform Google Ads developer token not configured (GOOGLE_ADS_DEVELOPER_TOKEN)"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 2000)) {
      const conversions = group.map((p) => (p.body as { conversions: unknown[] }).conversions[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers, body: JSON.stringify({ conversions, partialFailure: true, validateOnly: ctx.testMode }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { results?: Array<{ gclid?: string; conversionAction?: string; conversionDateTime?: string }>; partialFailureError?: { message?: string; details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string>; location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number }> } }> }> }; error?: { code?: number; message?: string; status?: string } } | null;
      const rowErrors = new Map<number, string>();
      for (const d of json?.partialFailureError?.details ?? []) for (const err of d.errors ?? []) {
        const idx = err.location?.fieldPathElements?.find((f) => f.fieldName === "conversions")?.index ?? -1;
        if (idx >= 0) rowErrors.set(idx, `${Object.values(err.errorCode ?? {})[0] ?? "error"}: ${err.message ?? ""}`);
      }
      group.forEach((p, i) => {
        if (cls !== "none") results.push(failed(p.eventId, cls, json?.error?.status ?? `http_${res.status ?? res.error}`, json?.error?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        else if (rowErrors.has(i)) results.push(failed(p.eventId, /CLICK_NOT_FOUND|TOO_RECENT|EXPIRED|INVALID_CONVERSION|UNPARSEABLE|NO_CONVERSION|UNAUTHORIZED_CUSTOMER/i.test(rowErrors.get(i)!) ? "invalid_payload" : "permanent", "partial_failure", rowErrors.get(i)!, res.status, res.durationMs));
        else results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, json?.results?.[i]?.conversionAction ?? null, ctx.testMode ? "validateOnly accepted" : excerpt(res.text)));
      });
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch({ ...ctx, testMode: true }, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass {
    const status = (body as { error?: { status?: string } } | null)?.error?.status;
    if (httpStatus === 401 || status === "UNAUTHENTICATED") return "credential_expired";
    if (httpStatus === 403 || status === "PERMISSION_DENIED") return "auth";
    if (httpStatus === 429 || status === "RESOURCE_EXHAUSTED") return "rate_limited";
    if (httpStatus === 400 || status === "INVALID_ARGUMENT") return "invalid_payload";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const { token, developerToken, headers } = await this.auth(ctx);
    if (!token) return { ok: false, status: "not_connected", detail: "Google account not connected", apiVersion: this.meta.apiVersion, checkedAt };
    if (!developerToken) return { ok: false, status: "invalid", detail: "Platform developer token missing (operator configuration)", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[0-9]{10}$/.test(String(ctx.publicConfig.customer_id ?? ""))) return { ok: false, status: "invalid", detail: "Customer ID must be 10 digits", apiVersion: this.meta.apiVersion, checkedAt };
    // validateOnly upload with an empty click: proves auth + developer token + customer access without recording anything
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers, body: JSON.stringify({ conversions: [{ conversionAction: `customers/${ctx.publicConfig.customer_id}/conversionActions/0`, conversionDateTime: conversionDateTime(new Date().toISOString()) }], partialFailure: true, validateOnly: true }) });
    if (res.status === 200) return { ok: true, status: "valid", detail: "OAuth token, developer token and customer access verified (validateOnly)", apiVersion: this.meta.apiVersion, checkedAt };
    const cls = this.classifyError(res.status, res.json, res.error);
    if (cls === "credential_expired") return { ok: false, status: "expired", detail: "OAuth token rejected; reconnect Google", apiVersion: this.meta.apiVersion, checkedAt };
    if (cls === "auth") return { ok: false, status: "invalid", detail: "No access to this customer ID (check login-customer-id / account permissions / developer token access level)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
