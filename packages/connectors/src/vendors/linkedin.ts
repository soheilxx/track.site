import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { ageDays, compact, eventMillis, failed, missingCredential, mockOrReal, previewOf, succeeded } from "./shared.ts";

/**
 * LinkedIn Insight Tag + Conversions API.
 * Verified 2026-09-03 against https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api
 * POST https://api.linkedin.com/rest/conversionEvents with `LinkedIn-Version: {yyyymm}`, `X-Restli-Protocol-Version: 2.0.0`,
 * Bearer token (scopes rw_conversions, r_ads). Body: conversion urn:lla:llaPartnerConversion:{id}, conversionHappenedAt (ms, ≤90 days),
 * conversionValue{currencyCode, amount as string}, eventId (dedup), user.userIds[{idType SHA256_EMAIL | LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID}],
 * user.externalIds[]. 201 Created on success; 400/422 validation. Version 202508 sunset 2026-08-17 → pinned 202608.
 * Each canonical event maps to a conversion rule id (mapping.vendorEvent or settings.conversion_rules[event]).
 */
export const linkedinMeta: ConnectorMeta = {
  type: "linkedin",
  displayName: "LinkedIn Ads (Insight Tag + Conversions API)",
  apiVersion: API_VERSIONS.linkedin.version,
  verifiedAt: API_VERSIONS.linkedin.verifiedAt,
  sunsetWatch: API_VERSIONS.linkedin.sunsetWatch,
  docsUrl: API_VERSIONS.linkedin.docsUrl,
  requiredPublicIds: [
    { key: "partner_id", label: "Insight Tag partner ID", pattern: "^[0-9]{4,12}$", example: "1234567", help: "Campaign Manager → Analyze → Insight Tag → `_linkedin_partner_id`. Public." },
    { key: "ad_account_id", label: "Ad account ID", pattern: "^[0-9]{6,12}$", example: "512345678", help: "Campaign Manager account number. Used to list conversion rules." },
  ],
  requiredCredentials: [{ kind: "oauth_access_token", label: "LinkedIn OAuth (rw_conversions, r_ads)", help: "Connect via LinkedIn OAuth; tokens are refreshed automatically and stored encrypted.", secret: true, oauth: { provider: "linkedin", scopes: ["rw_conversions", "r_ads"] } }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "eventId",
  transfer: DESTINATION_TRANSFER.linkedin,
};

function conversionRuleId(e: DispatchEvent["event"], mapping: EventMapping, ctx: ConnectorContext): string | null {
  const fromMapping = mapping.vendorEvent?.trim();
  if (fromMapping && /^[0-9]+$/.test(fromMapping)) return fromMapping;
  const rules = ctx.settings.conversion_rules as Record<string, unknown> | undefined;
  const v = rules?.[e.name];
  return typeof v === "string" && /^[0-9]+$/.test(v) ? v : typeof v === "number" ? String(v) : null;
}

export class LinkedInConnector implements Connector {
  readonly meta = linkedinMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.partner_id === "string" ? publicConfig.partner_id : null;
    return id ? { template: "linkedin_insight", ids: { partner_id: id }, consentPurpose: "marketing" } : null;
  }

  private headers(token: string): Record<string, string> {
    return { "content-type": "application/json", authorization: `Bearer ${token}`, "linkedin-version": this.meta.apiVersion, "x-restli-protocol-version": "2.0.0" };
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const rule = conversionRuleId(e, mapping, ctx);
    if (!rule) return null;
    const userIds: Array<{ idType: string; idValue: string }> = [];
    if (e.user_data?.em) userIds.push({ idType: "SHA256_EMAIL", idValue: e.user_data.em });
    const fat = input.clickIds.li_fat_id ?? e.vendor_ids?.li_fat_id ?? null;
    if (fat) userIds.push({ idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", idValue: fat });
    const c = e.commerce;
    const body = compact({
      conversion: `urn:lla:llaPartnerConversion:${rule}`,
      conversionHappenedAt: eventMillis(e),
      conversionValue: c?.value != null && c.currency ? { currencyCode: c.currency, amount: String(c.value) } : null,
      eventId: input.dedupId,
      user: compact({ userIds, externalIds: e.user_data?.external_id ? [e.user_data.external_id] : null }),
    }) as Record<string, unknown>;
    if (!(body.user as { userIds?: unknown[] })?.userIds) (body.user as Record<string, unknown>) = { ...(body.user as Record<string, unknown>), userIds: [] };
    return {
      vendorEventName: `conversion:${rule}`,
      dedupKey: input.dedupId,
      endpoint: mockOrReal(ctx, "/linkedin/rest/conversionEvents", "https://api.linkedin.com/rest/conversionEvents"),
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      preview: previewOf(body, ["idValue"]),
      eventId: e.event_id,
    };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const b = payload.body as { conversion?: string; conversionHappenedAt?: number; user?: { userIds?: unknown[]; externalIds?: unknown[] } };
    if (!b.conversion?.startsWith("urn:lla:llaPartnerConversion:")) errors.push("conversion rule URN missing");
    if (!b.conversionHappenedAt || Date.now() - b.conversionHappenedAt > 90 * 86_400_000) errors.push("conversionHappenedAt must be within 90 days");
    if (!(b.user?.userIds?.length || b.user?.externalIds?.length)) errors.push("user needs SHA256_EMAIL, LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID or externalIds");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await ctx.getCredential("oauth_access_token");
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "oauth_access_token"));
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      const res = await vendorRequest(ctx, { url: p.endpoint, method: "POST", headers: this.headers(token), body: JSON.stringify(p.body) });
      const cls = this.classifyError(res.status, res.json, res.error);
      if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 201, res.durationMs, null, excerpt(res.text)));
      else {
        const json = res.json as { message?: string; code?: string; serviceErrorCode?: number } | null;
        results.push(failed(p.eventId, cls, json?.code ?? (json?.serviceErrorCode ? `li_${json.serviceErrorCode}` : `http_${res.status ?? res.error}`), json?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
      }
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch(ctx, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass {
    const code = (body as { code?: string; serviceErrorCode?: number } | null);
    if (httpStatus === 401 || code?.code === "EMPTY_ACCESS_TOKEN" || code?.serviceErrorCode === 65600 || code?.serviceErrorCode === 65601) return "credential_expired";
    if (httpStatus === 403) return "auth";
    if (httpStatus === 422) return "invalid_payload";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const token = await ctx.getCredential("oauth_access_token");
    const account = String(ctx.publicConfig.ad_account_id ?? "");
    if (!token) return { ok: false, status: "not_connected", detail: "LinkedIn not connected", apiVersion: this.meta.apiVersion, checkedAt };
    if (!/^[0-9]{6,12}$/.test(account)) return { ok: false, status: "invalid", detail: "Ad account ID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    const url = mockOrReal(ctx, "/linkedin/rest/conversions", "https://api.linkedin.com/rest/conversions") + `?q=account&account=${encodeURIComponent(`urn:li:sponsoredAccount:${account}`)}`;
    const res = await vendorRequest(ctx, { url, method: "GET", headers: this.headers(token) });
    if (res.status === 200) {
      const rules = ((res.json as { elements?: Array<{ id: number; name: string; conversionMethod: string; enabled: boolean }> } | null)?.elements ?? []).filter((r) => r.conversionMethod === "CONVERSIONS_API" && r.enabled);
      return { ok: true, status: "valid", detail: `${rules.length} active Conversions API rule(s): ${rules.map((r) => `${r.id} ${r.name}`).join(", ").slice(0, 300)}`, apiVersion: this.meta.apiVersion, checkedAt };
    }
    if (res.status === 401) return { ok: false, status: "expired", detail: "Access token expired or revoked; reconnect LinkedIn", apiVersion: this.meta.apiVersion, checkedAt };
    if (res.status === 403) return { ok: false, status: "invalid", detail: "User lacks ad account role (needs CAMPAIGN_MANAGER or higher) or scopes rw_conversions, r_ads", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}

export function staleForLinkedIn(input: DispatchEvent): boolean {
  return ageDays(input.event) > 90;
}
