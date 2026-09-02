import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { ageDays, chunk, compact, contents, eventSeconds, failed, marketingGranted, missingCredential, mockOrReal, orderId, previewOf, prop, succeeded } from "./shared.ts";

/**
 * Microsoft Advertising: UET tag in the browser + Conversions API (CAPI) server-side.
 * Verified 2026-09-03 against https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration?view=bingads-13
 * POST https://capi.uet.microsoft.com/v1/{tagId}/events, `Authorization: Bearer <token>`, body { data: [...], continueOnValidationError, dataProvider }.
 * eventType pageLoad|custom, eventTime seconds (≤7 days), userData needs ≥1 identifier, em/ph SHA-256, msclkid UUID,
 * adStorageConsent G|D, max 1000 events per batch. Dedup with UET via identical eventId + eventName.
 * Access: CAPI is provisioned per account by Microsoft (pilot) — surfaced as a prerequisite in the wizard.
 */
const PAGE_TYPES: Record<string, string> = { page_view: "other", view_item: "product", view_content: "product", view_item_list: "category", add_to_cart: "cart", view_cart: "cart", begin_checkout: "cart", purchase: "purchase", search: "searchresults" };

export const microsoftMeta: ConnectorMeta = {
  type: "microsoft",
  displayName: "Microsoft Advertising (UET + Conversions API)",
  apiVersion: API_VERSIONS.microsoft.version,
  verifiedAt: API_VERSIONS.microsoft.verifiedAt,
  sunsetWatch: API_VERSIONS.microsoft.sunsetWatch,
  docsUrl: API_VERSIONS.microsoft.docsUrl,
  requiredPublicIds: [{ key: "uet_tag_id", label: "UET tag ID", pattern: "^[0-9]{6,12}$", example: "187012345", help: "Microsoft Advertising → Conversion tracking → UET tags. Public." }],
  requiredCredentials: [{ kind: "access_token", label: "Conversions API token", help: "UET tag → Set up tagging → Use Conversions API → Copy token (account must be provisioned for CAPI by Microsoft). Stored encrypted.", secret: true, oauth: null }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "eventId",
  transfer: DESTINATION_TRANSFER.microsoft,
};

export class MicrosoftConnector implements Connector {
  readonly meta = microsoftMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.uet_tag_id === "string" ? publicConfig.uet_tag_id : null;
    return id ? { template: "microsoft_uet", ids: { uet_tag_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const tag = String(ctx.publicConfig.uet_tag_id ?? "");
    return mockOrReal(ctx, `/microsoft/v1/${tag}/events`, `https://capi.uet.microsoft.com/v1/${tag}/events`);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    if (!ctx.publicConfig.uet_tag_id) return null;
    const isPage = e.name === "page_view";
    const eventName = mapping.vendorEvent || e.name;
    const msclkid = input.clickIds.msclkid && /^[0-9a-f-]{32,36}$/i.test(input.clickIds.msclkid) ? input.clickIds.msclkid : null;
    const items = contents(e).map((i) => compact({ id: i.id, quantity: i.quantity, price: i.item_price, name: i.name }));
    const c = e.commerce;
    const event = compact({
      eventType: isPage ? "pageLoad" : "custom",
      eventId: input.dedupId,
      eventName: isPage ? null : eventName,
      eventTime: eventSeconds(e),
      eventSourceUrl: e.url,
      referrerUrl: e.referrer,
      pageTitle: e.title,
      adStorageConsent: marketingGranted(e) ? "G" : "D",
      userData: compact({
        anonymousId: e.anonymous_id,
        externalId: e.user_data?.external_id ?? null,
        em: e.user_data?.em ?? null,
        ph: e.user_data?.ph ?? null,
        msclkid,
      }),
      customData: isPage ? null : compact({
        value: c?.value ?? null,
        currency: c?.currency ?? null,
        transactionId: orderId(e),
        items: items.length ? items : null,
        itemIds: items.length ? items.map((i) => i.id) : null,
        pageType: PAGE_TYPES[e.name] ?? null,
        ecommTotalValue: e.name === "purchase" || e.name === "add_to_cart" || e.name === "view_cart" ? (c?.value ?? null) : null,
        searchTerm: prop(e, "search_term"),
        eventCategory: e.category,
      }),
    });
    const body = { data: [event], continueOnValidationError: true, dataProvider: "track.site" };
    return { vendorEventName: isPage ? "pageLoad" : eventName, dedupKey: input.dedupId, endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["em", "ph"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const ev = (payload.body as { data: Array<Record<string, unknown>> }).data[0]!;
    const ud = (ev.userData ?? {}) as Record<string, unknown>;
    if (!["pageLoad", "custom"].includes(String(ev.eventType))) errors.push("eventType must be pageLoad or custom");
    if (typeof ev.eventTime !== "number" || Date.now() / 1000 - ev.eventTime > 7 * 86_400) errors.push("eventTime must be within the last 7 days");
    if (ev.eventType === "pageLoad" && !ev.eventSourceUrl) errors.push("eventSourceUrl required for pageLoad");
    if (!Object.keys(ud).length) errors.push("userData needs at least one identifier (anonymousId, externalId, em, ph, msclkid)");
    if (ev.eventType === "custom" && !ev.eventName) errors.push("eventName required for custom events");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 1000)) {
      const data = group.map((p) => (p.body as { data: unknown[] }).data[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data, continueOnValidationError: true, dataProvider: "track.site" }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { eventsReceived?: number; error?: { code?: string; message?: string; details?: Array<{ index?: number; propertyName?: string; errorMessage?: string; errorCode?: string; isWarning?: boolean }> } } | null;
      const details = json?.error?.details ?? [];
      group.forEach((p, i) => {
        const own = details.filter((d) => d.index === i);
        const errs = own.filter((d) => !d.isWarning);
        if (cls === "none" && errs.length === 0) {
          const warn = own.map((d) => `${d.propertyName}: ${d.errorMessage}`).join("; ");
          results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, warn ? `accepted with warnings: ${warn}`.slice(0, 300) : excerpt(res.text)));
        } else if (errs.length || (cls === "invalid_payload" && details.length === 0)) {
          results.push(failed(p.eventId, "invalid_payload", errs[0]?.errorCode ?? json?.error?.code ?? "ValidationError", errs.map((d) => `${d.propertyName}: ${d.errorMessage}`).join("; ") || (json?.error?.message ?? "validation failed"), res.status, res.durationMs));
        } else {
          results.push(failed(p.eventId, cls, json?.error?.code ?? `http_${res.status ?? res.error}`, json?.error?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        }
      });
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch(ctx, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass {
    const code = (body as { error?: { code?: string } } | null)?.error?.code;
    if (httpStatus === 401 || code === "Unauthorized") return "auth";
    if (httpStatus === 400) return "invalid_payload";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const token = await ctx.getCredential("access_token");
    if (!token) return { ok: false, status: "not_connected", detail: "No Conversions API token stored", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[0-9]{6,12}$/.test(String(ctx.publicConfig.uet_tag_id ?? ""))) return { ok: false, status: "invalid", detail: "UET tag ID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    // CAPI has no read endpoint; an intentionally invalid empty batch distinguishes 401 (bad token) from 400 (token accepted, payload rejected)
    const res = await vendorRequest(ctx, { url: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data: [], dataProvider: "track.site" }) });
    if (res.status === 401 || res.status === 403) return { ok: false, status: "expired", detail: "Token rejected by Microsoft (401). Copy a fresh token from the UET tag settings.", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 400 || res.status === 200) return { ok: true, status: "valid", detail: "Token accepted for this UET tag", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}

export function staleForMicrosoft(input: DispatchEvent): boolean {
  return ageDays(input.event) > 7;
}
