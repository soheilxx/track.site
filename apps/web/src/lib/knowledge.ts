import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import readingTime from "reading-time";
import { ACTIVE_LOCALES, ALL_LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";
import { KNOWLEDGE_LABELS, type KnowledgeLabels } from "./marketing-copy/knowledge-labels";
import { pick } from "./marketing-copy/pick";
import type { LocalizedCopy } from "./marketing-copy/types";
import { articlePath } from "./knowledge-routes";
import { buildSearchIndex, extractHeadings, plainTextFromMarkdown, search, type FacetCounts, type HubQuery, type HubTaxonomy, type SearchDocument, type SearchIndex } from "./knowledge-search";

/**
 * Tracking Knowledge content loader. Articles live in `apps/web/content/knowledge/<locale>/<file>.mdx`
 * with front matter (see `scripts/migrate-knowledge-frontmatter.mjs`). One topic = one
 * `translationGroupId` (the English file name); every locale version may carry its own `slug`.
 * Only `status: "published"` versions are listable, indexable and linked as hreflang alternates.
 */

/** Fixed product name of the knowledge area — identical in every language (supplement §6). */
export const KNOWLEDGE_NAME = "Tracking Knowledge";
export { KNOWLEDGE_PATH, articlePath } from "./knowledge-routes";

/**
 * A label in every programme locale (`null` until translated). The texts live in
 * `lib/marketing-copy/knowledge-labels/<locale>.ts` (one file per language); the tables below are
 * projections of them so every call site keeps `labelFor(label, locale)`.
 */
export type LocalizedLabel = LocalizedCopy<string>;

function projectLabel(select: (labels: KnowledgeLabels) => string): LocalizedLabel {
  const out = {} as Record<AppLocale, string | null>;
  for (const locale of ALL_LOCALES) {
    const entry = KNOWLEDGE_LABELS[locale];
    out[locale] = entry ? select(entry) : null;
  }
  return out as LocalizedLabel;
}

function constantLabel(text: string): LocalizedLabel {
  return Object.fromEntries(ALL_LOCALES.map((locale) => [locale, text])) as LocalizedLabel;
}

/** The nine topic worlds (supplement §6) in catalogue order; labels come from the knowledge-labels copy area. */
export const TOPIC_IDS = ["getting-started", "pixel-platform-integrations", "server-side-tracking", "ecommerce-tracking", "consent-privacy", "attribution-analytics", "ai-data-quality", "troubleshooting", "product-updates"] as const;
export type TopicId = (typeof TOPIC_IDS)[number];
export const TOPICS: ReadonlyArray<{ id: TopicId; label: LocalizedLabel }> = TOPIC_IDS.map((id) => ({ id, label: projectLabel((l) => l.topics[id]) }));

export const CONTENT_TYPES = ["guide", "tutorial", "reference", "explainer", "update"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const CONTENT_TYPE_LABELS: Record<ContentType, LocalizedLabel> = Object.fromEntries(CONTENT_TYPES.map((t) => [t, projectLabel((l) => l.contentTypes[t])])) as Record<ContentType, LocalizedLabel>;

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, LocalizedLabel> = Object.fromEntries(LEVELS.map((l) => [l, projectLabel((labels) => labels.levels[l])])) as Record<Level, LocalizedLabel>;

/** Editorial workflow states (supplement §7). Only `published` is public. */
export const KNOWLEDGE_STATUSES = ["draft", "translated", "reviewed", "published"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

/** Recency filter: articles published or updated within the window. */
export const RECENCY_WINDOWS = { "30d": 30, "90d": 90, "365d": 365 } as const;
export type RecencyId = keyof typeof RECENCY_WINDOWS;
export const RECENCY_IDS = Object.keys(RECENCY_WINDOWS) as RecencyId[];
export const RECENCY_LABELS: Record<RecencyId, LocalizedLabel> = Object.fromEntries(RECENCY_IDS.map((r) => [r, projectLabel((l) => l.recency[r])])) as Record<RecencyId, LocalizedLabel>;

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && (TOPIC_IDS as readonly string[]).includes(value);
}
export function isContentType(value: unknown): value is ContentType {
  return typeof value === "string" && (CONTENT_TYPES as readonly string[]).includes(value);
}
export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}
export function isKnowledgeStatus(value: unknown): value is KnowledgeStatus {
  return typeof value === "string" && (KNOWLEDGE_STATUSES as readonly string[]).includes(value);
}
export function isRecencyId(value: unknown): value is RecencyId {
  return typeof value === "string" && value in RECENCY_WINDOWS;
}

/** Label in the requested locale: strict for active locales, English only for inactive ones (same rule as `pick`). */
export function labelFor(label: LocalizedLabel, locale: string): string {
  return pick(locale, label);
}
export function topicLabel(topic: TopicId, locale: string): string {
  const entry = TOPICS.find((t) => t.id === topic);
  return entry ? labelFor(entry.label, locale) : topic;
}

export interface ArticleMeta {
  /** Stable id shared by every language version (= the English file name). */
  translationGroupId: string;
  /** Locale-specific URL slug (`/[locale]/tracking-knowledge/<slug>`). */
  slug: string;
  locale: string;
  title: string;
  description: string;
  excerpt: string;
  /** Legacy editorial category from the blog era; `topic` is the public taxonomy. */
  category: string;
  tags: string[];
  author: string;
  publishedAt: string;
  updatedAt: string | null;
  reviewedAt: string | null;
  status: KnowledgeStatus;
  topic: TopicId;
  platforms: string[];
  shopSystems: string[];
  contentType: ContentType;
  level: Level;
  coverAlt: string;
  readingMinutes: number;
  sources: Array<{ title: string; url: string }>;
  legalNotice: boolean;
  /** Front matter `featured: true` marks the hub's editorial lead story (supplement §6). */
  featured: boolean;
  /** Heading texts of the body (search index, table of contents). */
  headings: string[];
}

export interface Article extends ArticleMeta {
  content: string;
}

export interface Author {
  name: string;
  role: LocalizedLabel;
  bio: LocalizedLabel;
}

/** Editorial author records (real, no invented authors); their localized texts live in the knowledge-labels copy area. */
export const AUTHOR_KEYS = ["track-editorial"] as const;
export type AuthorKey = (typeof AUTHOR_KEYS)[number];

export const AUTHORS: Record<AuthorKey, Author> = {
  "track-editorial": {
    name: KNOWLEDGE_LABELS.en.authors["track-editorial"].displayName,
    role: projectLabel((l) => l.authors["track-editorial"].role),
    bio: projectLabel((l) => l.authors["track-editorial"].bio),
  },
};

/** Localized display name of the editorial author record. */
export const AUTHOR_DISPLAY_NAMES: Record<AuthorKey, LocalizedLabel> = {
  "track-editorial": projectLabel((l) => l.authors["track-editorial"].displayName),
};

/** Front-matter keys that still use the pre-rename author id. */
const AUTHOR_ALIASES: Record<string, string> = { "track-site-editorial": "track-editorial" };

export function resolveAuthorKey(key: string): string {
  return AUTHOR_ALIASES[key] ?? key;
}

/** Author record (with a localized display name) for a front-matter `author` value; unknown keys fall back to the raw value. */
export function authorFor(key: string, locale: string): Author & { key: string; displayName: string } {
  const resolved = resolveAuthorKey(key);
  const record = (AUTHORS as Record<string, Author | undefined>)[resolved];
  if (!record) return { key: resolved, name: key, displayName: key, role: constantLabel(""), bio: constantLabel("") };
  const names = (AUTHOR_DISPLAY_NAMES as Record<string, LocalizedLabel | undefined>)[resolved];
  return { key: resolved, ...record, displayName: names ? labelFor(names, locale) : record.name };
}

/** Localized alt text of the generated 1200×630 social card. */
export function socialCardAlt(title: string, locale: string): string {
  return pick(locale, KNOWLEDGE_LABELS).socialCardAlt.replace("{title}", title);
}

const SLUG_RE = /^[a-z0-9-]{3,120}$/;

function contentDir(locale: string): string {
  return path.resolve(process.cwd(), "content", "knowledge", locale);
}

function toArticle(locale: string, fileName: string, raw: string): Article | null {
  const { data, content } = matter(raw);
  if (!data.title || !data.description || !data.publishedAt) return null;
  const translationGroupId = typeof data.translationGroupId === "string" && data.translationGroupId ? data.translationGroupId : fileName;
  const slug = typeof data.slug === "string" && SLUG_RE.test(data.slug) ? data.slug : fileName;
  const status: KnowledgeStatus = isKnowledgeStatus(data.status) ? data.status : "draft";
  return {
    translationGroupId,
    slug,
    locale,
    title: String(data.title),
    description: String(data.description),
    excerpt: String(data.excerpt ?? data.description),
    category: String(data.category ?? "guides"),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    author: resolveAuthorKey(String(data.author ?? "track-editorial")),
    publishedAt: new Date(data.publishedAt).toISOString(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
    reviewedAt: data.reviewedAt ? new Date(data.reviewedAt).toISOString() : null,
    status,
    topic: isTopicId(data.topic) ? data.topic : "getting-started",
    platforms: Array.isArray(data.platforms) ? data.platforms.map(String) : [],
    shopSystems: Array.isArray(data.shopSystems) ? data.shopSystems.map(String) : [],
    contentType: isContentType(data.contentType) ? data.contentType : "guide",
    level: isLevel(data.level) ? data.level : "intermediate",
    coverAlt: String(data.coverAlt ?? data.title),
    readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
    sources: Array.isArray(data.sources) ? data.sources.map((s: { title: string; url: string }) => ({ title: String(s.title), url: String(s.url) })) : [],
    legalNotice: Boolean(data.legalNotice),
    featured: data.featured === true,
    headings: extractHeadings(content),
    content,
  };
}

/** Parsed articles per locale; cached for the production build (dev re-reads so content edits show up). */
const cache = new Map<string, Article[]>();

function loadLocale(locale: string): Article[] {
  const cached = cache.get(locale);
  if (cached) return cached;
  const dir = contentDir(locale);
  const articles: Article[] = [];
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".mdx")) continue;
      const article = toArticle(locale, file.replace(/\.mdx$/, ""), readFileSync(path.join(dir, file), "utf8"));
      if (article) articles.push(article);
    }
  }
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  if (process.env.NODE_ENV === "production") cache.set(locale, articles);
  return articles;
}

