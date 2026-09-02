import { hostMatches } from "@track-site/core";
import { getStandardEvent } from "@track-site/events";
import { DESTINATION_PURPOSE, type ConnectorType } from "@track-site/policy";
import { configBundleSchema, type ConfigBundle } from "./bundle.ts";
import { validateLogic } from "./jsonlogic.ts";

export interface LintIssue {
  code: string;
  path: string;
  message: string;
  /** which agent tool can fix it */
  fixTool?: string;
}

export interface LintResult {
  ok: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
}

const PURPOSE_RANK = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 } as const;

/** Public identifiers a browser/hybrid destination needs before it can be published. */
export const REQUIRED_BROWSER_IDS: Record<ConnectorType, string[]> = {
  webhook: [],
  meta: ["pixel_id"],
  google_ads: ["conversion_id"],
  ga4: ["measurement_id"],
  tiktok: ["pixel_id"],
  microsoft: ["uet_tag_id"],
  linkedin: ["partner_id"],
  reddit: ["pixel_id"],
  pinterest: ["tag_id"],
  snapchat: ["pixel_id"],
  x: ["pixel_id"],
  taboola: ["account_id"],
  outbrain: ["marketer_id"],
  amazon: ["tag_id"],
  spotify: ["pixel_id"],
  quora: ["pixel_id"],
  yahoo: ["pixel_id"],
  tradedesk: ["advertiser_id", "pixel_id"],
  gmp: ["floodlight_configuration_id"],
  adroll: ["advertiser_id", "pixel_id"],
  criteo: ["account_id"],
  affiliate: [],
};

/** Destination types that have no browser tag at all (server-side only). */
export const SERVER_ONLY_TYPES: ConnectorType[] = ["webhook", "affiliate"];

const FORBIDDEN_KEYS = ["html", "script", "javascript", "code", "eval", "function"];

/** Blocking policy/PII lint. Errors prevent publishing; warnings are shown in the diff. */
export function lintBundle(input: unknown): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const parsed = configBundleSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ code: "schema", path: issue.path.join("."), message: issue.message });
    }
    return { ok: false, errors, warnings };
  }
  const bundle = parsed.data;
  const raw = JSON.stringify(input).toLowerCase();
  for (const key of FORBIDDEN_KEYS) {
    if (raw.includes(`"${key}":`)) errors.push({ code: "forbidden_key", path: "$", message: `"${key}" is not allowed in a bundle (no custom HTML/JS)` });
  }

  if (bundle.settings.allowed_hosts.length === 0 && bundle.site.environment === "production") {
    errors.push({ code: "no_allowed_hosts", path: "settings.allowed_hosts", message: "Production needs at least one verified host", fixTool: "verify_domain" });
  }
  for (const [i, host] of bundle.settings.allowed_hosts.entries()) {
    if (!/^(\*\.)?[a-z0-9.-]+$/i.test(host) || host.length > 253) {
      errors.push({ code: "invalid_host", path: `settings.allowed_hosts[${i}]`, message: `Invalid host "${host}"` });
    }
  }

  if (bundle.consent.consent_mode.mode === "advanced") {
    warnings.push({ code: "advanced_consent_mode", path: "consent.consent_mode.mode", message: "Advanced consent mode sends cookieless pings before consent; requires documented legal review" });
  }
  if (bundle.consent.default_region_mode !== "strict_opt_in") {
    warnings.push({ code: "non_strict_region_mode", path: "consent.default_region_mode", message: "Default region mode is weaker than strict opt-in" });
  }

  const seen = new Set<string>();
  for (const [i, ev] of bundle.events.entries()) {
    const path = `events[${i}]`;
    if (seen.has(ev.name)) errors.push({ code: "duplicate_event", path, message: `Event "${ev.name}" is defined twice` });
    seen.add(ev.name);
    const std = getStandardEvent(ev.name);
    if (ev.trigger.type === "selector") {
      if (/javascript:|<|>/.test(ev.trigger.selector)) errors.push({ code: "unsafe_selector", path: `${path}.trigger.selector`, message: "Selector contains unsafe characters" });
    }
    if (ev.props_map !== null) {
      const v = validateLogic(ev.props_map);
      if (!v.ok) errors.push({ code: "invalid_logic", path: `${path}.props_map`, message: v.errors.join("; ") });
    }
    if (std?.authoritativeSourceRecommended && ev.enabled && ev.authoritative_source === "none") {
      const adTargets = bundle.destinations.filter((d) => d.enabled && PURPOSE_RANK[d.purpose] >= PURPOSE_RANK.marketing);
      if (adTargets.length) {
        errors.push({
          code: "conversion_without_authoritative_source",
          path,
          message: `"${ev.name}" is sent to advertising destinations but has no server-verified source (shop integration or server API)`,
          fixTool: "create_integration_draft",
        });
      } else {
        warnings.push({ code: "conversion_browser_only", path, message: `"${ev.name}" is browser-only; server-verified source recommended` });
      }
    }
  }

  const destIds = new Set<string>();
  for (const [i, d] of bundle.destinations.entries()) {
    const path = `destinations[${i}]`;
    if (destIds.has(d.id)) errors.push({ code: "duplicate_destination", path, message: "Destination listed twice" });
    destIds.add(d.id);
    const base = DESTINATION_PURPOSE[d.type];
    if (PURPOSE_RANK[d.purpose] < PURPOSE_RANK[base]) {
      errors.push({ code: "purpose_too_weak", path: `${path}.purpose`, message: `${d.type} requires at least "${base}" consent`, fixTool: "set_consent_policy_draft" });
    }
    if (SERVER_ONLY_TYPES.includes(d.type) && d.mode !== "server") {
      errors.push({ code: "server_only_destination", path: `${path}.mode`, message: `${d.type} has no browser tag; use mode "server"` });
    }
    if (d.mode !== "server") {
      for (const key of REQUIRED_BROWSER_IDS[d.type]) {
        if (!d.browser || !d.browser[key]) errors.push({ code: "missing_public_id", path: `${path}.browser.${key}`, message: `${d.type} needs ${key}`, fixTool: "save_public_pixel_id_draft" });
      }
    }
    if (d.enabled && d.mappings.filter((m) => m.enabled).length === 0) {
      warnings.push({ code: "no_mappings", path: `${path}.mappings`, message: `${d.name} has no enabled event mappings`, fixTool: "upsert_event_mapping_draft" });
    }
    for (const [j, m] of d.mappings.entries()) {
      if (!seen.has(m.event)) warnings.push({ code: "mapping_unknown_event", path: `${path}.mappings[${j}]`, message: `Mapping references unknown event "${m.event}"` });
      if (m.field_map !== null) {
        const v = validateLogic(m.field_map);
        if (!v.ok) errors.push({ code: "invalid_logic", path: `${path}.mappings[${j}].field_map`, message: v.errors.join("; ") });
      }
    }
    for (const [k, v] of Object.entries(d.browser ?? {})) {
      if (typeof v === "string" && /^https?:\/\//.test(v) && !/^https:\/\//.test(v)) errors.push({ code: "insecure_url", path: `${path}.browser.${k}`, message: "URLs must use https" });
      if (typeof v === "string" && /(token|secret|password)/i.test(k)) errors.push({ code: "secret_in_bundle", path: `${path}.browser.${k}`, message: "Secrets never belong in a config bundle" });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** Whether a request origin is allowed by the bundle. */
export function originAllowed(bundle: Pick<ConfigBundle, "settings">, originHost: string): boolean {
  return bundle.settings.allowed_hosts.some((h) => hostMatches(originHost, h));
}
