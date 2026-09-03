import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { can } from "@track-site/core";
import { listSites, orgSettings, sourceKeys } from "@track-site/db";
import { Card, CardContent, CardHeader, CardTitle } from "@track-site/ui";
import { OrgSettingsForm, OrganizationForm, SiteSettingsForm, SourceKeys } from "@/components/app/settings";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function SettingsPage() {
  const ctx = await requireOrgContext("org.read");
  const t = await getTranslations("app.settings");
  const data = await withOrg(ctx, async (tx) => {
    const settings = (await tx.select().from(orgSettings).where(eq(orgSettings.organizationId, ctx.organization.id)).limit(1))[0] ?? null;
    const siteRows = await listSites(tx, ctx.organization.id);
    const keys = await tx.select().from(sourceKeys).where(eq(sourceKeys.organizationId, ctx.organization.id)).orderBy(desc(sourceKeys.createdAt));
    return { settings, siteRows, keys };
  });
  const canUpdate = can(ctx.role, "org.update");
  const canSites = can(ctx.role, "sites.update");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("organization")}</CardTitle>
          </CardHeader>
          <CardContent>{canUpdate ? <OrganizationForm name={ctx.organization.name} /> : <p className="text-sm text-ink-2">{ctx.organization.name}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("preferences")}</CardTitle>
          </CardHeader>
          <CardContent>
            {canUpdate ? (
              <OrgSettingsForm settings={{ locale: data.settings?.locale ?? ctx.user.locale, dataRegion: data.settings?.dataRegion ?? "eu", aiEnabled: data.settings?.aiEnabled ?? true, benchmarkOptIn: data.settings?.benchmarkOptIn ?? false, killSwitch: data.settings?.killSwitch ?? false }} />
            ) : (
              <p className="text-sm text-ink-3">{t("readOnly")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("sites")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.siteRows.map((s) => (canSites ? <SiteSettingsForm key={s.id} site={{ id: s.id, name: s.name, trackingId: s.trackingId, killSwitch: s.killSwitch }} /> : <p key={s.id} className="text-sm">{s.name}</p>))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("keys")}</CardTitle>
          </CardHeader>
          <CardContent>
            {canSites ? (
              <SourceKeys sites={data.siteRows.map((s) => ({ id: s.id, name: s.name }))} keys={data.keys.map((k) => ({ id: k.id, siteId: k.siteId, name: k.name, prefix: k.keyPrefix, last4: k.last4, status: k.status, lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))} />
            ) : (
              <p className="text-sm text-ink-3">{t("readOnly")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
