import "server-only";
import { createOpenAI, verifyModelAvailability, type ModelAvailability } from "@track-site/ai";
import { stripePriceSlots } from "@track-site/catalog";
import { env, publicEnv } from "@/env";
import { resolvePrice, stripe } from "@/server/billing";
import { pool } from "@/server/db";

/**
 * Vendor and database status checks shared by the public probe `/api/health` and the operator console
 * (`/ops/health`). Every check is read-only, cached per instance for ten minutes (the vendors are rate
 * limited and the answers change rarely) and never throws: an unreachable vendor is a state, not an error.
 * Nothing here returns a secret — key ids, domains and model names only.
 */

const CACHE_TTL_MS = 10 * 60_000;

export type AiState = "not_configured" | "ok" | "invalid_key" | "unreachable" | "models_missing";

export interface AiStatus {
  ai: AiState;
  aiModels: { available: string[]; missing: string[] } | null;
  aiCheckedAt: string | null;
}

/** Model availability is checked at most every 10 minutes per instance (List models: read only). */
let aiCache: { at: number; value: ModelAvailability } | null = null;

export async function aiStatus(): Promise<AiStatus> {
  const e = env();
  if (!e.AI_ENABLED || !e.OPENAI_API_KEY) return { ai: "not_configured", aiModels: null, aiCheckedAt: null };
  if (!aiCache || Date.now() - aiCache.at > CACHE_TTL_MS) {
    const value = await verifyModelAvailability(createOpenAI(e.OPENAI_API_KEY, { timeoutMs: 8_000, maxRetries: 0 }), {
      primary: e.AI_MODEL_PRIMARY ?? "gpt-5.6-terra",
      fast: e.AI_MODEL_FAST ?? "gpt-5.6-luna",
      complex: e.AI_MODEL_COMPLEX ?? "gpt-5.6-sol",
    });
    aiCache = { at: Date.now(), value };
  }
  const v = aiCache.value;
  const ai: AiState = v.ok ? "ok" : v.error?.includes("401") ? "invalid_key" : v.error ? "unreachable" : "models_missing";
  return { ai, aiModels: { available: v.available, missing: v.missing }, aiCheckedAt: v.checkedAt };
}

export type MailTransport = "smtp" | "file" | "resend";

export interface MailStatus {
  mail: MailTransport;
  /** Resend only: the MAIL_FROM domain and its verification state as Resend reports it (or why the check could not run) */
  mailDomain: { domain: string | null; status: string } | null;
}

/** Resend domain status for the MAIL_FROM domain, checked at most every 10 minutes per instance (read-only). */
let mailCache: { at: number; value: { domain: string | null; status: string } } | null = null;

export async function mailStatus(): Promise<MailStatus> {
  const e = env();
  if (e.SMTP_URL) return { mail: "smtp", mailDomain: null };
  if (!e.RESEND_API_KEY) return { mail: "file", mailDomain: null };
  if (!mailCache || Date.now() - mailCache.at > CACHE_TTL_MS) {
    const from = e.MAIL_FROM ?? "";
    const domain = from.match(/@([A-Za-z0-9.-]+)/)?.[1]?.toLowerCase() ?? null;
    let status: string;
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${e.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 401 || res.status === 403) {
        // a "sending access" key may not list domains: sending still works, only the domain check is unavailable
        const body = (await res.json().catch(() => null)) as { name?: string } | null;
        status = body?.name === "restricted_api_key" ? "sending_only_key" : "invalid_key";
      } else if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ name: string; status: string }> };
        const match = (json.data ?? []).find((d) => d.name.toLowerCase() === domain);
        status = match ? match.status : "domain_missing";
      } else {
        const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
        status = `http_${res.status}${body?.name ? `:${body.name}` : ""}${body?.message ? ` ${body.message.slice(0, 80)}` : ""}`;
      }
    } catch {
      status = "unreachable";
    }
    mailCache = { at: Date.now(), value: { domain, status } };
  }
  return { mail: "resend", mailDomain: mailCache.value };
}

export type BillingState = "not_configured" | "ok" | "prices_failing" | "prices_missing" | "no_prices";

export interface BillingPrices {
  ok: string[];
  missing: string[];
  failed: Array<{ env: string; error: string }>;
  deprecated: string[];
}

export interface BillingStatus {
  billing: BillingState;
  billingPrices: BillingPrices | null;
}

/**
 * Stripe price configuration is verified at most every 10 minutes per instance (Prices: read only).
 * One slot per catalogue plan and interval; `resolvePrice` already rejects amounts/currencies that differ
 * from the catalogue list price (`amount_mismatch:<stripe>≠<catalogue>`). `billing` is `ok` only when every
 * slot verifies; `deprecated` lists the legacy `STRIPE_PRICE_SCALE_*` names still serving as fallback.
 */
let billingCache: { at: number; value: BillingStatus } | null = null;

export async function billingStatus(): Promise<BillingStatus> {
  if (!stripe() || !publicEnv().stripeEnabled) return { billing: "not_configured", billingPrices: null };
  if (!billingCache || Date.now() - billingCache.at > CACHE_TTL_MS) {
    const value: BillingPrices = { ok: [], missing: [], failed: [], deprecated: [] };
    const slots = stripePriceSlots();
    for (const slot of slots) {
      const name = slot.envName;
      const { price, error, envName, deprecated } = await resolvePrice(name, slot.interval);
      if (deprecated && envName) value.deprecated.push(envName);
      if (!price) {
        if (error === "missing") value.missing.push(name);
        else value.failed.push({ env: name, error: error ?? "unknown" });
        continue;
      }
      const want = slot.interval === "monthly" ? "month" : "year";
      const problem = !price.active
        ? "price_inactive"
        : price.type !== "recurring"
          ? "not_recurring"
          : price.recurring?.interval !== want
            ? `interval_${price.recurring?.interval ?? "none"}_expected_${want}`
            : price.unit_amount == null
              ? "no_unit_amount"
              : price.tax_behavior === "unspecified"
                ? "tax_behavior_unspecified"
                : null;
      if (problem) value.failed.push({ env: name, error: problem });
      else value.ok.push(name);
    }
    const billing: BillingState = value.failed.length
      ? "prices_failing"
      : value.ok.length === slots.length
        ? "ok"
        : value.ok.length
          ? "prices_missing"
          : "no_prices";
    billingCache = { at: Date.now(), value: { billing, billingPrices: value } };
  }
  return billingCache.value;
}

export interface DatabaseProbe {
  db: boolean;
  /** applied migrations (`drizzle.__drizzle_migrations`), null when the database did not answer */
  migrations: number | null;
}

/** One cheap query against the migration journal: proves connectivity and reports the applied count. */
export async function databaseProbe(): Promise<DatabaseProbe> {
  try {
    const res = await pool().query<{ n: string }>(`SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`);
    return { db: true, migrations: Number(res.rows[0]?.n ?? 0) };
  } catch {
    return { db: false, migrations: null };
  }
}
