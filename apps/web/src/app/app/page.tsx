import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { listSites } from "@track-site/db";
import { Badge, Button, Card, EmptyState, StatCard } from "@track-site/ui";
import { requireOrgContext, withOrg } from "@/server/session";
import { overviewStats } from "@/server/stats";

export default async function OverviewPage() {
  const ctx = await requireOrgContext();
  const t = await getTranslations("app.overview");
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  const stats = await overviewStats(ctx, sites.map((s) => s.id));
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="text-sm text-ink-3">{t("welcome", { name: ctx.user.name })}</p>
        </div>
        <Link href="/app/onboarding">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("createSite")}
          </Button>
        </Link>
      </div>
      {sites.length === 0 ? (
        <EmptyState
          title={t("noSites")}
          description={t("noSitesText")}
          action={
            <Link href="/app/onboarding">
              <Button>{t("createSite")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t("health")} value={stats.health === null ? "–" : `${stats.health}/100`} tone={stats.health === null ? "neutral" : stats.health >= 80 ? "ok" : stats.health >= 50 ? "warn" : "bad"} />
            <StatCard label={t("acceptedEvents")} value={stats.accepted.toLocaleString()} />
            <StatCard label={t("delivered")} value={stats.delivered.toLocaleString()} />
          </div>
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-ink">{t("sites")}</h2>
            </div>
            <ul className="divide-y divide-line">
              {sites.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{s.name}</p>
                    <p className="text-sm text-ink-3">
                      <span className="font-mono">{s.trackingId}</span> · {s.primaryDomain ?? "–"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.status === "active" ? "ok" : "warn"}>{s.status}</Badge>
                    <Link href={`/app/sites/${s.id}/setup`} className="text-sm font-medium text-primary hover:underline">
                      {t("openSetup")}
                    </Link>
                    <Link href={`/app/sites/${s.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
                      {t("viewSite")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
