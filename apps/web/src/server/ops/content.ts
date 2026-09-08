import "server-only";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { asc, sql } from "drizzle-orm";
import matter from "gray-matter";
import { knowledgeFeedback, pgErrorCode } from "@track-site/db";
import { relatedKnowledgeFor } from "@/components/marketing/integrations/catalog";
import { ACTIVE_LOCALES, isLocale, type AppLocale } from "@/i18n/routing";
import { INTEGRATIONS, type IntegrationCatalogEntry, type IntegrationCategory, type IntegrationKind } from "@/lib/integrations-catalog";
import {
  KNOWLEDGE_STATUSES,
  isTopicId,
  listArticles,
  listLearningPaths,
  readLearningPaths,
  type ArticleMeta,
  type ContentType,
  type KnowledgeStatus,
  type LearningPath,
  type LearningPathWithArticles,
  type Level,
  type TopicId,
} from "@/lib/knowledge";
import { KNOWLEDGE_PATH, articlePath } from "@/lib/knowledge-routes";
import { STATIC_MARKETING_ROUTES } from "@/lib/routes";
import { SITEMAP_SECTIONS, sitemapName } from "@/lib/seo";
import { logger } from "@/server/db";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Track Operations → Content (docs/17, task O10): read-only editorial view of the Tracking Knowledge area.
 *
 * Everything on these pages comes from the content that lives in git (`apps/web/content/knowledge`, read
 * through the public loader `lib/knowledge.ts`) plus the anonymous "was this helpful?" votes in
 * `knowledge_feedback` (no PII, no tenant). Nothing here touches tenant data, so no break-glass grant and no
 * page-view audit entry is involved; there are no mutations — content changes are commits.
 *
 * Rules the board applies (all derived from front matter, never invented):
 * - A translation group is *complete* when every active locale has a `published` version.
 * - The *last review* of a version is `reviewedAt`, else its publication (the first review). A published
 *   version whose last review is older than `REVIEW_STALE_DAYS` is *stale*.
 * - A version without a `takeaways:` list in its front matter is flagged as *missing takeaways*.
 * - A group *needs attention* when it is incomplete, has a stale review or a version without takeaways.
 */

export const REVIEW_STALE_DAYS = 180;
export const FEEDBACK_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------------
// Public links (the console is unlocalized; public pages carry the locale prefix)
// ---------------------------------------------------------------------------------------------------

/** `/<locale><path>` — the public URL of a marketing page for one locale. */
export function publicHref(locale: AppLocale, pathname: string): string {
  return `/${locale}${pathname}`;
}

/** The operator's language when it is an active locale, else English. */
export function operatorLocale(locale: string): AppLocale {
  return isLocale(locale) ? locale : "en";
}

