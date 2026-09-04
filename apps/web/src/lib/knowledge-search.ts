import type { ArticleFilters, ContentType, Level, RecencyId, TopicId } from "./knowledge";

/**
 * Locale-specific full-text search of the Tracking Knowledge hub (supplement §6): title, description,
 * excerpt, headings and body text with typo tolerance (bounded edit distance per token), accent and
 * umlaut folding (ä → a and ae, é → e, ß → ss …), combined with the directory filters and real facet
 * counts. Pure TypeScript without I/O or a search library, so the same module serves the server
 * (index built from the loader, cached per locale in `knowledge.ts`), the client island (query
 * parsing + URL serialisation) and the unit tests.
 */

/* ---------- documents, taxonomy, query ---------- */

/** Search input per article: the listing metadata plus the plain body text and the headings. */
export interface SearchDocument {
  /** Stable id (the `translationGroupId`). */
  id: string;
  title: string;
  description: string;
  excerpt: string;
  headings: string[];
  body: string;
  topic: string;
  platforms: string[];
  shopSystems: string[];
  contentType: string;
  level: string;
  publishedAt: string;
  updatedAt: string | null;
}

/** Catalogue values the query parser and the facet counter validate against (`KNOWLEDGE_TAXONOMY` in knowledge.ts). */
export interface HubTaxonomy {
  topics: readonly string[];
  contentTypes: readonly string[];
  levels: readonly string[];
  /** Recency window id → days. */
  recencyDays: Readonly<Record<string, number>>;
}

/** Search text plus the single-valued directory filters (`?q=&topic=&platform=&shop=&type=&level=&recency=`). */
export interface HubQuery extends ArticleFilters {
  q: string;
}

export const EMPTY_HUB_QUERY: HubQuery = { q: "" };
export const MAX_QUERY_LENGTH = 80;
const MAX_QUERY_TOKENS = 8;
const SLUG_RE = /^[a-z0-9-]{3,120}$/;

export type FacetKey = "topic" | "platform" | "shopSystem" | "contentType" | "level" | "recency";
export const FACET_KEYS: readonly FacetKey[] = ["topic", "platform", "shopSystem", "contentType", "level", "recency"];

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined> | { get(name: string): string | null };