function stripContent(article: Article): ArticleMeta {
  const { content: _content, ...meta } = article;
  return meta;
}

/* ---------- listing + filters ---------- */

export interface ArticleFilters {
  topic?: TopicId;
  platform?: string;
  shopSystem?: string;
  contentType?: ContentType;
  level?: Level;
  recency?: RecencyId;
}

/** Filter values from URL search params; unknown values are ignored so a bad query never breaks the page. */
export function parseFilters(params: Record<string, string | string[] | undefined>): ArticleFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filters: ArticleFilters = {};
  const topic = one(params.topic);
  if (isTopicId(topic)) filters.topic = topic;
  const platform = one(params.platform);
  if (platform && SLUG_RE.test(platform)) filters.platform = platform;
  const shopSystem = one(params.shopSystem ?? params.shop);
  if (shopSystem && SLUG_RE.test(shopSystem)) filters.shopSystem = shopSystem;
  const contentType = one(params.type ?? params.contentType);
  if (isContentType(contentType)) filters.contentType = contentType;
  const level = one(params.level);
  if (isLevel(level)) filters.level = level;
  const recency = one(params.recency);
  if (isRecencyId(recency)) filters.recency = recency;
  return filters;
}

export function hasFilters(filters: ArticleFilters): boolean {
  return Object.values(filters).some((v) => v !== undefined);
}

