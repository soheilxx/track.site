import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  PlatformAccessError,
  auditPlatform,
  requirePlatform,
  withPlatform,
  type PlatformContext,
} from "@/server/ops/platform";
import {
  REPORT_EXPORT_KINDS,
  loadSupportReportSnapshot,
  parseReportRange,
  supportReportCsv,
  supportReportView,
} from "@/server/support/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({ kind: z.enum(REPORT_EXPORT_KINDS).default("summary") });

/**
 * CSV export of one support report section for a date range (`kind`, `from` / `to` or `days`, `bucket` —
 * parsed exactly like the page). Counts, durations in minutes and rates only: no subjects, message bodies or
 * requester details. Requires `platform.reports.read`; every export writes an audit entry
 * (`platform.support_report.export`, actor kind `platform`) in the same transaction as the read — a bulk
 * read that leaves the console is recorded like a mutation.
 */
export async function GET(req: NextRequest) {
  let ctx: PlatformContext;
  try {
    ctx = await requirePlatform("PLATFORM_SUPPORT", "platform.reports.read");
  } catch (e) {
    if (e instanceof PlatformAccessError)
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", reason: e.reason },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    throw e;
  }
  const params = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({ kind: params.get("kind") ?? undefined });
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, code: "VALIDATION" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  const { kind } = parsed.data;
  const now = new Date();
  const query: Record<string, string> = {};
  for (const key of ["days", "from", "to", "bucket"]) {
    const value = params.get(key);
    if (value != null) query[key] = value;
  }
  const range = parseReportRange(query, now);
  if (range.fallback)
    return NextResponse.json(
      { ok: false, code: "VALIDATION" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );

  const csv = await withPlatform(ctx, async (tx) => {
    const snapshot = await loadSupportReportSnapshot(tx, range, now);
    const view = supportReportView(snapshot);
    const { body, rows } = supportReportCsv(view, kind);
    await auditPlatform(
      ctx,
      {
        action: "platform.support_report.export",
        targetType: "support_report",
        targetId: kind,
        metadata: {
          module: "support",
          kind,
          from: range.from,
          to: range.to,
          bucket: range.bucket,
          rows,
          tickets: view.cohort.tickets,
          truncated: view.cohort.truncated,
        },
      },
      tx,
    );
    return body;
  });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="support-report-${kind}-${range.from}_${range.to}.csv"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
