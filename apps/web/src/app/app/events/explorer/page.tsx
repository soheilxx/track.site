import { getTranslations } from "next-intl/server";
import { Banner, Button, EmptyState } from "@track-site/ui";
import { Explorer } from "@/components/app/events/explorer";
import { loadExplorerDetail, loadExplorerList, parseExplorerFilters } from "@/server/events";
import { switchToSiteAndOpenExplorerAction } from "@/server/events-actions";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Live Event Explorer (supplement §8 module 3; replaces /app/debugger). Filters live in the URL so a
 * view can be shared; the client component polls the JSON endpoint and shows "last updated".
 */
export default async function ExplorerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("events");
  const workspace = await activeSite(ctx);
  if (!workspace.site) return null;
  if (!workspace.environment) return <EmptyState title={t("module.noEnvironment")} />;
  const filters = parseExplorerFilters(q);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const eventId = /^[0-9A-HJKMNP-TV-Z]{26}$/.test(one(q.event)) ? one(q.event) : null;
  const legacySite = one(q.site);
  const otherSite = legacySite && legacySite !== workspace.site.id ? (workspace.sites.find((s) => s.id === legacySite) ?? null) : null;
  const [list, detail] = await Promise.all([loadExplorerList(ctx, workspace.site, workspace.environment, filters), eventId ? loadExplorerDetail(ctx, workspace.site, eventId) : Promise.resolve(null)]);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (k !== "site" && typeof v === "string") query.set(k, v);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("explorer.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("explorer.intro")}</p>
      </div>
      {otherSite ? (
        <Banner
          tone="info"
          title={t("explorer.workspaceBanner.text", { site: otherSite.name })}
          action={
            <form action={switchToSiteAndOpenExplorerAction}>
              <input type="hidden" name="siteId" value={otherSite.id} />
              <input type="hidden" name="query" value={query.toString()} />
              <Button type="submit" size="sm" variant="secondary">
                {t("explorer.workspaceBanner.switch", { site: otherSite.name })}
              </Button>
            </form>
          }
        />
      ) : null}
      <Explorer siteId={workspace.site.id} environmentId={workspace.environment.id} filters={filters} initialList={list} initialDetail={detail} initialEventId={eventId} />
    </div>
  );
}
