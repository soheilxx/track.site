import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_HUB_QUERY,
  buildSearchIndex,
  editDistance,
  extractHeadings,
  foldText,
  foldVariants,
  hasHubQuery,
  hubQueryToSearch,
  maxEdits,
  parseHubQuery,
  plainTextFromMarkdown,
  search,
  tokenize,
  withoutFacet,
  type HubTaxonomy,
  type SearchDocument,
} from "./knowledge-search";

vi.mock("server-only", () => ({}));

const TAXONOMY: HubTaxonomy = {
  topics: ["getting-started", "server-side-tracking", "consent-privacy", "ai-data-quality"],
  contentTypes: ["guide", "tutorial", "reference", "explainer", "update"],
  levels: ["beginner", "intermediate", "advanced"],
  recencyDays: { "30d": 30, "90d": 90, "365d": 365 },
};

const NOW = new Date("2026-09-04T12:00:00Z");

function doc(partial: Partial<SearchDocument> & { id: string; title: string }): SearchDocument {
  return {
    description: "",
    excerpt: "",
    headings: [],
    body: "",
    topic: "getting-started",
    platforms: [],
    shopSystems: [],
    contentType: "guide",
    level: "intermediate",
    publishedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: null,
    ...partial,
  };
}

const DOCS: SearchDocument[] = [
  doc({
    id: "meta-capi",
    title: "Meta Conversions API in practice: event_id and deduplication",
    description: "Run Pixel and Conversions API side by side without double counting.",
    headings: ["The endpoint in one line", "Hashing user data"],
    body: "Meta counts a browser event and a server event as one when both carry the same event_id. Test event codes verify deliveries.",
    topic: "server-side-tracking",
    platforms: ["meta"],
    contentType: "tutorial",
    publishedAt: "2026-09-03T00:00:00.000Z",
  }),
  doc({
    id: "datenqualitaet",
    title: "Datenqualität im Tracking: Prüfungen für jede Übergabe",
    description: "Wie fehlende Währungen, doppelte Käufe und leere Werte erkannt werden.",
    headings: ["Prüfregeln", "Straße und Hausnummer"],
    body: "Der Health Score bündelt sechs Komponenten. Große Abweichungen lösen eine Warnung aus.",
    topic: "ai-data-quality",
    contentType: "reference",
    level: "advanced",
    publishedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  }),
  doc({
    id: "consent-mode",
    title: "Consent Mode v2 without the guesswork",
    description: "Purposes, signals and what a server-side router must do.",
    body: "Denied consent means the destination receives nothing. Shopify checkouts need the consent state from the storefront.",
    topic: "consent-privacy",
    shopSystems: ["shopify"],
    contentType: "guide",
    level: "beginner",
    publishedAt: "2026-05-01T00:00:00.000Z",
  }),
  doc({
    id: "café",
    title: "Résumé of the café tracking pilot",
    body: "A short explainer.",
    topic: "getting-started",
    contentType: "explainer",
    level: "beginner",
    publishedAt: "2025-01-01T00:00:00.000Z",
  }),
];

const INDEX = buildSearchIndex(DOCS, TAXONOMY);
const ids = (q: string, filters: Record<string, string> = {}) => search(INDEX, { q, ...filters } as never, NOW).hits.map((h) => h.doc.id);

describe("folding", () => {
  it("folds accents and umlauts in both spellings", () => {
    expect(foldText("Résumé café")).toBe("resume cafe");
    expect(foldText("Straße")).toBe("strasse");
    expect(foldVariants("Datenqualität")).toEqual(["datenqualitat", "datenqualitaet"]);
    expect(foldVariants("Prüfung")).toEqual(["prufung", "pruefung"]);
    expect(foldVariants("event")).toEqual(["event"]);
  });

  it("tokenises on non-alphanumerics and indexes every umlaut variant", () => {
    expect(tokenize("event_id, Übergabe & GA4!")).toEqual(["event", "id", "ubergabe", "uebergabe", "ga4"]);
    expect(tokenize("a b")).toEqual([]);
  });
});

