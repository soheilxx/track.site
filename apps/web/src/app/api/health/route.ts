import { NextResponse } from "next/server";
import { env, publicEnv } from "@/env";
import { pool } from "@/server/db";

export const dynamic = "force-dynamic";

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
  return NextResponse.json(
    {
      ok: dbOk,
      db: dbOk,
      migrations,
      appEnv: p.appEnv,
      ai: p.aiEnabled ? "configured" : "not_configured",
      billing: p.stripeEnabled ? "configured" : "not_configured",
      mail: e.SMTP_URL ? "smtp" : e.RESEND_API_KEY ? "resend" : "file",
      ts: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