export function filterArticles<T extends ArticleMeta>(articles: readonly T[], filters: ArticleFilters, now: Date = new Date()): T[] {
  const since = filters.recency ? now.getTime() - RECENCY_WINDOWS[filters.recency] * 86_400_000 : null;
  return articles.filter((a) => {
    if (filters.topic && a.topic !== filters.topic) return false;
    if (filters.platform && !a.platforms.includes(filters.platform)) return false;
    if (filters.shopSystem && !a.shopSystems.includes(filters.shopSystem)) return false;
    if (filters.contentType && a.contentType !== filters.contentType) return false;
    if (filters.level && a.level !== filters.level) return false;
    if (since !== null && new Date(a.updatedAt ?? a.publishedAt).getTime() < since) return false;
    return true;
  });
}

/** Published articles of a locale, newest first; `includeUnpublished` adds draft/translated/reviewed versions (never for public listings). */
export async function listArticles(locale: string, options: { includeUnpublished?: boolean; filters?: ArticleFilters } = {}): Promise<ArticleMeta[]> {
  const all = loadLocale(locale).filter((a) => options.includeUnpublished || a.status === "published");
  const filtered = options.filters ? filterArticles(all, options.filters) : all;
  return filtered.map(stripContent);
}

/** Article by its localized slug, any status (callers decide what a non-published version may do). */
export async function getArticle(locale: string, slug: string): Promise<Article | null> {
  if (!SLUG_RE.test(slug)) return null;
  return loadLocale(locale).find((a) => a.slug === slug) ?? null;
}

