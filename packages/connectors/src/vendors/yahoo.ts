import { createHmac, randomUUID } from "node:crypto";
import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, contents, eventSeconds, failed, isOffline, missingCredential, mockOrReal, orderId, previewOf, succeeded } from "./shared.ts";

/**
 * Yahoo DSP: Dot tag in the browser + Yahoo Conversions API (DataX events).
 * Verified 2026-09-03 against https://help.yahooinc.com/dsp-api/docs/standard-yahoo-conversion-api:
 * POST https://batch.datax.yahoo.com/v1/events/{pixelId}, `Authorization: Bearer <access_token>` (OAuth 2.0 client credentials via
 * JWT client assertion to https://id.b2b.yahooincapis.com/zts/v1/oauth2/token, 60-minute tokens), body = JSON array of events:
 * { eventTs (s|ms), eventName, eventId (dedup), actionSource web|app|phone|email|physical_store, actionSourceUrl, country, region,
 * userData { email[] sha256, phone[] sha256, gpsaid[], idfa[], pxid[], ip_address, userAgent }, eventData { price, products[{category, subCategory}], customKeyValues },
 * clickData { vmcid, tblci }, privacy { privacy_type GPP|GDPR|OPTOUT, consent_string, gpp_sid[] } }. Response { success: COMPLETE|PARTIAL, message }.
 * Limits: 200 requests/s, 10 MB/s. Prices are USD unless a currency custom key is agreed with Yahoo.
 */
export const yahooMeta: ConnectorMeta = {
  type: "yahoo",
  displayName: "Yahoo DSP (Dot tag + Conversions API)",
  apiVersion: API_VERSIONS.yahoo.version,
  verifiedAt: API_VERSIONS.yahoo.verifiedAt,
  sunsetWatch: API_VERSIONS.yahoo.sunsetWatch,
  docsUrl: API_VERSIONS.yahoo.docsUrl,
  requiredPublicIds: [
    { key: "pixel_id", label: "Yahoo pixel ID", pattern: "^[0-9]{3,12}$", example: "10012345", help: "DSP → Advertiser → Tracking → Pixels → Pixel ID. Public." },
    { key: "project_id", label: "Dot tag project ID", pattern: "^[0-9]{3,12}$", example: "10000", help: "From the Dot tag snippet (`projectId`). Public." },
  ],
  requiredCredentials: [
    { kind: "client_id", label: "Yahoo DSP API client ID", help: "DSP → Settings → API access. Stored encrypted.", secret: true, oauth: null },
    { kind: "client_secret", label: "Yahoo DSP API client secret", help: "Issued with the client ID; used to mint 60-minute access tokens server-side.", secret: true, oauth: null },
  ],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "eventId",
  transfer: DESTINATION_TRANSFER.yahoo,
};

const tokenCache = new Map<string, { token: string; exp: number }>();

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** OAuth 2.0 client-credentials grant with an HS256 JWT client assertion (Yahoo ID B2B). */
export async function yahooAccessToken(ctx: ConnectorContext, clientId: string, clientSecret: string): Promise<{ token: string | null; status: number | null; detail: string }> {
  const cached = tokenCache.get(ctx.integrationId);
  if (cached && cached.exp > Date.now() + 60_000) return { token: cached.token, status: 200, detail: "cached" };
  const tokenUrl = mockOrReal(ctx, "/yahoo/zts/v1/oauth2/token", "https://id.b2b.yahooincapis.com/zts/v1/oauth2/token");
  const now = Math.floor(ctx.now().getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: clientId, sub: clientId, aud: `${tokenUrl}?realm=dsp`, exp: now + 600, iat: now, jti: randomUUID() }));
  const signature = b64url(createHmac("sha256", clientSecret).update(`${header}.${claims}`).digest());
  const form = new URLSearchParams({ grant_type: "client_credentials", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: `${header}.${claims}.${signature}`, scope: "dsp-api-access", realm: "dsp" });
  const res = await vendorRequest(ctx, { url: tokenUrl, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
  const json = res.json as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
  if (res.status === 200 && json?.access_token) {
    tokenCache.set(ctx.integrationId, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 });
    return { token: json.access_token, status: 200, detail: "minted" };
  }
  return { token: null, status: res.status, detail: json?.error_description ?? json?.error ?? excerpt(res.text, 160) ?? String(res.error) };
}

