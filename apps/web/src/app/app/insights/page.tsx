import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, EmptyState, StatCard, buttonVariants } from "@track-site/ui";
import { DestinationTable } from "@/components/app/insights/attribution-tables";
import { EvidenceBadge } from "@/components/app/insights/evidence";
import { count, percent } from "@/components/app/insights/format";
import { InsightsPageHeader } from "@/components/app/insights/page-header";
import { attributionHealth } from "@/server/insights";
import { parseRange } from "@/server/insights-attribution";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

export const dynamic = "force-dynamic";

/**
 * Insights overview: the observed attribution facts of the active site and window, the forwarding
 * state per destination and the way into the full attribution report and the audiences. Every
 * figure is computed from stored records on request; nothing here is a placeholder.
 */
export default async function InsightsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("insights");
  const locale = await getLocale();
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("overview.title")}</h1>
        <EmptyState
          title={t("noSite.title")}
          description={t("noSite.text")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("noSite.action")}
            </Link>
          }
        />
      </div>
    );
  }
  const site = workspace.site;
  const health = await attributionHealth(ctx, {
    siteId: site.id,
    environmentId: workspace.environment?.id ?? null,
    days: parseRange(q.range),
  });
  const o = health.observed;
  const coverage = o.total > 0 ? o.marketing / o.total : null;
  const problems = health.destinations.filter(
    (d) => d.verdict === "failing" || d.verdict === "not_delivered" || d.verdict === "partial",
  ).length;
  // "ok" only rests on an observed forwarding; destinations without an eligible event prove nothing
  const forwarding = health.destinations.filter((d) => d.verdict === "forwarding").length;
  return (
    <div className="space-y-8">
      <InsightsPageHeader
        title={t("overview.title")}
        intro={t("overview.intro")}
        site={site}
        environment={workspace.environment}
        window={health.window}
        basePath="/app/insights"
      />

      <section aria-labelledby="overview-attribution-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="overview-attribution-title" className="text-base font-semibold text-ink">
              {t("overview.attribution.title")}
            </h2>
            <EvidenceBadge kind="observed" />
          </div>
          <Link
            href={
              health.window.days === 30
                ? "/app/insights/attribution"
                : `/app/insights/attribution?range=${health.window.days}`
            }
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("overview.attribution.open")} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {o.total === 0 ? (
          <EmptyState
            title={t("overview.empty.title")}
            description={t("overview.empty.text")}
            action={
              <Link href="/app/events" className={buttonVariants()}>
                {t("overview.empty.action")}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("attribution.facts.consent.label")}
              value={coverage === null ? "–" : percent(coverage, locale)}
              hint={t("attribution.facts.consent.hint", {
                marketing: count(o.marketing, locale),
                total: count(o.total, locale),
              })}
            />
            <StatCard
              label={t("attribution.facts.withClickIds.label")}
              value={count(o.withClickIds, locale)}
              hint={
                o.marketing > 0
                  ? t("attribution.facts.withClickIds.hint", {
                      marketing: count(o.marketing, locale),
                    })
                  : t("attribution.facts.withClickIds.hintNoConsent")
              }
            />
            <StatCard
              label={t("attribution.facts.captureRate.label")}
              value={o.captureRate === null ? "–" : percent(o.captureRate, locale)}
              hint={
                o.captureRate === null
                  ? t("attribution.facts.captureRate.unknown")
                  : t("attribution.facts.captureRate.hint")
              }
            />
            <StatCard
              label={t("overview.attribution.destinations")}
              value={count(problems, locale)}
              tone={problems > 0 ? "warn" : forwarding > 0 ? "ok" : "neutral"}
              hint={
                health.destinations.length === 0
                  ? t("overview.attribution.noDestinations")
                  : problems > 0
                    ? t("overview.attribution.destinationsProblems")
                    : forwarding > 0
                      ? t("overview.attribution.destinationsOk")
                      : t("overview.attribution.destinationsNoObservation")
              }
            />
          </div>
        )}
      </section>

      <DestinationTable destinations={health.destinations} siteId={site.id} compact />

      <section aria-labelledby="overview-audiences-title">
        <Card
          variant="flat"
          className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <h2 id="overview-audiences-title" className="text-base font-semibold text-ink">
              {t("overview.audiences.title")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("overview.audiences.text")}</p>
          </div>
          <Link
            href="/app/insights/audiences"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("overview.audiences.open")} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      </section>
    </div>
  );
}
