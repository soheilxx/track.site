import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSite, listShopConnections } from "@track-site/db";
import { buttonVariants } from "@track-site/ui";
import { ShopConnections } from "@/components/app/shop-connections";
import { env } from "@/env";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function ShopConnectionsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const ctx = await requireOrgContext("sites.read");
  const t = await getTranslations("app.shop");
  const data = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, siteId);
    if (!site) return null;
    const connections = await listShopConnections(tx, site.id);
    return { site, connections };
  });
  if (!data) notFound();
  const { site, connections } = data;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
        </div>
        {/* button-styled link: interactive elements are never nested */}
        <Link href={`/app/sites/${site.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
          {t("backToSite")}
        </Link>
      </div>
      <ShopConnections
        siteId={site.id}
        trackingId={site.trackingId}
        ingestUrl={env().HOST_INGEST}
        connections={connections.map((c) => ({
          id: c.id,
          platform: c.platform,
          shopDomain: c.shopDomain,
          status: c.status,
          pathToken: c.pathToken,
          hasSecret: c.credentialId !== null,
          settings: c.settings,
          lastEventAt: c.lastEventAt ? c.lastEventAt.toISOString() : null,
          lastError: c.lastError,
        }))}
      />
    </div>
  );
}
