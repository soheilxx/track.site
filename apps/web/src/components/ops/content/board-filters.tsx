import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";
import { TOPIC_IDS, topicLabel } from "@/lib/knowledge";
import { BOARD_VIEWS, boardFiltered, boardQueryString, type BoardFilters } from "@/server/ops/content";

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-9 items-center rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
    active ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
  );

/** Board filters as links (URL state, no client JS): one row of views, one row of topics; the active chip carries `aria-current`. */
export async function BoardFilters({ filters, locale }: { filters: BoardFilters; locale: string }) {
  const t = await getTranslations("opsContent.board.filters");
  const base = "/ops/content";
  return (
    <div className="space-y-3" role="group" aria-label={t("legend")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("view")}</span>
        <ul className="flex flex-wrap gap-2">
          {BOARD_VIEWS.map((view) => {
            const active = filters.view === view;
            return (
              <li key={view}>
                <Link href={`${base}${boardQueryString({ ...filters, view })}`} aria-current={active ? "true" : undefined} className={chip(active)}>
                  {t(`views.${view}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("topic")}</span>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href={`${base}${boardQueryString({ ...filters, topic: null })}`} aria-current={filters.topic === null ? "true" : undefined} className={chip(filters.topic === null)}>
              {t("allTopics")}
            </Link>
          </li>
          {TOPIC_IDS.map((topic) => {
            const active = filters.topic === topic;
            return (
              <li key={topic}>
                <Link href={`${base}${boardQueryString({ ...filters, topic })}`} aria-current={active ? "true" : undefined} className={chip(active)}>
                  {topicLabel(topic, locale)}
                </Link>
              </li>
            );
          })}
        </ul>
        {boardFiltered(filters) ? (
          <Link href={base} className="inline-flex min-h-9 items-center rounded-sm px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
            {t("reset")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