/** Public URL of a published version: the operator's language, then English, then any published version. */
export function preferredArticleHref(published: Partial<Record<AppLocale, string>>, locale: string): string | null {
  const order: AppLocale[] = [operatorLocale(locale), "en", ...ACTIVE_LOCALES];
  for (const l of order) {
    const slug = published[l];
    if (slug) return publicHref(l, articlePath(slug));
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Front matter that the loader does not expose (takeaways)
// ---------------------------------------------------------------------------------------------------

/** Number of non-empty entries of a front-matter `takeaways:` list; 0 for a missing or malformed list. */
export function countTakeaways(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => typeof item === "string" && item.trim().length > 0).length;
}

function contentDir(locale: string): string {
  return path.resolve(process.cwd(), "content", "knowledge", locale);
}

/** Takeaway counts per translation group of one locale; cached for the production build like the loader (dev re-reads). */
const takeawaysCache = new Map<string, Map<string, number>>();

function takeawaysIndex(locale: AppLocale): Map<string, number> {
  const cached = takeawaysCache.get(locale);
  if (cached) return cached;
  const out = new Map<string, number>();
  const dir = contentDir(locale);
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".mdx")) continue;
      try {
        const { data } = matter(readFileSync(path.join(dir, file), "utf8"));
        const group = typeof data.translationGroupId === "string" && data.translationGroupId ? data.translationGroupId : file.replace(/\.mdx$/, "");
        out.set(group, countTakeaways(data.takeaways));
      } catch {
        // malformed front matter: the loader skips the file as well, so it is not on the board
      }
    }
  }
  if (process.env.NODE_ENV === "production") takeawaysCache.set(locale, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Review staleness (pure)
// ---------------------------------------------------------------------------------------------------

/** Last editorial review of a version: `reviewedAt`, else the publication date (the first review). */
export function lastReviewOf(version: { reviewedAt: string | null; publishedAt: string }): string {
  return version.reviewedAt ?? version.publishedAt;
}

/** Whole days since an ISO date; negative for a date in the future, `null` for an unparsable value. */
export function ageInDays(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.floor((nowMs - at) / DAY_MS);
}

/** True when the last review is older than `days` (published versions only — drafts are not public yet). */
export function isReviewStale(version: { status: KnowledgeStatus; reviewedAt: string | null; publishedAt: string }, nowMs: number, days = REVIEW_STALE_DAYS): boolean {
  if (version.status !== "published") return false;
  const age = ageInDays(lastReviewOf(version), nowMs);
  return age !== null && age > days;
}

// ---------------------------------------------------------------------------------------------------
// Editorial board
// ---------------------------------------------------------------------------------------------------

export interface ContentVersion {
  locale: AppLocale;
  slug: string;
  status: KnowledgeStatus;
  title: string;
  publishedAt: string;
  updatedAt: string | null;
  reviewedAt: string | null;
  /** `reviewedAt`, else `publishedAt` */
  lastReviewedAt: string;
  /** published and last review older than `REVIEW_STALE_DAYS` */
  reviewStale: boolean;
  /** entries of the front-matter `takeaways:` list (0 = missing) */
  takeaways: number;
  readingMinutes: number;
  topic: TopicId;
  contentType: ContentType;
  level: Level;
  featured: boolean;
  /** public URL; null unless published */
  href: string | null;
}

export type StatusCounts = Record<KnowledgeStatus, number>;

export interface ContentGroup {
  translationGroupId: string;
  /** English title, else the first available version's title */
  title: string;
  topic: TopicId;
  contentType: ContentType;
  level: Level;
  featured: boolean;
  versions: Partial<Record<AppLocale, ContentVersion>>;
  counts: StatusCounts;
  /** active locales without any version file */
  missing: AppLocale[];
  /** every active locale has a published version */
  complete: boolean;
  /** most recent `reviewedAt` across the versions; null when no version was ever reviewed */
  lastReviewedAt: string | null;
  missingTakeaways: AppLocale[];
  staleReviews: AppLocale[];
  attention: boolean;
  /** public URL in the operator's language, English or any published version */
  href: string | null;
}

export interface LocaleBoardSummary {
  locale: AppLocale;
  counts: StatusCounts;
  missing: number;
  missingTakeaways: number;
  staleReviews: number;
  /** most recent `reviewedAt` of the locale's versions */
  lastReviewedAt: string | null;
}

export interface BoardTotals {
  groups: number;
  complete: number;
  incomplete: number;
  attention: number;
  versions: StatusCounts;
  missingVersions: number;
  missingTakeaways: number;
  staleReviews: number;
  neverReviewed: number;
}

export interface EditorialBoard {
  generatedAt: string;
  locales: readonly AppLocale[];
  groups: ContentGroup[];
  totals: BoardTotals;
  perLocale: LocaleBoardSummary[];
}

export function emptyStatusCounts(): StatusCounts {
  return { draft: 0, translated: 0, reviewed: 0, published: 0 };
}

const maxIso = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : (a ?? b));

