import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import {
  AgentsSection,
  BacklogSection,
  CategoriesSection,
  CsatSection,
  ExportForm,
  MethodNotes,
  OrganisationsSection,
  RangeFilter,
  ReportKpis,
  SlaSection,
  TagsSection,
  TimesSection,
  VolumeSection,
  dateTime,
  day,
} from "@/components/ops/support/reports";
import { checkPlatform, platformLocale, withPlatform } from "@/server/ops/platform";
import {
  REPORT_DEFAULT_DAYS,
  REPORT_MAX_TICKETS,
  SMALL_SAMPLE_TICKETS,
  dayKey,
  loadSupportReportSnapshot,
  parseReportRange,
  supportReportView,
} from "@/server/support/reports";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support.pages.reports");
  return { title: t("title") };
}

/**
 * Track Operations → Support → Reports (docs/18 §"Reports", task T7): ticket volume by day / week and channel,
 * the backlog by status, first-response and resolution medians and 90th percentiles, SLA attainment, per-agent
 * workload, satisfaction, top categories and tags and the busiest organisations for a date range — every
 * figure from stored timestamps and counts, small numbers flagged, nothing extrapolated. Requires
 * `platform.reports.read`; reads run as `tracksite_ops` through `withPlatform`. The page shows aggregates and
 * organisation metadata only, so no break-glass grant and no page-view audit entry is involved (the CSV
 * export is audited by its route).
 */
export default async function OpsSupportReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.reports.read");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const now = new Date();
  const range = parseReportRange(await searchParams, now);
  const [snapshot, t, tSupport, locale] = await Promise.all([
    withPlatform(ctx, (tx) => loadSupportReportSnapshot(tx, range, now)),
    getTranslations("supportReports"),
    getTranslations("support"),
    platformLocale(ctx.user),
  ]);
  const view = supportReportView(snapshot);
  return (
    <div className="space-y-10" data-testid="ops-support-reports">
      <OpsPageHeader
        title={tSupport("pages.reports.title")}
        intro={t("intro")}
        context={
          <>
            <span className="tabular-nums">
              {t("context.asOf", { at: dateTime(view.generatedAt, locale) })}
            </span>
            <span className="tabular-nums">
              {t("context.range", { from: day(range.from, locale), to: day(range.to, locale) })}
            </span>
            <span className="tabular-nums">{t("context.days", { count: range.days })}</span>
            <span className="tabular-nums">
              {t("context.tickets", { count: view.cohort.tickets })}
            </span>
          </>
        }
        actions={
          <>
            <ExportForm range={range} />
            <Link href="/ops/support" className={buttonVariants({ variant: "ghost" })}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t("backToSupport")}
            </Link>
          </>
        }
      />

      <RangeFilter range={range} today={dayKey(now)} />

      {range.fallback ? (
        <Alert tone="warn">{t("range.fallback", { days: REPORT_DEFAULT_DAYS })}</Alert>
      ) : null}
      {view.cohort.smallSample ? (
        <Alert tone="info" title={t("notes.small.title")}>
          {t("notes.small.text", { min: SMALL_SAMPLE_TICKETS })}
        </Alert>
      ) : null}
      {view.cohort.truncated ? (
        <Alert tone="warn" title={t("notes.truncated.title")}>
          {t("notes.truncated.text", { max: REPORT_MAX_TICKETS })}
        </Alert>
      ) : null}

      <ReportKpis view={view} locale={locale} />
      <VolumeSection volume={view.volume} range={range} locale={locale} />
      <BacklogSection backlog={view.backlog} locale={locale} />
      <TimesSection times={view.times} locale={locale} />
      <SlaSection sla={view.sla} locale={locale} />
      <AgentsSection agents={view.agents} locale={locale} />
      <CsatSection csat={view.csat} locale={locale} />
      <div className="grid gap-10 xl:grid-cols-2">
        <CategoriesSection categories={view.categories} locale={locale} />
        <TagsSection tags={view.tags} locale={locale} />
      </div>
      <OrganisationsSection organisations={view.organisations} locale={locale} />
      <MethodNotes />
    </div>
  );
}
