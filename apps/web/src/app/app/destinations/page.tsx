import { desc, eq, max } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { deliveryAttempts, integrations, listSites, sites } from "@track-site/db";
import { Badge, Card, EmptyState } from "@track-site/ui";
import { requireOrgContext, withOrg } from "@/server/session";

const statusTone = (s: string) => (s === "connected" ? "ok" : s === "error" ? "bad" : s === "paused" ? "warn" : "neutral");

export default async function DestinationsOverviewPage() {
  const ctx = await requireOrgContext("integrations.read");
  const t = await getTranslations("destinations");
  const data = await withOrg(ctx, async (tx) => {
    const siteRows = await listSites(tx, ctx.organization.id);
    const rows = await tx
      .select({ id: integrations.id, name: integrations.name, type: integrations.connectorType, status: integrations.status, health: integrations.health, testMode: integrations.testMode, siteId: integrations.siteId, siteName: sites.name })
      .from(integrations)
      .innerJoin(sites, eq(sites.id, integrations.siteId))
      .where(eq(integrations.organizationId, ctx.organization.id))
      .orderBy(desc(integrations.createdAt));
    const success = await tx.select({ integrationId: deliveryAttempts.integrationId, at: max(deliveryAttempts.startedAt) }).from(deliveryAttempts).where(eq(deliveryAttempts.status, "success")).groupBy(deliveryAttempts.integrationId);
    return { siteRows, rows, success: new Map(success.map((s) => [s.integrationId, s.at])) };
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState
          title={t("none")}
          description={t("noneText")}
          action={
            data.siteRows[0] ? (
              <Link href={`/app/sites/${data.siteRows[0].id}/destinations/new`} className="text-sm font-medium text-primary hover:underline">
                {t("add")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2">{t("title")}</th>
                  <th className="px-4 py-2">{t("site")}</th>
                  <th className="px-4 py-2">{t("status")}</th>
                  <th className="px-4 py-2">{t("health")}</th>
                  <th className="px-4 py-2">{t("lastSuccess")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const last = data.success.get(r.id);
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-4 py-2">
                        <span className="font-medium text-ink">{r.name}</span> <span className="font-mono text-xs text-ink-3">{r.type}</span>
                      </td>
                      <td className="px-4 py-2 text-ink-2">{r.siteName}</td>
                      <td className="px-4 py-2">
                        <Badge tone={statusTone(r.status)}>{t(`status_${r.status}`)}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={r.health.status === "healthy" ? "ok" : r.health.status === "unknown" || r.health.status === "not_connected" ? "neutral" : "bad"}>{t(`health_${["healthy", "degraded", "unhealthy", "not_connected"].includes(r.health.status) ? r.health.status : "unknown"}`)}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-3">{last ? new Date(last).toLocaleString() : t("never")}</td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/app/sites/${r.siteId}/destinations/${r.id}`} className="text-sm font-medium text-primary hover:underline">
                          {t("openWizard")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        {data.siteRows.map((s) => (
          <Link key={s.id} href={`/app/sites/${s.id}/destinations/new`} className="text-primary hover:underline">
            {t("add")} · {s.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
