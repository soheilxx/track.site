import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { chunk, compact, eventMillis, failed, marketingGranted, missingCredential, mockOrReal, numItems, orderId, previewOf, succeeded } from "./shared.ts";

/**
 * Google Marketing Platform (Campaign Manager 360 / DV360 / SA360) via Floodlight.
 * Browser: Floodlight through the Google tag (gtag `DC-{configId}` with `send_to: DC-src/group/activity+standard`).
 * Server: Campaign Manager 360 API conversions.batchinsert — verified 2026-09-03 against
 * https://developers.google.com/doubleclick-advertisers/rest/v5/conversions/batchinsert:
 * POST https://dfareporting.googleapis.com/dfareporting/v5/userprofiles/{profileId}/conversions/batchinsert (scope ddmconversions),
 * body { conversions[{ kind, floodlightActivityId, floodlightConfigurationId, ordinal, timestampMicros, value, quantity, gclid|dclid|matchId|encryptedUserId|mobileDeviceId,
 * customVariables, adUserDataConsent, userIdentifiers[{hashedEmail|hashedPhoneNumber|addressInfo}] }], encryptionInfo? }.
 * Response { hasFailures, status[{ conversion, errors[{code, message, kind}] }] }. DV360 and SA360 consume the same Floodlight activities.
 */
export const gmpMeta: ConnectorMeta = {
  type: "gmp",
  displayName: "Google Marketing Platform (CM360 / DV360 / SA360 Floodlight)",
  apiVersion: API_VERSIONS.gmp.version,
  verifiedAt: API_VERSIONS.gmp.verifiedAt,
  sunsetWatch: API_VERSIONS.gmp.sunsetWatch,
  docsUrl: API_VERSIONS.gmp.docsUrl,
  requiredPublicIds: [
    { key: "floodlight_configuration_id", label: "Floodlight configuration ID (advertiser)", pattern: "^[0-9]{5,15}$", example: "1234567", help: "CM360 → Floodlight → Configuration (the `src=` value in Floodlight tags). Public." },
    { key: "profile_id", label: "CM360 user profile ID", pattern: "^[0-9]{5,15}$", example: "7654321", help: "CM360 → user profile of the API user (needed for conversion uploads)." },
  ],
  requiredCredentials: [{ kind: "oauth_refresh_token", label: "Google OAuth (ddmconversions scope)", help: "Connect a Google account with CM360 conversion-upload rights; refresh tokens stored encrypted.", secret: true, oauth: { provider: "google", scopes: ["https://www.googleapis.com/auth/ddmconversions"] } }],
  supportsBrowser: true,
  supportsServer: true,
  dedupField: "ordinal",
  transfer: DESTINATION_TRANSFER.gmp,
};

function activityId(e: DispatchEvent["event"], mapping: EventMapping, ctx: ConnectorContext): string | null {
  const m = mapping.vendorEvent?.trim();
  if (m && /^[0-9]+$/.test(m)) return m;
  const map = ctx.settings.floodlight_activities as Record<string, unknown> | undefined;
  const v = map?.[e.name];
  return typeof v === "string" && /^[0-9]+$/.test(v) ? v : typeof v === "number" ? String(v) : null;
}

export class GmpConnector implements Connector {
  readonly meta = gmpMeta;

  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null {
    const id = typeof publicConfig.floodlight_configuration_id === "string" ? publicConfig.floodlight_configuration_id : null;
    return id ? { template: "gmp_floodlight", ids: { floodlight_configuration_id: id }, consentPurpose: "marketing" } : null;
  }

  private endpoint(ctx: ConnectorContext): string {
    const profile = String(ctx.publicConfig.profile_id ?? "");
    return mockOrReal(ctx, `/cm360/dfareporting/${this.meta.apiVersion}/userprofiles/${profile}/conversions/batchinsert`, `https://dfareporting.googleapis.com/dfareporting/${this.meta.apiVersion}/userprofiles/${profile}/conversions/batchinsert`);
  }