export async function getArticleByGroup(locale: string, translationGroupId: string): Promise<Article | null> {
  return loadLocale(locale).find((a) => a.translationGroupId === translationGroupId) ?? null;
}

/** Topics in catalogue order with the number of published articles per topic in this locale. */
export async function listTopics(locale: string): Promise<Array<{ id: TopicId; label: string; count: number }>> {
  const counts = new Map<TopicId, number>();
  for (const a of await listArticles(locale)) counts.set(a.topic, (counts.get(a.topic) ?? 0) + 1);
  return TOPICS.map((t) => ({ id: t.id, label: labelFor(t.label, locale), count: counts.get(t.id) ?? 0 }));
}

/**
 * Published slug per active locale for a translation group. Drives hreflang, the sitemap alternates
 * and the language switcher, so switching the language stays on the same article; a locale without
 * a published version is simply absent (never an English fallback under a localized URL).
 */
export async function alternatesForGroup(translationGroupId: string): Promise<Partial<Record<AppLocale, string>>> {
  const slugs: Partial<Record<AppLocale, string>> = {};
  for (const locale of ACTIVE_LOCALES) {
    const article = loadLocale(locale).find((a) => a.translationGroupId === translationGroupId && a.status === "published");
    if (article) slugs[locale] = article.slug;
  }
  return slugs;
}

/** Same as `alternatesForGroup`, as locale-neutral paths (`/tracking-knowledge/<slug>`). */
export async function pathsForGroup(translationGroupId: string): Promise<Partial<Record<AppLocale, string>>> {
  const slugs = await alternatesForGroup(translationGroupId);
  const paths: Partial<Record<AppLocale, string>> = {};
  for (const [locale, slug] of Object.entries(slugs) as Array<[AppLocale, string]>) paths[locale] = articlePath(slug);
  return paths;
}

export async function relatedArticles(locale: string, article: ArticleMeta, limit = 3): Promise<ArticleMeta[]> {
  const others = (await listArticles(locale)).filter((a) => a.translationGroupId !== article.translationGroupId);
  const scored = others.map((a) => ({
    a,
    score: (a.topic === article.topic ? 3 : 0) + a.platforms.filter((p) => article.platforms.includes(p)).length + a.shopSystems.filter((s) => article.shopSystems.includes(s)).length + a.tags.filter((t) => article.tags.includes(t)).length,
  }));
  return scored
    .sort((x, y) => y.score - x.score || y.a.publishedAt.localeCompare(x.a.publishedAt))
    .slice(0, limit)
    .map((s) => s.a);
}

