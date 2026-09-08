import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@track-site/ui";
import { ConnectorsSection, FunnelSection, GrowthKpis, MethodNotes, PlanMixSection, RetentionSection, SignupsSection, dateTime } from "@/components/ops/growth";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { SMALL_SAMPLE_ORGANIZATIONS, growthView, loadGrowthSnapshot } from "@/server/ops/growth";
import { checkPlatform, platformLocale, withPlatform } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("growth");
}

/**
 * Growth analytics (docs/17, task O7): sign-ups per day and week, the activation funnel, weekly retention
 * cohorts, active organisations, the plan mix and the connectors in use — counts and rates over the
 * platform's own tables, never event payloads, members or end-user data, so no break-glass grant and no
 * page-view audit entry is involved. Reads run as `tracksite_ops` through `withPlatform`.
 */
export default async function OpsGrowthPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const ctx = access.ctx;
  const now = new Date();
  const [snapshot, tOps, t, locale] = await Promise.all([
    withPlatform(ctx, (tx) => loadGrowthSnapshot(tx, now)),
    getTranslations("ops"),
    getTranslations("opsGrowth"),
    platformLocale(ctx.user),
  ]);
  const view = growthView(snapshot);
  return (
    <div className="space-y-10" data-testid="ops-growth">
      <OpsPageHeader
        title={tOps("pages.growth.title")}
        intro={t("intro")}
        context={
          <>
            <span className="tabular-nums">{t("context.asOf", { at: dateTime(view.generatedAt, locale) })}</span>
            <span className="tabular-nums">{t("context.organizations", { count: view.totals.organizations })}</span>
            <span className="tabular-nums">{t("context.users", { count: view.totals.users })}</span>
            <span className="tabular-nums">{t("context.sites", { count: view.totals.sites })}</span>
          </>
        }
      />

      {view.smallSample ? (
        <Alert tone="info" title={t("sample.title")}>
          {t("sample.text", { min: SMALL_SAMPLE_ORGANIZATIONS })}
        </Alert>
      ) : null}

      <GrowthKpis view={view} locale={locale} />
      <SignupsSection signups={view.signups} locale={locale} />
      <FunnelSection funnel={view.funnel} locale={locale} />
      <RetentionSection retention={view.retention} locale={locale} />
      <PlanMixSection planMix={view.planMix} locale={locale} />
      <ConnectorsSection connectors={view.connectors} locale={locale} />
      <MethodNotes />
    </div>
  );
}
