import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState, buttonVariants } from "@track-site/ui";
import {
  AttributionFacts,
  CaptureConfig,
  Definitions,
  ModelledHints,
  NoEventsState,
  UnknownList,
} from "@/components/app/insights/attribution-facts";
import {
  ClickIdTable,
  DailyCapture,
  DestinationTable,
  TouchpointTable,
} from "@/components/app/insights/attribution-tables";
import { InsightsPageHeader } from "@/components/app/insights/page-header";
import { attributionHealth } from "@/server/insights";
import { parseRange } from "@/server/insights-attribution";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

export const dynamic = "force-dynamic";

/**
 * Attribution & Click-ID Health (supplement §8, module 11): consent-compliant capture, lifetime,
 * origin and forwarding of the supported click ids for the active site, environment and window —
 * observed facts, modelled hints and the unknown kept strictly apart.
 */
export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("insights");
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("attribution.title")}</h1>
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
  const empty = health.observed.total === 0;
  return (
    <div className="space-y-8">
      <InsightsPageHeader
        title={t("attribution.title")}
        intro={t("attribution.intro")}
        site={site}
        environment={workspace.environment}
        window={health.window}
        basePath="/app/insights/attribution"
      />
      {empty ? <NoEventsState siteId={site.id} /> : <AttributionFacts health={health} />}
      <CaptureConfig config={health.config} />
      {empty ? null : (
        <>
          <ClickIdTable clickIds={health.clickIds} />
          <DailyCapture daily={health.daily} />
        </>
      )}
      <DestinationTable destinations={health.destinations} siteId={site.id} />
      {empty ? null : <ModelledHints health={health} />}
      <UnknownList health={health} />
      <TouchpointTable touchpoints={health.touchpoints} />
      <Definitions />
    </div>
  );
}
