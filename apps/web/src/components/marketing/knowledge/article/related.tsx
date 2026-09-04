import { useId } from "react";
import { Badge, Container } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { LEVEL_LABELS, articlePath, labelFor, topicLabel, type ArticleMeta } from "@/lib/knowledge";
import { readingTimeLabel } from "@/lib/knowledge-article";

/**
 * Related articles (ranked by `rankRelated` in lib/knowledge-article.ts: same topic, then shared
 * tags; same locale; published only) as a ruled list — topic, title, excerpt, level and reading time.
 * Omitted when nothing is related. Hidden in print.
 */
export function RelatedArticles({ heading, items, locale, minutesTemplate }: { heading: string; items: ArticleMeta[]; locale: string; minutesTemplate: string }) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} data-article-related="" data-print="hide" className="border-t border-line bg-surface">
      <Container className="py-12 md:py-16">
        <h2 id={id} className="font-display text-h2 font-semibold text-ink">
          {heading}
        </h2>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {items.map((a) => (
            <li key={a.translationGroupId}>
              <Link href={articlePath(a.slug)} className="group grid gap-2 py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
                <span className="flex flex-wrap items-start gap-2">
                  <Badge tone="primary">{topicLabel(a.topic, locale)}</Badge>
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{a.title}</span>
                  <span className="mt-1 block text-small text-ink-2">{a.excerpt}</span>
                  <span className="mt-2 block text-micro text-ink-3">
                    {labelFor(LEVEL_LABELS[a.level], locale)} · {readingTimeLabel(minutesTemplate, a.readingMinutes)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
