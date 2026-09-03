import { NextResponse } from "next/server";
import { createOpenAI, verifyModelAvailability, type ModelAvailability } from "@track-site/ai";
import { env, publicEnv } from "@/env";
import { resolvePrice, stripe } from "@/server/billing";
import { pool } from "@/server/db";

export const dynamic = "force-dynamic";

/** Model availability is checked at most every 10 minutes per instance (List models: read only). */
let aiCache: { at: number; value: ModelAvailability } | null = null;

async function aiStatus(): Promise<{ ai: string; aiModels: { available: string[]; missing: string[] } | null; aiCheckedAt: string | null }> {
  const e = env();
  if (!e.AI_ENABLED || !e.OPENAI_API_KEY) return { ai: "not_configured", aiModels: null, aiCheckedAt: null };
  if (!aiCache || Date.now() - aiCache.at > 10 * 60_000) {
    const value = await verifyModelAvailability(createOpenAI(e.OPENAI_API_KEY, { timeoutMs: 8_000, maxRetries: 0 }), { primary: e.AI_MODEL_PRIMARY ?? "gpt-5.6-terra", fast: e.AI_MODEL_FAST ?? "gpt-5.6-luna", complex: e.AI_MODEL_COMPLEX ?? "gpt-5.6-sol" });
    aiCache = { at: Date.now(), value };
  }
  const v = aiCache.value;
  const ai = v.ok ? "ok" : v.error?.includes("401") ? "invalid_key" : v.error ? "unreachable" : "models_missing";
  return { ai, aiModels: { available: v.available, missing: v.missing }, aiCheckedAt: v.checkedAt };
}

/** Resend domain status for the MAIL_FROM domain, checked at most every 10 minutes per instance (read-only). */
let mailCache: { at: number; value: { domain: string | null; status: string } } | null = null;

async function mailStatus(): Promise<{ mail: string; mailDomain: { domain: string | null; status: string } | null }> {
  const e = env();
  if (e.SMTP_URL) return { mail: "smtp", mailDomain: null };
  if (!e.RESEND_API_KEY) return { mail: "file", mailDomain: null };
  if (!mailCache || Date.now() - mailCache.at > 10 * 60_000) {
    const from = e.MAIL_FROM ?? "";
    const domain = from.match(/@([A-Za-z0-9.-]+)/)?.[1]?.toLowerCase() ?? null;
    let status: string;
    try {
      const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${e.RESEND_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
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

/** Stripe price configuration is verified at most every 10 minutes per instance (Prices: read only). */
const PRICE_ENV = ["STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_YEARLY", "STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_GROWTH_YEARLY", "STRIPE_PRICE_SCALE_MONTHLY", "STRIPE_PRICE_SCALE_YEARLY"] as const;
type BillingPrices = { ok: string[]; missing: string[]; failed: Array<{ env: string; error: string }> };
let billingCache: { at: number; value: { billing: string; billingPrices: BillingPrices | null } } | null = null;

async function billingStatus(): Promise<{ billing: string; billingPrices: BillingPrices | null }> {
  if (!stripe() || !publicEnv().stripeEnabled) return { billing: "not_configured", billingPrices: null };
  if (!billingCache || Date.now() - billingCache.at > 10 * 60_000) {
    const value: BillingPrices = { ok: [], missing: [], failed: [] };
    for (const name of PRICE_ENV) {
      const interval = name.endsWith("_YEARLY") ? "yearly" : "monthly";
      const { price, error } = await resolvePrice(name, interval);
      if (!price) {
        if (error === "missing") value.missing.push(name);
        else value.failed.push({ env: name, error: error ?? "unknown" });
        continue;
      }
      const want = interval === "monthly" ? "month" : "year";
      const problem = !price.active ? "price_inactive" : price.type !== "recurring" ? "not_recurring" : price.recurring?.interval !== want ? `interval_${price.recurring?.interval ?? "none"}_expected_${want}` : price.unit_amount == null ? "no_unit_amount" : price.tax_behavior === "unspecified" ? "tax_behavior_unspecified" : null;
      if (problem) value.failed.push({ env: name, error: problem });
      else value.ok.push(name);
    }
    const billing = value.failed.length ? "prices_failing" : value.ok.length ? "ok" : "no_prices";
    billingCache = { at: Date.now(), value: { billing, billingPrices: value } };
  }
  return billingCache.value;
}

export async function GET() {
  let dbOk: boolean;
  let migrations: number | null = null;
  try {
    const res = await pool().query<{ n: string }>(`SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`);
    migrations = Number(res.rows[0]?.n ?? 0);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const p = publicEnv();
  const ai = await aiStatus();
  return NextResponse.json(
    {
      ok: dbOk,
      db: dbOk,
      migrations,
      appEnv: p.appEnv,
      ...ai,
      ...(await billingStatus()),
      ...(await mailStatus()),
      ts: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
