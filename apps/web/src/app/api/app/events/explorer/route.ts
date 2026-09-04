import { NextResponse, type NextRequest } from "next/server";
import { can } from "@track-site/core";
import { loadExplorerDetail, loadExplorerList, parseExplorerFilters } from "@/server/events";
import { getOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

export const dynamic = "force-dynamic";

/**
 * Polling endpoint of the Live Event Explorer: the list for the current filters and, with `event`,
 * the redacted detail with its lineage. Tenant and workspace come from the session; the `site` the
 * client rendered must still be the active workspace site, otherwise 409 (`workspace_changed`) so
 * the page reloads instead of mixing sites.
 */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!can(ctx.role, "events.read")) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const workspace = await activeSite(ctx);
  if (!workspace.site || !workspace.environment) return NextResponse.json({ ok: false, code: "NO_SITE" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  if (q.get("site") !== workspace.site.id || (q.get("env") && q.get("env") !== workspace.environment.id)) return NextResponse.json({ ok: false, code: "WORKSPACE_CHANGED" }, { status: 409 });
  const filters = parseExplorerFilters(Object.fromEntries(q.entries()));
  const eventId = q.get("event");
  const [list, detail] = await Promise.all([loadExplorerList(ctx, workspace.site, workspace.environment, filters), eventId ? loadExplorerDetail(ctx, workspace.site, eventId) : Promise.resolve(null)]);
  return NextResponse.json({ ok: true, list, detail, detailFound: eventId ? detail !== null : null }, { headers: { "cache-control": "no-store" } });
}
