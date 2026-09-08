import { getTranslations } from "next-intl/server";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { LOCALE_NAMES } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { ContentFreshness } from "@/server/ops/content";
import { formatDateTime, formatDay, formatRelative } from "./format";
import { LiveLink } from "./live-link";
import { ContentSection, Panel } from "./section";

/** Last build (id + file time) and, per locale, the counts the static sitemap and feed routes would render now. */
export async function Freshness({ freshness, locale, now }: { freshness: ContentFreshness; locale: string; now: string }) {
  const t = await getTranslations("opsContent");
  const nowMs = Date.parse(now);
  const n = (v: number) => formatNumber(v, locale);
  const build = freshness.build;
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <ContentSection id="build" title={t("freshness.build.title")}>
          {build ? (
            <Panel className="px-4 py-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-ink-3">{t("freshness.build.id")}</dt>
                  <dd className="mt-0.5 break-all font-mono text-ink">{build.id}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-ink-3">{t("freshness.build.builtAt")}</dt>
                  <dd className="mt-0.5 text-ink">
                    <time dateTime={build.builtAt}>{formatDateTime(build.builtAt, locale)}</time>
                    <p className="text-xs text-ink-3">{formatRelative(build.builtAt, locale, nowMs)}</p>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-ink-3">{t("freshness.build.runtime")}</dt>
                  <dd className="mt-0.5">
                    <Status tone={freshness.runtime === "production" ? "ok" : "neutral"}>{t(`freshness.build.runtimes.${freshness.runtime}`)}</Status>
                  </dd>
                </div>
              </dl>
            </Panel>
          ) : (
            <EmptyState title={t("freshness.build.none")} description={t("freshness.build.noneText")} />
          )}
        </ContentSection>
        <ContentSection id="index" title={t("freshness.index.title")}>
          <Panel className="px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-ink-2">
                <code className="text-ink">{freshness.sitemapIndexHref}</code> · {t("freshness.index.sitemaps", { count: n(freshness.sitemapCount) })}
              </p>
              <LiveLink href={freshness.sitemapIndexHref}>{t("freshness.index.open")}</LiveLink>
            </div>
          </Panel>
        </ContentSection>
      </div>
      <Panel>
        <Table caption={t("freshness.caption")}>
          <THead>
            <Tr>
              <Th>{t("freshness.columns.locale")}</Th>
              <Th className="text-right">{t("freshness.columns.knowledgeUrls")}</Th>
              <Th className="text-right">{t("freshness.columns.pageUrls")}</Th>
              <Th>{t("freshness.columns.newestPublished")}</Th>
              <Th>{t("freshness.columns.newestUpdated")}</Th>
              <Th className="text-right">{t("freshness.columns.unpublished")}</Th>
              <Th>{t("freshness.columns.links")}</Th>
            </Tr>
          </THead>
          <TBody>
            {freshness.locales.map((row) => (
              <Tr key={row.locale} data-testid="content-freshness-row">
                <Td label={t("freshness.columns.locale")}>
                  <span className="font-medium text-ink">{LOCALE_NAMES[row.locale]}</span> <code className="text-xs text-ink-3">{row.locale}</code>
                </Td>
                <Td label={t("freshness.columns.knowledgeUrls")} numeric>
                  {n(row.knowledgeUrls)}
                </Td>
                <Td label={t("freshness.columns.pageUrls")} numeric>
                  {n(row.pageUrls)}
                </Td>
                <Td label={t("freshness.columns.newestPublished")} className="whitespace-nowrap text-ink-2">
                  {row.newestPublishedAt ? <time dateTime={row.newestPublishedAt}>{formatDay(row.newestPublishedAt, locale)}</time> : t("common.none")}
                </Td>
                <Td label={t("freshness.columns.newestUpdated")} className="whitespace-nowrap text-ink-2">
                  {row.newestUpdatedAt ? <time dateTime={row.newestUpdatedAt}>{formatDay(row.newestUpdatedAt, locale)}</time> : t("common.none")}
                </Td>
                <Td label={t("freshness.columns.unpublished")} numeric className={row.unpublishedVersions > 0 ? "text-warn" : undefined}>
                  {n(row.unpublishedVersions)}
                </Td>
                <Td label={t("freshness.columns.links")}>
                  <div className="flex flex-wrap gap-1.5">
                    <LiveLink href={row.hubHref} label={`${t("freshness.openHub")} ${LOCALE_NAMES[row.locale]}`}>
                      {t("freshness.openHub")}
                    </LiveLink>
                    <LiveLink href={row.feedHref} label={`${t("freshness.openFeed")} ${LOCALE_NAMES[row.locale]}`}>
                      {t("freshness.openFeed")}
                    </LiveLink>
                    <LiveLink href={row.sitemapHref} label={`${t("freshness.openSitemap")} ${LOCALE_NAMES[row.locale]}`}>
                      {t("freshness.openSitemap")}
                    </LiveLink>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
