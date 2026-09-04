import { ArrowRight } from "lucide-react";
import { Badge, Breadcrumbs, Container, buttonVariants, cn, type LinkRenderer } from "@track-site/ui";
import { MarketingSection, SectionHeading } from "@/components/marketing/features/section";
import { IntegrationGlyph } from "@/components/marketing/integrations/glyph";
import { Link } from "@/i18n/navigation";
import { KNOWLEDGE_NAME, KNOWLEDGE_PATH, articlePath, type ArticleMeta, type LearningPathWithArticles } from "@/lib/knowledge";
import type { KnowledgeHubCopy } from "@/lib/marketing-copy/knowledge";
import { Cover, TopicGlyph } from "../cover";
import { HubDirectory } from "./directory";
import { HubSearch } from "./search-box";
import { formatHubDate, readingLabel, type GuideLink, type TopicWorld } from "./server";
import { plural, fill } from "./text";
import type { HubLabels } from "./types";

/*
 * Server-rendered sections of the Tracking Knowledge hub (supplement §6 "Neue Knowledge-Übersicht"):
 * hero with the search island, one large featured story, topic worlds + learning paths, platform and
 * shop-system guides, "newly published" / "recently updated", the directory frame and a restrained
 * product CTA. Layouts alternate on purpose (docs/12 §4): panel, hairline grid, numbered lists, pill
 * links, two-column lists, sidebar directory — no repeated card grid.
 */
const eyebrowClass = "text-micro font-semibold tracking-wide text-primary uppercase";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const stretched = "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";
const rowHover = "transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2/60 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-primary";

/** next-intl's <Link> as the breadcrumb link renderer (locale prefix added automatically). */
const BreadcrumbLink: LinkRenderer = ({ href, ...rest }) => <Link href={href} {...rest} />;

function articleDate(a: ArticleMeta, copy: KnowledgeHubCopy, locale: string) {
  const updated = !!a.updatedAt && a.updatedAt > a.publishedAt;
  const iso = updated ? a.updatedAt! : a.publishedAt;
  return { updated, iso, label: formatHubDate(locale, iso), prefix: updated ? copy.card.updated : copy.card.published };
}

/* ---------- 1. hero + search ---------- */

