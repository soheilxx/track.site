import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { integrations, sites } from "@track-site/db";
import { Banner, EmptyState, StatCard, buttonVariants } from "@track-site/ui";
import { formatDateTime } from "@/components/app/data-quality/format";
import { InboxFilterBar, InboxList } from "@/components/app/data-quality/inbox";
import { DataQualityHeader } from "@/components/app/data-quality/page-header";
import { formatNumber } from "@/lib/format";
import { aiConfigured } from "@/server/ai/context";
import { ISSUE_CATEGORIES, loadFixContext, loadInbox, type InboxFilters, type InboxStatus, type IssueCategory } from "@/server/data-quality";
import { requireOrgContext, withOrg } from "@/server/session";
import { activeSite } from "@/server/workspace";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dataQuality");
  return { title: t("title") };
}

const STATUSES: ReadonlyArray<InboxStatus | "all"> = ["open", "acknowledged", "resolved", "muted", "all"];

function parseFilters(q: { status?: string; category?: string }): InboxFilters {
  const status = STATUSES.includes(q.status as InboxStatus) ? (q.status as InboxStatus | "all") : "open";
  const category = (ISSUE_CATEGORIES as readonly string[]).includes(q.category ?? "") ? (q.category as IssueCategory) : "all";
  return { status, category };
}

/**
 * Data Quality Inbox (redesign supplement §8 module 7) for the active workspace site: measured issues from the
 * worker scan, ranked by impact and grouped by category, with evidence, the acknowledge / resolve / mute workflow
 * and a reviewable fix draft where the configuration can fix the problem. Filters live in the URL.
 */
export default async function DataQualityPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("dataQuality");
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
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
  const environment = workspace.environment;
  const filters = parseFilters(q);
  const locale = ctx.user.locale;
  const { inbox, timezone } = await withOrg(ctx, async (tx) => {
    const names = await tx.select({ id: integrations.id, name: integrations.name }).from(integrations).where(eq(integrations.siteId, site.id));
    const [row] = await tx.select({ currency: sites.currency, timezone: sites.timezone }).from(sites).where(eq(sites.id, site.id)).limit(1);
    const fixContext = await loadFixContext(tx, { siteId: site.id, environmentId: environment?.id ?? null, siteCurrency: row?.currency ?? null, destinationNames: Object.fromEntries(names.map((n) => [n.id, n.name])) });
    return { inbox: await loadInbox(tx, { siteId: site.id, filters, fixContext }), timezone: row?.timezone ?? "Europe/Berlin" };
  });
  const canManage = can(ctx.role, "config.draft");
  return (
    <div className="space-y-6">
      <DataQualityHeader section="inbox" site={site} />
      {inbox.scanStale && inbox.lastScanAt ? <Banner tone="warn">{t("summary.staleScan", { date: formatDateTime(inbox.lastScanAt, locale, timezone) })}</Banner> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("summary.open")} value={formatNumber(inbox.counts.open, locale)} tone={inbox.counts.open > 0 ? "warn" : inbox.lastScanAt ? "ok" : "neutral"} hint={inbox.lastScanAt ? undefined : t("summary.notMeasured")} />
        <StatCard label={t("summary.critical")} value={formatNumber(inbox.counts.critical, locale)} tone={inbox.counts.critical > 0 ? "bad" : inbox.lastScanAt ? "ok" : "neutral"} hint={inbox.lastScanAt ? undefined : t("summary.notMeasured")} />
        <StatCard label={t("summary.acknowledged")} value={formatNumber(inbox.counts.acknowledged, locale)} hint={t("summary.mutedCount", { n: inbox.counts.muted })} />
        <StatCard label={t("summary.lastScan")} value={inbox.lastScanAt ? formatDateTime(inbox.lastScanAt, locale, timezone) : "—"} hint={inbox.lastScanAt ? (inbox.lastObservedAt ? t("summary.lastObserved", { date: formatDateTime(inbox.lastObservedAt, locale, timezone) }) : undefined) : t("summary.lastScanNever")} />
      </div>
      <InboxFilterBar filters={filters} inbox={inbox} locale={locale} />
      <InboxList inbox={inbox} filters={filters} site={{ id: site.id, name: site.name, timezone }} environment={environment ? { id: environment.id, kind: environment.kind, name: environment.name } : null} locale={locale} canManage={canManage} aiEnabled={aiConfigured()} />
    </div>
  );
}
