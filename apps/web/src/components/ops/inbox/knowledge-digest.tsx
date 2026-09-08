import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { KnowledgeDigest as Digest } from "@/server/ops/inbox";
import { formatDateTime, formatRelative } from "./format";
import { StatList } from "./stat-list";

/** Helpful / not helpful votes per article; the share is shown only where votes exist (never an invented rate). */
export async function KnowledgeDigest({ digest, locale, now }: { digest: Digest; locale: string; now: string }) {
  const t = await getTranslations("opsInbox");
  const nowMs = Date.parse(now);
  if (!digest.available) return <EmptyState title={t("knowledge.unavailable")} description={t("knowledge.unavailableText")} />;
  const n = (v: number) => formatNumber(v, locale);
  if (digest.rows.length === 0) return <EmptyState title={t("knowledge.empty", { days: digest.windowDays })} description={t("knowledge.emptyText")} />;
  return (
    <div className="space-y-6">
      <StatList
        label={t("knowledge.totals.label", { days: digest.windowDays })}
        items={[
          { key: "votes", label: t("knowledge.totals.votes"), value: n(digest.totals.votes) },
          { key: "helpful", label: t("knowledge.totals.helpful"), value: n(digest.totals.helpful) },
          { key: "notHelpful", label: t("knowledge.totals.notHelpful"), value: n(digest.totals.notHelpful), tone: digest.totals.notHelpful > 0 ? "warn" : "neutral" },
          { key: "articles", label: t("knowledge.totals.articles"), value: n(digest.totals.articles) },
        ]}
      />
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("knowledge.caption")}>
          <THead>
            <Tr>
              <Th>{t("knowledge.columns.article")}</Th>
              <Th>{t("knowledge.columns.helpful")}</Th>
              <Th>{t("knowledge.columns.notHelpful")}</Th>
              <Th>{t("knowledge.columns.share")}</Th>
              <Th>{t("knowledge.columns.locales")}</Th>
              <Th>{t("knowledge.columns.last")}</Th>
              <Th>{t("knowledge.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {digest.rows.map((row) => (
              <Tr key={row.translationGroupId} data-testid="knowledge-digest-row">
                <Td label={t("knowledge.columns.article")}>
                  {row.title ? <p className="font-medium text-ink">{row.title}</p> : <p className="text-ink-3">{t("knowledge.unknownArticle")}</p>}
                  <code className="text-xs text-ink-3 break-all">{row.translationGroupId}</code>
                </Td>
                <Td label={t("knowledge.columns.helpful")} numeric>
                  {n(row.helpful)}
                </Td>
                <Td label={t("knowledge.columns.notHelpful")} numeric className={row.notHelpful > 0 ? "font-medium text-warn" : undefined}>
                  {n(row.notHelpful)}
                </Td>
                <Td label={t("knowledge.columns.share")} numeric>
                  {row.helpfulShare === null ? <span className="text-ink-3">{t("common.none")}</span> : formatNumber(row.helpfulShare / 100, locale, { style: "percent", maximumFractionDigits: 0 })}
                </Td>
                <Td label={t("knowledge.columns.locales")} numeric>
                  {n(row.locales)}
                </Td>
                <Td label={t("knowledge.columns.last")} className="whitespace-nowrap text-ink-2">
                  {row.lastVoteAt ? (
                    <>
                      <time dateTime={row.lastVoteAt}>{formatDateTime(row.lastVoteAt, locale)}</time>
                      <p className="text-xs text-ink-3">{formatRelative(row.lastVoteAt, locale, nowMs)}</p>
                    </>
                  ) : (
                    t("common.none")
                  )}
                </Td>
                <Td label={t("knowledge.columns.actions")}>
                  {row.href ? (
                    <a href={row.href} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label={t("knowledge.openArticleLabel", { title: row.title ?? row.translationGroupId })}>
                      {t("knowledge.openArticle")} <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
