import { createHash } from "node:crypto";
import { DESTINATION_TRANSFER } from "@track-site/policy";
import type { BrowserTagConfig, Connector, ConnectorContext, ConnectorMeta, CredentialValidation, DispatchEvent, DispatchResult, EventMapping, ErrorClass, HealthResult, ValidationResult, VendorPayload } from "../connector.ts";
import { classifyHttpStatus, excerpt, vendorRequest } from "../http.ts";
import { API_VERSIONS } from "../versions.ts";
import { AFFILIATE_PRESETS, type AffiliatePreset } from "./affiliate-presets.ts";
import { contents, failed, missingCredential, mockOrReal, numItems, orderId, prop, succeeded } from "./shared.ts";

/**
 * Universal affiliate server-to-server postback connector. A destination selects a network preset (or the custom
 * template), stores the network-specific ids in publicConfig and secrets (tokens, checksum secrets) in credentials.
 * Postbacks are rendered from the preset template, signed where the network requires it and delivered once per event;
 * the order id is the vendor-side deduplication key. Networks without a click id in the session are skipped.
 */
export const affiliateMeta: ConnectorMeta = {
  type: "affiliate",
  displayName: "Affiliate networks (server-to-server postbacks)",
  apiVersion: API_VERSIONS.affiliate.version,
  verifiedAt: API_VERSIONS.affiliate.verifiedAt,
  sunsetWatch: null,
  docsUrl: API_VERSIONS.affiliate.docsUrl,
  requiredPublicIds: [{ key: "preset", label: "Network", pattern: `^(${Object.keys(AFFILIATE_PRESETS).join("|")})$`, example: "awin", help: "Awin, CJ, impact.com, TradeTracker, Tradedoubler, Partnerize, Rakuten, Webgains, Digistore24, ADCELL, belboon, TUNE, Everflow or a custom postback URL." }],
  requiredCredentials: [],
  supportsBrowser: false,
  supportsServer: true,
  dedupField: "order_id",
  transfer: DESTINATION_TRANSFER.affiliate,
};

type Values = Record<string, string>;

function enc(v: string): string {
  return encodeURIComponent(v);
}

function render(template: string, values: Values, encode: (v: string) => string): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (_m, key: string) => encode(values[key] ?? ""));
}

function renderJson(node: unknown, values: Values): unknown {
  if (typeof node === "string") {
    const m = /^\{([a-z0-9_]+)\}$/i.exec(node);
    if (m) {
      const v = values[m[1]!];
      if (v === undefined || v === "") return undefined;
      if (v.startsWith("__json__:")) return JSON.parse(v.slice(9));
      return v;
    }
    return render(node, values, (v) => v);
  }
  if (Array.isArray(node)) return node.map((n) => renderJson(n, values)).filter((n) => n !== undefined);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const r = renderJson(v, values);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return node;
}