describe("edit distance", () => {
  it("counts substitutions, insertions, deletions and transpositions once", () => {
    expect(editDistance("conversion", "conversion", 2)).toBe(0);
    expect(editDistance("conversins", "conversions", 2)).toBe(1);
    expect(editDistance("dedublication", "deduplication", 2)).toBe(1);
    expect(editDistance("cosnent", "consent", 2)).toBe(1);
    expect(editDistance("sever", "server", 2)).toBe(1);
    expect(editDistance("meta", "pixel", 2)).toBe(3);
  });

  it("bounds typos by token length", () => {
    expect(maxEdits(3)).toBe(0);
    expect(maxEdits(5)).toBe(1);
    expect(maxEdits(9)).toBe(2);
  });
});

describe("search", () => {
  it("matches title, description, headings and body text", () => {
    expect(ids("deduplication")).toEqual(["meta-capi"]);
    expect(ids("double counting")).toEqual(["meta-capi"]);
    expect(ids("hashing")).toEqual(["meta-capi"]);
    expect(ids("test event codes")).toEqual(["meta-capi"]);
    expect(ids("storefront")).toEqual(["consent-mode"]);
  });

  it("tolerates typos and prefixes", () => {
    expect(ids("dedublication")).toEqual(["meta-capi"]);
    expect(ids("conversins api")).toEqual(["meta-capi"]);
    expect(ids("cosnent")).toEqual(["consent-mode"]);
    expect(ids("conv")).toEqual(["meta-capi"]);
    expect(ids("xyzzy")).toEqual([]);
  });

  it("folds accents and finds umlaut words in every spelling", () => {
    expect(ids("resume cafe")).toEqual(["café"]);
    expect(ids("Datenqualität")).toEqual(["datenqualitaet"]);
    expect(ids("datenqualitaet")).toEqual(["datenqualitaet"]);
    expect(ids("datenqualitat")).toEqual(["datenqualitaet"]);
    expect(ids("strasse")).toEqual(["datenqualitaet"]);
    expect(ids("Prüfregeln")).toEqual(["datenqualitaet"]);
  });

  it("ranks title matches above body matches and newest first without a query", () => {
    expect(ids("consent")[0]).toBe("consent-mode");
    // no text: newest first by update or publication date
    expect(ids("")).toEqual(["meta-capi", "datenqualitaet", "consent-mode", "café"]);
  });

  it("combines the text with every filter", () => {
    expect(ids("", { topic: "consent-privacy" })).toEqual(["consent-mode"]);
    expect(ids("consent", { topic: "server-side-tracking" })).toEqual([]);
    expect(ids("", { platform: "meta" })).toEqual(["meta-capi"]);
    expect(ids("", { shopSystem: "shopify" })).toEqual(["consent-mode"]);
    expect(ids("", { contentType: "reference", level: "advanced" })).toEqual(["datenqualitaet"]);
    expect(ids("", { recency: "30d" })).toEqual(["meta-capi", "datenqualitaet"]);
    expect(ids("", { recency: "365d" })).toEqual(["meta-capi", "datenqualitaet", "consent-mode"]);
    expect(ids("", { level: "beginner", recency: "30d" })).toEqual([]);
  });

  it("reports real hit counts and facet counts given the text and the other facets", () => {
    const all = search(INDEX, EMPTY_HUB_QUERY, NOW);
    expect(all.total).toBe(4);
    expect(all.corpus).toBe(4);
    expect(all.facets.topic).toEqual({ "getting-started": 1, "server-side-tracking": 1, "consent-privacy": 1, "ai-data-quality": 1 });
    expect(all.facets.platform).toEqual({ meta: 1 });
    expect(all.facets.shopSystem).toEqual({ shopify: 1 });
    expect(all.facets.level).toEqual({ beginner: 2, intermediate: 1, advanced: 1 });
    expect(all.facets.recency).toEqual({ "30d": 2, "90d": 2, "365d": 3 });

    const filtered = search(INDEX, { q: "", level: "beginner" }, NOW);
    expect(filtered.total).toBe(2);
    // the level facet counts ignore the level filter itself; the other facets respect it
    expect(filtered.facets.level).toEqual({ beginner: 2, intermediate: 1, advanced: 1 });
    expect(filtered.facets.topic).toEqual({ "getting-started": 1, "server-side-tracking": 0, "consent-privacy": 1, "ai-data-quality": 0 });

    const text = search(INDEX, { q: "consent" }, NOW);
    expect(text.total).toBe(1);
    expect(text.facets.contentType.guide).toBe(1);
    expect(text.facets.contentType.tutorial).toBe(0);
  });

  it("drops stop words unless the query consists of nothing else", () => {
    expect(ids("the deduplication")).toEqual(["meta-capi"]);
    // a query of stop words only still matches literally (three documents contain "the")
    expect(ids("the")).toHaveLength(3);
    expect(ids("the")).toContain("meta-capi");
  });
});