function readParam(source: ParamSource, name: string): string | undefined {
  if ("get" in source && typeof source.get === "function") {
    const v = source.get(name);
    return v === null ? undefined : v;
  }
  const v = (source as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly string[]): T | undefined {
  return value !== undefined && allowed.includes(value) ? (value as T) : undefined;
}

/** Query from URL search params (server `searchParams` object or `URLSearchParams`); unknown values are ignored. */
export function parseHubQuery(source: ParamSource, taxonomy: HubTaxonomy): HubQuery {
  const query: HubQuery = { q: normalizeQueryText(readParam(source, "q") ?? "") };
  const topic = oneOf<TopicId>(readParam(source, "topic"), taxonomy.topics);
  if (topic) query.topic = topic;
  const platform = readParam(source, "platform");
  if (platform && SLUG_RE.test(platform)) query.platform = platform;
  const shopSystem = readParam(source, "shop") ?? readParam(source, "shopSystem");
  if (shopSystem && SLUG_RE.test(shopSystem)) query.shopSystem = shopSystem;
  const contentType = oneOf<ContentType>(readParam(source, "type") ?? readParam(source, "contentType"), taxonomy.contentTypes);
  if (contentType) query.contentType = contentType;
  const level = oneOf<Level>(readParam(source, "level"), taxonomy.levels);
  if (level) query.level = level;
  const recency = oneOf<RecencyId>(readParam(source, "recency"), Object.keys(taxonomy.recencyDays));
  if (recency) query.recency = recency;
  return query;
}

export function normalizeQueryText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/** Canonical search string (`""` when nothing is set, otherwise `?q=…&topic=…&platform=…&shop=…&type=…&level=…&recency=…`). */
export function hubQueryToSearch(query: HubQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.topic) params.set("topic", query.topic);
  if (query.platform) params.set("platform", query.platform);
  if (query.shopSystem) params.set("shop", query.shopSystem);
  if (query.contentType) params.set("type", query.contentType);
  if (query.level) params.set("level", query.level);
  if (query.recency) params.set("recency", query.recency);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasHubQuery(query: HubQuery): boolean {
  return query.q.length > 0 || hasHubFilters(query);
}

export function hasHubFilters(query: HubQuery): boolean {
  return FACET_KEYS.some((key) => query[key] !== undefined);
}

/** The query without one facet (used for that facet's counts) or without every facet. */
export function withoutFacet(query: HubQuery, key: FacetKey | "all"): HubQuery {
  const next: HubQuery = { q: query.q };
  for (const facet of FACET_KEYS) {
    if (facet === key || key === "all") continue;
    const value = query[facet];
    if (value !== undefined) Object.assign(next, { [facet]: value });
  }
  return next;
}

/* ---------- folding + tokenising ---------- */

const TRANSLIT: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l" };

/**
 * Lower-case, accent-folded text. `umlauts: "base"` maps ä/ö/ü to a/o/u (like every other accented
 * letter); `"translit"` maps them to ae/oe/ue, the usual keyboard spelling. ß is always `ss`.
 */
export function foldText(text: string, umlauts: "base" | "translit" = "base"): string {
  let s = text.toLowerCase();
  if (umlauts === "translit") s = s.replace(/[äöü]/g, (m) => TRANSLIT[m] ?? m);
  s = s.replace(/[ßæœøđł]/g, (m) => TRANSLIT[m] ?? m);
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** Both foldings of a word when they differ (`datenqualität` → `datenqualitat`, `datenqualitaet`). */
export function foldVariants(word: string): string[] {
  const base = foldText(word, "base");
  const translit = foldText(word, "translit");
  return base === translit ? [base] : [base, translit];
}

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;
const ASCII_TOKEN = /^[a-z0-9]+$/;

/** Folded tokens (all variants) of a text; tokens shorter than two characters are dropped. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(TOKEN_SPLIT)) {
    if (raw.length < 2) continue;
    for (const variant of foldVariants(raw)) {
      const token = variant.replace(/[^a-z0-9]+/g, "");
      if (token.length >= 2 && ASCII_TOKEN.test(token)) out.push(token);
    }
  }
  return out;
}

/** Raw query words → folded variant groups (one group per typed word), stop words dropped when other words remain. */
export function queryTokenGroups(q: string): string[][] {
  const words = q.split(TOKEN_SPLIT).filter((w) => w.length >= 2);
  const groups = words.map((w) => Array.from(new Set(foldVariants(w).map((v) => v.replace(/[^a-z0-9]+/g, "")).filter((v) => v.length >= 2 && ASCII_TOKEN.test(v))))).filter((g) => g.length > 0);
  const meaningful = groups.filter((g) => !g.every((t) => STOP_WORDS.has(t)));
  return (meaningful.length > 0 ? meaningful : groups).slice(0, MAX_QUERY_TOKENS);
}

const STOP_WORDS = new Set([
  // en
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "it", "this", "that", "as", "by", "at", "from", "be", "your", "you", "we", "not", "what", "how", "do", "does",
  // de
  "der", "die", "das", "und", "oder", "ein", "eine", "einen", "einem", "eines", "einer", "im", "mit", "fur", "fuer", "von", "zu", "zur", "zum", "ist", "sind", "es", "auf", "an", "als", "bei", "aus", "den", "dem", "des", "nicht", "wie", "was", "wird", "werden", "sich", "auch", "so", "wir", "du",
]);

/* ---------- markdown → search text ---------- */

const INLINE_MARKUP = /[`*~]+|\[([^\]]*)\]\([^)]*\)|<[^>]+>/g;
/** Emphasis underscores at word boundaries only — identifiers such as `event_id` keep theirs. */
const EMPHASIS_UNDERSCORE = /(^|\s)_+(?=\S)|(?<=\S)_+(?=\s|$)/g;

function stripInline(text: string): string {
  return text
    .replace(INLINE_MARKUP, (match, linkText: string | undefined) => (linkText !== undefined ? linkText : ""))
    .replace(EMPHASIS_UNDERSCORE, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heading texts (`#` … `######`) of an MDX body without inline markup. */
export function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) {
      const text = stripInline(m[1]);
      if (text) headings.push(text);
    }
  }
  return headings;
}

