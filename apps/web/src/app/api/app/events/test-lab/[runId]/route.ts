import { NextResponse, type NextRequest } from "next/server";
import { can } from "@track-site/core";
import { loadTestLabTimeline } from "@/server/events";
import { getOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

export const dynamic = "force-dynamic";

/** Polling endpoint of the Live Test Lab: the timeline of one run (events, lineage, delivery attempts; redacted). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!can(ctx.role, "events.read")) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const workspace = await activeSite(ctx);
  if (!workspace.site) return NextResponse.json({ ok: false, code: "NO_SITE" }, { status: 404 });
  if (req.nextUrl.searchParams.get("site") !== workspace.site.id) return NextResponse.json({ ok: false, code: "WORKSPACE_CHANGED" }, { status: 409 });
  const { runId } = await params;
  const timeline = await loadTestLabTimeline(ctx, workspace.site, runId);
  if (!timeline) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, timeline }, { headers: { "cache-control": "no-store" } });
}