/** One board row from the locale versions of a translation group (pure; staleness was decided per version). */
export function buildGroup(translationGroupId: string, versions: Partial<Record<AppLocale, ContentVersion>>, locales: readonly AppLocale[], operator: string): ContentGroup {
  const counts = emptyStatusCounts();
  const missing: AppLocale[] = [];
  const missingTakeaways: AppLocale[] = [];
  const staleReviews: AppLocale[] = [];
  const published: Partial<Record<AppLocale, string>> = {};
  let lastReviewedAt: string | null = null;
  for (const locale of locales) {
    const v = versions[locale];
    if (!v) {
      missing.push(locale);
      continue;
    }
    counts[v.status] += 1;
    if (v.status === "published") published[locale] = v.slug;
    if (v.takeaways === 0) missingTakeaways.push(locale);
    if (v.reviewStale) staleReviews.push(locale);
    lastReviewedAt = maxIso(lastReviewedAt, v.reviewedAt);
  }
  const lead = versions.en ?? locales.map((l) => versions[l]).find((v): v is ContentVersion => !!v);
  const complete = missing.length === 0 && counts.published === locales.length;
  return {
    translationGroupId,
    title: lead?.title ?? translationGroupId,
    topic: lead?.topic ?? "getting-started",
    contentType: lead?.contentType ?? "guide",
    level: lead?.level ?? "intermediate",
    featured: lead?.featured ?? false,
    versions,
    counts,
    missing,
    complete,
    lastReviewedAt,
    missingTakeaways,
    staleReviews,
    attention: !complete || missingTakeaways.length > 0 || staleReviews.length > 0,
    href: preferredArticleHref(published, operator),
  };
}

/** Board version of an article plus the takeaway count from its front matter (pure). */
export function toVersion(article: ArticleMeta, locale: AppLocale, takeaways: number, nowMs: number): ContentVersion {
  return {
    locale,
    slug: article.slug,
    status: article.status,
    title: article.title,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    reviewedAt: article.reviewedAt,
    lastReviewedAt: lastReviewOf(article),
    reviewStale: isReviewStale(article, nowMs),
    takeaways,
    readingMinutes: article.readingMinutes,
    topic: article.topic,
    contentType: article.contentType,
    level: article.level,
    featured: article.featured,
    href: article.status === "published" ? publicHref(locale, articlePath(article.slug)) : null,
  };
}

/** Totals over the board rows (pure). */
export function summarizeBoard(groups: readonly ContentGroup[], locales: readonly AppLocale[]): { totals: BoardTotals; perLocale: LocaleBoardSummary[] } {
  const totals: BoardTotals = { groups: groups.length, complete: 0, incomplete: 0, attention: 0, versions: emptyStatusCounts(), missingVersions: 0, missingTakeaways: 0, staleReviews: 0, neverReviewed: 0 };
  const perLocale = new Map<AppLocale, LocaleBoardSummary>(locales.map((locale) => [locale, { locale, counts: emptyStatusCounts(), missing: 0, missingTakeaways: 0, staleReviews: 0, lastReviewedAt: null }]));
  for (const g of groups) {
    if (g.complete) totals.complete += 1;
    else totals.incomplete += 1;
    if (g.attention) totals.attention += 1;
    if (!g.lastReviewedAt) totals.neverReviewed += 1;
    totals.missingVersions += g.missing.length;
    totals.missingTakeaways += g.missingTakeaways.length;
    totals.staleReviews += g.staleReviews.length;
    for (const status of KNOWLEDGE_STATUSES) totals.versions[status] += g.counts[status];
    for (const locale of locales) {
      const summary = perLocale.get(locale)!;
      const v = g.versions[locale];
      if (!v) {
        summary.missing += 1;
        continue;
      }
      summary.counts[v.status] += 1;
      if (v.takeaways === 0) summary.missingTakeaways += 1;
      if (v.reviewStale) summary.staleReviews += 1;
      summary.lastReviewedAt = maxIso(summary.lastReviewedAt, v.reviewedAt);
    }
  }
  return { totals, perLocale: Array.from(perLocale.values()) };
}

// ---------------------------------------------------------------------------------------------------
// Board filters (URL state)
// ---------------------------------------------------------------------------------------------------

export const BOARD_VIEWS = ["all", "attention", "incomplete", "stale", "takeaways", "unpublished"] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];

