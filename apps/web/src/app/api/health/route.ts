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
      mail: e.SMTP_URL ? "smtp" : e.RESEND_API_KEY ? "resend" : "file",
      ts: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
