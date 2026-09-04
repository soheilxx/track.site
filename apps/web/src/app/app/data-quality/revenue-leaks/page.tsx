import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { sites } from "@track-site/db";
import { EmptyState, buttonVariants } from "@track-site/ui";
import { DataQualityHeader } from "@/components/app/data-quality/page-header";
import { LeakControls, LeakReport, LeakSources } from "@/components/app/data-quality/revenue-leaks";
import { LEAK_RANGES, loadRevenueLeaks, type LeakKind, type LeakRange } from "@/server/revenue-leaks";
import { requireOrgContext, withOrg } from "@/server/session";
import { activeSite } from "@/server/workspace";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dataQuality");
  return { title: t("leaks.title") };
}

/**
 * Signal Gap & Revenue Leak Detector (redesign supplement §8 module 4): authoritative orders or leads versus
 * observed, deduplicated and delivered conversions per destination and day, with reasons and uncertainty.
 */
export default async function RevenueLeaksPage({ searchParams }: { searchParams: Promise<{ range?: string; kind?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("dataQuality");
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("leaks.title")}</h1>
        <EmptyState
          title={t("noSite")}
          description={t("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("createSite")}
            </Link>
          }
        />
      </div>
    );
  }
  const site = workspace.site;
  const rangeDays: LeakRange = (LEAK_RANGES as readonly number[]).includes(Number(q.range)) ? (Number(q.range) as LeakRange) : 7;
  const kind: LeakKind = q.kind === "lead" ? "lead" : "purchase";
  const locale = ctx.user.locale;
  const { report, timezone } = await withOrg(ctx, async (tx) => {
    const [row] = await tx.select({ timezone: sites.timezone }).from(sites).where(eq(sites.id, site.id)).limit(1);
    return { report: await loadRevenueLeaks(tx, { siteId: site.id, kind, rangeDays }), timezone: row?.timezone ?? "Europe/Berlin" };
  });
  return (
    <div className="space-y-6">
      <DataQualityHeader section="leaks" site={site} />
      <LeakControls report={report} />
      <LeakSources report={report} siteId={site.id} locale={locale} timezone={timezone} />
      <LeakReport report={report} locale={locale} timezone={timezone} />
    </div>
  );
}