function sqlTs(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function presetFor(ctx: ConnectorContext): AffiliatePreset | null {
  const id = String(ctx.publicConfig.preset ?? "");
  return AFFILIATE_PRESETS[id] ?? null;
}

export class AffiliateConnector implements Connector {
  readonly meta = affiliateMeta;

  getBrowserConfig(): BrowserTagConfig | null {
    return null;
  }

  private values(input: DispatchEvent, mapping: EventMapping, preset: AffiliatePreset, ctx: ConnectorContext, secrets: Record<string, string>): Values | null {
    const e = input.event;
    const clickId = preset.clickIdParams.map((k) => input.clickIds[k] ?? input.clickIds[k.toLowerCase()]).find(Boolean) ?? input.clickIds.aff_click_id ?? null;
    if (preset.requiresClickId && !clickId) return null;
    const c = e.commerce;
    const items = contents(e);
    const when = new Date(e.client_ts ?? e.server_ts);
    const value = c?.value != null ? String(c.value) : "";
    const oid = orderId(e) ?? input.dedupId;
    const v: Values = {
      click_id: clickId ?? "",
      order_id: oid,
      value,
      currency: c?.currency ?? "",
      event_name: mapping.vendorEvent || e.name,
      quantity: numItems(e) != null ? String(numItems(e)) : "",
      voucher: c?.coupon ?? "",
      discount: c?.discount != null ? String(c.discount) : "",
      email_sha256: e.user_data?.em ?? "",
      customer_status: prop(e, "customer_status") ?? (prop(e, "new_customer") === "true" ? "new" : ""),
      country: /^[A-Z]{2}$/.test(e.consent.region ?? "") ? String(e.consent.region) : "",
      url: e.url ?? "",
      timestamp_iso: when.toISOString(),
      timestamp_ms: String(when.getTime()),
      timestamp_s: String(Math.floor(when.getTime() / 1000)),
      timestamp_sql: sqlTs(when),
      timestamp_compact: when.toISOString().replace(/[-:T]/g, "").slice(0, 14),
      timestamp_pz: sqlTs(when),
      landing_date: "",
      test_mode: ctx.testMode ? "1" : "0",
      items_skulist: items.map((i) => i.id).join("|"),
      items_qlist: items.map((i) => String(i.quantity)).join("|"),
      items_amtlist: items.map((i) => String(Math.round((i.item_price ?? 0) * 100 * i.quantity))).join("|"),
      items_namelist: items.map((i) => i.name ?? "").join("|"),
      items_pz: items.map((i) => `[category:${enc(i.category ?? "default")}/sku:${enc(i.id)}/value:${i.item_price ?? 0}/quantity:${i.quantity}]`).join(""),
      items_webgains: items.length ? `__json__:${JSON.stringify(items.map((i) => ({ price: String(i.item_price ?? 0), name: i.name ?? i.id, code: i.id })))}` : "",
      basket_f: items.map((i) => `f1=${enc(i.id)}&f2=${enc(i.name ?? "")}&f3=${i.item_price ?? 0}&f4=${i.quantity}`).join("|"),
      signature: "",
    };
    for (const cfg of preset.config) v[cfg.key] = cfg.secret ? (secrets[cfg.key] ?? "") : String(ctx.publicConfig[cfg.key] ?? "");
    if (preset.signature === "tradedoubler" && secrets.checksum_secret) v.signature = `v04${createHash("md5").update(`${secrets.checksum_secret}${oid}${value}`).digest("hex")}`;
    if (preset.id === "cj") v.signature = secrets.signature ?? "";
    if (preset.id === "tune" || preset.id === "everflow") v.security_token = secrets.security_token ?? "";
    return v;
  }

  /** secrets are resolved lazily at dispatch; mapEvent renders with placeholders for secret fields */
  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null {
    if (!mapping.enabled) return null;
    const preset = presetFor(ctx);
    if (!preset) return null;
    if (!mapping.vendorEvent && !preset.events.includes(input.event.name)) return null;
    const values = this.values(input, mapping, preset, ctx, {});
    if (!values) return null;
    const secretKeys = preset.config.filter((c) => c.secret).map((c) => c.key);
    for (const k of secretKeys) values[k] = `{${k}}`;
    if (preset.signature || preset.id === "cj") values.signature = "{signature}";
    if (preset.id === "tune" || preset.id === "everflow") values.security_token = "{security_token}";
    const built = this.build(preset, values, ctx);
    const preview = { ...built, headers: undefined };
    return { vendorEventName: values.event_name!, dedupKey: values.order_id!, endpoint: built.url, method: preset.method === "GET" ? "POST" : "POST", headers: built.headers, body: { preset: preset.id, values }, preview, eventId: input.event.event_id };
  }

  private build(preset: AffiliatePreset, values: Values, ctx: ConnectorContext): { url: string; headers: Record<string, string>; body: string | null; method: "GET" | "POST" } {
    const base = ctx.baseUrlOverride ? mockOrReal(ctx, `/affiliate/${preset.id}`, "") : render(preset.url, values, enc);
    const params = Object.entries(preset.params)
      .map(([k, t]) => [k, render(t, values, (v) => v)] as const)
      .filter(([, v]) => v !== "" && !/^\{[a-z0-9_]+\}$/i.test(v) && !/:\s*$/.test(v));
    const headers: Record<string, string> = {};
    if (preset.method === "GET") {
      const qs = new URLSearchParams(params.map(([k, v]) => [k, v])).toString();
      return { url: qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base, headers, body: null, method: "GET" };
    }
    if (preset.method === "POST_FORM") {
      headers["content-type"] = "application/x-www-form-urlencoded";
      return { url: base, headers, body: new URLSearchParams(params.map(([k, v]) => [k, v])).toString(), method: "POST" };
    }
    headers["content-type"] = "application/json";
    return { url: base, headers, body: JSON.stringify(renderJson(preset.json ?? {}, values)), method: "POST" };
  }

  validatePayload(payload: VendorPayload): ValidationResult {
    const errors: string[] = [];
    const b = payload.body as { preset: string; values: Values };
    const preset = AFFILIATE_PRESETS[b.preset];
    if (!preset) return { ok: false, errors: ["unknown preset"] };
    if (preset.requiresClickId && !b.values.click_id) errors.push("click id required for this network");
    for (const cfg of preset.config) if (!cfg.secret && !b.values[cfg.key] && !/\?$/.test(cfg.pattern) && !cfg.pattern.includes("?$")) errors.push(`${cfg.label} missing`);
    if (b.values.currency && !/^[A-Z]{3}$/.test(b.values.currency)) errors.push("currency must be ISO 4217");
    return { ok: errors.length === 0, errors };
  }

  private async secrets(ctx: ConnectorContext, preset: AffiliatePreset): Promise<Record<string, string> | null> {
    const out: Record<string, string> = {};
    for (const cfg of preset.config.filter((c) => c.secret)) {
      const v = await ctx.getCredential(cfg.key === "checksum_secret" ? "signing_secret" : cfg.key === "signature" ? "access_token" : "api_secret");
      if (v) out[cfg.key] = v;
      else if (!cfg.pattern.includes("{0,")) return null;
    }
    if (preset.auth.type === "basic") {
      const pw = await ctx.getCredential(preset.auth.passwordCredential);
      if (!pw) return null;
      out.__basic_password = pw;
    }
    if (preset.auth.type === "bearer" || preset.auth.type === "query") {
      const t = await ctx.getCredential(preset.auth.credential);
      if (!t) return null;
      out.__token = t;
    }
    return out;
  }

  async dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const p of payloads) {
      const b = p.body as { preset: string; values: Values };
      const preset = AFFILIATE_PRESETS[b.preset];
      if (!preset) {
        results.push(failed(p.eventId, "permanent", "unknown_preset", `unknown affiliate preset ${b.preset}`));
        continue;
      }
      const secrets = await this.secrets(ctx, preset);
      if (!secrets) {
        results.push(missingCredential(p.eventId, "affiliate_secret"));
        continue;
      }
      const values: Values = { ...b.values };
      for (const cfg of preset.config.filter((c) => c.secret)) values[cfg.key] = secrets[cfg.key] ?? "";
      if (preset.signature === "tradedoubler") values.signature = secrets.checksum_secret ? `v04${createHash("md5").update(`${secrets.checksum_secret}${values.order_id}${values.value}`).digest("hex")}` : "";
      if (preset.id === "cj") values.signature = secrets.signature ?? "";
      if (preset.id === "tune" || preset.id === "everflow") values.security_token = secrets.security_token ?? "";
      const built = this.build(preset, values, ctx);
      const headers = { ...built.headers };
      if (preset.auth.type === "basic") headers.authorization = `Basic ${Buffer.from(`${values[preset.auth.userField] ?? ""}:${secrets.__basic_password}`).toString("base64")}`;
      if (preset.auth.type === "bearer") headers.authorization = `Bearer ${secrets.__token}`;
      const url = preset.auth.type === "query" ? `${built.url}${built.url.includes("?") ? "&" : "?"}${preset.auth.param}=${enc(secrets.__token!)}` : built.url;
      const res = await vendorRequest(ctx, { url, method: built.method, headers, body: built.body ?? undefined });
      const cls = this.classifyError(res.status, res.json, res.error);
      const secretValues = Object.values(secrets);
      const scrub = (s: string | null) => (s ? secretValues.reduce((acc, sv) => (sv ? acc.split(sv).join("[secret]") : acc), s) : s);
      if (cls === "none") results.push(succeeded(p.eventId, res.status ?? 200, res.durationMs, null, scrub(excerpt(res.text)) ?? "postback accepted"));
      else results.push(failed(p.eventId, cls, `http_${res.status ?? res.error}`, scrub(excerpt(res.text, 200)) ?? String(res.error), res.status, res.durationMs));
    }
    return results;
  }

  async sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult> {
    const [r] = await this.dispatchBatch({ ...ctx, testMode: true }, [payload]);
    return r!;
  }

  classifyError(httpStatus: number | null, _body: unknown, error?: unknown): ErrorClass {
    if (httpStatus === 401 || httpStatus === 403) return "auth";
    return classifyHttpStatus(httpStatus, error === "timeout" ? "timeout" : error === "network" ? "network" : null);
  }

  async validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation> {
    const checkedAt = ctx.now().toISOString();
    const preset = presetFor(ctx);
    if (!preset) return { ok: false, status: "invalid", detail: "Select an affiliate network preset", apiVersion: this.meta.apiVersion, checkedAt };
    const missing = preset.config.filter((c) => !c.secret && !c.pattern.includes("?$") && !ctx.publicConfig[c.key]).map((c) => c.label);
    if (missing.length) return { ok: false, status: "invalid", detail: `Missing: ${missing.join(", ")}`, apiVersion: this.meta.apiVersion, checkedAt };
    const secrets = await this.secrets(ctx, preset);
    if (!secrets) return { ok: false, status: "not_connected", detail: "Network secret (token / checksum) missing", apiVersion: this.meta.apiVersion, checkedAt };
    return { ok: true, status: preset.verified === "network" ? "unknown" : "valid", detail: preset.verified === "network" ? `${preset.name}: template follows the network's advertiser documentation (confirm parameters with your network contact); postbacks are attributable only with the ${preset.clickIdParams[0]} click id` : `${preset.name}: template verified ${preset.verified}; attribution requires the ${preset.clickIdParams[0]} click id`, apiVersion: this.meta.apiVersion, checkedAt };
  }

  async getHealth(ctx: ConnectorContext): Promise<HealthResult> {
    const v = await this.validateCredentials(ctx);
    return { status: v.ok ? (v.status === "unknown" ? "degraded" : "healthy") : v.status === "not_connected" ? "not_connected" : "unhealthy", detail: v.detail, checkedAt: v.checkedAt, apiVersion: this.meta.apiVersion, sunsetWatch: null };
  }
}
