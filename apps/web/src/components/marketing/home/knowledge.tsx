import { ArrowRight } from "lucide-react";
import { Badge } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { KNOWLEDGE_PATH, LEVEL_LABELS, articlePath, labelFor, listArticles, topicLabel, type ArticleMeta } from "@/lib/knowledge";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { fill } from "@/components/marketing/demo/text";
import { HomeSection } from "./section";

/** Topics shown first when they are published in the locale; the newest published articles fill the remaining slots. */
const PREFERRED = ["server-side-tracking-explained", "meta-conversions-api-deduplication", "consent-mode-v2-guide"];
const COUNT = 3;

async function selectArticles(locale: string): Promise<ArticleMeta[]> {
  const published = await listArticles(locale);
  const preferred = PREFERRED.map((id) => published.find((a) => a.translationGroupId === id)).filter((a): a is ArticleMeta => !!a);
  const rest = published.filter((a) => !preferred.includes(a));
  return [...preferred, ...rest].slice(0, COUNT);
}

/** Selected Tracking Knowledge articles (real, published posts from the knowledge loader). */
export async function HomeKnowledge({ copy, locale }: { copy: HomeCopy; locale: string }) {
  const c = copy.knowledge;
  const articles = await selectArticles(locale);
  if (articles.length === 0) return null;
  return (
    <HomeSection id="knowledge" eyebrow={c.eyebrow} title={c.title} text={c.text} tone="surface">
      <ul className="grid gap-8 md:grid-cols-3 md:gap-6">
        {articles.map((a) => (
          <li key={a.translationGroupId} className="flex flex-col border-t border-line-2 pt-5">
            <div className="flex flex-wrap items-center gap-2 text-micro text-ink-3">
              <Badge tone="primary">{topicLabel(a.topic, locale)}</Badge>
              <span>{labelFor(LEVEL_LABELS[a.level], locale)}</span>
              <span aria-hidden="true">·</span>
              <span>{fill(c.minutes, { n: a.readingMinutes })}</span>
            </div>
            <h3 className="mt-3 font-display text-h3 font-semibold text-ink">
              <Link href={articlePath(a.slug)} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {a.title}
              </Link>
            </h3>
            <p className="mt-2 text-small text-ink-2">{a.description}</p>
          </li>
        ))}
      </ul>
      <Link href={KNOWLEDGE_PATH} className="mt-8 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline">
        {c.all} <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </HomeSection>
  );
}
