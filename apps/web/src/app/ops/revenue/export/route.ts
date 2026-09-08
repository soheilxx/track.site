import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { loadRevenueSnapshot, overageCsv, revenueView, subscriptionsCsv } from "@/server/ops/revenue";

export const dynamic = "force-dynamic";

const querySchema = z.object({ kind: z.enum(["subscriptions", "overage"]).default("subscriptions") });

/**
 * CSV export of the Revenue module (admin-only). `kind=subscriptions`: every ledger row with its list-price
 * MRR and Stripe ids; `kind=overage`: the current period's overage exposure. Metadata and aggregates only.
 * Every export writes an audit entry (`platform.revenue.export`, actor kind `platform`) in the same
 * transaction as the read — a bulk read that leaves the console is recorded like a mutation.
 */
export async function GET(req: NextRequest) {
  let ctx: PlatformContext;
  try {
    ctx = await requirePlatform("PLATFORM_ADMIN");
  } catch (e) {
    if (e instanceof PlatformAccessError) return NextResponse.json({ ok: false, code: "FORBIDDEN", reason: e.reason }, { status: 403, headers: { "cache-control": "no-store" } });
    throw e;
  }
  const parsed = querySchema.safeParse({ kind: req.nextUrl.searchParams.get("kind") ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION" }, { status: 400, headers: { "cache-control": "no-store" } });
  const { kind } = parsed.data;
  const now = new Date();
  const csv = await withPlatform(ctx, async (tx) => {
    const snapshot = await loadRevenueSnapshot(tx, now);
    const overage = revenueView(snapshot).overage;
    const body = kind === "subscriptions" ? subscriptionsCsv(snapshot.subscriptions) : overageCsv(overage);
    const rows = kind === "subscriptions" ? snapshot.subscriptions.length : overage.rows.length;
    await auditPlatform(ctx, { action: "platform.revenue.export", targetType: "revenue_export", targetId: kind, metadata: { kind, rows, periodKey: snapshot.periodKey } }, tx);
    return body;
  });
  const stamp = now.toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="track-revenue-${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