/** Body text of an MDX file as plain words: no import/export lines, JSX tags, fences, tables or link URLs. */
export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !/^\s*(import|export)\s/.test(line) && !/^\s*```/.test(line) && !/^\s*\|?\s*:?-{3,}/.test(line))
    .map((line) => stripInline(line.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, "").replace(/\|/g, " ")))
    .filter(Boolean)
    .join(" ");
}

/* ---------- index ---------- */

export interface SearchIndex {
  docs: SearchDocument[];
  /** term → doc index → weighted term score. */
  terms: Map<string, Map<number, number>>;
  vocabulary: string[];
  /** Folded title per document (phrase bonus). */
  titles: string[];
  taxonomy: HubTaxonomy;
  /** Facet values that occur in the corpus (platforms and shop systems have no fixed catalogue). */
  facetValues: { platform: string[]; shopSystem: string[] };
}

const FIELD_WEIGHTS = { title: 10, headings: 5, description: 4, excerpt: 3, body: 1 } as const;

function addTerms(terms: Map<string, Map<number, number>>, doc: number, text: string, weight: number) {
  const tf = new Map<string, number>();
  for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + 1);
  for (const [token, count] of tf) {
    let postings = terms.get(token);
    if (!postings) {
      postings = new Map();
      terms.set(token, postings);
    }
    postings.set(doc, (postings.get(doc) ?? 0) + weight * (1 + Math.log(count)));
  }
}

export function buildSearchIndex(docs: readonly SearchDocument[], taxonomy: HubTaxonomy): SearchIndex {
  const terms = new Map<string, Map<number, number>>();
  const platforms = new Set<string>();
  const shopSystems = new Set<string>();
  docs.forEach((doc, i) => {
    addTerms(terms, i, doc.title, FIELD_WEIGHTS.title);
    addTerms(terms, i, doc.headings.join(" "), FIELD_WEIGHTS.headings);
    addTerms(terms, i, doc.description, FIELD_WEIGHTS.description);
    addTerms(terms, i, doc.excerpt, FIELD_WEIGHTS.excerpt);
    addTerms(terms, i, doc.body, FIELD_WEIGHTS.body);
    for (const p of doc.platforms) platforms.add(p);
    for (const s of doc.shopSystems) shopSystems.add(s);
  });
  return {
    docs: [...docs],
    terms,
    vocabulary: Array.from(terms.keys()).sort(),
    titles: docs.map((d) => foldText(d.title)),
    taxonomy,
    facetValues: { platform: Array.from(platforms).sort(), shopSystem: Array.from(shopSystems).sort() },
  };
}

/* ---------- matching ---------- */

/** Allowed typos per token length: none up to 3 characters, one up to 7, two beyond. */
export function maxEdits(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * Optimal string alignment distance (insert, delete, substitute, adjacent transposition), capped:
 * returns `max + 1` as soon as the distance exceeds `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    const cur: number[] = new Array<number>(cols);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, (prev2[j - 2] ?? 0) + 1);
      cur[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[cols - 1] ?? max + 1, max + 1);
}

const QUALITY = { exact: 1, prefix: 0.7, typo1: 0.5, typo2: 0.3 } as const;
const PHRASE_BONUS = 20;

/** Best (quality × term weight) per document for one query token, over exact, prefix and fuzzy vocabulary matches. */
function matchToken(index: SearchIndex, token: string): Map<number, number> {
  const best = new Map<number, number>();
  const apply = (term: string, quality: number) => {
    const postings = index.terms.get(term);
    if (!postings) return;
    for (const [doc, weight] of postings) {
      const score = weight * quality;
      if (score > (best.get(doc) ?? 0)) best.set(doc, score);
    }
  };
  apply(token, QUALITY.exact);
  const edits = /^\d+$/.test(token) ? 0 : maxEdits(token.length);
  const prefix = token.length >= 3;
  if (!prefix && edits === 0) return best;
  for (const term of index.vocabulary) {
    if (term === token) continue;
    if (prefix && term.startsWith(token)) {
      apply(term, QUALITY.prefix);
      continue;
    }
    if (edits === 0 || Math.abs(term.length - token.length) > edits) continue;
    const d = editDistance(token, term, edits);
    if (d === 1) apply(term, QUALITY.typo1);
    else if (d === 2 && edits >= 2) apply(term, QUALITY.typo2);
  }
  return best;
}

