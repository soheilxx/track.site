import { sha256Hex } from "@track-site/core";
import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { compact, failed, mockOrReal, orderId, prop, succeeded } from "./shared.ts";

/**
 * Spotify Ad Analytics pixel + server-side pixel endpoint.
 * Verified 2026-09-03 against https://help.adanalytics.spotify.com/technical-pixel-docs (browser: https://pixel.byspotify.com/ping.min.js,
 * `spdt('conf', {key})`, events view/lead/product/addtocart/checkout/purchase) and
 * https://help.adanalytics.spotify.com/server-side-gtm-ssgtm-integration-1 (server: GET https://img.byspotify.com?key=&a=init|lead|purchase&uid=&alias=&value=&currency=&order_id=&type=
 * with X-Forwarded-For and User-Agent headers). Server-side supports init, lead and purchase only; other events stay browser-side.
 * Spotify warns that pixel + server events for the same action are counted twice, so server delivery is intended for browser-less flows
 * (server-only mode) or for events the pixel does not send.
 */
const SERVER_ACTIONS: Record<string, { a: "init" | "lead" | "purchase"; type?: string }> = {
  page_view: { a: "init" },
  purchase: { a: "purchase" },
  generate_lead: { a: "lead", type: "lead" },
  sign_up: { a: "lead", type: "signup" },
  subscribe: { a: "lead", type: "subscribe" },
  start_trial: { a: "lead", type: "trial" },
  contact: { a: "lead", type: "contact" },
  book_appointment: { a: "lead", type: "appointment" },
  download: { a: "lead", type: "download" },
};

export const spotifyMeta: ConnectorMeta = {
  type: "spotify",
  displayName: "Spotify Ad Analytics (pixel + server-side)",
  apiVersion: API_VERSIONS.spotify.version,
  verifiedAt: API_VERSIONS.spotify.verifiedAt,
  sunsetWatch: API_VERSIONS.spotify.sunsetWatch,
  docsUrl: API_VERSIONS.spotify.docsUrl,
  requiredPublicIds: [{ key: "pixel_id", label: "Spotify pixel key", pattern: "^[0-9a-z-]{1,64}$", example: "123", help: "Ad Analytics → Manage → Your Pixels → key. Public." }],
  requiredCredentials: [],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: null,
  transfer: DESTINATION_TRANSFER.spotify,
};

export class SpotifyConnector implements Connector {
  readonly meta = spotifyMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.pixel_id === "string" ? publicConfig.pixel_id : null;
    return id ? { template: "spotify_pixel", ids: { pixel_id: id }, consentPurpose: "marketing" } : null;
  }

  private base(ctx: ConnectorContext): string {
    return mockOrReal(ctx, "/spotify/img", "https://img.byspotify.com");
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const key = String(ctx.publicConfig.pixel_id ?? "");
    if (!key) return null;
    const action = SERVER_ACTIONS[mapping.vendorEvent || e.name] ?? SERVER_ACTIONS[e.name];
    if (!action) return null;
    const uidSource = e.session_id ?? e.anonymous_id ?? input.dedupId;
    const c = e.commerce;
    const query = compact({
      key,
      a: action.a,
      uid: sha256Hex(uidSource).slice(0, 40),
      alias: e.user_data?.external_id ?? null,
      type: action.a === "lead" ? (prop(e, "lead_type") ?? action.type ?? null) : null,
      value: action.a === "purchase" ? (c?.value != null ? String(c.value) : null) : action.a === "lead" ? (mapping.vendorEvent || e.name) : null,
      currency: action.a === "purchase" ? (c?.currency ?? null) : null,
      order_id: action.a === "purchase" ? orderId(e) : null,
    }) as Record<string, string>;
    const endpoint = `${this.base(ctx)}?${new URLSearchParams(query).toString()}`;
    return { vendorEventName: action.a, dedupKey: action.a === "purchase" ? (orderId(e) ?? input.dedupId) : input.dedupId, endpoint, method: "POST", headers: compact({ "x-forwarded-for": e.ip_truncated, referer: e.url }) as Record<string, string>, body: query, preview: query, eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const q = payload.body as Record<string, string>;
    if (!q.key) errors.push("key (pixel) required");
    if (!["init", "lead", "purchase"].includes(q.a ?? "")) errors.push("a must be init, lead or purchase");
    if (!q.uid) errors.push("uid (hashed session id) required");
    if (q.a === "purchase" && !q.order_id) errors.push("order_id recommended for purchase");
    return { ok: errors.filter((m) => !m.includes("recommended")).length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      const res = await vendorRequest(ctx, { url: p.endpoint, method: "GET", headers: { ...p.headers, "user-agent": `track.site/1.0 (${(p.body as Record<string, string>).a}; server-side)` } });
      const cls = this.classifyError(res.status, res.json, res.error);
      if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, "pixel request accepted"));
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
    const key = String(ctx.publicConfig.pixel_id ?? "");
    if (!/^[0-9a-z-]{1,64}$/.test(key)) return { ok: false, status: "invalid", detail: "Pixel key malformed", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: `${this.base(ctx)}?key=${encodeURIComponent(key)}&a=init&uid=validation`, method: "GET", headers: { "user-agent": "track.site/1.0 (validation)" } });
    if (res.status !== null && res.status < 500) return { ok: true, status: "valid", detail: "Spotify pixel endpoint reachable (no credentials; attribution uses the pixel key and hashed session id)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Endpoint unreachable (${res.status ?? res.error})`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
