import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getSite, listIntegrations } from "@track-site/db";
import { Badge, Button, Card, EmptyState } from "@track-site/ui";
import { requireOrgContext, withOrg } from "@/server/session";

const statusTone = (s: string) => (s === "connected" ? "ok" : s === "error" ? "bad" : s === "paused" ? "warn" : "neutral");

export default async function SiteDestinationsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const ctx = await requireOrgContext("integrations.read");
  const t = await getTranslations("destinations");
  const data = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, siteId);
    if (!site) return null;
    return { site, rows: await listIntegrations(tx, site.id) };
  });
  if (!data) notFound();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="text-sm text-ink-3">{data.site.name}</p>
        </div>
        <Link href={`/app/sites/${data.site.id}/destinations/new`}>
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("add")}
          </Button>
        </Link>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState title={t("none")} description={t("noneText")} />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {data.rows.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <Link href={`/app/sites/${data.site.id}/destinations/${r.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="ml-2 font-mono text-xs text-ink-3">{r.connectorType}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <Badge tone={statusTone(r.status)}>{t(`status_${r.status}`)}</Badge>
                    <Badge tone={r.health.status === "healthy" ? "ok" : r.health.status === "unknown" || r.health.status === "not_connected" ? "neutral" : "bad"}>{t(`health_${["healthy", "degraded", "unhealthy", "not_connected"].includes(r.health.status) ? r.health.status : "unknown"}`)}</Badge>
                    {r.testMode ? <Badge tone="warn">test</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
