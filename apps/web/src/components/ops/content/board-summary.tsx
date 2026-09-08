import { getTranslations } from "next-intl/server";
import { TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { LOCALE_NAMES } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { EditorialBoard } from "@/server/ops/content";
import { formatDay } from "./format";
import { ContentSection, Panel } from "./section";
import { StatList } from "./stats";

/** Board totals and the per-locale version counts; every number is counted from the front matter. */
export async function BoardSummary({ board, locale }: { board: EditorialBoard; locale: string }) {
  const t = await getTranslations("opsContent");
  const n = (v: number) => formatNumber(v, locale);
  const { totals } = board;
  const unpublished = totals.versions.draft + totals.versions.translated + totals.versions.reviewed;
  return (
    <div className="space-y-6">
      <StatList
        label={t("board.totals.label")}
        items={[
          { key: "groups", label: t("board.totals.groups"), value: n(totals.groups) },
          { key: "complete", label: t("board.totals.complete"), value: n(totals.complete), tone: totals.groups > 0 && totals.complete === totals.groups ? "ok" : "neutral" },
          { key: "attention", label: t("board.totals.attention"), value: n(totals.attention), tone: totals.attention > 0 ? "warn" : "ok" },
          { key: "published", label: t("board.totals.published"), value: n(totals.versions.published) },
          { key: "unpublished", label: t("board.totals.unpublished"), value: n(unpublished) },
          { key: "missing", label: t("board.totals.missingVersions"), value: n(totals.missingVersions), tone: totals.missingVersions > 0 ? "bad" : "ok" },
          { key: "takeaways", label: t("board.totals.missingTakeaways"), value: n(totals.missingTakeaways), tone: totals.missingTakeaways > 0 ? "warn" : "ok" },
          { key: "stale", label: t("board.totals.staleReviews"), value: n(totals.staleReviews), tone: totals.staleReviews > 0 ? "warn" : "ok" },
        ]}
      />
      <ContentSection id="per-locale" title={t("board.perLocale.title")}>
        <Panel>
          <Table caption={t("board.perLocale.caption")}>
            <THead>
              <Tr>
                <Th>{t("board.perLocale.columns.locale")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.published")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.reviewed")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.translated")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.draft")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.missing")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.takeaways")}</Th>
                <Th className="text-right">{t("board.perLocale.columns.stale")}</Th>
                <Th>{t("board.perLocale.columns.lastReviewed")}</Th>
              </Tr>
            </THead>
            <TBody>
              {board.perLocale.map((row) => (
                <Tr key={row.locale} data-testid="content-locale-row">
                  <Td label={t("board.perLocale.columns.locale")}>
                    <span className="font-medium text-ink">{LOCALE_NAMES[row.locale]}</span> <code className="text-xs text-ink-3">{row.locale}</code>
                  </Td>
                  <Td label={t("board.perLocale.columns.published")} numeric>
                    {n(row.counts.published)}
                  </Td>
                  <Td label={t("board.perLocale.columns.reviewed")} numeric>
                    {n(row.counts.reviewed)}
                  </Td>
                  <Td label={t("board.perLocale.columns.translated")} numeric>
                    {n(row.counts.translated)}
                  </Td>
                  <Td label={t("board.perLocale.columns.draft")} numeric>
                    {n(row.counts.draft)}
                  </Td>
                  <Td label={t("board.perLocale.columns.missing")} numeric className={row.missing > 0 ? "font-medium text-bad" : undefined}>
                    {n(row.missing)}
                  </Td>
                  <Td label={t("board.perLocale.columns.takeaways")} numeric className={row.missingTakeaways > 0 ? "font-medium text-warn" : undefined}>
                    {n(row.missingTakeaways)}
                  </Td>
                  <Td label={t("board.perLocale.columns.stale")} numeric className={row.staleReviews > 0 ? "font-medium text-warn" : undefined}>
                    {n(row.staleReviews)}
                  </Td>
                  <Td label={t("board.perLocale.columns.lastReviewed")} className="whitespace-nowrap text-ink-2">
                    {row.lastReviewedAt ? <time dateTime={row.lastReviewedAt}>{formatDay(row.lastReviewedAt, locale)}</time> : t("common.never")}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      </ContentSection>
    </div>
  );
}