  private async token(ctx: ConnectorContext): Promise<string | null> {
    return (await ctx.getCredential("oauth_access_token")) ?? (ctx.oauth ? await ctx.oauth.accessToken("google_cm360") : null);
  }

  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const e = input.event;
    const config = String(ctx.publicConfig.floodlight_configuration_id ?? "");
    const activity = activityId(e, mapping, ctx);
    if (!config || !activity || !ctx.publicConfig.profile_id) return null;
    const c = e.commerce;
    const identifiers: Array<Record<string, string>> = [];
    if (e.user_data?.em) identifiers.push({ hashedEmail: e.user_data.em });
    if (e.user_data?.ph) identifiers.push({ hashedPhoneNumber: e.user_data.ph });
    const conversion = compact({
      kind: "dfareporting#conversion",
      floodlightConfigurationId: config,
      floodlightActivityId: activity,
      ordinal: orderId(e) ?? input.dedupId,
      timestampMicros: String(eventMillis(e) * 1000),
      value: c?.value ?? null,
      quantity: numItems(e) ?? 1,
      gclid: input.clickIds.gclid ?? null,
      dclid: input.clickIds.dclid ?? null,
      matchId: !input.clickIds.gclid && !input.clickIds.dclid && e.user_id ? e.user_id : null,
      adUserDataConsent: marketingGranted(e) ? "GRANTED" : "DENIED",
      userIdentifiers: identifiers.length ? identifiers : null,
    });
    const body = { kind: "dfareporting#conversionsBatchInsertRequest", conversions: [conversion] };
    return { vendorEventName: `floodlight:${activity}`, dedupKey: String(conversion.ordinal), endpoint: this.endpoint(ctx), method: "POST", headers: { "content-type": "application/json" }, body, preview: previewOf(body, ["hashedEmail", "hashedPhoneNumber"]), eventId: e.event_id };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const conv = (payload.body as { conversions: Array<Record<string, unknown>> }).conversions[0]!;
    if (!conv.floodlightActivityId || !conv.floodlightConfigurationId) errors.push("floodlightActivityId and floodlightConfigurationId required");
    if (!conv.gclid && !conv.dclid && !conv.matchId && !conv.userIdentifiers && !conv.encryptedUserId && !conv.mobileDeviceId) errors.push("one of gclid, dclid, matchId, userIdentifiers, encryptedUserId or mobileDeviceId required");
    const micros = Number(conv.timestampMicros);
    if (!micros || Date.now() * 1000 - micros > 28 * 86_400_000 * 1000) errors.push("timestampMicros must be within 28 days");
    if (!conv.ordinal) errors.push("ordinal required for deduplication");
    return { ok: errors.length === 0, errors };
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const token = await this.token(ctx);
    if (!token) return payloads.map((p) => missingCredential(p.eventId, "oauth_access_token"));
    const results: DispatchResult[] = [];
    for (const group of chunk(payloads, 1000)) {
      const conversions = group.map((p) => (p.body as { conversions: unknown[] }).conversions[0]);
      const res = await vendorRequest(ctx, { url: group[0]!.endpoint, method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ kind: "dfareporting#conversionsBatchInsertRequest", conversions }) });
      const cls = this.classifyError(res.status, res.json, res.error);
      const json = res.json as { hasFailures?: boolean; status?: Array<{ errors?: Array<{ code?: string; message?: string }> }>; error?: { code?: number; message?: string; status?: string } } | null;
      group.forEach((p, i) => {
        const errs = json?.status?.[i]?.errors ?? [];
        if (cls !== "none") results.push(failed(p.eventId, cls, json?.error?.status ?? `http_${res.status ?? res.error}`, json?.error?.message ?? excerpt(res.text, 200) ?? String(res.error), res.status, res.durationMs));
        else if (errs.length) results.push(failed(p.eventId, /NOT_FOUND|INVALID_ARGUMENT|PERMISSION_DENIED/.test(errs[0]?.code ?? "") ? "invalid_payload" : "permanent", errs[0]?.code ?? "conversion_error", errs.map((x) => x.message).join("; "), res.status, res.durationMs));
        else results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, ctx.testMode ? "accepted (CM360 has no validate-only mode; test uploads use a dedicated test activity)" : excerpt(res.text)));
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
    const token = await this.token(ctx);
    if (!token) return { ok: false, status: "not_connected", detail: "Google account not connected", apiVersion: this.meta.apiVersion, checkedAt };
    const profile = String(ctx.publicConfig.profile_id ?? "");
    if (!/^[0-9]{5,15}$/.test(profile)) return { ok: false, status: "invalid", detail: "Profile ID malformed", apiVersion: this.meta.apiVersion, checkedAt };
    const url = mockOrReal(ctx, `/cm360/dfareporting/${this.meta.apiVersion}/userprofiles/${profile}/floodlightConfigurations/${ctx.publicConfig.floodlight_configuration_id}`, `https://dfareporting.googleapis.com/dfareporting/${this.meta.apiVersion}/userprofiles/${profile}/floodlightConfigurations/${ctx.publicConfig.floodlight_configuration_id}`);
    const res = await vendorRequest(ctx, { url, method: "GET", headers: { authorization: `Bearer ${token}` } });
    if (res.status === 200) return { ok: true, status: "valid", detail: "Floodlight configuration readable with the connected account", apiVersion: this.meta.apiVersion, checkedAt };
    const cls = this.classifyError(res.status, res.json, res.error);
    if (cls === "credential_expired") return { ok: false, status: "expired", detail: "OAuth token rejected; reconnect Google", apiVersion: this.meta.apiVersion, checkedAt };
    if (cls === "auth" || res.status === 404) return { ok: false, status: "invalid", detail: "Profile has no access to this Floodlight configuration", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: false, status: "unknown", detail: `Unexpected response ${res.status ?? res.error}`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? "healthy" : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: this.meta.sunsetWatch };
  }
}