export class YahooConnector implements Connector {
  readonly meta = yahooMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const pixel = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    const project = typeof publicConfig.project_id === "string" ? publicConfig.project_id : null;
    return pixel && project ? { template: "yahoo_dot", ids: { pixel_id: pixel, project_id: project }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const pixel = String(ctx.publicConfig.pixel_id ?? "");
    return mockOrReal(ctx, `/yahoo/v1/events/${pixel}`, `https://batch.datax.yahoo.com/v1/events/${pixel}`);
  }

  private async token(ctx: ConnectorContext): Promise<{ token: string | null; status: number | null; detail: string }> {
    const fromPlatform = ctx.oauth ? await ctx.oauth.accessToken("yahoo") : null;
    if (fromPlatform) return { token: fromPlatform, status: 200, detail: "platform" };
    const id = await ctx.getCredential("client_id");
    const secret = await ctx.getCredential("client_secret");
    if (!id || !secret) return { token: null, status: null, detail: "client credentials missing" };
    return yahooAccessToken(ctx, id, secret);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.pixel_id) return null;
    const name = mapping.vendorEvent || e.name;
    const c = e.commerce;
    const items = contents(e);
    const ud = e.user_data;
    const event = compact({
      eventTs: eventSeconds(e),
      eventName: name,
      eventId: input.dedupId,
      actionSource: isOffline(e) ? "physical_store" : "web",
      actionSourceUrl: e.url,
      country: e.consent.region && /^[A-Z]{2}$/.test(e.consent.region) ? e.consent.region : null,
      userData: compact({ email: ud?.em ? [ud.em] : null, phone: ud?.ph ? [ud.ph] : null }),
      eventData: compact({
        price: c?.value ?? null,
        products: items.length ? items.map((i) => compact({ category: i.category ?? i.id, subCategory: i.name })) : null,
        customKeyValues: compact({ currency: c?.currency ?? null, order_id: orderId(e), quantity: c?.quantity != null ? String(c.quantity) : null }),
      }),
      clickData: compact({ vmcid: input.clickIds.vmcid ?? input.clickIds.yclid ?? null, tblci: input.clickIds.tblci ?? null }),
      privacy: e.consent.gpc ? { privacy_type: "OPTOUT" } : null,
    });
    const body = [event];
    return { vendorEventName: name, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body, preview: previewOf({ events: body }, ["email", "phone"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const ev = (payload.body as Array<Record<string, unknown>>)[0]!;
    const ud = (ev.userData ?? {}) as Record<string, unknown>;
    const cd = (ev.clickData ?? {}) as Record<string, unknown>;
    if (!ev.eventName) errors.push("eventName required");
    if (typeof ev.eventTs !== "number") errors.push("eventTs required");
    if (!ev.actionSource) errors.push("actionSource required");
    if (!Object.keys(ud).length && !Object.keys(cd).length) errors.push("userData needs at least one identifier or clickData (vmcid)");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const t = await this.token(ctx);
    if (!t.token) return payloads.map((p) => (t.status === null ? missingCredential(p.eventId, "client_id") : failed(p.eventId, "credential_expired", "token_mint_failed", t.detail, t.status)));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 500)) {
      const events = group.map((p) => (p.body as unknown[])[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${t.token}` }, body: JSON.stringify(events) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { success?: string; message?: string } | null;
      for (const p of group) {
        if (cls === "none" && json?.success !== "PARTIAL") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, excerpt(res.text)));
        else if (cls === "none") results.push(failed(p.eventId, "invalid_payload", "partial", `Yahoo accepted the batch partially: ${json?.message ?? ""}`, res.status, res.durationMs));
        else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, json?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      }
      if (res.status === 401) tokenCache.delete(ctx.integrationId);
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
    if (!/^[0-9]{3,12}$/.test(String(ctx.publicConfig.pixel_id ?? ""))) return { ok: false, status: "invalid", detail: "Pixel ID must be numeric", apiVersion: this.meta.apiVersion, checkedAt };
    const t = await this.token(ctx);
    if (!t.token && t.status === null) return { ok: false, status: "not_connected", detail: "Yahoo DSP API client credentials missing", apiVersion: this.meta.apiVersion, checkedAt };
    if (!t.token) return { ok: false, status: t.status === 401 || t.status === 400 ? "invalid" : "unknown", detail: `Token request failed: ${t.detail}`, apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: true, status: "valid", detail: `Access token issued (${t.detail}); events post to pixel ${ctx.publicConfig.pixel_id}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
