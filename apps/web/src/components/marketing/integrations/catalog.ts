import { INTEGRATION_CATEGORIES, INTEGRATION_MODES, integrationModes, type IntegrationCatalogEntry, type IntegrationCategory, type IntegrationMode } from "@/lib/integrations-catalog";

/**
 * Pure search/filter logic of the integrations overview (client + server, no React). The query is
 * URL-synchronised: `?q=<text>&category=<a,b>&mode=<x,y>`. Categories combine with OR (an
 * integration has exactly one), modes with AND (the platform must support every selected mode).
 */
export interface IntegrationQuery {
  q: string;
  categories: IntegrationCategory[];
  modes: IntegrationMode[];
}

export const EMPTY_INTEGRATION_QUERY: IntegrationQuery = { q: "", categories: [], modes: [] };

const MAX_QUERY_LENGTH = 80;

export function isIntegrationCategory(value: unknown): value is IntegrationCategory {
  return typeof value === "string" && (INTEGRATION_CATEGORIES as readonly string[]).includes(value);
}

export function isIntegrationMode(value: unknown): value is IntegrationMode {
  return typeof value === "string" && (INTEGRATION_MODES as readonly string[]).includes(value);
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined> | { get(name: string): string | null };

function readParam(source: ParamSource, name: string): string | undefined {
  if ("get" in source && typeof source.get === "function") {
    const v = source.get(name);
    return v === null ? undefined : v;
  }
  const v = (source as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v[0] : v;
}

function listParam<T extends string>(raw: string | undefined, guard: (v: unknown) => v is T, order: readonly T[]): T[] {
  if (!raw) return [];
  const values = new Set(raw.split(",").map((v) => v.trim().toLowerCase()).filter(guard));
  return order.filter((v) => values.has(v));
}

/** Query from URL search params (server `searchParams` object or `URLSearchParams`); unknown values are ignored. */
export function parseIntegrationQuery(source: ParamSource): IntegrationQuery {
  return {
    q: (readParam(source, "q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH),
    categories: listParam(readParam(source, "category"), isIntegrationCategory, INTEGRATION_CATEGORIES),
    modes: listParam(readParam(source, "mode"), isIntegrationMode, INTEGRATION_MODES),
  };
}

/** Canonical search string (`""` when empty, otherwise `?q=…&category=…&mode=…`). */
export function integrationQueryToSearch(query: IntegrationQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.categories.length) params.set("category", query.categories.join(","));
  if (query.modes.length) params.set("mode", query.modes.join(","));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasIntegrationQuery(query: IntegrationQuery): boolean {
  return query.q.length > 0 || query.categories.length > 0 || query.modes.length > 0;
}

/** Lower-case, diacritics folded, punctuation collapsed — for accent-insensitive matching. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The subset of a catalogue entry the search needs; the client explorer passes serialisable items of this shape. */
export interface SearchableIntegration {
  slug: string;
  name: string;
  shortName: string;
  category: IntegrationCategory;
  modes: IntegrationMode[];
  keywords: string[];
  summary: string;
  presets?: string[];
  /** Editorial tier for the default order (lower first). */
  tier: number;
}

/** `summary` is the localized one-liner of the entry (`integrationText()` in ./text.ts resolves it per locale on the server). */
export function toSearchable(entry: IntegrationCatalogEntry, summary: string): SearchableIntegration {
  return {
    slug: entry.slug,
    name: entry.name,
    shortName: entry.shortName,
    category: entry.category,
    modes: integrationModes(entry),
    // click ids are searchable too ("gclid" → Google Ads, GA4, Floodlight)
    keywords: [...entry.keywords, ...entry.clickIds],
    summary,
    ...(entry.presets ? { presets: entry.presets } : {}),
    tier: entry.group === "commerce" ? 1 : entry.group,
  };
}

/** Relevance of an item for a free-text query; 0 = no match. */
export function searchScore(item: SearchableIntegration, q: string): number {
  const needle = normalizeSearchText(q);
  if (!needle) return 1;
  const name = normalizeSearchText(item.name);
  const short = normalizeSearchText(item.shortName);
  if (name === needle || short === needle) return 100;
  if (name.startsWith(needle) || short.startsWith(needle)) return 80;
  if (name.includes(needle) || short.includes(needle)) return 60;
  const words = needle.split(" ");
  const fields = [...item.keywords, ...(item.presets ?? [])].map(normalizeSearchText);
  if (fields.some((f) => f === needle)) return 50;
  if (fields.some((f) => f.includes(needle))) return 40;
  const summary = normalizeSearchText(item.summary);
  if (words.every((w) => summary.includes(w) || name.includes(w) || fields.some((f) => f.includes(w)))) return 20;
  return 0;
}

export function matchesFilters(item: Pick<SearchableIntegration, "category" | "modes">, query: Pick<IntegrationQuery, "categories" | "modes">): boolean {
  if (query.categories.length && !query.categories.includes(item.category)) return false;
  return query.modes.every((m) => item.modes.includes(m));
}

const categoryRank = new Map(INTEGRATION_CATEGORIES.map((c, i) => [c, i]));

/** Default order: category → editorial tier → name. */
export function compareDefault(a: SearchableIntegration, b: SearchableIntegration): number {
  return (categoryRank.get(a.category) ?? 0) - (categoryRank.get(b.category) ?? 0) || a.tier - b.tier || a.name.localeCompare(b.name);
}

/** Items matching the query; sorted by relevance when searching, otherwise in default order. */
export function filterIntegrations<T extends SearchableIntegration>(items: readonly T[], query: IntegrationQuery): T[] {
  const scored = items.filter((item) => matchesFilters(item, query)).map((item) => ({ item, score: searchScore(item, query.q) }));
  const matched = scored.filter((s) => s.score > 0);
  if (query.q) matched.sort((x, y) => y.score - x.score || compareDefault(x.item, y.item));
  else matched.sort((x, y) => compareDefault(x.item, y.item));
  return matched.map((s) => s.item);
}

/** Result count per category when that chip would be added (search + mode filters applied). */
export function countByCategory<T extends SearchableIntegration>(items: readonly T[], query: IntegrationQuery): Record<IntegrationCategory, number> {
  const counts = Object.fromEntries(INTEGRATION_CATEGORIES.map((c) => [c, 0])) as Record<IntegrationCategory, number>;
  for (const item of items) {
    if (searchScore(item, query.q) > 0 && matchesFilters(item, { categories: [], modes: query.modes })) counts[item.category] += 1;
  }
  return counts;
}

/** Result count per mode when that chip would be added (search + category filters + other modes applied). */
export function countByMode<T extends SearchableIntegration>(items: readonly T[], query: IntegrationQuery): Record<IntegrationMode, number> {
  const counts = Object.fromEntries(INTEGRATION_MODES.map((m) => [m, 0])) as Record<IntegrationMode, number>;
  for (const item of items) {
    if (searchScore(item, query.q) === 0 || !matchesFilters(item, { categories: query.categories, modes: [] })) continue;
    for (const m of INTEGRATION_MODES) {
      if (item.modes.includes(m) && query.modes.every((sel) => sel === m || item.modes.includes(sel))) counts[m] += 1;
    }
  }
  return counts;
}

/** Group items by category in catalogue order (empty categories omitted). */
export function groupByCategory<T extends SearchableIntegration>(items: readonly T[]): Array<{ category: IntegrationCategory; items: T[] }> {
  return INTEGRATION_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter((g) => g.items.length > 0);
}

/* ---------- related Tracking Knowledge ---------- */

export interface KnowledgeMatchable {
  platforms: string[];
  shopSystems: string[];
  tags: string[];
  publishedAt: string;
}

/**
 * Articles about an integration: the article's `platforms` / `shopSystems` name the catalogue slug,
 * or one of its `tags` is listed in the entry's `knowledgeTags`. Direct platform matches rank first,
 * then tag matches, newest first. No fallback to unrelated articles.
 */
export function relatedKnowledgeFor<T extends KnowledgeMatchable>(entry: Pick<IntegrationCatalogEntry, "slug" | "knowledgeTags">, articles: readonly T[], limit = 3): T[] {
  const tags = new Set(entry.knowledgeTags);
  return articles
    .map((a) => ({ a, score: (a.platforms.includes(entry.slug) || a.shopSystems.includes(entry.slug) ? 3 : 0) + a.tags.filter((t) => tags.has(t)).length }))
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || y.a.publishedAt.localeCompare(x.a.publishedAt))
    .slice(0, limit)
    .map((s) => s.a);
}
