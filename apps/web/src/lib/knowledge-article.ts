import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { compileMDX, type MDXRemoteProps } from "next-mdx-remote/rsc";
import type { ReactElement } from "react";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { ALL_LOCALES, type AppLocale } from "@/i18n/routing";
import type { ArticleMeta, ContentType, TopicId } from "@/lib/knowledge";
import type { KnowledgeCtaKey } from "@/lib/marketing-copy/knowledge-article";

/**
 * Article-template helpers for Tracking Knowledge (redesign supplement §6 "Neues Artikeltemplate"):
 * the MDX pipeline with heading extraction for the table of contents, the extra front-matter fields
 * the template renders (key takeaways), the related-article ranking and the topic → CTA mapping.
 * `knowledge.ts` stays the single loader for listing, slugs, status and alternates; this module only
 * reads what the loader does not expose and never changes its contract.
 */

export type MdxComponents = NonNullable<MDXRemoteProps["components"]>;

/** Id of the element that wraps the rendered MDX body (the reading-progress island measures it). */
export const ARTICLE_BODY_ID = "article-body";

/* ---------- table of contents ---------- */

export interface TocHeading {
  /** Anchor id assigned by rehype-slug (`## Three losses` → `three-losses`, duplicates suffixed `-1`). */
  id: string;
  text: string;
  depth: 2 | 3;
}

/** Minimal hast shape (element / text / mdx nodes): enough to walk the tree without unified's types. */
export interface HastLike {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastLike[];
  value?: string;
  data?: Record<string, unknown>;
}

/** Plain text of a node (inline markup such as `code` or `em` inside a heading is flattened). */
export function hastText(node: HastLike): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

/**
 * Every `h2`/`h3` that carries an id (set by rehype-slug, which runs first) in document order, also
 * inside MDX blocks such as callouts. `h1` is the article title and `h4`+ stays out of the TOC.
 */
export function collectHeadings(tree: HastLike, sink: TocHeading[] = []): TocHeading[] {
  const visit = (node: HastLike): void => {
    if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
      const id = node.properties?.id;
      const text = hastText(node).replace(/\s+/g, " ").trim();
      if (typeof id === "string" && id && text) sink.push({ id, text, depth: node.tagName === "h2" ? 2 : 3 });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return sink;
}

/** rehype plugin: records every h2/h3 with its rehype-slug id into `sink` while the article compiles. */
export function rehypeCollectHeadings(options: { sink: TocHeading[] }) {
  return (tree: HastLike): void => {
    collectHeadings(tree, options.sink);
  };
}

/**
 * rehype plugin: exposes the fence meta (```json title="request.json") as a `metastring` property on
 * the `<code>` element. remark keeps it in `data.meta`, which MDX does not pass to components.
 */
export function rehypeCodeMeta() {
  const visit = (node: HastLike): void => {
    if (node.type === "element" && node.tagName === "code") {
      const meta = node.data?.meta;
      if (typeof meta === "string" && meta) node.properties = { ...node.properties, metastring: meta };
    }
    for (const child of node.children ?? []) visit(child);
  };
  return (tree: HastLike): void => visit(tree);
}

export interface CompiledArticle {
  content: ReactElement;
  headings: TocHeading[];
}

/**
 * Compiles article MDX to React (GFM tables, slugged headings) and returns the headings for the
 * table of contents. The heading list is complete once the promise resolves, so the page can render
 * the TOC before the body. `components` maps the MDX names documented in docs/13-knowledge-authoring.md.
 */
export async function compileArticle(source: string, components: MdxComponents): Promise<CompiledArticle> {
  const headings: TocHeading[] = [];
  const { content } = await compileMDX({
    source,
    components,
    options: { mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug, rehypeCodeMeta, [rehypeCollectHeadings, { sink: headings }]] } },
  });
  return { content, headings };
}

/* ---------- front-matter extras the loader does not expose ---------- */

export interface ArticleExtras {
  /** `takeaways:` list from the front matter; empty when the article has none (rendered only when present). */
  takeaways: string[];
}

export const MAX_TAKEAWAYS = 6;

export function parseTakeaways(value: unknown, max = MAX_TAKEAWAYS): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.replace(/\s+/g, " ").trim() : "";
    if (text) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

const GROUP_RE = /^[a-z0-9-]{3,120}$/;
const extrasCache = new Map<string, ArticleExtras>();

function contentDir(locale: string): string {
  return path.resolve(process.cwd(), "content", "knowledge", locale);
}

/** Front matter of a translation group's file in `locale`: `<group>.mdx` first, then a scan by `translationGroupId`. */
function readGroupFrontMatter(locale: string, translationGroupId: string): Record<string, unknown> | null {
  const dir = contentDir(locale);
  if (!GROUP_RE.test(translationGroupId) || !existsSync(dir)) return null;
  const direct = path.join(dir, `${translationGroupId}.mdx`);
  const candidates = existsSync(direct) ? [direct] : [];
  for (const file of readdirSync(dir)) {
    const full = path.join(dir, file);
    if (file.endsWith(".mdx") && full !== direct) candidates.push(full);
  }
  for (const file of candidates) {
    const { data } = matter(readFileSync(file, "utf8"));
    const group = typeof data.translationGroupId === "string" && data.translationGroupId ? data.translationGroupId : path.basename(file, ".mdx");
    if (group === translationGroupId) return data as Record<string, unknown>;
  }
  return null;
}

