import { NextResponse, type NextRequest } from "next/server";
import { getIntegration, withTenant } from "@track-site/db";
import { db } from "@/server/db";
import { providerConfig, signState, startUrl, xRequestToken } from "@/server/oauth";
import { getOrgContext } from "@/server/session";
import { siteBelongsToOrg } from "@/server/ai/context";

export const dynamic = "force-dynamic";

/** Starts the vendor OAuth connect flow for a destination (state bound to org/site/integration/user). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  if (!["OWNER", "ADMIN", "DEVELOPER"].includes(ctx.role)) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const integrationId = req.nextUrl.searchParams.get("integration") ?? "";
  const siteId = req.nextUrl.searchParams.get("site") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(integrationId) || !/^[0-9a-f-]{36}$/i.test(siteId) || !(await siteBelongsToOrg(ctx.organization.id, siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const integration = await withTenant(db(), ctx.organization.id, (tx) => getIntegration(tx, siteId, integrationId));
  if (!integration) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const back = `/app/sites/${siteId}/destinations/${integrationId}`;
  const base = { organizationId: ctx.organization.id, siteId, integrationId, provider, userId: ctx.user.id, issuedAt: Date.now() };
  if (provider === "x") {
    const rt = await xRequestToken();
    if (!rt) return NextResponse.redirect(new URL(`${back}?oauth=not_configured`, req.url));
    const res = NextResponse.redirect(rt.authorizeUrl);
    res.cookies.set("ts_oauth_x", signState({ ...base, requestSecret: rt.secret }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/oauth/x", maxAge: 900 });
    return res;
  }
  if (!providerConfig(provider)) return NextResponse.redirect(new URL(`${back}?oauth=not_configured`, req.url));
  const url = startUrl(provider, base);
  if (!url) return NextResponse.redirect(new URL(`${back}?oauth=not_configured`, req.url));
  return NextResponse.redirect(url);
}
