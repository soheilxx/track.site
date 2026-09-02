import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listSites } from "@track-site/db";
import { Badge, Button, Card, EmptyState } from "@track-site/ui";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function SitesPage() {
  const ctx = await requireOrgContext("sites.read");
  const t = await getTranslations("app");
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("nav.sites")}</h1>
        <Link href="/app/onboarding">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("overview.createSite")}
          </Button>
        </Link>
      </div>
      {sites.length === 0 ? (
        <EmptyState title={t("overview.noSites")} description={t("overview.noSitesText")} />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {sites.map((s) => (
              <li key={s.id} className="px-5 py-4">
                <Link href={`/app/sites/${s.id}`} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="ml-2 font-mono text-sm text-ink-3">{s.trackingId}</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm text-ink-3">
                    {s.primaryDomain} <Badge tone={s.status === "active" ? "ok" : "warn"}>{s.status}</Badge>
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
