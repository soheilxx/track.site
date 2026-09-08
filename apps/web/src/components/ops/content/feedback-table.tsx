import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { ContentFeedback, VoteCounts } from "@/server/ops/content";
import { formatDateTime, formatRelative } from "./format";
import { LiveLink } from "./live-link";
import { Panel } from "./section";
import { StatList } from "./stats";

/** Helpful / not helpful votes per article, all-time and recent, split by locale; a share is shown only where votes exist. */
export async function FeedbackTable({ feedback, locale, now }: { feedback: ContentFeedback; locale: string; now: string }) {
  const t = await getTranslations("opsContent");
  const nowMs = Date.parse(now);
  const n = (v: number) => formatNumber(v, locale);
  const share = (v: VoteCounts) => (v.helpfulShare === null ? <span className="text-ink-3">{t("common.none")}</span> : formatNumber(v.helpfulShare / 100, locale, { style: "percent", maximumFractionDigits: 0 }));
  const cell = (v: VoteCounts) => t("feedback.cell", { helpful: n(v.helpful), notHelpful: n(v.notHelpful) });
  if (!feedback.available) return <EmptyState title={t("feedback.unavailable")} description={t("feedback.unavailableText")} />;
  const inbox = (
    <Link href="/ops/inbox/knowledge" className={buttonVariants({ variant: "secondary", size: "sm" })}>
      {t("feedback.inboxLink")}
    </Link>
  );
  if (feedback.rows.length === 0) return <EmptyState title={t("feedback.empty")} description={t("feedback.emptyText")} action={inbox} />;
  const { totals } = feedback;
  return (
    <div className="space-y-6">
      <StatList
        label={t("feedback.totals.label")}
        items={[
          { key: "votes", label: t("feedback.totals.votes"), value: n(totals.allTime.total) },
          { key: "helpful", label: t("feedback.totals.helpful"), value: n(totals.allTime.helpful) },
          { key: "notHelpful", label: t("feedback.totals.notHelpful"), value: n(totals.allTime.notHelpful), tone: totals.allTime.notHelpful > 0 ? "warn" : "neutral" },
          { key: "share", label: t("feedback.totals.share"), value: share(totals.allTime) },
          { key: "recent", label: t("feedback.totals.recentVotes", { days: feedback.windowDays }), value: n(totals.recent.total) },
          { key: "articles", label: t("feedback.totals.articles"), value: n(totals.articlesWithVotes) },
          { key: "withoutVotes", label: t("feedback.totals.withoutVotes"), value: n(totals.publishedWithoutVotes) },
        ]}
      />
      <div className="flex justify-end">{inbox}</div>
      <Panel>
        <Table caption={t("feedback.caption")}>
          <THead>
            <Tr>
              <Th>{t("feedback.columns.article")}</Th>
              <Th>{t("feedback.columns.allTime")}</Th>
              <Th>{t("feedback.columns.recent", { days: feedback.windowDays })}</Th>
              <Th className="text-right">{t("feedback.columns.share")}</Th>
              <Th>{t("feedback.columns.byLocale")}</Th>
              <Th>{t("feedback.columns.last")}</Th>
              <Th>{t("feedback.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {feedback.rows.map((row) => (
              <Tr key={row.translationGroupId} data-testid="content-feedback-row">
                <Td label={t("feedback.columns.article")}>
                  {row.title ? <p className="font-medium text-ink">{row.title}</p> : <p className="text-ink-3">{t("feedback.unknownArticle")}</p>}
                  <code className="text-xs break-all text-ink-3">{row.translationGroupId}</code>
                </Td>
                <Td label={t("feedback.columns.allTime")} className={row.allTime.notHelpful > 0 ? "text-warn" : undefined}>
                  {cell(row.allTime)}
                </Td>
                <Td label={t("feedback.columns.recent", { days: feedback.windowDays })}>{row.recent.total > 0 ? cell(row.recent) : <span className="text-ink-3">{t("common.none")}</span>}</Td>
                <Td label={t("feedback.columns.share")} numeric>
                  {share(row.allTime)}
                </Td>
                <Td label={t("feedback.columns.byLocale")}>
                  <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
                    {(Object.entries(row.byLocale) as Array<[string, VoteCounts]>).map(([l, v]) => (
                      <li key={l}>
                        <span className="font-medium text-ink">{l.toUpperCase()}</span> {cell(v)}
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td label={t("feedback.columns.last")} className="whitespace-nowrap text-ink-2">
                  {row.lastVoteAt ? (
                    <>
                      <time dateTime={row.lastVoteAt}>{formatDateTime(row.lastVoteAt, locale)}</time>
                      <p className="text-xs text-ink-3">{formatRelative(row.lastVoteAt, locale, nowMs)}</p>
                    </>
                  ) : (
                    t("common.none")
                  )}
                </Td>
                <Td label={t("feedback.columns.actions")}>
                  {row.href ? (
                    <LiveLink href={row.href} label={t("board.openLabel", { title: row.title ?? row.translationGroupId })}>
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