/** Machine-readable translation parity per group across every active locale (supplement §11). */
export async function translationParity(): Promise<Array<{ translationGroupId: string; versions: Partial<Record<AppLocale, { slug: string; status: KnowledgeStatus }>>; complete: boolean }>> {
  const groups = new Map<string, Partial<Record<AppLocale, { slug: string; status: KnowledgeStatus }>>>();
  for (const locale of ACTIVE_LOCALES) {
    for (const a of loadLocale(locale)) {
      const versions = groups.get(a.translationGroupId) ?? {};
      versions[locale] = { slug: a.slug, status: a.status };
      groups.set(a.translationGroupId, versions);
    }
  }
  return Array.from(groups, ([translationGroupId, versions]) => ({
    translationGroupId,
    versions,
    complete: ACTIVE_LOCALES.every((l) => versions[l]?.status === "published"),
  })).sort((a, b) => a.translationGroupId.localeCompare(b.translationGroupId));
}

/* ---------- hub: featured story, fresh lists, guides ---------- */

function freshness(a: ArticleMeta): string {
  return a.updatedAt ?? a.publishedAt;
}

/**
 * The hub's lead story: the published article with front matter `featured: true` (the most recently
 * reviewed one when several are flagged), otherwise the most recently reviewed published article
 * (ties: most recently updated/published). `null` only when nothing is published in the locale.
 */
export async function getFeaturedArticle(locale: string): Promise<ArticleMeta | null> {
  const published = await listArticles(locale);
  if (published.length === 0) return null;
  const byReview = (x: ArticleMeta, y: ArticleMeta) => (y.reviewedAt ?? "").localeCompare(x.reviewedAt ?? "") || freshness(y).localeCompare(freshness(x)) || x.slug.localeCompare(y.slug);
  const flagged = published.filter((a) => a.featured).sort(byReview);
  return flagged[0] ?? [...published].sort(byReview)[0] ?? null;
}

/** Newest published articles by publication date. */
export async function listRecentlyPublished(locale: string, limit = 5): Promise<ArticleMeta[]> {
  return (await listArticles(locale)).slice(0, limit);
}

/** Published articles that carry an `updatedAt` after publication, most recent update first; empty when nothing was updated yet. */
export async function listRecentlyUpdated(locale: string, limit = 5): Promise<ArticleMeta[]> {
  return (await listArticles(locale))
    .filter((a) => a.updatedAt && a.updatedAt > a.publishedAt)
    .sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? "") || x.slug.localeCompare(y.slug))
    .slice(0, limit);
}

export interface GuideTarget {
  /** Platform or shop-system id as used in the front matter (= integration catalogue slug). */
  id: string;
  count: number;
}

/** Platforms and shop systems named in the published articles' front matter with their article counts (most articles first). */
export async function listGuideTargets(locale: string): Promise<{ platforms: GuideTarget[]; shopSystems: GuideTarget[] }> {
  const platforms = new Map<string, number>();
  const shopSystems = new Map<string, number>();
  for (const a of await listArticles(locale)) {
    for (const p of a.platforms) platforms.set(p, (platforms.get(p) ?? 0) + 1);
    for (const s of a.shopSystems) shopSystems.set(s, (shopSystems.get(s) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) => Array.from(m, ([id, count]) => ({ id, count })).sort((x, y) => y.count - x.count || x.id.localeCompare(y.id));
  return { platforms: sorted(platforms), shopSystems: sorted(shopSystems) };
}

/* ---------- hub: curated learning paths ---------- */

/**
 * Curated learning path as authored in `content/knowledge/paths.<locale>.json` — one file per locale,
 * a top-level JSON array (an object `{ "paths": [...] }` is accepted too):
 *
 *   [{ "id": "server-side-basics",           // stable, URL-safe, unique per file
 *      "title": "…",                          // localized
 *      "description": "…",                    // localized, one or two sentences
 *      "groupIds": ["server-side-tracking-explained", "dedup-event-id-order-id"] }]  // translationGroupIds in reading order
 *
 * Only published articles of the locale are resolved; unknown or unpublished ids are skipped, a path
 * without any resolvable article is dropped, and a missing or malformed file yields an empty list.
 */
export interface LearningPath {
  id: string;
  title: string;
  description: string;
  groupIds: string[];
}

export interface LearningPathWithArticles extends LearningPath {
  articles: ArticleMeta[];
  /** Sum of the reading minutes of the resolved articles. */
  readingMinutes: number;
}

function pathsFile(locale: string): string {
  return path.resolve(process.cwd(), "content", "knowledge", `paths.${locale}.json`);
}

function toLearningPath(raw: unknown): LearningPath | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !SLUG_RE.test(r.id) || typeof r.title !== "string" || !r.title.trim()) return null;
  const groupIds = Array.isArray(r.groupIds) ? r.groupIds.filter((g): g is string => typeof g === "string" && SLUG_RE.test(g)) : [];
  return { id: r.id, title: r.title.trim(), description: typeof r.description === "string" ? r.description.trim() : "", groupIds };
}