/** Extra front-matter fields of an article (cached for the production build; dev re-reads so edits show up). */
export async function articleExtras(locale: string, translationGroupId: string): Promise<ArticleExtras> {
  const key = `${locale}:${translationGroupId}`;
  const cached = extrasCache.get(key);
  if (cached) return cached;
  const data = readGroupFrontMatter(locale, translationGroupId);
  const extras: ArticleExtras = { takeaways: parseTakeaways(data?.takeaways) };
  if (process.env.NODE_ENV === "production") extrasCache.set(key, extras);
  return extras;
}

/* ---------- related articles ---------- */

export type RelatedSubject = Pick<ArticleMeta, "translationGroupId" | "locale" | "topic" | "tags" | "platforms" | "shopSystems">;

function shared(a: readonly string[], b: readonly string[]): number {
  const set = new Set(b);
  return a.filter((x) => set.has(x)).length;
}

/**
 * Related articles: same topic first, then the number of shared tags, then shared platforms/shop
 * systems, newest first as the tie-break. Same locale and published versions only, never the
 * article itself, and only candidates that share something — an article without any relation gets
 * an empty list (the section is omitted) instead of arbitrary filler.
 */
export function rankRelated<T extends ArticleMeta>(candidates: readonly T[], article: RelatedSubject, limit = 3): T[] {
  return candidates
    .filter((c) => c.locale === article.locale && c.status === "published" && c.translationGroupId !== article.translationGroupId)
    .map((c) => ({ c, topic: c.topic === article.topic ? 1 : 0, tags: shared(c.tags, article.tags), context: shared(c.platforms, article.platforms) + shared(c.shopSystems, article.shopSystems) }))
    .filter((s) => s.topic > 0 || s.tags > 0 || s.context > 0)
    .sort((x, y) => y.topic - x.topic || y.tags - x.tags || y.context - x.context || (y.c.updatedAt ?? y.c.publishedAt).localeCompare(x.c.updatedAt ?? x.c.publishedAt) || x.c.slug.localeCompare(y.c.slug))
    .slice(0, Math.max(0, limit))
    .map((s) => s.c);
}

/* ---------- contextual Track CTA ---------- */

/** One restrained product CTA per topic world; the texts live in marketing-copy/knowledge-article.ts. */
export const CTA_BY_TOPIC: Record<TopicId, { key: KnowledgeCtaKey; href: string }> = {
  "getting-started": { key: "ai-setup", href: "/features/ai-setup" },
  "pixel-platform-integrations": { key: "integrations", href: "/integrations" },
  "server-side-tracking": { key: "server-side", href: "/features/server-side-tracking" },
  "ecommerce-tracking": { key: "ecommerce", href: "/integrations" },
  "consent-privacy": { key: "consent", href: "/features/consent" },
  "attribution-analytics": { key: "attribution", href: "/features/attribution" },
  "ai-data-quality": { key: "data-quality", href: "/features/data-quality" },
  troubleshooting: { key: "debugger", href: "/features/event-debugger" },
  "product-updates": { key: "product", href: "/how-it-works" },
};

export function ctaForTopic(topic: TopicId): { key: KnowledgeCtaKey; href: string } {
  return CTA_BY_TOPIC[topic];
}

/* ---------- structured data + formatting ---------- */

/** `TechArticle` for reference and tutorial content, `BlogPosting` for guides, explainers and updates (supplement §6). */
export function articleSchemaType(contentType: ContentType): "TechArticle" | "BlogPosting" {
  return contentType === "reference" || contentType === "tutorial" ? "TechArticle" : "BlogPosting";
}

const DATE_LOCALES: Record<AppLocale, string> = { en: "en-GB", de: "de-DE", fr: "fr-FR", es: "es-ES", it: "it-IT", nl: "nl-NL" };

/** Long date in the locale's convention; dates in the front matter are calendar days, so they are formatted in UTC. */
export function formatArticleDate(locale: string, iso: string): string {
  const tag = (ALL_LOCALES as readonly string[]).includes(locale) ? DATE_LOCALES[locale as AppLocale] : DATE_LOCALES.en;
  return new Date(iso).toLocaleDateString(tag, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** `"{n} min read"` + 4 → `"4 min read"`. */
export function readingTimeLabel(template: string, minutes: number): string {
  return template.replace("{n}", String(minutes));
}

/** ISO 8601 duration for `timeRequired` in the article JSON-LD. */
export function readingTimeDuration(minutes: number): string {
  return `PT${Math.max(1, Math.round(minutes))}M`;
}
