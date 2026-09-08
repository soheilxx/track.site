import { getTranslations } from "next-intl/server";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/app/alerts/format";
import { formatNumber } from "@/lib/format";
import { ACTIVITY_WINDOW_DAYS, healthTone, type SiteView } from "@/server/ops/organisations";
import { SNIPPET_TONE, environmentKindLabel, siteStatusLabel, snippetLabel } from "./labels";

/** Sites with domains, health and one row per environment: published configuration, last event, 7-day volume and snippet state. */
export async function SitesTable({ sites, locale, now }: { sites: SiteView[]; locale: string; now: string }) {
  const t = await getTranslations("opsOrganisations.detail.sites");
  const tAll = await getTranslations("opsOrganisations");
  const tc = await getTranslations("opsOrganisations.common");
  const nowMs = Date.parse(now);
  if (sites.length === 0) return <p className="text-sm text-ink-3">{t("empty")}</p>;
  return (
    <div className="space-y-4">
      {sites.map((site) => (
        <section key={site.id} aria-labelledby={`site-${site.id}`} className="rounded-[var(--radius-card)] border border-line bg-surface">
          <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 id={`site-${site.id}`} className="text-sm font-semibold text-ink">
                {site.name} <code className="ml-1 text-xs font-normal text-ink-3">{site.trackingId}</code>
              </h3>
              <p className="text-xs text-ink-3">
                {site.primaryDomain ?? tc("none")} · {site.domains.total ? t("domains", { verified: site.domains.verified, total: site.domains.total }) : t("noDomains")} · {site.platform}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={site.status === "active" ? "ok" : site.status === "paused" ? "warn" : "neutral"}>{siteStatusLabel(tAll, site.status)}</Badge>
              {site.killSwitch ? <Badge tone="bad">{t("killSwitch")}</Badge> : null}
              {site.healthScore == null ? (
                <span className="text-xs text-ink-3">{tc("notMeasured")}</span>
              ) : (
                <Status tone={healthTone(site.healthScore)} indicator="both" className="text-xs">
                  {t("health", { score: formatNumber(site.healthScore, locale) })}
                </Status>
              )}
            </div>
          </div>
          {site.environments.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-3">{t("noEnvironments")}</p>
          ) : (
            <div className="px-2 py-2 sm:px-3">
              <Table caption={t("caption")}>
                <THead>
                  <Tr>
                    <Th>{t("environment")}</Th>
                    <Th>{t("config")}</Th>
                    <Th>{t("lastEvent")}</Th>
                    <Th className="text-right">{t("events7d")}</Th>
                    <Th>{t("snippet")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {site.environments.map((env) => (
                    <Tr key={env.id}>
                      <Td label={t("environment")}>
                        <p className="text-ink">
                          {environmentKindLabel(tAll, env.kind)}
                          {env.name !== environmentKindLabel(tAll, env.kind) ? <span className="text-ink-3"> · {env.name}</span> : null}
                        </p>
                        <p className="text-xs text-ink-3">
                          {env.isDefault ? t("default") : null}
                          {env.isDefault && env.testMode ? " · " : null}
                          {env.testMode ? t("testMode") : null}
                        </p>
                      </Td>
                      <Td label={t("config")}>
                        {env.activeVersion == null ? (
                          <span className="text-ink-3">{t("noConfig")}</span>
                        ) : (
                          <>
                            <span className="font-mono text-ink">{t("version", { version: env.activeVersion })}</span>
                            {env.publishedAt ? <p className="text-xs text-ink-3">{t("publishedAt", { date: formatDateTime(env.publishedAt, locale) ?? "" })}</p> : null}
                          </>
                        )}
                      </Td>
                      <Td label={t("lastEvent")} className="whitespace-nowrap text-ink-2">
                        {env.lastEventAt ? (
                          <time dateTime={env.lastEventAt} title={formatDateTime(env.lastEventAt, locale) ?? undefined}>
                            {formatRelative(env.lastEventAt, locale, nowMs)}
                          </time>
                        ) : (
                          <span className="text-ink-3">{tAll("directory.noActivity", { days: ACTIVITY_WINDOW_DAYS })}</span>
                        )}
                      </Td>
                      <Td label={t("events7d")} numeric>
                        {formatNumber(env.events7d, locale)}
                      </Td>
                      <Td label={t("snippet")}>
                        <Status tone={SNIPPET_TONE[env.snippet] ?? "neutral"} indicator="both">
                          {snippetLabel(tAll, env.snippet)}
                        </Status>
                        {env.lastBrowserEventAt ? <p className="text-xs text-ink-3">{formatRelative(env.lastBrowserEventAt, locale, nowMs)}</p> : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      ))}
      <p className="text-xs text-ink-3">{t("snippetHelp", { days: ACTIVITY_WINDOW_DAYS })}</p>
    </div>
  );
}
