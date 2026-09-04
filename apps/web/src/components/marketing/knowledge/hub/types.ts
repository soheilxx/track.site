import type { ContentType, Level, TopicId } from "@/lib/knowledge";
import type { FacetKey, HubQuery } from "@/lib/knowledge-search";
import type { KnowledgeHubCopy } from "@/lib/marketing-copy/knowledge";

/**
 * Serialisable shapes shared by the server page, the search server action and the client island of
 * the Tracking Knowledge hub. Dates are pre-formatted on the server (one ICU, no hydration drift);
 * labels travel once as maps so the client never needs the (server-only) knowledge loader.
 */
export interface DirectoryItem {
  groupId: string;
  slug: string;
  title: string;
  excerpt: string;
  topic: TopicId;
  contentType: ContentType;
  level: Level;
  readingMinutes: number;
  date: { iso: string; label: string; updated: boolean };
}

export interface FacetOption {
  value: string;
  label: string;
  /** Real hit count given the search text and the other active facets. */
  count: number;
}

export type HubFacets = Record<FacetKey, FacetOption[]>;

export interface HubSearchResponse {
  /** Validated query the results belong to. */
  query: HubQuery;
  /** Canonical URL search string of `query` (`""` for the unfiltered hub). */
  search: string;
  items: DirectoryItem[];
  total: number;
  corpus: number;
  facets: HubFacets;
}

export interface HubLabels {
  topics: Record<TopicId, string>;
  types: Record<ContentType, string>;
  levels: Record<Level, string>;
}

/** Copy the client island needs (a subset of the hub copy plus the taxonomy labels). */
export interface HubIslandCopy {
  search: KnowledgeHubCopy["search"];
  directory: KnowledgeHubCopy["directory"];
  card: KnowledgeHubCopy["card"];
  labels: HubLabels;
}
