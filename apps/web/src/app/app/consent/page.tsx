import { desc, eq, isNull, and } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { RETENTION_DEFAULT_DAYS, consentPolicies, dataSubjectRequests, listSites, retentionPolicies, sites } from "@track-site/db";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@track-site/ui";
import { DsarForm, DsarRow, RetentionForm } from "@/components/app/privacy";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function PrivacyPage() {
  const ctx = await requireOrgContext("consent.read");
  const t = await getTranslations("app.privacy");
  const data = await withOrg(ctx, async (tx) => {
    const siteRows = await listSites(tx, ctx.organization.id);
    const policies = await tx
      .select({ id: consentPolicies.id, siteId: consentPolicies.siteId, siteName: sites.name, version: consentPolicies.version, status: consentPolicies.status, cmp: consentPolicies.cmp, consentMode: consentPolicies.consentMode, publishedAt: consentPolicies.publishedAt, updatedAt: consentPolicies.updatedAt })
      .from(consentPolicies)
      .innerJoin(sites, eq(sites.id, consentPolicies.siteId))
      .where(eq(consentPolicies.organizationId, ctx.organization.id))
      .orderBy(desc(consentPolicies.updatedAt))
      .limit(50);
    const retention = await tx.select().from(retentionPolicies).where(and(eq(retentionPolicies.organizationId, ctx.organization.id), isNull(retentionPolicies.siteId)));
    const requests = await tx.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.organizationId, ctx.organization.id)).orderBy(desc(dataSubjectRequests.requestedAt)).limit(100);
    return { siteRows, policies, retention, requests };
  });
  const canRetention = can(ctx.role, "privacy.retention");
  const canDsar = can(ctx.role, "privacy.dsar");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("policies")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.policies.length === 0 ? (
            <p className="text-sm text-ink-3">{t("noPolicies")}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.policies.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <Link href={`/app/sites/${p.siteId}/setup`} className="font-medium text-ink hover:underline">
                      {p.siteName}
                    </Link>{" "}
                    <span className="text-ink-3">{t("version", { version: p.version })}</span> <Badge tone={p.status === "published" ? "ok" : "neutral"}>{p.status}</Badge>
                  </span>
                  <span className="text-xs text-ink-3">
                    {t("cmp")}: {p.cmp?.provider ?? "api"} · {t("mode")}: {p.consentMode.mode}
                    {p.publishedAt ? ` · ${p.publishedAt.toLocaleDateString()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("retention")}</CardTitle>
          <p className="text-sm text-ink-3">{t("retentionText")}</p>
        </CardHeader>
        <CardContent>
          {canRetention ? (
            <RetentionForm kinds={Object.entries(RETENTION_DEFAULT_DAYS).map(([kind, defaultDays]) => ({ kind, defaultDays }))} values={Object.fromEntries(data.retention.map((r) => [r.dataKind, r.days]))} />
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-3">
              {Object.entries(RETENTION_DEFAULT_DAYS).map(([kind, days]) => (
                <li key={kind}>
                  <span className="font-mono text-xs">{kind}</span>: {data.retention.find((r) => r.dataKind === kind)?.days ?? days} {t("days").toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dsar")}</CardTitle>
          <p className="text-sm text-ink-3">{t("dsarText")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {canDsar ? <DsarForm /> : null}
          {data.requests.length === 0 ? (
            <p className="text-sm text-ink-3">{t("noRequests")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.requests.map((r) => (
                <DsarRow key={r.id} request={{ id: r.id, kind: r.kind, status: r.status, requestedAt: r.requestedAt.toISOString(), dueAt: r.dueAt.toISOString(), hasReport: Boolean(r.report) && (r.kind === "export" || r.kind === "portability"), note: r.note }} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
