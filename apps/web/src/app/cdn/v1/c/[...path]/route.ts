import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

export const dynamic = "force-dynamic";

/** Config manifests and signed bundles are served by the collector; the CDN host proxies them here locally. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const safe = path.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `${env().HOST_INGEST}/v1/c/${safe}`;
  try {
    const res = await fetch(upstream, { headers: { accept: "application/json" }, cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": res.headers.get("cache-control") ?? "no-store",
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "config_upstream_unavailable" }, { status: 503, headers: { "access-control-allow-origin": "*" } });
  }
}