describe("query parsing and URL state", () => {
  it("parses URL params defensively and serialises them canonically", () => {
    const query = parseHubQuery({ q: "  meta   capi ", topic: "consent-privacy", shop: "shopify", type: "guide", level: "beginner", recency: "90d", platform: "meta" }, TAXONOMY);
    expect(query).toEqual({ q: "meta capi", topic: "consent-privacy", shopSystem: "shopify", contentType: "guide", level: "beginner", recency: "90d", platform: "meta" });
    expect(hubQueryToSearch(query)).toBe("?q=meta+capi&topic=consent-privacy&platform=meta&shop=shopify&type=guide&level=beginner&recency=90d");
    expect(parseHubQuery(new URLSearchParams(hubQueryToSearch(query)), TAXONOMY)).toEqual(query);
    expect(parseHubQuery({ topic: "nope", level: "<script>", recency: "1d", platform: "a b", q: "x".repeat(200) }, TAXONOMY)).toEqual({ q: "x".repeat(80) });
    expect(hubQueryToSearch(EMPTY_HUB_QUERY)).toBe("");
    expect(hasHubQuery(EMPTY_HUB_QUERY)).toBe(false);
    expect(hasHubQuery({ q: "", level: "advanced" })).toBe(true);
    expect(withoutFacet({ q: "a", topic: "getting-started", level: "beginner" }, "topic")).toEqual({ q: "a", level: "beginner" });
    expect(withoutFacet({ q: "a", topic: "getting-started" }, "all")).toEqual({ q: "a" });
  });
});

describe("markdown extraction", () => {
  it("extracts headings and plain body text without markup", () => {
    const md = "import X from 'y'\n\n## The `event_id` field\n\nSee [the docs](https://example.com) for **details**.\n\n```js\nconst a = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n### Résumé";
    expect(extractHeadings(md)).toEqual(["The event_id field", "Résumé"]);
    const text = plainTextFromMarkdown(md);
    expect(text).toContain("See the docs for details.");
    expect(text).not.toContain("https://example.com");
    expect(text).not.toContain("import X");
    expect(text).toContain("const a = 1");
  });
});

describe("real corpus", () => {
  it("finds the published articles of both locales with typos and umlauts", async () => {
    const { searchKnowledge } = await import("./knowledge");
    const en = await searchKnowledge("en", { q: "meta conversins api" }, NOW);
    expect(en.hits[0]?.translationGroupId).toBe("meta-conversions-api-deduplication");
    expect(en.corpus).toBe(30);
    expect(en.facets.platform.meta).toBeGreaterThan(0);
    const de = await searchKnowledge("de", { q: "Deduplizierung" }, NOW);
    expect(de.hits.length).toBeGreaterThan(0);
    expect(de.hits.every((a) => a.locale === "de")).toBe(true);
    const folded = await searchKnowledge("de", { q: "datenqualitaet" }, NOW);
    expect(folded.hits.length).toBeGreaterThan(0);
    const filtered = await searchKnowledge("en", { q: "", shopSystem: "shopify" }, NOW);
    expect(filtered.hits.every((a) => a.shopSystems.includes("shopify"))).toBe(true);
    expect(filtered.total).toBe(filtered.hits.length);
  });
});
