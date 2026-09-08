import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the helpers under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));
vi.mock("@/lib/knowledge", async () => {
  const actual = await vi.importActual<typeof Knowledge>("@/lib/knowledge");
  return { ...actual, listArticles: vi.fn(async () => []), listLearningPaths: vi.fn(async () => []), readLearningPaths: vi.fn(() => []) };
});

import type * as Knowledge from "@/lib/knowledge";
import type { ArticleMeta, LearningPath, LearningPathWithArticles } from "@/lib/knowledge";
import type { IntegrationCatalogEntry } from "@/lib/integrations-catalog";
import {
  DEFAULT_BOARD_FILTERS,
  REVIEW_STALE_DAYS,
  ageInDays,
  boardFiltered,
  boardQueryString,
  buildFeedbackRows,
  buildGroup,
  buildPathRows,
  countTakeaways,
  coverageFor,
  filterGroups,
  isReviewStale,
  lastReviewOf,
  parseBoardFilters,
  pathCoverage,
  preferredArticleHref,
  publicHref,
  readBuildInfo,
  summarizeBoard,
  toVersion,
  voteCounts,
  type ContentGroup,
  type ContentVersion,
} from "./content";

const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const DAY = 86_400_000;
const LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;

function article(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    translationGroupId: "consent-mode-v2-guide",
    slug: "consent-mode-v2-guide",
    locale: "en",
    title: "Consent Mode v2",
    description: "d",
    excerpt: "e",
    category: "consent",
    tags: ["consent-mode"],
    author: "track-editorial",
    publishedAt: "2026-09-02T00:00:00.000Z",
    updatedAt: null,
    reviewedAt: "2026-09-03T00:00:00.000Z",
    status: "published",
    topic: "consent-privacy",
    platforms: ["google-ads"],
    shopSystems: [],
    contentType: "guide",
    level: "intermediate",
    coverAlt: "",
    readingMinutes: 7,
    sources: [],
    legalNotice: false,
    featured: false,
    headings: [],
    ...overrides,
  };
}

const version = (locale: (typeof LOCALES)[number], overrides: Partial<ArticleMeta> = {}, takeaways = 4): ContentVersion => toVersion(article({ locale, ...overrides }), locale, takeaways, NOW);

describe("links", () => {
  it("prefixes public paths with the locale and prefers the operator's language, then English, then any version", () => {
    expect(publicHref("de", "/tracking-knowledge")).toBe("/de/tracking-knowledge");
    expect(preferredArticleHref({ en: "a", de: "b" }, "de")).toBe("/de/tracking-knowledge/b");
    expect(preferredArticleHref({ en: "a", fr: "c" }, "de")).toBe("/en/tracking-knowledge/a");
    expect(preferredArticleHref({ fr: "c" }, "xx")).toBe("/fr/tracking-knowledge/c");
    expect(preferredArticleHref({}, "en")).toBeNull();
  });
});

describe("front matter helpers", () => {
  it("counts only non-empty takeaway strings", () => {
    expect(countTakeaways(["a", " ", "", 3, "b"])).toBe(2);
    expect(countTakeaways("a")).toBe(0);
    expect(countTakeaways(undefined)).toBe(0);
  });

  it("derives the last review from reviewedAt, else the publication date, and flags stale published versions only", () => {
    expect(lastReviewOf({ reviewedAt: "2026-01-01", publishedAt: "2025-01-01" })).toBe("2026-01-01");
    expect(lastReviewOf({ reviewedAt: null, publishedAt: "2025-01-01" })).toBe("2025-01-01");
    expect(ageInDays("2026-09-01T12:00:00.000Z", NOW)).toBe(7);
    expect(ageInDays("not a date", NOW)).toBeNull();
    expect(ageInDays(null, NOW)).toBeNull();
    const old = new Date(NOW - (REVIEW_STALE_DAYS + 1) * DAY).toISOString();
    const fresh = new Date(NOW - (REVIEW_STALE_DAYS - 1) * DAY).toISOString();
    expect(isReviewStale({ status: "published", reviewedAt: null, publishedAt: old }, NOW)).toBe(true);
    expect(isReviewStale({ status: "published", reviewedAt: fresh, publishedAt: old }, NOW)).toBe(false);
    expect(isReviewStale({ status: "draft", reviewedAt: null, publishedAt: old }, NOW)).toBe(false);
  });
});

