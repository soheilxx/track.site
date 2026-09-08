import { NextResponse } from "next/server";
import { publicEnv } from "@/env";
import { aiStatus, billingStatus, databaseProbe, mailStatus } from "@/server/health-status";

export const dynamic = "force-dynamic";

/** Public probe: database + migrations, AI models, Stripe prices and mail domain (the checks live in `server/health-status.ts`, shared with the operator console). */
export async function GET() {
  const { db, migrations } = await databaseProbe();
  const p = publicEnv();
  const ai = await aiStatus();
  return NextResponse.json(
    {
      ok: db,
      db,
      migrations,
      appEnv: p.appEnv,
      ...ai,
      ...(await billingStatus()),
      ...(await mailStatus()),
      ts: new Date().toISOString(),
    },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
