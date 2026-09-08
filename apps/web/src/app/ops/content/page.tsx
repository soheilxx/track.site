import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BoardFilters } from "@/components/ops/content/board-filters";
import { BoardSummary } from "@/components/ops/content/board-summary";
import { BoardTable } from "@/components/ops/content/board-table";
import { formatDateTime } from "@/components/ops/content/format";
import { ContentHeader } from "@/components/ops/content/header";
import { Footnote } from "@/components/ops/content/section";
import { ContentSubnav } from "@/components/ops/content/subnav";
import { OpsForbidden, opsPageMetadata } from "@/components/ops/shell";
import { REVIEW_STALE_DAYS, boardFiltered, filterGroups, loadEditorialBoard, parseBoardFilters } from "@/server/ops/content";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("content");
}

/**
 * Track Operations → Content (docs/17, task O10): the Tracking Knowledge editorial board. Everything comes from
 * the article front matter in git — status per locale, review dates, takeaways — so the page is read-only,
 * involves no tenant data and needs neither a break-glass grant nor a page-view audit entry. Filters live in
 * the URL. The other sections (reader feedback, learning paths, sitemaps and feeds, integration coverage) are
 * sibling routes reachable from the section nav.
 */
export default async function OpsContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const filters = parseBoardFilters(await searchParams);
  const [t, locale] = await Promise.all([getTranslations("opsContent"), platformLocale(ctx.user)]);
  const board = await loadEditorialBoard(locale);
  const groups = filterGroups(board.groups, filters);
  return (
    <div className="space-y-6">
      <ContentHeader section="board" intro={t("intro")} locale={locale} />
      <ContentSubnav current="board" />
      <p className="max-w-3xl text-sm text-ink-3">{t("board.intro", { days: REVIEW_STALE_DAYS })}</p>
      <BoardSummary board={board} locale={locale} />
      <BoardFilters filters={filters} locale={locale} />
      <BoardTable board={board} groups={groups} filtered={boardFiltered(filters)} locale={locale} now={board.generatedAt} />
      <Footnote>{t("common.generatedAt", { time: formatDateTime(board.generatedAt, locale) ?? board.generatedAt })}</Footnote>
    </div>
  );
}
