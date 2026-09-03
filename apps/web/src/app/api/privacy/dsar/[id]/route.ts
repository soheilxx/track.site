import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { dataSubjectRequests, recordAudit } from "@track-site/db";
import { getOrgContext, withOrg } from "@/server/session";
import { can } from "@track-site/core";

export const dynamic = "force-dynamic";

/** Downloads a completed export/portability report as JSON (audited). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!can(ctx.role, "privacy.dsar") || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const row = await withOrg(ctx, async (tx) => {
    const r = (await tx.select().from(dataSubjectRequests).where(and(eq(dataSubjectRequests.id, id), eq(dataSubjectRequests.organizationId, ctx.organization.id))).limit(1))[0] ?? null;
    if (r?.report) await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "dsar.download", targetType: "dsar", targetId: id, requestId: ctx.tenant.requestId });
    return r;
  });
  if (!row?.report) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return new NextResponse(JSON.stringify({ request: { id: row.id, kind: row.kind, requestedAt: row.requestedAt, completedAt: row.completedAt }, report: row.report }, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="dsar-${row.id}.json"`, "cache-control": "no-store" } });
}
