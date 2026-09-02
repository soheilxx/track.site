import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, failed, missingCredential, mockOrReal, orderId, previewOf, succeeded } from "./shared.ts";

/**
 * AdRoll (NextRoll) pixel + Server-to-Server Event API (beta).
 * Verified 2026-09-03 against https://apidocs.nextroll.com/server-to-server-api/reference.html:
 * POST https://srv.adroll.com/api?advertisable={EID}[&dry_run=true], `Authorization: Token <Server Access Token>` (issued by the account manager;
 * S2S is in beta and must be enabled per account). Body = JSON array of events { advertisable_eid, pixel_eid, event_name, event_attributes,
 * conversion_value, currency, page_location, timestamp, ip, user_agent, identifiers { adct, first_party_cookie (__adroll_fpc), email_sha256, user_id } };
 * every event needs `first_party_cookie` or `adct`. The API is documented as "under active development".
 */
export const adrollMeta: ConnectorMeta = {
  type: "adroll",
  displayName: "AdRoll (pixel + S2S Event API, beta)",
  apiVersion: API_VERSIONS.adroll.version,
  verifiedAt: API_VERSIONS.adroll.verifiedAt,
  sunsetWatch: API_VERSIONS.adroll.sunsetWatch,
  docsUrl: API_VERSIONS.adroll.docsUrl,
  requiredPublicIds: [
    { key: "advertiser_id", label: "Advertisable EID", pattern: "^[A-Z0-9]{20,32}$", example: "ABCDEFGHIJKLMNOPQRSTUVWX", help: "AdRoll pixel snippet `adroll_adv_id`. Public." },
    { key: "pixel_id", label: "Pixel EID", pattern: "^[A-Z0-9]{20,32}$", example: "ZYXWVUTSRQPONMLKJIHGFEDC", help: "AdRoll pixel snippet `adroll_pix_id`. Public." },
  ],
  requiredCredentials: [{ kind: "access_token", label: "Server Access Token (SAT)", help: "Issued by your NextRoll account manager for the S2S beta. Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "event_attributes.order_id",
  transfer: DESTINATION_TRANSFER.adroll,
  accessNote: "The AdRoll Server-to-Server Event API is in beta: request access and a Server Access Token from your NextRoll account manager before enabling server delivery. The pixel works without it.",
};

export class AdRollConnector implements Connector {
  readonly meta = adrollMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const adv = typeof publicConfig.advertiser_id === "string" ? publicConfig.advertiser_id : null;
    const pix = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return adv && pix ? { template: "adroll_pixel", ids: { advertiser_id: adv, pixel_id: pix }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext, dryRun: boolean): string {
    const adv = String(ctx.publicConfig.advertiser_id ?? "");
    return mockOrReal(ctx, "/adroll/api", "https://srv.adroll.com/api") + `?advertisable=${encodeURIComponent(adv)}${dryRun ? "&dry_run=true" : ""}`;
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.advertiser_id) return null;
    const identifiers = compact({
      adct: input.clickIds.adroll_clid ?? input.clickIds.adct ?? null,
      first_party_cookie: e.vendor_ids?.adroll_fpc ?? null,
      email_sha256: e.user_data?.em ?? null,
      user_id: e.user_data?.external_id ?? null,
    });
    const c = e.commerce;
    const event = compact({
      advertisable_eid: String(ctx.publicConfig.advertiser_id),
      pixel_eid: typeof ctx.publicConfig.pixel_id === "string" ? ctx.publicConfig.pixel_id : null,
      event_name: mapping.vendorEvent || e.name,
      event_attributes: compact({ order_id: orderId(e), event_id: input.dedupId, currency: c?.currency ?? null, product_ids: c?.items?.map((i) => i.item_id) ?? null }),
      conversion_value: c?.value ?? null,
      currency: c?.currency ?? null,
      page_location: e.url,
      timestamp: new Date(e.client_ts ?? e.server_ts).toISOString(),
      identifiers,
    });
    const body = [event];
    return { vendorEventName: String(event.event_name), dedupKey: input.dedupId, endpoint: this.endpoint(ctx, ctx.testMode), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf({ events: body }, ["email_sha256"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const ev = (payload.body as Array<Record<string, unknown>>)[0]!;
    const ids = (ev.identifiers ?? {}) as Record<string, unknown>;
    if (!ev.event_name) errors.push("event_name required");
    if (!ids.first_party_cookie && !ids.adct) errors.push("identifiers need first_party_cookie (__adroll_fpc) or adct");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 500)) {
      const events = group.map((p) => (p.body as unknown[])[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", authorization: `Token ${token}` }, body: JSON.stringify(events) });
      const cls = this.classifyError(res.status, res.json, res.error);
      for (const p of group) {
        if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, ctx.testMode ? "dry_run accepted" : excerpt(res.text)));
        else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      }
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
    if (!token) return { ok: false, status: "not_connected", detail: "No Server Access Token stored (beta access required)", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[A-Z0-9]{20,32}$/.test(String(ctx.publicConfig.advertiser_id ?? ""))) return { ok: false, status: "invalid", detail: "Advertisable EID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx, true), method: "POST", headers: { "content-type": "application/json", authorization: `Token ${token}` }, body: JSON.stringify([{ advertisable_eid: ctx.publicConfig.advertiser_id, event_name: "tracksite_validation", timestamp: new Date().toISOString(), identifiers: { first_party_cookie: "validation" } }]) });
    if (res.status !== null && res.status >= 200 && res.status < 300) return { ok: true, status: "valid", detail: "Server Access Token accepted (dry_run)", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 401 || res.status === 403) return { ok: false, status: "expired", detail: "Server Access Token rejected", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