/** Documents matching every query word (a word matches through any of its folded variants) with their scores; `null` without text. */
function textMatches(index: SearchIndex, q: string): Map<number, number> | null {
  const groups = queryTokenGroups(q);
  if (groups.length === 0) return null;
  let result: Map<number, number> | null = null;
  for (const group of groups) {
    const merged = new Map<number, number>();
    for (const variant of group) {
      for (const [doc, score] of matchToken(index, variant)) if (score > (merged.get(doc) ?? 0)) merged.set(doc, score);
    }
    if (result === null) {
      result = merged;
    } else {
      const next = new Map<number, number>();
      for (const [doc, score] of result) {
        const add = merged.get(doc);
        if (add !== undefined) next.set(doc, score + add);
      }
      result = next;
    }
    if (result.size === 0) break;
  }
  if (result && groups.length > 1) {
    const phrase = foldText(q).replace(/[^a-z0-9]+/g, " ").trim();
    for (const [doc, score] of result) if (phrase && index.titles[doc]?.includes(phrase)) result.set(doc, score + PHRASE_BONUS);
  }
  return result ?? new Map();
}

/* ---------- filters + facets ---------- */

export function matchesFilters(doc: SearchDocument, filters: ArticleFilters, recencyDays: Readonly<Record<string, number>>, now: Date): boolean {
  if (filters.topic && doc.topic !== filters.topic) return false;
  if (filters.platform && !doc.platforms.includes(filters.platform)) return false;
  if (filters.shopSystem && !doc.shopSystems.includes(filters.shopSystem)) return false;
  if (filters.contentType && doc.contentType !== filters.contentType) return false;
  if (filters.level && doc.level !== filters.level) return false;
  if (filters.recency) {
    const days = recencyDays[filters.recency];
    if (days === undefined) return false;
    if (new Date(doc.updatedAt ?? doc.publishedAt).getTime() < now.getTime() - days * 86_400_000) return false;
  }
  return true;
}

export type FacetCounts = Record<FacetKey, Record<string, number>>;

export interface SearchHit {
  /** Position in `index.docs`. */
  index: number;
  doc: SearchDocument;
  score: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** Number of hits (text + every filter). */
  total: number;
  /** Number of documents in the index. */
  corpus: number;
  /** Hit count per facet value given the text and the other facets. */
  facets: FacetCounts;
}

function docDate(doc: SearchDocument): string {
  return doc.updatedAt ?? doc.publishedAt;
}

/** Text search + filters + facet counts; ranked by score, then newest first, then title. */
export function search(index: SearchIndex, query: HubQuery, now: Date = new Date()): SearchResult {
  const scores = textMatches(index, query.q);
  const candidates = scores === null ? index.docs.map((_, i) => i) : Array.from(scores.keys());
  const recencyDays = index.taxonomy.recencyDays;
  const hits: SearchHit[] = [];
  for (const i of candidates) {
    const doc = index.docs[i]!;
    if (!matchesFilters(doc, query, recencyDays, now)) continue;
    hits.push({ index: i, doc, score: scores?.get(i) ?? 0 });
  }
  hits.sort((a, b) => b.score - a.score || docDate(b.doc).localeCompare(docDate(a.doc)) || a.doc.title.localeCompare(b.doc.title));

  const facetValues: Record<FacetKey, readonly string[]> = {
    topic: index.taxonomy.topics,
    platform: index.facetValues.platform,
    shopSystem: index.facetValues.shopSystem,
    contentType: index.taxonomy.contentTypes,
    level: index.taxonomy.levels,
    recency: Object.keys(recencyDays),
  };
  const facets = {} as FacetCounts;
  for (const key of FACET_KEYS) {
    const counts: Record<string, number> = {};
    for (const value of facetValues[key]) counts[value] = 0;
    const others = withoutFacet(query, key);
    for (const i of candidates) {
      const doc = index.docs[i]!;
      if (!matchesFilters(doc, others, recencyDays, now)) continue;
      const values = key === "platform" ? doc.platforms : key === "shopSystem" ? doc.shopSystems : key === "recency" ? recencyValuesFor(doc, recencyDays, now) : [doc[key]];
      for (const v of values) if (v in counts) counts[v] = (counts[v] ?? 0) + 1;
    }
    facets[key] = counts;
  }
  return { hits, total: hits.length, corpus: index.docs.length, facets };
}

function recencyValuesFor(doc: SearchDocument, recencyDays: Readonly<Record<string, number>>, now: Date): string[] {
  const age = now.getTime() - new Date(docDate(doc)).getTime();
  return Object.entries(recencyDays)
    .filter(([, days]) => age <= days * 86_400_000)
    .map(([id]) => id);
}
