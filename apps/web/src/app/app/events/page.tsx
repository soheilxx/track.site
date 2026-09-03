import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PgEventStore } from "@track-site/analytics";
import { listSites } from "@track-site/db";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Label, Select, StatCard } from "@track-site/ui";
import { pool } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";

/** Event volume per day and event name for the last 7 days (accepted vs. dropped), per site. */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("app.events");
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  const site = sites.find((s) => s.id === q.site) ?? sites[0] ?? null;
  if (!site) return <EmptyState title={t("noSites")} />;
  const store = new PgEventStore(pool());
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86_400_000);
  const rows = await store.counts(site.id, from, to, "day");
  const [lastBrowser, lastServer] = await Promise.all([store.lastEventAt(site.id, "browser"), store.lastEventAt(site.id, "server")]);
  const total = rows.reduce((a, r) => a + r.count, 0);
  const dropped = rows.reduce((a, r) => a + r.dropped, 0);
  const byName = new Map<string, { count: number; dropped: number; sources: Set<string> }>();
  for (const r of rows) {
    const cur = byName.get(r.name) ?? { count: 0, dropped: 0, sources: new Set<string>() };
    cur.count += r.count;
    cur.dropped += r.dropped;
    cur.sources.add(r.source);
    byName.set(r.name, cur);
  }
  const days = Array.from(new Set(rows.map((r) => r.bucket))).sort();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <div>
            <Label htmlFor="ev-site">{t("site")}</Label>
            <Select id="ev-site" name="site" defaultValue={site.id} className="mt-1">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
            {t("show")}
          </button>
        </form>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("accepted")} value={total} hint={t("last7")} />
        <StatCard label={t("dropped")} value={dropped} tone={dropped ? "warn" : "neutral"} hint={t("last7")} />
        <StatCard label={t("lastBrowser")} value={lastBrowser ? lastBrowser.toLocaleString() : t("never")} />
        <StatCard label={t("lastServer")} value={lastServer ? lastServer.toLocaleString() : t("never")} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("byEvent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {byName.size === 0 ? (
            <p className="text-sm text-ink-3">
              {t("empty")}{" "}
              <Link href={`/app/sites/${site.id}`} className="text-primary hover:underline">
                {t("install")}
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-3">
                  <tr>
                    <th className="py-1 pr-3">{t("event")}</th>
                    <th className="py-1 pr-3">{t("sources")}</th>
                    {days.map((d) => (
                      <th key={d} className="py-1 pr-3 font-normal">
                        {d.slice(5, 10)}
                      </th>
                    ))}
                    <th className="py-1 pr-3">{t("accepted")}</th>
                    <th className="py-1 pr-3">{t("dropped")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(byName.entries())
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([name, agg]) => (
                      <tr key={name} className="border-t border-line">
                        <td className="py-1.5 pr-3">
                          <Link href={`/app/debugger?site=${site.id}&name=${encodeURIComponent(name)}`} className="font-mono text-xs text-primary hover:underline">
                            {name}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-ink-3">{Array.from(agg.sources).join(", ")}</td>
                        {days.map((d) => (
                          <td key={d} className="py-1.5 pr-3 text-xs">
                            {rows.filter((r) => r.bucket === d && r.name === name).reduce((a, r) => a + r.count, 0) || ""}
                          </td>
                        ))}
                        <td className="py-1.5 pr-3">{agg.count}</td>
                        <td className="py-1.5 pr-3 text-ink-3">{agg.dropped}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
