import "server-only";
import { ACTIVE_LOCALES, LOCALE_NAMES } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { integrationBySlug, type IntegrationCategory } from "@/lib/integrations-catalog";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  LEVELS,
  LEVEL_LABELS,
  RECENCY_LABELS,
  RECENCY_WINDOWS,
  TOPICS,
  getFeaturedArticle,
  labelFor,
  listGuideTargets,
  listLearningPaths,
  listRecentlyPublished,
  listRecentlyUpdated,
  listTopics,
  searchKnowledge,
  type ArticleMeta,
  type ContentType,
  type Level,
  type LearningPathWithArticles,
  type TopicId,
} from "@/lib/knowledge";
import { FACET_KEYS, hubQueryToSearch, type FacetKey, type HubQuery } from "@/lib/knowledge-search";
import { KNOWLEDGE_HUB_COPY, type KnowledgeHubCopy } from "@/lib/marketing-copy/knowledge";
import { pick } from "@/lib/marketing-copy/pick";
import { fill, humanize } from "./text";
import type { DirectoryItem, FacetOption, HubFacets, HubIslandCopy, HubLabels, HubSearchResponse } from "./types";

/**
 * Server side of the hub: resolves the loader data into the serialisable shapes the sections and
 * the client island render. Used by the page (initial render) and by the search server action.
 */
export function hubCopy(locale: string): KnowledgeHubCopy {
  return pick(locale, KNOWLEDGE_HUB_COPY);
}

export function hubLabels(locale: string): HubLabels {
  const topics = {} as Record<TopicId, string>;
  for (const t of TOPICS) topics[t.id] = labelFor(t.label, locale);
  const types = {} as Record<ContentType, string>;
  for (const t of CONTENT_TYPES) types[t] = labelFor(CONTENT_TYPE_LABELS[t], locale);
  const levels = {} as Record<Level, string>;
  for (const l of LEVELS) levels[l] = labelFor(LEVEL_LABELS[l], locale);
  return { topics, types, levels };
}

export function islandCopy(locale: string): HubIslandCopy {
  const c = hubCopy(locale);
  return { search: c.search, directory: c.directory, card: c.card, labels: hubLabels(locale) };
}

/** Long calendar date in the locale's convention (`lib/format.ts`, UTC so a date-only value never shifts). */
export function formatHubDate(locale: string, iso: string): string {
  return formatDate(iso, locale);
}

export function readingLabel(copy: KnowledgeHubCopy, minutes: number): string {
  return fill(copy.card.minutes, { n: minutes });
}

/** Display label of a platform or shop-system id: the integration catalogue's short name, else the humanized slug. */
export function guideLabel(id: string): string {
  return integrationBySlug(id)?.shortName ?? humanize(id);
}

export function toDirectoryItem(a: ArticleMeta, locale: string): DirectoryItem {
  const updated = !!a.updatedAt && a.updatedAt > a.publishedAt;
  const iso = updated ? a.updatedAt! : a.publishedAt;
  return {
    groupId: a.translationGroupId,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    topic: a.topic,
    contentType: a.contentType,
    level: a.level,
    readingMinutes: a.readingMinutes,
    date: { iso, label: formatHubDate(locale, iso), updated },
  };
}

function facetOptions(key: FacetKey, counts: Record<string, number>, locale: string): FacetOption[] {
  const option = (value: string, label: string): FacetOption => ({ value, label, count: counts[value] ?? 0 });
  switch (key) {
    case "topic":
      return TOPICS.map((t) => option(t.id, labelFor(t.label, locale)));
    case "contentType":
      return CONTENT_TYPES.map((t) => option(t, labelFor(CONTENT_TYPE_LABELS[t], locale)));
    case "level":
      return LEVELS.map((l) => option(l, labelFor(LEVEL_LABELS[l], locale)));
    case "recency":
      return (Object.keys(RECENCY_WINDOWS) as Array<keyof typeof RECENCY_WINDOWS>).map((r) => option(r, labelFor(RECENCY_LABELS[r], locale)));
    default:
      return Object.keys(counts)
        .map((id) => option(id, guideLabel(id)))
        .sort((x, y) => x.label.localeCompare(y.label));
  }
}

/** Search + filters + facet counts as the island consumes them. */
export async function buildHubSearchResponse(locale: string, query: HubQuery, now: Date = new Date()): Promise<HubSearchResponse> {
  const result = await searchKnowledge(locale, query, now);
  const facets = {} as HubFacets;
  for (const key of FACET_KEYS) facets[key] = facetOptions(key, result.facets[key], locale);
  return { query, search: hubQueryToSearch(query), items: result.hits.map((a) => toDirectoryItem(a, locale)), total: result.total, corpus: result.corpus, facets };
}

/* ---------- editorial sections ---------- */

export interface TopicWorld {
  id: TopicId;
  label: string;
  description: string;
  count: number;
}

export interface GuideLink {
  id: string;
  label: string;
  count: number;
  monogram: string;
  category: IntegrationCategory;
}

export interface HubData {
  featured: ArticleMeta | null;
  topics: TopicWorld[];
  paths: LearningPathWithArticles[];
  guides: { platforms: GuideLink[]; shopSystems: GuideLink[] };
  published: ArticleMeta[];
  updated: ArticleMeta[];
  /** Native names of the languages the knowledge area is served in. */
  languages: string[];
}

function toGuideLink(target: { id: string; count: number }): GuideLink {
  const entry = integrationBySlug(target.id);
  return { id: target.id, label: entry?.shortName ?? humanize(target.id), count: target.count, monogram: entry?.monogram ?? target.id.slice(0, 2).toUpperCase(), category: entry?.category ?? "custom" };
}

export async function getHubData(locale: string): Promise<HubData> {
  const c = hubCopy(locale);
  const [featured, topics, paths, targets, published, updated] = await Promise.all([getFeaturedArticle(locale), listTopics(locale), listLearningPaths(locale), listGuideTargets(locale), listRecentlyPublished(locale, 5), listRecentlyUpdated(locale, 5)]);
  return {
    featured,
    topics: topics.map((t) => ({ ...t, description: c.topics.descriptions[t.id] })),
    paths,
    guides: { platforms: targets.platforms.map(toGuideLink), shopSystems: targets.shopSystems.map(toGuideLink) },
    published,
    updated,
    languages: ACTIVE_LOCALES.map((l) => LOCALE_NAMES[l]),
  };
}
