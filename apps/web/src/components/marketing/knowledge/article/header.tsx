import { Badge, Breadcrumbs } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { CONTENT_TYPE_LABELS, KNOWLEDGE_NAME, KNOWLEDGE_PATH, LEVEL_LABELS, labelFor, topicLabel, type ArticleMeta } from "@/lib/knowledge";
import { formatArticleDate, readingTimeLabel } from "@/lib/knowledge-article";
import type { KnowledgeArticleCopy } from "@/lib/marketing-copy/knowledge-article";

/**
 * Article head (supplement §6): breadcrumbs (Track → Tracking Knowledge → topic → article), topic,
 * content type and level, the title, the intro (front-matter description), the responsible editor
 * and the published / updated / last-reviewed dates plus the reading time as a definition list.
 * Calm editorial typography: display face for the title, no decorative rules, no raw tags.
 */
export function ArticleHeader({ article, locale, copy, editorName }: { article: ArticleMeta; locale: string; copy: KnowledgeArticleCopy; editorName: string }) {
  const topic = topicLabel(article.topic, locale);
  const dates: Array<{ label: string; iso: string }> = [{ label: copy.meta.published, iso: article.publishedAt }];
  if (article.updatedAt) dates.push({ label: copy.meta.updated, iso: article.updatedAt });
  if (article.reviewedAt) dates.push({ label: copy.meta.reviewed, iso: article.reviewedAt });
  return (
    <div>
      <Breadcrumbs
        label={copy.breadcrumbs.label}
        linkComponent={Link}
        items={[
          { label: copy.breadcrumbs.home, href: "/" },
          { label: KNOWLEDGE_NAME, href: KNOWLEDGE_PATH },
          { label: topic, href: `${KNOWLEDGE_PATH}?topic=${article.topic}` },
          { label: article.title },
        ]}
      />
      <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-3">
        <Badge tone="primary">{topic}</Badge>
        <span>{labelFor(CONTENT_TYPE_LABELS[article.contentType], locale)}</span>
        <span aria-hidden="true">·</span>
        <span>{labelFor(LEVEL_LABELS[article.level], locale)}</span>
      </div>
      <h1 className="mt-4 max-w-4xl font-display text-h1 font-semibold text-ink">{article.title}</h1>
      <p className="mt-5 max-w-text text-lg text-ink-2">{article.description}</p>
      <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-small text-ink-3">
        <div className="flex gap-1.5">
          <dt>{copy.meta.by}</dt>
          <dd className="font-medium text-ink-2">{editorName}</dd>
        </div>
        {dates.map((d) => (
          <div key={d.label} className="flex gap-1.5">
            <dt>{d.label}</dt>
            <dd>
              <time dateTime={d.iso} className="text-ink-2">
                {formatArticleDate(locale, d.iso)}
              </time>
            </dd>
          </div>
        ))}
        <div className="flex gap-1.5">
          <dt className="sr-only">{copy.meta.readingTime}</dt>
          <dd className="text-ink-2">{readingTimeLabel(copy.meta.minutes, article.readingMinutes)}</dd>
        </div>
      </dl>
    </div>
  );
}
