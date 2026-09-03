import { NextResponse } from "next/server";
import { createOpenAI, verifyModelAvailability, type ModelAvailability } from "@track-site/ai";
import { env, publicEnv } from "@/env";
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
    let status = "unknown";
    try {
      const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${e.RESEND_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
      if (res.status === 401 || res.status === 403) status = "invalid_key";
      else if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ name: string; status: string }> };
        const match = (json.data ?? []).find((d) => d.name.toLowerCase() === domain);
        status = match ? match.status : "domain_missing";
      } else status = `http_${res.status}`;
    } catch {
      status = "unreachable";
    }
    mailCache = { at: Date.now(), value: { domain, status } };
  }
  return { mail: "resend", mailDomain: mailCache.value };
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
  const e = env();
  const p = publicEnv();
  const ai = await aiStatus();
  return NextResponse.json(
    {
      ok: dbOk,
      db: dbOk,
      migrations,
      appEnv: p.appEnv,
      ...ai,
      billing: p.stripeEnabled ? "configured" : "not_configured",
      ...(await mailStatus()),
      ts: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
