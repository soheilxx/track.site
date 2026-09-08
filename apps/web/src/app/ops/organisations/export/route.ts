import { NextResponse, type NextRequest } from "next/server";
import { loadOrganisationExport, organisationsCsv, parseOrganisationFilters } from "@/server/ops/organisations";
import { PlatformAccessError, auditPlatform, requirePlatform } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

/**
 * CSV export of the organisations directory: the same filters as the page, the same metadata columns
 * (no e-mails, no Stripe ids, no event data), at most EXPORT_MAX_ROWS rows. Every export is recorded
 * in the audit log with the filters and the row count. Signed-out visitors are redirected to the login
 * page by `requirePlatform`; accounts without platform role get 403.
 */
export async function GET(request: NextRequest): Promise<Response> {
  let ctx;
  try {
    ctx = await requirePlatform("PLATFORM_SUPPORT");
  } catch (e) {
    if (e instanceof PlatformAccessError) return NextResponse.json({ ok: false, code: "FORBIDDEN", reason: e.reason }, { status: 403 });
    throw e;
  }
  const filters = parseOrganisationFilters(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const now = new Date();
  const { rows, total, truncated } = await loadOrganisationExport(ctx, filters, now);
  await auditPlatform(ctx, {
    action: "platform.organizations.export",
    targetType: "organization_directory",
    metadata: { module: "organisations", filters: { q: filters.q, plan: filters.plan, status: filters.status, suspended: filters.suspended, sort: filters.sort, dir: filters.dir }, rows: rows.length, total, truncated },
  });
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(organisationsCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="organisations-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