describe("board rows", () => {
  it("builds a version with a public link only when published", () => {
    expect(version("de").href).toBe("/de/tracking-knowledge/consent-mode-v2-guide");
    expect(version("de", { status: "draft" }).href).toBeNull();
    expect(version("en", {}, 0).takeaways).toBe(0);
  });

  it("marks a group complete only when every locale is published and collects the flags per locale", () => {
    const old = new Date(NOW - 400 * DAY).toISOString();
    const versions = {
      en: version("en"),
      de: version("de", { reviewedAt: null, publishedAt: old }),
      fr: version("fr", { status: "translated" }, 0),
      es: version("es"),
      it: version("it"),
    };
    const g = buildGroup("consent-mode-v2-guide", versions, LOCALES, "de");
    expect(g.title).toBe("Consent Mode v2");
    expect(g.topic).toBe("consent-privacy");
    expect(g.counts).toEqual({ draft: 0, translated: 1, reviewed: 0, published: 4 });
    expect(g.missing).toEqual(["nl"]);
    expect(g.complete).toBe(false);
    expect(g.staleReviews).toEqual(["de"]);
    expect(g.missingTakeaways).toEqual(["fr"]);
    expect(g.lastReviewedAt).toBe("2026-09-03T00:00:00.000Z");
    expect(g.attention).toBe(true);
    expect(g.href).toBe("/de/tracking-knowledge/consent-mode-v2-guide");
  });

  it("falls back to the first available version for the title and reports never-reviewed groups", () => {
    const g = buildGroup("x", { fr: version("fr", { title: "FR", reviewedAt: null }) }, LOCALES, "en");
    expect(g.title).toBe("FR");
    expect(g.lastReviewedAt).toBeNull();
    expect(g.href).toBe("/fr/tracking-knowledge/consent-mode-v2-guide");
    const complete = buildGroup("y", Object.fromEntries(LOCALES.map((l) => [l, version(l)])), LOCALES, "en");
    expect(complete.complete).toBe(true);
    expect(complete.attention).toBe(false);
  });

  it("sums totals and per-locale counts from the rows", () => {
    const a = buildGroup("a", Object.fromEntries(LOCALES.map((l) => [l, version(l)])), LOCALES, "en");
    const b = buildGroup("b", { en: version("en", { reviewedAt: null }, 0), de: version("de", { status: "draft" }) }, LOCALES, "en");
    const { totals, perLocale } = summarizeBoard([a, b], LOCALES);
    expect(totals).toEqual({ groups: 2, complete: 1, incomplete: 1, attention: 1, versions: { draft: 1, translated: 0, reviewed: 0, published: 7 }, missingVersions: 4, missingTakeaways: 1, staleReviews: 0, neverReviewed: 0 });
    const en = perLocale.find((p) => p.locale === "en")!;
    expect(en.counts.published).toBe(2);
    expect(en.missingTakeaways).toBe(1);
    expect(en.lastReviewedAt).toBe("2026-09-03T00:00:00.000Z");
    expect(perLocale.find((p) => p.locale === "nl")!.missing).toBe(1);
  });
});

describe("board filters", () => {
  const rows: ContentGroup[] = [
    buildGroup("complete", Object.fromEntries(LOCALES.map((l) => [l, version(l)])), LOCALES, "en"),
    buildGroup("takeaways", Object.fromEntries(LOCALES.map((l) => [l, version(l, { topic: "troubleshooting" }, 0)])), LOCALES, "en"),
    buildGroup("draft", { en: version("en", { status: "draft" }) }, LOCALES, "en"),
  ];

  it("reads valid values and falls back to the full board for anything else", () => {
    expect(parseBoardFilters({})).toEqual(DEFAULT_BOARD_FILTERS);
    expect(parseBoardFilters({ view: "stale", topic: "consent-privacy" })).toEqual({ view: "stale", topic: "consent-privacy" });
    expect(parseBoardFilters({ view: ["takeaways"], topic: "nope" })).toEqual({ view: "takeaways", topic: null });
    expect(parseBoardFilters({ view: "x" })).toEqual(DEFAULT_BOARD_FILTERS);
  });

  it("serialises only non-default filters", () => {
    expect(boardQueryString(DEFAULT_BOARD_FILTERS)).toBe("");
    expect(boardQueryString({ view: "attention", topic: null })).toBe("?view=attention");
    expect(boardQueryString({ view: "all", topic: "troubleshooting" })).toBe("?topic=troubleshooting");
    expect(boardFiltered(DEFAULT_BOARD_FILTERS)).toBe(false);
    expect(boardFiltered({ view: "all", topic: "troubleshooting" })).toBe(true);
  });

  it("filters by view and topic", () => {
    const ids = (filters: Parameters<typeof filterGroups>[1]) => filterGroups(rows, filters).map((g) => g.translationGroupId);
    expect(ids(DEFAULT_BOARD_FILTERS)).toEqual(["complete", "takeaways", "draft"]);
    expect(ids({ view: "attention", topic: null })).toEqual(["takeaways", "draft"]);
    expect(ids({ view: "incomplete", topic: null })).toEqual(["draft"]);
    expect(ids({ view: "takeaways", topic: null })).toEqual(["takeaways"]);
    expect(ids({ view: "unpublished", topic: null })).toEqual(["draft"]);
    expect(ids({ view: "stale", topic: null })).toEqual([]);
    expect(ids({ view: "all", topic: "troubleshooting" })).toEqual(["takeaways"]);
  });
});

