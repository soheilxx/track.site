import { NextResponse, type NextRequest } from "next/server";
import { loadOpsAuditExport, opsAuditCsv, opsAuditFilterSummary, parseOpsAuditFilters } from "@/server/ops/audit";
import { PlatformAccessError, auditPlatform, requirePlatform } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

/**
 * CSV export of the audit explorer: the same filters as the page, the same redacted key lists (diff and
 * metadata flattened to `path=value` pairs — never raw payloads, end-user personal data or secrets; the
 * platform actor's e-mail is not a column), newest first, at most OPS_AUDIT_EXPORT_MAX_ROWS rows. Every
 * export is itself an audit entry (`platform.audit.export`) with the filters and the row count — carrying
 * the organisation id when the export is scoped to one tenant, so its own audit log shows it. Signed-out
 * visitors are redirected to the login page by `requirePlatform`; accounts without platform role get 403.
 */
export async function GET(request: NextRequest): Promise<Response> {
  let ctx;
  try {
    ctx = await requirePlatform("PLATFORM_SUPPORT");
  } catch (e) {
    if (e instanceof PlatformAccessError) return NextResponse.json({ ok: false, code: "FORBIDDEN", reason: e.reason }, { status: 403 });
    throw e;
  }
  const filters = parseOpsAuditFilters(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const now = new Date();
  const { entries, total, truncated, organization } = await loadOpsAuditExport(ctx, filters);
  await auditPlatform(ctx, {
    action: "platform.audit.export",
    organizationId: organization.kind === "organization" ? organization.id : null,
    targetType: "audit_log",
    metadata: { module: "audit", filters: opsAuditFilterSummary(filters), rows: entries.length, total, truncated },
  });
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(opsAuditCsv(entries), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
