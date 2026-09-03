import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { activeVersion, domains, environments, getSite } from "@track-site/db";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@track-site/ui";
import { DomainVerification } from "@/components/app/domain-verification";
import { Snippet } from "@/components/app/snippet";
import { env } from "@/env";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const ctx = await requireOrgContext("sites.read");
  const t = await getTranslations("app.site");
  const data = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, siteId);
    if (!site) return null;
    const envs = await tx.select().from(environments).where(eq(environments.siteId, site.id));
    const doms = await tx.select().from(domains).where(and(eq(domains.siteId, site.id), eq(domains.organizationId, ctx.organization.id)));
    const prod = envs.find((e) => e.isDefault) ?? envs[0];
    const active = prod ? await activeVersion(tx, prod.id) : null;
    return { site, envs, doms, active };
  });
  if (!data) notFound();
  const { site, envs, doms, active } = data;
  const e = env();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{site.name}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {t("trackingId")}: <span className="font-mono text-ink">{site.trackingId}</span> · {t("trackingIdHelp")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/sites/${site.id}/setup`}>
            <Button size="sm">{t("openSetup")}</Button>
          </Link>
          <Link href={`/app/sites/${site.id}/destinations`}>
            <Button size="sm" variant="secondary">
              Destinations
            </Button>
          </Link>
          <Link href={`/app/debugger?site=${site.id}`}>
            <Button size="sm" variant="secondary">
              {t("openDebugger")}
            </Button>
          </Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("snippetTitle")}</CardTitle>
            <p className="text-sm text-ink-3">{t("snippetText")}</p>
          </CardHeader>
          <CardContent>
            <Snippet trackingId={site.trackingId} cdnUrl={e.HOST_CDN} ingestUrl={e.HOST_INGEST} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("domains")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {doms.map((d) => (
              <div key={d.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{d.hostname}</span>
                  <Badge tone={d.verifiedAt ? "ok" : "warn"}>{d.verifiedAt ? t("verified") : t("unverified")}</Badge>
                </div>
                {!d.verifiedAt ? <DomainVerification domainId={d.id} hostname={d.hostname} token={d.verificationToken} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("environments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {envs.map((en) => (
                <li key={en.id} className="flex items-center justify-between">
                  <span className="text-ink">{en.name}</span>
                  <span className="text-ink-3">{en.testMode ? "test mode" : "live"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("activeConfig")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-2">{active ? t("version", { version: active.version }) : t("noConfig")}</CardContent>
        </Card>
      </div>
    </div>
  );
}
