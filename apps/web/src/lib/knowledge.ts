import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import readingTime from "reading-time";
import { ACTIVE_LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";

/**
 * Tracking Knowledge content loader. Articles live in `apps/web/content/knowledge/<locale>/<file>.mdx`
 * with front matter (see `scripts/migrate-knowledge-frontmatter.mjs`). One topic = one
 * `translationGroupId` (the English file name); every locale version may carry its own `slug`.
 * Only `status: "published"` versions are listable, indexable and linked as hreflang alternates.
 */

/** Fixed product name of the knowledge area — identical in every language (supplement §6). */
export const KNOWLEDGE_NAME = "Tracking Knowledge";
export const KNOWLEDGE_PATH = "/tracking-knowledge";

export type LocalizedLabel = { en: string; de: string };

export const TOPICS = [
  { id: "getting-started", label: { en: "Getting Started", de: "Erste Schritte" } },
  { id: "pixel-platform-integrations", label: { en: "Pixel & Platform Integrations", de: "Pixel- & Plattform-Integrationen" } },
  { id: "server-side-tracking", label: { en: "Server-Side Tracking", de: "Server-Side Tracking" } },
  { id: "ecommerce-tracking", label: { en: "Ecommerce Tracking", de: "E-Commerce-Tracking" } },
  { id: "consent-privacy", label: { en: "Consent & Privacy", de: "Consent & Datenschutz" } },
  { id: "attribution-analytics", label: { en: "Attribution & Analytics", de: "Attribution & Analytics" } },
  { id: "ai-data-quality", label: { en: "AI & Data Quality", de: "KI & Datenqualität" } },
  { id: "troubleshooting", label: { en: "Troubleshooting", de: "Fehlerbehebung" } },
  { id: "product-updates", label: { en: "Product Updates", de: "Produkt-Updates" } },
] as const satisfies ReadonlyArray<{ id: string; label: LocalizedLabel }>;
export type TopicId = (typeof TOPICS)[number]["id"];
export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((t) => t.id);

export const CONTENT_TYPES = ["guide", "tutorial", "reference", "explainer", "update"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const CONTENT_TYPE_LABELS: Record<ContentType, LocalizedLabel> = {
  guide: { en: "Guide", de: "Leitfaden" },
  tutorial: { en: "Tutorial", de: "Tutorial" },
  reference: { en: "Reference", de: "Referenz" },
  explainer: { en: "Explainer", de: "Erklärung" },
  update: { en: "Update", de: "Update" },
};

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, LocalizedLabel> = {
  beginner: { en: "Beginner", de: "Einsteiger" },
  intermediate: { en: "Intermediate", de: "Fortgeschrittene" },
  advanced: { en: "Advanced", de: "Experten" },
};

/** Editorial workflow states (supplement §7). Only `published` is public. */
export const KNOWLEDGE_STATUSES = ["draft", "translated", "reviewed", "published"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

/** Recency filter: articles published or updated within the window. */
export const RECENCY_WINDOWS = { "30d": 30, "90d": 90, "365d": 365 } as const;
export type RecencyId = keyof typeof RECENCY_WINDOWS;
export const RECENCY_LABELS: Record<RecencyId, LocalizedLabel> = {
  "30d": { en: "Last 30 days", de: "Letzte 30 Tage" },
  "90d": { en: "Last 90 days", de: "Letzte 90 Tage" },
  "365d": { en: "Last 12 months", de: "Letzte 12 Monate" },
};

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

/** Label in the requested locale; English for locales without a catalogue entry yet. */
export function labelFor(label: LocalizedLabel, locale: string): string {
  return locale === "de" ? label.de : label.en;
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
}

export interface Article extends ArticleMeta {
  content: string;
}

export interface Author {
  name: string;
  role: LocalizedLabel;
  bio: LocalizedLabel;
}

export const AUTHORS: Record<string, Author> = {
  "track-editorial": {
    name: "Track editorial team",
    role: { en: "Product & engineering", de: "Produkt & Engineering" },
    bio: {
      en: "The people building Track: engineers and analysts who work on server-side tracking, consent tooling and connector integrations every day.",
      de: "Die Menschen hinter Track: Engineers und Analysts, die täglich an Server-Side Tracking, Consent-Tooling und Connector-Integrationen arbeiten.",
    },
  },
};

/** Localized display name of the editorial author record. */
export const AUTHOR_DISPLAY_NAMES: Record<string, LocalizedLabel> = {
  "track-editorial": { en: "Track editorial team", de: "Track-Redaktion" },
};

/** Front-matter keys that still use the pre-rename author id. */
const AUTHOR_ALIASES: Record<string, string> = { "track-site-editorial": "track-editorial" };

export function resolveAuthorKey(key: string): string {
  return AUTHOR_ALIASES[key] ?? key;
}

/** Author record (with a localized display name) for a front-matter `author` value; unknown keys fall back to the raw value. */
export function authorFor(key: string, locale: string): Author & { key: string; displayName: string } {
  const resolved = resolveAuthorKey(key);
  const record = AUTHORS[resolved];
  if (!record) return { key: resolved, name: key, displayName: key, role: { en: "", de: "" }, bio: { en: "", de: "" } };
  const names = AUTHOR_DISPLAY_NAMES[resolved];
  return { key: resolved, ...record, displayName: names ? labelFor(names, locale) : record.name };
}

export function articlePath(slug: string): string {
  return `${KNOWLEDGE_PATH}/${slug}`;
}

/** Localized alt text of the generated 1200×630 social card. */
export function socialCardAlt(title: string, locale: string): string {
  return locale === "de" ? `Track ${KNOWLEDGE_NAME}: ${title}` : `Track ${KNOWLEDGE_NAME}: ${title}`;
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

export { DEFAULT_LOCALE as KNOWLEDGE_DEFAULT_LOCALE };