describe("feedback rows", () => {
  it("never invents a share and aggregates per article across locales, most negative first", () => {
    expect(voteCounts(0, 0).helpfulShare).toBeNull();
    expect(voteCounts(2, 1).helpfulShare).toBe(67);
    const rows = buildFeedbackRows(
      [
        { translationGroupId: "a", locale: "en", helpful: 3, notHelpful: 1, recentHelpful: 1, recentNotHelpful: 0, lastVoteAt: "2026-09-01T00:00:00.000Z" },
        { translationGroupId: "a", locale: "de", helpful: 0, notHelpful: 2, recentHelpful: 0, recentNotHelpful: 2, lastVoteAt: "2026-09-05T00:00:00.000Z" },
        { translationGroupId: "b", locale: "xx", helpful: 5, notHelpful: 0, recentHelpful: 0, recentNotHelpful: 0, lastVoteAt: null },
      ],
      new Map([["a", "Article A"]]),
      new Map([["a", "/en/tracking-knowledge/a"]]),
    );
    expect(rows.map((r) => r.translationGroupId)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ title: "Article A", href: "/en/tracking-knowledge/a", allTime: { helpful: 3, notHelpful: 3, total: 6, helpfulShare: 50 }, recent: { helpful: 1, notHelpful: 2, total: 3 }, lastVoteAt: "2026-09-05T00:00:00.000Z" });
    expect(rows[0]!.byLocale).toEqual({ en: voteCounts(3, 1), de: voteCounts(0, 2) });
    expect(rows[1]).toMatchObject({ title: null, href: null, byLocale: {}, lastVoteAt: null });
  });
});

describe("learning paths", () => {
  const raw: LearningPath = { id: "p", title: "Path", description: "", groupIds: ["a", "b", "c"] };
  const resolved: LearningPathWithArticles = { ...raw, articles: [article({ translationGroupId: "a" }), article({ translationGroupId: "c" })], readingMinutes: 14 };

  it("reports listed vs. resolved ids and hub visibility per locale", () => {
    expect(pathCoverage("en", raw, resolved)).toEqual({ locale: "en", title: "Path", description: "", listed: 3, resolved: 2, unresolved: ["b"], readingMinutes: 14, visible: true });
    expect(pathCoverage("de", raw, undefined)).toMatchObject({ resolved: 0, unresolved: ["a", "b", "c"], readingMinutes: 0, visible: false });
  });

  it("builds one row per path id across locales with missing locales and unresolved totals", () => {
    const byLocale = new Map<(typeof LOCALES)[number], { raw: LearningPath[]; resolved: LearningPathWithArticles[] }>([
      ["en", { raw: [raw], resolved: [resolved] }],
      ["de", { raw: [{ ...raw, title: "Pfad" }, { id: "q", title: "Q", description: "", groupIds: ["a"] }], resolved: [] }],
    ]);
    const rows = buildPathRows(byLocale, LOCALES);
    expect(rows.map((r) => r.id)).toEqual(["p", "q"]);
    expect(rows[0]).toMatchObject({ title: "Path", missingLocales: ["fr", "es", "it", "nl"], unresolvedTotal: 4, attention: true });
    expect(rows[1]).toMatchObject({ title: "Q", missingLocales: ["en", "fr", "es", "it", "nl"], attention: true });
  });
});

describe("integration coverage", () => {
  const entry = { slug: "google-ads", name: "Google Ads", kind: "destination", category: "ads", docsUrl: "https://example.test/docs", verifiedAt: "2026-08-01", knowledgeTags: ["gclid"] } as IntegrationCatalogEntry;

  it("matches articles by platform slug or knowledge tag per locale, the same rule as the public page", () => {
    const published = new Map<(typeof LOCALES)[number], ArticleMeta[]>([
      ["en", [article({ translationGroupId: "a" }), article({ translationGroupId: "b", platforms: [], tags: ["gclid"] }), article({ translationGroupId: "c", platforms: ["meta"], tags: [] })]],
      ["de", [article({ translationGroupId: "a", locale: "de" })]],
    ]);
    const row = coverageFor(entry, published, LOCALES, "de");
    expect(row.perLocale).toEqual({ en: 2, de: 1, fr: 0, es: 0, it: 0, nl: 0 });
    expect(row.groups).toEqual(["a", "b"]);
    expect(row.href).toBe("/de/integrations/google-ads");
    expect(row.vendorDocsUrl).toBe("https://example.test/docs");
    expect(coverageFor({ ...entry, knowledgeTags: [] }, new Map(), LOCALES, "xx")).toMatchObject({ groups: [], href: "/en/integrations/google-ads" });
  });
});

describe("build info", () => {
  it("returns null without a build output instead of inventing a build time", () => {
    expect(readBuildInfo("/definitely/not/a/dir")).toBeNull();
  });
});
