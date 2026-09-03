import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { dataQualityIssues, listSites, siteHealthSnapshots } from "@track-site/db";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard } from "@track-site/ui";
import { IssueActions } from "@/components/app/quality";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<{ site?: string; status?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("app.quality");
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  const site = sites.find((s) => s.id === q.site) ?? sites[0] ?? null;
  if (!site) return <EmptyState title={t("noSites")} />;
  const status = q.status === "resolved" || q.status === "ignored" ? q.status : "open";
  const data = await withOrg(ctx, async (tx) => {
    const issues = await tx.select().from(dataQualityIssues).where(eq(dataQualityIssues.siteId, site.id)).orderBy(desc(dataQualityIssues.lastSeenAt)).limit(200);
    const snapshot = (await tx.select().from(siteHealthSnapshots).where(eq(siteHealthSnapshots.siteId, site.id)).orderBy(desc(siteHealthSnapshots.computedAt)).limit(1))[0] ?? null;
    return { issues, snapshot };
  });
  const issues = data.issues.filter((i) => i.status === status);
  const counts = { open: data.issues.filter((i) => i.status === "open").length, critical: data.issues.filter((i) => i.status === "open" && i.severity === "critical").length };
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {sites.map((s) => (
            <Link key={s.id} href={`/app/data-quality?site=${s.id}`} className={`rounded-full px-3 py-1 ${s.id === site.id ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-3"}`}>
              {s.name}
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("score")} value={data.snapshot ? `${data.snapshot.score}/100` : "—"} tone={data.snapshot ? (data.snapshot.score >= 80 ? "ok" : data.snapshot.score >= 50 ? "warn" : "bad") : "neutral"} hint={data.snapshot ? t("computedAt", { date: data.snapshot.computedAt.toLocaleString() }) : t("noSnapshot")} />
        <StatCard label={t("openIssues")} value={counts.open} tone={counts.open ? "warn" : "ok"} />
        <StatCard label={t("critical")} value={counts.critical} tone={counts.critical ? "bad" : "ok"} />
      </div>
      {data.snapshot ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("components")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.snapshot.components).map(([k, c]) => (
                <li key={k} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{k}</span>
                    <Badge tone={c.score >= 80 ? "ok" : c.score >= 50 ? "warn" : "bad"}>{c.score}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-3">{c.detail}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("issues")}</CardTitle>
          <div className="flex gap-2 text-xs">
            {(["open", "resolved", "ignored"] as const).map((s) => (
              <Link key={s} href={`/app/data-quality?site=${site.id}&status=${s}`} className={`rounded-full px-2 py-0.5 ${s === status ? "bg-primary-soft text-primary" : "text-ink-3"}`}>
                {t(`status_${s}`)}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <p className="text-sm text-ink-3">{t("noIssues")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {issues.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={i.severity === "critical" ? "bad" : i.severity === "warning" ? "warn" : "neutral"}>{i.severity}</Badge>
                      <span className="font-mono text-xs text-ink-3">{i.kind}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{i.summary}</p>
                    <p className="text-xs text-ink-3">
                      {t("occurrences", { n: i.occurrences })} · {t("lastSeen", { date: i.lastSeenAt.toLocaleString() })}
                      {i.fixTool ? ` · ${t("fixWith", { tool: i.fixTool })}` : ""}
                    </p>
                  </div>
                  <IssueActions issueId={i.id} status={i.status} siteId={site.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
