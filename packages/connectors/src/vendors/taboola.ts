import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, eventMillis, failed, mockOrReal, numItems, orderId, succeeded } from "./shared.ts";

/**
 * Taboola (Realize) pixel + server-to-server conversions.
 * Verified 2026-09-03 against https://developers.taboola.com/pixel/docs/the-postback-url and
 * https://developers.taboola.com/pixel/docs/bulk-submit-s2s-conversions:
 * GET https://trc.taboola.com/actions-handler/log/3/s2s-action?click-id=&name=&revenue=&currency=&quantity=&orderid= (single) and
 * POST https://trc.taboola.com/{account-id}/log/3/bulk-s2s-action { actions: [{ "click-id", timestamp (ms), name, revenue, currency, quantity, orderid }] }
 * (≤1000 per request, no authentication, 204 = accepted for asynchronous processing). The click id is the `tblci` landing-page parameter
 * (≈120 chars, case-sensitive) and is mandatory: events without it cannot be attributed and are not sent.
 */
export const taboolaMeta: ConnectorMeta = {
  type: "taboola",
  displayName: "Taboola (Realize pixel + S2S)",
  apiVersion: API_VERSIONS.taboola.version,
  verifiedAt: API_VERSIONS.taboola.verifiedAt,
  sunsetWatch: API_VERSIONS.taboola.sunsetWatch,
  docsUrl: API_VERSIONS.taboola.docsUrl,
  requiredPublicIds: [{ key: "account_id", label: "Taboola account ID (numeric)", pattern: "^[0-9]{4,12}$", example: "1234567", help: "Realize → Tracking → Taboola Pixel (the numeric id in the pixel snippet). Public." }],
  requiredCredentials: [],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "orderid",
  transfer: DESTINATION_TRANSFER.taboola,
};

export class TaboolaConnector implements Connector {
  readonly meta = taboolaMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.account_id === "string" ? publicConfig.account_id : null;
    return id ? { template: "taboola_pixel", ids: { account_id: id }, consentPurpose: "marketing" } : null;
  }

  private bulkEndpoint(ctx: ConnectorContext): string {
    const account = String(ctx.publicConfig.account_id ?? "");
    return mockOrReal(ctx, `/taboola/${account}/log/3/bulk-s2s-action`, `https://trc.taboola.com/${account}/log/3/bulk-s2s-action`);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.account_id) return null;
    const clickId = input.clickIds.tblci ?? null;
    if (!clickId) return null; // postback networks attribute by click id only
    const name = mapping.vendorEvent || e.name;
    const c = e.commerce;
    const action = compact({
      "click-id": clickId,
      timestamp: eventMillis(e),
      name,
      revenue: c?.value ?? null,
      currency: c?.currency ?? null,
      quantity: numItems(e),
      orderid: orderId(e),
    });
    const body = { actions: [action] };
    return { vendorEventName: name, dedupKey: orderId(e) ?? input.dedupId, endpoint: this.bulkEndpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: body, eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const a = (payload.body as { actions: Array<Record<string, unknown>> }).actions[0]!;
    if (!a["click-id"]) errors.push("click-id (tblci) required");
    if (!a.name) errors.push("name (Realize event name) required");
    if (typeof a.timestamp !== "number") errors.push("timestamp (ms) required");
    if (a.currency && !/^[A-Z]{3}$/.test(String(a.currency))) errors.push("currency must be a 3-letter uppercase code");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 1000)) {
      const actions = group.map((p) => (p.body as { actions: unknown[] }).actions[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actions }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      for (const p of group) {
        if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 204, res.durationMs, null, "accepted for asynchronous processing (204)"));
        else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      }
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch(ctx, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, _body: unknown, error?: unknown): ErrorClass {
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    if (!/^[0-9]{4,12}$/.test(String(ctx.publicConfig.account_id ?? ""))) return { ok: false, status: "invalid", detail: "Account ID must be numeric", apiVersion: this.meta.apiVersion, checkedAt };
    // the S2S endpoints are unauthenticated; reachability of the bulk endpoint is the only server-side check available
    const res = await vendorRequest(ctx, { url: this.bulkEndpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actions: [] }) });
    if (res.status !== null && res.status < 500) return { ok: true, status: "valid", detail: "Taboola S2S endpoint reachable (no credentials required; attribution depends on the tblci click id and the Realize event name)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Endpoint unreachable (${res.status ?? res.error})`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