export interface BoardFilters {
  view: BoardView;
  topic: TopicId | null;
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = { view: "all", topic: null };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function isBoardView(value: unknown): value is BoardView {
  return typeof value === "string" && (BOARD_VIEWS as readonly string[]).includes(value);
}

/** Filters from the URL; unknown values fall back to the full board so a bad query never breaks the page. */
export function parseBoardFilters(params: Record<string, string | string[] | undefined>): BoardFilters {
  const view = one(params.view);
  const topic = one(params.topic);
  return { view: isBoardView(view) ? view : "all", topic: isTopicId(topic) ? topic : null };
}

/** `""` for the default view, otherwise `?view=…&topic=…` (defaults omitted). */
export function boardQueryString(filters: BoardFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.topic) params.set("topic", filters.topic);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function boardFiltered(filters: BoardFilters): boolean {
  return filters.view !== "all" || filters.topic !== null;
}

/** Rows that match the filters (pure). */
export function filterGroups(groups: readonly ContentGroup[], filters: BoardFilters): ContentGroup[] {
  return groups.filter((g) => {
    if (filters.topic && g.topic !== filters.topic) return false;
    switch (filters.view) {
      case "attention":
        return g.attention;
      case "incomplete":
        return !g.complete;
      case "stale":
        return g.staleReviews.length > 0;
      case "takeaways":
        return g.missingTakeaways.length > 0;
      case "unpublished":
        return g.counts.draft + g.counts.translated + g.counts.reviewed > 0;
      default:
        return true;
    }
  });
}

// ---------------------------------------------------------------------------------------------------
// Loaders (file system via the public loader)
// ---------------------------------------------------------------------------------------------------

/** Every version (any status) per active locale, read once per request. */
async function articlesByLocale(includeUnpublished: boolean): Promise<Map<AppLocale, ArticleMeta[]>> {
  const out = new Map<AppLocale, ArticleMeta[]>();
  for (const locale of ACTIVE_LOCALES) out.set(locale, await listArticles(locale, { includeUnpublished }));
  return out;
}

/** The editorial board: one row per translation group, versions per active locale, totals and per-locale summaries. */
export async function loadEditorialBoard(operator: string, now: Date = new Date()): Promise<EditorialBoard> {
  const nowMs = now.getTime();
  const byLocale = await articlesByLocale(true);
  const groups = new Map<string, Partial<Record<AppLocale, ContentVersion>>>();
  for (const locale of ACTIVE_LOCALES) {
    const takeaways = takeawaysIndex(locale);
    for (const article of byLocale.get(locale) ?? []) {
      const versions = groups.get(article.translationGroupId) ?? {};
      // a second file with the same group id in one locale would be an authoring error; the first one (loader order) wins
      if (!versions[locale]) versions[locale] = toVersion(article, locale, takeaways.get(article.translationGroupId) ?? 0, nowMs);
      groups.set(article.translationGroupId, versions);
    }
  }
  const rows = Array.from(groups, ([id, versions]) => buildGroup(id, versions, ACTIVE_LOCALES, operator)).sort((a, b) => a.title.localeCompare(b.title, "en") || a.translationGroupId.localeCompare(b.translationGroupId));
  const { totals, perLocale } = summarizeBoard(rows, ACTIVE_LOCALES);
  return { generatedAt: now.toISOString(), locales: ACTIVE_LOCALES, groups: rows, totals, perLocale };
}

// ---------------------------------------------------------------------------------------------------
// Knowledge feedback per article (knowledge_feedback, anonymous by design)
// ---------------------------------------------------------------------------------------------------

export interface VoteCounts {
  helpful: number;
  notHelpful: number;
  total: number;
  /** integer percent of helpful votes; null without votes (never an invented rate) */
  helpfulShare: number | null;
}

export interface FeedbackRow {
  translationGroupId: string;
  /** English title of the article; null when the group is not on the board (the id is shown instead) */
  title: string | null;
  href: string | null;
  allTime: VoteCounts;
  recent: VoteCounts;
  byLocale: Partial<Record<AppLocale, VoteCounts>>;
  lastVoteAt: string | null;
}

export interface ContentFeedback {
  available: boolean;
  generatedAt: string;
  windowDays: number;
  totals: { allTime: VoteCounts; recent: VoteCounts; articlesWithVotes: number; publishedWithoutVotes: number };
  rows: FeedbackRow[];
}

export function voteCounts(helpful: number, notHelpful: number): VoteCounts {
  const total = helpful + notHelpful;
  return { helpful, notHelpful, total, helpfulShare: total > 0 ? Math.round((helpful / total) * 100) : null };
}

const addVotes = (a: VoteCounts, b: VoteCounts): VoteCounts => voteCounts(a.helpful + b.helpful, a.notHelpful + b.notHelpful);

interface FeedbackAggregate {
  translationGroupId: string;
  locale: string;
  helpful: number;
  notHelpful: number;
  recentHelpful: number;
  recentNotHelpful: number;
  lastVoteAt: string | null;
}

/** Per-article rows from the per-locale aggregates (pure): most "not helpful" votes first, then most votes, then id. */
export function buildFeedbackRows(aggregates: readonly FeedbackAggregate[], titles: ReadonlyMap<string, string>, hrefs: ReadonlyMap<string, string | null>): FeedbackRow[] {
  const rows = new Map<string, FeedbackRow>();
  for (const a of aggregates) {
    const row = rows.get(a.translationGroupId) ?? {
      translationGroupId: a.translationGroupId,
      title: titles.get(a.translationGroupId) ?? null,
      href: hrefs.get(a.translationGroupId) ?? null,
      allTime: voteCounts(0, 0),
      recent: voteCounts(0, 0),
      byLocale: {},
      lastVoteAt: null,
    };
    const votes = voteCounts(a.helpful, a.notHelpful);
    row.allTime = addVotes(row.allTime, votes);
    row.recent = addVotes(row.recent, voteCounts(a.recentHelpful, a.recentNotHelpful));
    if (isLocale(a.locale)) row.byLocale[a.locale] = addVotes(row.byLocale[a.locale] ?? voteCounts(0, 0), votes);
    row.lastVoteAt = maxIso(row.lastVoteAt, a.lastVoteAt);
    rows.set(a.translationGroupId, row);
  }
  return Array.from(rows.values()).sort((x, y) => y.allTime.notHelpful - x.allTime.notHelpful || y.allTime.total - x.allTime.total || x.translationGroupId.localeCompare(y.translationGroupId));
}

/** `interval '30 days'` from the module constant (same pattern as the inbox digest; no user input involved). */
const FEEDBACK_WINDOW = sql.raw(`interval '${FEEDBACK_WINDOW_DAYS} days'`);

const toIso = (value: Date | string | null | undefined): string | null => (value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const num = (value: unknown): number => Number(value ?? 0);
const isMissingTable = (e: unknown): boolean => pgErrorCode(e) === "42P01";

/** "Was this article helpful?" votes per article: all-time and the last 30 days, split by locale. */
export async function loadContentFeedback(ctx: PlatformContext, operator: string, now: Date = new Date()): Promise<ContentFeedback> {
  const generatedAt = now.toISOString();
  const empty: ContentFeedback = { available: false, generatedAt, windowDays: FEEDBACK_WINDOW_DAYS, totals: { allTime: voteCounts(0, 0), recent: voteCounts(0, 0), articlesWithVotes: 0, publishedWithoutVotes: 0 }, rows: [] };
  const aggregates = await withPlatform(ctx, async (tx) => {
    try {
      return await tx.transaction((sp) =>
        sp
          .select({
            translationGroupId: knowledgeFeedback.translationGroupId,
            locale: knowledgeFeedback.locale,
            helpful: sql<number>`count(*) FILTER (WHERE ${knowledgeFeedback.helpful})::int`,
            notHelpful: sql<number>`count(*) FILTER (WHERE NOT ${knowledgeFeedback.helpful})::int`,
            recentHelpful: sql<number>`count(*) FILTER (WHERE ${knowledgeFeedback.helpful} AND ${knowledgeFeedback.createdAt} >= now() - ${FEEDBACK_WINDOW})::int`,
            recentNotHelpful: sql<number>`count(*) FILTER (WHERE NOT ${knowledgeFeedback.helpful} AND ${knowledgeFeedback.createdAt} >= now() - ${FEEDBACK_WINDOW})::int`,
            lastVoteAt: sql<Date | string | null>`max(${knowledgeFeedback.createdAt})`,
          })
          .from(knowledgeFeedback)
          .groupBy(knowledgeFeedback.translationGroupId, knowledgeFeedback.locale)
          .orderBy(asc(knowledgeFeedback.translationGroupId), asc(knowledgeFeedback.locale))
          .limit(2000),
      );
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      logger.warn("knowledge_feedback missing: apply migration 0005_knowledge_feedback");
      return null;
    }
  });
  if (!aggregates) return empty;
  const board = await loadEditorialBoard(operator, now);
  const titles = new Map(board.groups.map((g) => [g.translationGroupId, g.title]));
  const hrefs = new Map(board.groups.map((g) => [g.translationGroupId, g.href]));
  const rows = buildFeedbackRows(
    aggregates.map((a) => ({ translationGroupId: a.translationGroupId, locale: a.locale, helpful: num(a.helpful), notHelpful: num(a.notHelpful), recentHelpful: num(a.recentHelpful), recentNotHelpful: num(a.recentNotHelpful), lastVoteAt: toIso(a.lastVoteAt) })),
    titles,
    hrefs,
  );
  const voted = new Set(rows.map((r) => r.translationGroupId));
  return {
    available: true,
    generatedAt,
    windowDays: FEEDBACK_WINDOW_DAYS,
    totals: {
      allTime: rows.reduce((acc, r) => addVotes(acc, r.allTime), voteCounts(0, 0)),
      recent: rows.reduce((acc, r) => addVotes(acc, r.recent), voteCounts(0, 0)),
      articlesWithVotes: rows.length,
      publishedWithoutVotes: board.groups.filter((g) => g.counts.published > 0 && !voted.has(g.translationGroupId)).length,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------------------------------
// Learning paths
// ---------------------------------------------------------------------------------------------------

export interface PathLocaleState {
  locale: AppLocale;
  title: string;
  description: string;
  /** ids listed in the file */
  listed: number;
  /** ids that resolve to a published article of the locale */
  resolved: number;
  /** listed ids without a published article in this locale (unknown group or not published) */
  unresolved: string[];
  readingMinutes: number;
  /** the path is shown on the hub (at least one article resolves) */
  visible: boolean;
}

export interface PathRow {
  id: string;
  /** English title, else the first available locale's title */
  title: string;
  locales: Partial<Record<AppLocale, PathLocaleState>>;
  missingLocales: AppLocale[];
  unresolvedTotal: number;
  attention: boolean;
}

export interface PathsOverview {
  generatedAt: string;
  locales: readonly AppLocale[];
  rows: PathRow[];
  totals: { paths: number; attention: number; missingLocales: number; unresolved: number };
  /** public hub anchor of the learning paths section per locale */
  hubHref: Record<AppLocale, string>;
}

/** Coverage of one path in one locale from its raw definition and the hub's resolved version (pure). */
export function pathCoverage(locale: AppLocale, raw: LearningPath, resolved: LearningPathWithArticles | undefined): PathLocaleState {
  const resolvedIds = new Set((resolved?.articles ?? []).map((a) => a.translationGroupId));
  const unresolved = raw.groupIds.filter((id) => !resolvedIds.has(id));
  return {
    locale,
    title: raw.title,
    description: raw.description,
    listed: raw.groupIds.length,
    resolved: resolvedIds.size,
    unresolved,
    readingMinutes: resolved?.readingMinutes ?? 0,
    visible: !!resolved,
  };
}

/** Path rows across locales (pure); `byLocale` carries the raw and resolved paths per locale. */
export function buildPathRows(byLocale: ReadonlyMap<AppLocale, { raw: LearningPath[]; resolved: LearningPathWithArticles[] }>, locales: readonly AppLocale[]): PathRow[] {
  const rows = new Map<string, PathRow>();
  for (const locale of locales) {
    const entry = byLocale.get(locale);
    if (!entry) continue;
    const resolvedById = new Map(entry.resolved.map((p) => [p.id, p]));
    for (const raw of entry.raw) {
      const row = rows.get(raw.id) ?? { id: raw.id, title: raw.title, locales: {}, missingLocales: [], unresolvedTotal: 0, attention: false };
      row.locales[locale] = pathCoverage(locale, raw, resolvedById.get(raw.id));
      rows.set(raw.id, row);
    }
  }
  for (const row of rows.values()) {
    row.title = row.locales.en?.title ?? locales.map((l) => row.locales[l]?.title).find((t): t is string => !!t) ?? row.id;
    row.missingLocales = locales.filter((l) => !row.locales[l]);
    row.unresolvedTotal = locales.reduce((n, l) => n + (row.locales[l]?.unresolved.length ?? 0), 0);
    row.attention = row.missingLocales.length > 0 || row.unresolvedTotal > 0 || locales.some((l) => row.locales[l] && !row.locales[l]!.visible);
  }
  return Array.from(rows.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** Curated learning paths per locale: which ids are listed, which resolve to published articles, what the hub shows. */
export async function loadPathsOverview(now: Date = new Date()): Promise<PathsOverview> {
  const byLocale = new Map<AppLocale, { raw: LearningPath[]; resolved: LearningPathWithArticles[] }>();
  for (const locale of ACTIVE_LOCALES) byLocale.set(locale, { raw: readLearningPaths(locale), resolved: await listLearningPaths(locale) });
  const rows = buildPathRows(byLocale, ACTIVE_LOCALES);
  return {
    generatedAt: now.toISOString(),
    locales: ACTIVE_LOCALES,
    rows,
    totals: {
      paths: rows.length,
      attention: rows.filter((r) => r.attention).length,
      missingLocales: rows.reduce((n, r) => n + r.missingLocales.length, 0),
      unresolved: rows.reduce((n, r) => n + r.unresolvedTotal, 0),
    },
    hubHref: Object.fromEntries(ACTIVE_LOCALES.map((l) => [l, `${publicHref(l, KNOWLEDGE_PATH)}#paths-title`])) as Record<AppLocale, string>,
  };
}

// ---------------------------------------------------------------------------------------------------
// Sitemap and feed freshness
// ---------------------------------------------------------------------------------------------------

export interface BuildInfo {
  id: string;
  /** modification time of the build id file = end of the last production build */
  builtAt: string;
}

export interface FreshnessLocale {
  locale: AppLocale;
  hubHref: string;
  feedHref: string;
  sitemapHref: string;
  /** published articles = knowledge sitemap URLs = feed items */
  knowledgeUrls: number;
  pageUrls: number;
  newestPublishedAt: string | null;
  newestUpdatedAt: string | null;
  /** versions the loader knows but the public routes do not list */
  unpublishedVersions: number;
}

export interface ContentFreshness {
  generatedAt: string;
  runtime: "production" | "development" | "test";
  /** null when no production build output exists next to the app (development) */
  build: BuildInfo | null;
  sitemapIndexHref: string;
  sitemapCount: number;
  locales: FreshnessLocale[];
}

/** Build id and its file time from `.next/BUILD_ID`; null without a build (development) or on any read error. */
export function readBuildInfo(appDir: string = process.cwd()): BuildInfo | null {
  try {
    const file = path.join(appDir, ".next", "BUILD_ID");
    if (!existsSync(file)) return null;
    const id = readFileSync(file, "utf8").trim();
    if (!id) return null;
    return { id, builtAt: statSync(file).mtime.toISOString() };
  } catch {
    return null;
  }
}

const newest = (articles: readonly ArticleMeta[], pick: (a: ArticleMeta) => string | null): string | null => articles.reduce<string | null>((acc, a) => maxIso(acc, pick(a)), null);

/** Per-locale counts of the static sitemap and feed routes as the loader would render them now, plus the last build. */
export async function loadContentFreshness(now: Date = new Date()): Promise<ContentFreshness> {
  const all = await articlesByLocale(true);
  const runtime = process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";
  return {
    generatedAt: now.toISOString(),
    runtime,
    build: readBuildInfo(),
    sitemapIndexHref: "/sitemap.xml",
    sitemapCount: ACTIVE_LOCALES.length * SITEMAP_SECTIONS.length,
    locales: ACTIVE_LOCALES.map((locale) => {
      const versions = all.get(locale) ?? [];
      const articles = versions.filter((a) => a.status === "published");
      return {
        locale,
        hubHref: publicHref(locale, KNOWLEDGE_PATH),
        feedHref: publicHref(locale, `${KNOWLEDGE_PATH}/feed.xml`),
        sitemapHref: `/sitemaps/${sitemapName("knowledge", locale)}`,
        knowledgeUrls: articles.length,
        pageUrls: STATIC_MARKETING_ROUTES.length,
        newestPublishedAt: newest(articles, (a) => a.publishedAt),
        newestUpdatedAt: newest(articles, (a) => a.updatedAt),
        unpublishedVersions: versions.length - articles.length,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------
// Integration catalogue coverage
// ---------------------------------------------------------------------------------------------------

export interface IntegrationCoverageRow {
  slug: string;
  name: string;
  kind: IntegrationKind;
  category: IntegrationCategory;
  /** public vendor documentation the implementation was verified against */
  vendorDocsUrl: string | null;
  verifiedAt: string | null;
  /** published, related articles per active locale */
  perLocale: Record<AppLocale, number>;
  /** distinct translation groups related to the integration in any locale */
  groups: string[];
  /** public integration page in the operator's language */
  href: string;
}

export interface IntegrationCoverage {
  generatedAt: string;
  locales: readonly AppLocale[];
  rows: IntegrationCoverageRow[];
  totals: { integrations: number; destinations: number; sources: number; withArticles: number; withoutArticles: number; withVendorDocs: number; everyLocale: number };
}

/** Coverage of one catalogue entry from the published articles per locale (pure; same matching rule as the public integration page). */
export function coverageFor(entry: IntegrationCatalogEntry, published: ReadonlyMap<AppLocale, readonly ArticleMeta[]>, locales: readonly AppLocale[], operator: string): IntegrationCoverageRow {
  const perLocale = {} as Record<AppLocale, number>;
  const groups = new Set<string>();
  for (const locale of locales) {
    const articles = published.get(locale) ?? [];
    const related = relatedKnowledgeFor(entry, articles, articles.length);
    perLocale[locale] = related.length;
    for (const a of related) groups.add(a.translationGroupId);
  }
  return {
    slug: entry.slug,
    name: entry.name,
    kind: entry.kind,
    category: entry.category,
    vendorDocsUrl: entry.docsUrl,
    verifiedAt: entry.verifiedAt,
    perLocale,
    groups: Array.from(groups).sort(),
    href: publicHref(operatorLocale(operator), `/integrations/${entry.slug}`),
  };
}

/** Which catalogue entries have knowledge articles (per locale) and vendor documentation. */
export async function loadIntegrationCoverage(operator: string, now: Date = new Date()): Promise<IntegrationCoverage> {
  const published = await articlesByLocale(false);
  const rows = INTEGRATIONS.map((entry) => coverageFor(entry, published, ACTIVE_LOCALES, operator)).sort((a, b) => a.groups.length - b.groups.length || a.name.localeCompare(b.name, "en"));
  return {
    generatedAt: now.toISOString(),
    locales: ACTIVE_LOCALES,
    rows,
    totals: {
      integrations: rows.length,
      destinations: rows.filter((r) => r.kind === "destination").length,
      sources: rows.filter((r) => r.kind === "source").length,
      withArticles: rows.filter((r) => r.groups.length > 0).length,
      withoutArticles: rows.filter((r) => r.groups.length === 0).length,
      withVendorDocs: rows.filter((r) => r.vendorDocsUrl !== null).length,
      everyLocale: rows.filter((r) => ACTIVE_LOCALES.every((l) => r.perLocale[l] > 0)).length,
    },
  };
}
