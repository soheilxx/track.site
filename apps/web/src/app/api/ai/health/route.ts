import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/server/session";
import { aiConfigured, modelAvailability, modelRouting } from "@/server/ai/context";

export const dynamic = "force-dynamic";

/** AI status for the dashboard: configured, model availability per role, blockers (no key material). */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1" && ctx.role === "OWNER";
  const routing = modelRouting();
  const availability = aiConfigured() ? await modelAvailability(force) : null;
  return NextResponse.json({
    configured: aiConfigured(),
    routing: { primary: "configured", fast: "configured", complex: "configured" },
    availability: availability ? { ok: availability.ok, checkedAt: availability.checkedAt, missing: availability.missing.map((m) => (m === routing.primary ? "primary" : m === routing.fast ? "fast" : "complex")), suggestions: availability.suggestions.length, error: availability.error } : null,
    fallback: "form_wizard",
  });
}
