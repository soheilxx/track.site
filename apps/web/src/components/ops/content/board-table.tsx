import { getTranslations } from "next-intl/server";
import { Badge, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS, labelFor, topicLabel } from "@/lib/knowledge";
import { formatNumber } from "@/lib/format";
import { REVIEW_STALE_DAYS, type ContentGroup, type EditorialBoard } from "@/server/ops/content";
import { formatDay, formatRelative } from "./format";
import { LiveLink } from "./live-link";
import { Panel } from "./section";
import { STATUS_TONE } from "./tones";

/** One row per translation group: status chip per locale, last review, flags and the live link. */
export async function BoardTable({ board, groups, filtered, locale, now }: { board: EditorialBoard; groups: ContentGroup[]; filtered: boolean; locale: string; now: string }) {
  const t = await getTranslations("opsContent");
  const nowMs = Date.parse(now);
  const n = (v: number) => formatNumber(v, locale);
  if (board.groups.length === 0) return <EmptyState title={t("board.empty")} description={t("board.emptyText")} />;
  if (groups.length === 0) return <EmptyState title={t("board.emptyFiltered")} description={t("board.emptyFilteredText")} />;
  const codes = (locales: readonly string[]) => locales.map((l) => l.toUpperCase()).join(", ");
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-3" aria-live="polite">
        {filtered ? t("board.countFiltered", { count: n(groups.length) }) : t("board.count", { count: n(groups.length) })}
      </p>
      <Panel>
        <Table caption={t("board.caption")}>
          <THead>
            <Tr>
              <Th>{t("board.columns.article")}</Th>
              <Th>{t("board.columns.locales")}</Th>
              <Th>{t("board.columns.reviewed")}</Th>
              <Th>{t("board.columns.flags")}</Th>
              <Th>{t("board.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {groups.map((g) => (
              <Tr key={g.translationGroupId} data-testid="content-board-row">
                <Td label={t("board.columns.article")} className="min-w-[16rem]">
                  <p className="font-medium text-ink">{g.title}</p>
                  <code className="text-xs break-all text-ink-3">{g.translationGroupId}</code>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                    <span>{topicLabel(g.topic, locale)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{labelFor(CONTENT_TYPE_LABELS[g.contentType], locale)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{labelFor(LEVEL_LABELS[g.level], locale)}</span>
                    {g.featured ? <Badge tone="primary">{t("flags.featured")}</Badge> : null}
                  </p>
                </Td>
                <Td label={t("board.columns.locales")}>
                  <ul className="flex flex-wrap gap-1.5" aria-label={t("board.columns.locales")}>
                    {board.locales.map((l) => {
                      const v = g.versions[l];
                      const status = v?.status ?? "missing";
                      return (
                        <li key={l}>
                          <Status tone={STATUS_TONE[status]} chip>
                            {l.toUpperCase()} · {t(`status.${status}`)}
                          </Status>
                        </li>
                      );
                    })}
                  </ul>
                </Td>
                <Td label={t("board.columns.reviewed")} className="whitespace-nowrap text-ink-2">
                  {g.lastReviewedAt ? (
                    <>
                      <time dateTime={g.lastReviewedAt}>{formatDay(g.lastReviewedAt, locale)}</time>
                      <p className="text-xs text-ink-3">{formatRelative(g.lastReviewedAt, locale, nowMs)}</p>
                    </>
                  ) : (
                    <span className="text-warn">{t("flags.neverReviewed")}</span>
                  )}
                </Td>
                <Td label={t("board.columns.flags")}>
                  {g.attention ? (
                    <ul className="flex flex-col gap-1 text-sm">
                      {!g.complete ? (
                        <li>
                          <Status tone="bad" indicator="icon">
                            {t("flags.incomplete")}
                            {g.missing.length ? <span className="text-ink-2"> ({t("status.missing")}: {codes(g.missing)})</span> : null}
                          </Status>
                        </li>
                      ) : null}
                      {g.staleReviews.length ? (
                        <li>
                          <Status tone="warn" indicator="icon">
                            {t("flags.stale", { days: REVIEW_STALE_DAYS })} <span className="text-ink-2">({codes(g.staleReviews)})</span>
                          </Status>
                        </li>
                      ) : null}
                      {g.missingTakeaways.length ? (
                        <li>
                          <Status tone="warn" indicator="icon">
                            {t("flags.takeaways")} <span className="text-ink-2">({codes(g.missingTakeaways)})</span>
                          </Status>
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <Status tone="ok" indicator="icon">
                      {t("common.ok")}
                    </Status>
                  )}
                </Td>
                <Td label={t("board.columns.actions")}>
                  {g.href ? (
                    <LiveLink href={g.href} label={t("board.openLabel", { title: g.title })}>
                      {t("common.openLive")}
                    </LiveLink>
                  ) : (
                    <span className="text-ink-3">{t("common.none")}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
