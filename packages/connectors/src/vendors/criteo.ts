import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { compact, contents, failed, mockOrReal, orderId, previewOf, prop, succeeded } from "./shared.ts";

/**
 * Criteo OneTag (browser) + OneTag server-to-server events.
 * Verified 2026-09-03 against https://guides.criteotilt.com/onetag/s2s/:
 * POST https://widget.criteo.com/m/event?version=s2s_v0 (JSON; regional 307 redirects to widget.eu/us/as.criteo.com), body
 * { account, ip, user_agent, full_url, previous_url, site_type d|m|t, retailer_visitor_id, id { mapping_key + mapped_user_id (GUM id from the
 * crto_mapped_user_id cookie) | email { raw|md5|sha256 } | idfa | gaid }, alternate_ids[], events[{ event: viewHome|viewPage|login|viewList|viewItem|
 * addToCart|viewBasket|beginCheckout|addPaymentInfo|trackTransaction|viewSearch, item(s) {id, price, quantity}, currency, id (transaction), dd, timestamp }],
 * version: "s2s_v1.0.0" }. HTTP 200 always; inspect { errors[], warnings[] } (e.g. UserIdentifierMissing). Timestamps must be near real time (≤15 min).
 */
export const CRITEO_EVENT_NAMES: Record<string, string> = {
  page_view: "viewPage",
  view_item: "viewItem",
  view_content: "viewItem",
  view_item_list: "viewList",
  search: "viewList",
  add_to_cart: "addToCart",
  view_cart: "viewBasket",
  begin_checkout: "beginCheckout",
  add_payment_info: "addPaymentInfo",
  purchase: "trackTransaction",
  login: "login",
};

export const criteoMeta: ConnectorMeta = {
  type: "criteo",
  displayName: "Criteo (OneTag + server-side events)",
  apiVersion: API_VERSIONS.criteo.version,
  verifiedAt: API_VERSIONS.criteo.verifiedAt,
  sunsetWatch: API_VERSIONS.criteo.sunsetWatch,
  docsUrl: API_VERSIONS.criteo.docsUrl,
  requiredPublicIds: [{ key: "account_id", label: "Criteo account ID (partner ID)", pattern: "^[0-9]{3,10}$", example: "12345", help: "Management Center → OneTag → account id (`a=` in the loader URL). Public." }],
  requiredCredentials: [],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "id",
  transfer: DESTINATION_TRANSFER.criteo,
};

export class CriteoConnector implements Connector {
  readonly meta = criteoMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.account_id === "string" ? publicConfig.account_id : null;
    return id ? { template: "criteo_onetag", ids: { account_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    return mockOrReal(ctx, "/criteo/m/event", "https://widget.criteo.com/m/event") + "?version=s2s_v0";
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const account = String(ctx.publicConfig.account_id ?? "");
    if (!account) return null;
    const name = mapping.vendorEvent || CRITEO_EVENT_NAMES[e.name];
    if (!name) return null;
    const items = contents(e).map((i) => compact({ id: i.id, price: i.item_price, quantity: i.quantity }));
    const c = e.commerce;
    const gum = e.vendor_ids?.crto_mapped_user_id ?? null;
    const id = compact({
      mapping_key: gum ? account : null,
      mapped_user_id: gum,
      email: e.user_data?.em ? { sha256: e.user_data.em } : null,
    });
    const event = compact({
      event: name,
      timestamp: new Date(e.client_ts ?? e.server_ts).toISOString(),
      item: name === "viewItem" ? (items[0]?.id ?? null) : ["viewList", "addToCart", "viewBasket", "beginCheckout", "trackTransaction"].includes(name) ? (items.length ? (name === "viewList" ? items.map((i) => i.id) : items) : null) : null,
      id: name === "trackTransaction" ? orderId(e) : null,
      currency: ["addToCart", "viewBasket", "beginCheckout", "trackTransaction"].includes(name) ? (c?.currency ?? null) : null,
      keywords: name === "viewList" ? prop(e, "search_term") : null,
      dd: name === "trackTransaction" && e.name === "purchase" ? "true" : null,
    });
    const body = compact({
      account,
      ip: e.ip_truncated,
      full_url: e.url,
      previous_url: e.referrer,
      site_type: "d",
      retailer_visitor_id: e.anonymous_id,
      id,
      events: [event],
      version: "s2s_v1.0.0",
    }) as Record<string, unknown>;
    return { vendorEventName: name, dedupKey: name === "trackTransaction" ? (orderId(e) ?? input.dedupId) : input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["sha256", "mapped_user_id"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const b = payload.body as { account?: string; id?: Record<string, unknown>; events?: Array<Record<string, unknown>> };
    if (!b.account) errors.push("account required");
    const id = b.id ?? {};
    if (!((id.mapping_key && id.mapped_user_id) || id.email || id.idfa || id.gaid)) errors.push("one identifier required: mapped_user_id (GUM id from crto_mapped_user_id) or hashed email");
    const ev = b.events?.[0];
    if (!ev?.event) errors.push("event required");
    if (ev?.event === "trackTransaction" && (!ev.id || !ev.item)) errors.push("trackTransaction needs transaction id and items");
    if (["addToCart", "viewBasket", "beginCheckout", "viewItem", "viewList"].includes(String(ev?.event)) && !ev?.item) errors.push(`${ev?.event} needs item(s)`);
    if (ev?.timestamp && Date.now() - new Date(String(ev.timestamp)).getTime() > 15 * 60_000) errors.push("timestamp older than 15 minutes (Criteo requires near real-time events)");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      const res = await vendorRequest(ctx, { url: p.endpoint, method: "POST", headers: p.headers, body: JSON.stringify(p.body) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { errors?: string[]; warnings?: string[] } | null;
      if (cls !== "none") results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      else if (json?.errors?.length) results.push(failed(p.eventId, "invalid_payload", json.errors[0] ?? "error", json.errors.join("; "), res.status, res.durationMs));
      else results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, json?.warnings?.length ? `accepted with warnings: ${json.warnings.join("; ")}`.slice(0, 300) : excerpt(res.text)));
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
    if (!/^[0-9]{3,10}$/.test(String(ctx.publicConfig.account_id ?? ""))) return { ok: false, status: "invalid", detail: "Account ID must be numeric", apiVersion: this.meta.apiVersion, checkedAt };
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: ctx.publicConfig.account_id, id: { email: { sha256: "0000000000000000000000000000000000000000000000000000000000000000" } }, events: [{ event: "viewHome", timestamp: new Date().toISOString() }], version: "s2s_v1.0.0" }) });
    const json = res.json as { errors?: string[] } | null;
    if (res.status === 200 && !(json?.errors ?? []).some((x) => /account/i.test(x))) return { ok: true, status: "valid", detail: "Criteo S2S endpoint accepted the account (no credentials required; identity via GUM id or hashed email)", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: res.status === 200 ? "invalid" : "unknown", detail: json?.errors?.join("; ") ?? `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
