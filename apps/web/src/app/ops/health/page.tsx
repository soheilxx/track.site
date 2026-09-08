import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/ops/health/auto-refresh";
import { CollectorPanel } from "@/components/ops/health/collector";
import { Database } from "@/components/ops/health/database";
import { Deliveries } from "@/components/ops/health/deliveries";
import { Destinations } from "@/components/ops/health/destinations";
import { fmtTime } from "@/components/ops/health/format";
import { Queues } from "@/components/ops/health/queues";
import { RecentErrors } from "@/components/ops/health/recent-errors";
import { StripeLedger } from "@/components/ops/health/stripe-ledger";
import { Summary } from "@/components/ops/health/summary";
import { Vendors } from "@/components/ops/health/vendors";
import { WorkerJobs } from "@/components/ops/health/worker-jobs";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { REFRESH_INTERVAL_MS, loadPlatformHealth } from "@/server/ops/health";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("health");
}

/**
 * Platform health (docs/17, task O3): aggregates and metadata across all tenants — never event payloads,
 * end-user data or secrets — so no break-glass grant and no page-view audit entry is involved. The page
 * is rendered per request; the `AutoRefresh` island re-renders it every 60 s while the tab is visible.
 */
export default async function OpsHealthPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const ctx = access.ctx;
  const [t, tPages, locale] = await Promise.all([getTranslations("opsHealth"), getTranslations("ops.pages.health"), platformLocale(ctx.user)]);
  const view = await loadPlatformHealth(ctx);
  const nowMs = Date.parse(view.generatedAt);
  return (
    <div className="space-y-10">
      <OpsPageHeader
        title={tPages("title")}
        intro={t("intro")}
        actions={<AutoRefresh generatedAt={view.generatedAt} updatedLabel={fmtTime(view.generatedAt, locale) ?? view.generatedAt} intervalMs={REFRESH_INTERVAL_MS} />}
      />
      <Summary view={view} locale={locale} nowMs={nowMs} />
      <div className="grid gap-10 xl:grid-cols-2">
        <CollectorPanel collector={view.collector} locale={locale} />
        <Database database={view.database} locale={locale} />
      </div>
      <WorkerJobs worker={view.worker} locale={locale} nowMs={nowMs} />
      <Queues queues={view.queues} locale={locale} />
      <Deliveries deliveries={view.deliveries} locale={locale} />
      <Destinations destinations={view.destinations} locale={locale} nowMs={nowMs} />
      <StripeLedger stripe={view.stripe} locale={locale} nowMs={nowMs} />
      <Vendors vendors={view.vendors} locale={locale} />
      <RecentErrors recent={view.recent} locale={locale} nowMs={nowMs} />
    </div>
  );
}