/** Raw learning paths of a locale (no article resolution); `[]` when the file is missing or invalid. */
export function readLearningPaths(locale: string): LearningPath[] {
  const file = pathsFile(locale);
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { paths?: unknown }).paths) ? (parsed as { paths: unknown[] }).paths : [];
    const seen = new Set<string>();
    const paths: LearningPath[] = [];
    for (const item of list) {
      const p = toLearningPath(item);
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        paths.push(p);
      }
    }
    return paths;
  } catch {
    return [];
  }
}

/** Learning paths with their published articles resolved in reading order (see `LearningPath`). */
export async function listLearningPaths(locale: string): Promise<LearningPathWithArticles[]> {
  const byGroup = new Map((await listArticles(locale)).map((a) => [a.translationGroupId, a]));
  return readLearningPaths(locale)
    .map((p) => {
      const articles = p.groupIds.map((g) => byGroup.get(g)).filter((a): a is ArticleMeta => !!a);
      return { ...p, articles, readingMinutes: articles.reduce((n, a) => n + a.readingMinutes, 0) };
    })
    .filter((p) => p.articles.length > 0);
}

/* ---------- hub: full-text search ---------- */

/** Catalogue values the search query parser and the facet counts validate against. */
export const KNOWLEDGE_TAXONOMY: HubTaxonomy = { topics: TOPIC_IDS, contentTypes: CONTENT_TYPES, levels: LEVELS, recencyDays: RECENCY_WINDOWS };

function toSearchDocument(a: Article): SearchDocument {
  return {
    id: a.translationGroupId,
    title: a.title,
    description: a.description,
    excerpt: a.excerpt,
    headings: a.headings,
    body: plainTextFromMarkdown(a.content),
    topic: a.topic,
    platforms: a.platforms,
    shopSystems: a.shopSystems,
    contentType: a.contentType,
    level: a.level,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
  };
}

/** Search index per locale, built at request time from the loader and kept in module scope until the published set changes. */
const searchIndexCache = new Map<string, { fingerprint: string; index: SearchIndex }>();

export function getSearchIndex(locale: string): SearchIndex {
  const published = loadLocale(locale).filter((a) => a.status === "published");
  const fingerprint = published.map((a) => `${a.slug}:${a.updatedAt ?? a.publishedAt}:${a.content.length}`).join("|");
  const cached = searchIndexCache.get(locale);
  if (cached && cached.fingerprint === fingerprint) return cached.index;
  const index = buildSearchIndex(published.map(toSearchDocument), KNOWLEDGE_TAXONOMY);
  searchIndexCache.set(locale, { fingerprint, index });
  return index;
}

export interface KnowledgeSearchResult {
  hits: ArticleMeta[];
  total: number;
  corpus: number;
  facets: FacetCounts;
}

/** Full-text search over the published articles of a locale combined with the directory filters (supplement §6). */
export async function searchKnowledge(locale: string, query: HubQuery, now: Date = new Date()): Promise<KnowledgeSearchResult> {
  const index = getSearchIndex(locale);
  const published = loadLocale(locale).filter((a) => a.status === "published");
  const byGroup = new Map(published.map((a) => [a.translationGroupId, stripContent(a)]));
  const result = search(index, query, now);
  return { hits: result.hits.map((h) => byGroup.get(h.doc.id)).filter((a): a is ArticleMeta => !!a), total: result.total, corpus: result.corpus, facets: result.facets };
}

export { DEFAULT_LOCALE as KNOWLEDGE_DEFAULT_LOCALE };
