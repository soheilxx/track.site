import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { compact, failed, mockOrReal, orderId, succeeded } from "./shared.ts";

/**
 * Outbrain pixel + server-to-server conversions.
 * Verified 2026-09-03 against https://www.outbrain.com/help/advertisers/server2server-integrations/:
 * GET https://tr.outbrain.com/unifiedPixel?ob_click_id=&name=&orderValue=&orderId=&currency=&timestamp= (no authentication; `ob_click_id`
 * is appended to landing pages, `name` is the case-sensitive event-based conversion name; timestamp formats MM/dd/yyyy HH:mm:ss or yyyy-MM-dd HH:mm:ss).
 * Events without an Outbrain click id cannot be attributed and are not sent.
 */
export const outbrainMeta: ConnectorMeta = {
  type: "outbrain",
  displayName: "Outbrain (pixel + S2S)",
  apiVersion: API_VERSIONS.outbrain.version,
  verifiedAt: API_VERSIONS.outbrain.verifiedAt,
  sunsetWatch: API_VERSIONS.outbrain.sunsetWatch,
  docsUrl: API_VERSIONS.outbrain.docsUrl,
  requiredPublicIds: [{ key: "marketer_id", label: "Outbrain marketer ID", pattern: "^[0-9a-f]{20,40}$", example: "00abcdef1234567890abcdef1234567890", help: "Amplify → Conversions → Outbrain Pixel (OB_ADV_ID). Public." }],
  requiredCredentials: [],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "orderId",
  transfer: DESTINATION_TRANSFER.outbrain,
};

function ts(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export class OutbrainConnector implements Connector {
  readonly meta = outbrainMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.marketer_id === "string" ? publicConfig.marketer_id : null;
    return id ? { template: "outbrain_pixel", ids: { marketer_id: id }, consentPurpose: "marketing" } : null;
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.marketer_id) return null;
    const clickId = input.clickIds.ob_click_id ?? input.clickIds.dicbo ?? null;
    if (!clickId) return null;
    const name = (mapping.vendorEvent || e.name).replace(/\s+/g, "_");
    const c = e.commerce;
    const query = compact({ ob_click_id: clickId, name, orderValue: c?.value != null ? String(c.value) : null, orderId: orderId(e), currency: c?.currency ?? null, timestamp: ts(e.client_ts ?? e.server_ts) }) as Record<string, string>;
    const endpoint = mockOrReal(ctx, "/outbrain/unifiedPixel", "https://tr.outbrain.com/unifiedPixel") + `?${new URLSearchParams(query).toString()}`;
    return { vendorEventName: name, dedupKey: orderId(e) ?? input.dedupId, endpoint, method: "POST", headers: {}, body: query, preview: query, eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const q = payload.body as Record<string, string>;
    if (!q.ob_click_id) errors.push("ob_click_id required");
    if (!q.name) errors.push("name (conversion name) required");
    if (q.currency && !/^[A-Z]{3}$/.test(q.currency)) errors.push("currency must be a 3-letter code");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      const res = await vendorRequest(ctx, { url: p.endpoint, method: "GET", headers: {} });
      const cls = this.classifyError(res.status, res.json, res.error);
      if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, "postback accepted"));
      else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
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
    if (!/^[0-9a-f]{20,40}$/.test(String(ctx.publicConfig.marketer_id ?? ""))) return { ok: false, status: "invalid", detail: "Marketer ID malformed (hex string from the pixel snippet)", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: mockOrReal(ctx, "/outbrain/unifiedPixel", "https://tr.outbrain.com/unifiedPixel") + "?ob_click_id=validation&name=tracksite_validation", method: "GET", headers: {} });
    if (res.status !== null && res.status < 500) return { ok: true, status: "valid", detail: "Outbrain postback endpoint reachable (no credentials; attribution depends on ob_click_id and the conversion name)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Endpoint unreachable (${res.status ?? res.error})`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