export function HubHero({ copy, corpus, topicCount, languages, formAction, rssHref }: { copy: KnowledgeHubCopy; corpus: number; topicCount: number; languages: string[]; formAction: string; rssHref: string }) {
  return (
    <section aria-labelledby="hub-title" className="relative overflow-hidden border-b border-line">
      <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <Container className="relative pt-8 pb-12 md:pt-12 md:pb-16">
        <Breadcrumbs className="mb-8" label={copy.breadcrumbs.label} linkComponent={BreadcrumbLink} items={[{ label: copy.breadcrumbs.home, href: "/" }, { label: KNOWLEDGE_NAME }]} />
        <p className={eyebrowClass}>{copy.hero.eyebrow}</p>
        <h1 id="hub-title" className="mt-3 font-display text-h1 font-semibold text-ink">
          {KNOWLEDGE_NAME}
        </h1>
        <p className="mt-5 max-w-text text-lg text-ink-2">{copy.hero.lead}</p>
        <div className="mt-8">
          <HubSearch action={formAction} />
        </div>
        <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-ink-3">
          <span className="tabular-nums">{plural(copy.hero.articles, corpus)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{plural(copy.hero.topics, topicCount)}</span>
          <span aria-hidden="true">·</span>
          <span>{languages.join(" · ")}</span>
          <a href="#directory" className={cn("inline-flex min-h-9 items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11", focusRing)}>
            {copy.hero.browse}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
          <a href={rssHref} className={cn("inline-flex min-h-9 items-center rounded-sm underline-offset-4 hover:text-ink hover:underline pointer-coarse:min-h-11", focusRing)}>
            {copy.hero.rss}
          </a>
        </p>
      </Container>
    </section>
  );
}

/* ---------- 2. featured story ---------- */

export function FeaturedStory({ article, locale, copy, labels }: { article: ArticleMeta; locale: string; copy: KnowledgeHubCopy; labels: HubLabels }) {
  const date = articleDate(article, copy, locale);
  return (
    <MarketingSection width="wide" labelledBy="featured-title">
      <article className={cn("relative grid overflow-hidden rounded-[var(--radius-panel-lg)] border border-line bg-surface shadow-card lg:grid-cols-12", rowHover)}>
        <div className="lg:col-span-7">
          <Cover topic={article.topic} groupId={article.translationGroupId} size="hero" className="h-full w-full" />
        </div>
        <div className="flex flex-col justify-center p-6 md:p-10 lg:col-span-5">
          <p className={eyebrowClass}>{copy.featured.eyebrow}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-ink-3">
            <Badge tone="primary">{labels.topics[article.topic]}</Badge>
            <span>{labels.types[article.contentType]}</span>
            <span aria-hidden="true">·</span>
            <span>{labels.levels[article.level]}</span>
          </div>
          <h2 id="featured-title" className="mt-3 font-display text-h2 font-semibold text-ink">
            <Link href={articlePath(article.slug)} className={stretched}>
              {article.title}
            </Link>
          </h2>
          <p className="mt-4 text-body text-ink-2 md:text-lg">{article.description}</p>
          <p className="mt-5 flex flex-wrap items-center gap-x-2 text-micro text-ink-3">
            <span>{readingLabel(copy, article.readingMinutes)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {date.prefix} <time dateTime={date.iso}>{date.label}</time>
            </span>
          </p>
          <span aria-hidden="true" className="mt-6 inline-flex items-center gap-1 text-small font-medium text-primary">
            {copy.featured.read}
            <ArrowRight className="size-4" />
          </span>
        </div>
      </article>
    </MarketingSection>
  );
}

/* ---------- 3. topic worlds + learning paths ---------- */

export function TopicWorlds({ topics, copy }: { topics: TopicWorld[]; copy: KnowledgeHubCopy }) {
  return (
    <MarketingSection tone="surface" labelledBy="topics-title">
      <SectionHeading id="topics-title" eyebrow={copy.topics.eyebrow} title={copy.topics.title} text={copy.topics.text} />
      <ul className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((t) => (
          <li key={t.id} className={cn("relative flex gap-4 bg-surface p-5 md:p-6", rowHover)}>
            <TopicGlyph topic={t.id} size={44} className="mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">
                <Link href={`${KNOWLEDGE_PATH}?topic=${t.id}`} className={stretched}>
                  {t.label}
                </Link>
              </h3>
              <p className="mt-1 text-small text-ink-2">{t.description}</p>
              <p className="mt-2 text-micro text-ink-3 tabular-nums">{plural(copy.topics.articles, t.count)}</p>
            </div>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

export function LearningPaths({ paths, copy, labels }: { paths: LearningPathWithArticles[]; copy: KnowledgeHubCopy; labels: HubLabels }) {
  if (paths.length === 0) return null;
  return (
    <MarketingSection labelledBy="paths-title">
      <SectionHeading id="paths-title" eyebrow={copy.paths.eyebrow} title={copy.paths.title} text={copy.paths.text} />
      <ul className="mt-10 grid gap-6 lg:grid-cols-2">
        {paths.map((p) => (
          <li key={p.id} className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 md:p-8">
            <h3 className="font-display text-h3 font-semibold text-ink">{p.title}</h3>
            {p.description ? <p className="mt-2 text-small text-ink-2">{p.description}</p> : null}
            <p className="mt-2 text-micro text-ink-3 tabular-nums">
              {plural(copy.paths.steps, p.articles.length)} · {fill(copy.paths.minutes, { n: p.readingMinutes })}
            </p>
            <ol className="mt-5 space-y-3">
              {p.articles.map((a, i) => (
                <li key={a.translationGroupId} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-xs font-bold text-primary tabular-nums">
                    {i + 1}
                  </span>
                  <span className="sr-only">{fill(copy.paths.step, { n: i + 1 })}</span>
                  <div className="min-w-0">
                    <Link href={articlePath(a.slug)} className={cn("inline-flex min-h-6 items-center rounded-sm font-medium text-ink underline-offset-4 hover:text-primary hover:underline pointer-coarse:min-h-11", focusRing)}>
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-micro text-ink-3">
                      {labels.types[a.contentType]} · {labels.levels[a.level]} · {readingLabel(copy, a.readingMinutes)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

/* ---------- 4. platform + shop-system guides ---------- */

function GuideGroup({ title, items, param, copy }: { title: string; items: GuideLink[]; param: "platform" | "shop"; copy: KnowledgeHubCopy }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((g) => (
          <li key={g.id}>
            <Link href={`${KNOWLEDGE_PATH}?${param}=${g.id}`} className={cn("inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-chip)] border border-line-2 bg-surface py-1 pr-3.5 pl-1.5 text-sm font-medium text-ink transition-[border-color,background-color] duration-[var(--motion-fast)] ease-out hover:border-ink-3 hover:bg-surface-2", focusRing)}>
              <IntegrationGlyph monogram={g.monogram} category={g.category} size="sm" />
              <span>{g.label}</span>
              <span className="text-xs text-ink-3 tabular-nums">{plural(copy.guides.articles, g.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlatformGuides({ platforms, shopSystems, copy }: { platforms: GuideLink[]; shopSystems: GuideLink[]; copy: KnowledgeHubCopy }) {
  if (platforms.length === 0 && shopSystems.length === 0) return null;
  return (
    <MarketingSection tone="surface" labelledBy="guides-title">
      <SectionHeading id="guides-title" eyebrow={copy.guides.eyebrow} title={copy.guides.title} text={copy.guides.text} />
      <div className="mt-10 grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        <GuideGroup title={copy.guides.platforms} items={platforms} param="platform" copy={copy} />
        <GuideGroup title={copy.guides.shopSystems} items={shopSystems} param="shop" copy={copy} />
      </div>
    </MarketingSection>
  );
}

/* ---------- 5. newly published + recently updated ---------- */

function FreshList({ items, locale, copy, labels }: { items: ArticleMeta[]; locale: string; copy: KnowledgeHubCopy; labels: HubLabels }) {
  return (
    <ol className="mt-5 border-t border-line">
      {items.map((a) => {
        const date = articleDate(a, copy, locale);
        return (
          <li key={a.translationGroupId} className={cn("relative grid grid-cols-[7.5rem_1fr] gap-4 border-b border-line py-4", rowHover)}>
            <time dateTime={date.iso} className="pt-0.5 text-micro text-ink-3 tabular-nums">
              {date.label}
            </time>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">
                <Link href={articlePath(a.slug)} className={stretched}>
                  {a.title}
                </Link>
              </h3>
              <p className="mt-1 text-micro text-ink-3">
                {labels.topics[a.topic]} · {readingLabel(copy, a.readingMinutes)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function FreshLists({ published, updated, locale, copy, labels }: { published: ArticleMeta[]; updated: ArticleMeta[]; locale: string; copy: KnowledgeHubCopy; labels: HubLabels }) {
  if (published.length === 0) return null;
  return (
    <MarketingSection labelledBy="fresh-new-title">
      <p className={eyebrowClass}>{copy.fresh.eyebrow}</p>
      <div className="mt-3 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="fresh-new-title" className="font-display text-h3 font-semibold text-ink">
            {copy.fresh.newTitle}
          </h2>
          <p className="mt-2 text-small text-ink-2">{copy.fresh.newText}</p>
          <FreshList items={published} locale={locale} copy={copy} labels={labels} />
        </div>
        <div>
          <h2 id="fresh-updated-title" className="font-display text-h3 font-semibold text-ink">
            {copy.fresh.updatedTitle}
          </h2>
          <p className="mt-2 text-small text-ink-2">{copy.fresh.updatedText}</p>
          {updated.length > 0 ? (
            <FreshList items={updated} locale={locale} copy={copy} labels={labels} />
          ) : (
            <p className="mt-5 rounded-[var(--radius-control)] border border-dashed border-line-2 px-4 py-5 text-small text-ink-3" role="status">
              {copy.fresh.updatedEmpty}
            </p>
          )}
        </div>
      </div>
    </MarketingSection>
  );
}

/* ---------- 6. directory frame ---------- */

export function DirectorySection({ copy }: { copy: KnowledgeHubCopy }) {
  return (
    <MarketingSection id="directory" tone="surface" labelledBy="directory-title" className="scroll-mt-20">
      <SectionHeading id="directory-title" eyebrow={copy.directory.eyebrow} title={copy.directory.title} text={copy.directory.text} />
      <div className="mt-10">
        <HubDirectory />
      </div>
    </MarketingSection>
  );
}

/* ---------- 7. restrained product CTA ---------- */

export function ProductCta({ copy }: { copy: KnowledgeHubCopy }) {
  return (
    <section aria-labelledby="hub-cta-title" className="border-t border-line">
      <Container className="py-12 md:py-16">
        <div className="flex flex-col gap-6 rounded-[var(--radius-panel)] border border-line bg-surface p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="max-w-text">
            <p className={eyebrowClass}>{copy.cta.eyebrow}</p>
            <h2 id="hub-cta-title" className="mt-2 font-display text-h3 font-semibold text-ink">
              {copy.cta.title}
            </h2>
            <p className="mt-2 text-small text-ink-2">{copy.cta.text}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              {copy.cta.primary}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/how-it-works" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              {copy.cta.secondary}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
