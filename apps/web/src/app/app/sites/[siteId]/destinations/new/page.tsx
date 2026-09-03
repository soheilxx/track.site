import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AFFILIATE_PRESETS, buildIntegrationMatrix } from "@track-site/connectors";
import { getSite } from "@track-site/db";
import { DestinationCatalog, type CatalogEntry } from "@/components/destinations/catalog";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function NewDestinationPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const ctx = await requireOrgContext("integrations.manage");
  const t = await getTranslations("destinations");
  const site = await withOrg(ctx, (tx) => getSite(tx, ctx.organization.id, siteId));
  if (!site) notFound();
  const entries: CatalogEntry[] = buildIntegrationMatrix().map((r) => ({
    type: r.type,
    displayName: r.displayName,
    browser: r.browser,
    server: r.server,
    offline: r.offline,
    verifiedAt: r.verifiedAt,
    docsUrl: r.docsUrl,
    accessNote: r.accessNote,
    group: r.type === "ga4" ? "analytics" : r.type === "webhook" ? "other" : r.type === "affiliate" ? "affiliate" : "ads",
  }));
  return (
    <div className="space-y-4">
      <nav className="text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href={`/app/sites/${site.id}`} className="hover:underline">
          {site.name}
        </Link>{" "}
        / <Link href={`/app/sites/${site.id}/destinations`} className="hover:underline">{t("title")}</Link>
      </nav>
      <h1 className="font-display text-2xl font-semibold text-ink">{t("catalogTitle")}</h1>
      <p className="max-w-2xl text-sm text-ink-3">{t("catalogIntro")}</p>
      <DestinationCatalog siteId={site.id} entries={entries} presets={Object.values(AFFILIATE_PRESETS).map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
