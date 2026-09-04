import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_LOCALES } from "@/i18n/routing";

vi.mock("server-only", () => ({}));

const {
  CONTENT_TYPES,
  KNOWLEDGE_NAME,
  KNOWLEDGE_PATH,
  LEVELS,
  TOPIC_IDS,
  alternatesForGroup,
  articlePath,
  authorFor,
  filterArticles,
  getArticle,
  hasFilters,
  listArticles,
  listTopics,
  parseFilters,
  pathsForGroup,
  relatedArticles,
  socialCardAlt,
  topicLabel,
  translationParity,
} = await import("./knowledge");

beforeEach(() => {
  process.env.HOST_MARKETING = "https://www.track.site";
});

const SLUG = /^[a-z0-9-]{3,120}$/;

describe("Tracking Knowledge content", () => {
  it("publishes 30 groups in every active locale, every group in every locale", async () => {
    const parity = await translationParity();
    expect(parity).toHaveLength(30);
    for (const g of parity) {
      expect(g.complete, `${g.translationGroupId} is missing a published version`).toBe(true);
      for (const l of ACTIVE_LOCALES) expect(g.versions[l]?.status).toBe("published");
    }
    for (const locale of ACTIVE_LOCALES) expect(await listArticles(locale)).toHaveLength(30);
  });

  it("has unique, URL-safe slugs and a translationGroupId per locale", async () => {
    for (const locale of ACTIVE_LOCALES) {
      const articles = await listArticles(locale);
      const slugs = articles.map((a) => a.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      const groups = articles.map((a) => a.translationGroupId);
      expect(new Set(groups).size).toBe(groups.length);
      for (const a of articles) {
        expect(a.slug).toMatch(SLUG);
        expect(a.translationGroupId).toMatch(SLUG);
        expect(a.locale).toBe(locale);
      }
    }
  });

  it("uses only catalogued topics, content types and levels and has the required fields", async () => {
    for (const locale of ACTIVE_LOCALES) {
      for (const a of await listArticles(locale)) {
        expect(TOPIC_IDS, `${locale}/${a.slug} topic`).toContain(a.topic);
        expect(CONTENT_TYPES, `${locale}/${a.slug} contentType`).toContain(a.contentType);
        expect(LEVELS, `${locale}/${a.slug} level`).toContain(a.level);
        expect(a.title.length).toBeGreaterThan(10);
        expect(a.description.length).toBeGreaterThan(30);
        expect(a.readingMinutes).toBeGreaterThanOrEqual(1);
        expect(Number.isNaN(Date.parse(a.publishedAt))).toBe(false);
        expect(Array.isArray(a.platforms)).toBe(true);
        expect(Array.isArray(a.shopSystems)).toBe(true);
      }
    }
  });

  it("keeps the same topic taxonomy across the language versions of a group", async () => {
    const [first, ...rest] = ACTIVE_LOCALES;
    const reference = await listArticles(first!);
    for (const locale of rest) {
      const byGroup = new Map((await listArticles(locale)).map((a) => [a.translationGroupId, a]));
      for (const a of reference) {
        const twin = byGroup.get(a.translationGroupId);
        expect(twin, `${locale} version of ${a.translationGroupId}`).toBeDefined();
        expect(twin!.topic).toBe(a.topic);
        expect(twin!.platforms).toEqual(a.platforms);
        expect(twin!.shopSystems).toEqual(a.shopSystems);
      }
    }
  });

  it("resolves alternates per active locale so hreflang and the language switcher stay on the same article", async () => {
    const slugs = await alternatesForGroup("server-side-tracking-explained");
    for (const l of ACTIVE_LOCALES) expect(slugs[l]).toMatch(SLUG);
    const paths = await pathsForGroup("server-side-tracking-explained");
    for (const l of ACTIVE_LOCALES) expect(paths[l]).toBe(articlePath(slugs[l]!));
    expect(await alternatesForGroup("does-not-exist")).toEqual({});
  });

  it("loads an article by its localized slug and rejects unsafe slugs", async () => {
    const article = await getArticle("en", "server-side-tracking-explained");
    expect(article?.status).toBe("published");
    expect(article?.content.length).toBeGreaterThan(500);
    expect(article?.content).not.toMatch(/\]\(\/(?:[a-z]{2}\/)?blog\//);
    expect(await getArticle("en", "../etc/passwd")).toBeNull();
    expect(await getArticle("en", "no-such-article")).toBeNull();
  });

  it("uses the visible brand 'Track' in every article; 'track.site' only as a domain or address (supplement §2)", async () => {
    // a `track.site` that is not part of a host name, URL, e-mail address or URL path is a product mention
    const PRODUCT_MENTION = /(?<![A-Za-z0-9.@/])track\.site(?![A-Za-z0-9/])/i;
    for (const locale of ACTIVE_LOCALES) {
      for (const meta of await listArticles(locale, { includeUnpublished: true })) {
        const article = (await getArticle(locale, meta.slug))!;
        for (const [field, text] of [
          ["title", article.title],
          ["description", article.description],
          ["excerpt", article.excerpt],
          ["content", article.content],
        ] as const) {
          expect(text, `${locale}/${meta.slug} ${field}`).not.toMatch(PRODUCT_MENTION);
        }
      }
    }
    // 180 articles (30 topics × six active locales) are read and parsed here: well beyond the 5 s default
  }, 60_000);

  it("counts published articles per topic in catalogue order", async () => {
    const topics = await listTopics("de");
    expect(topics.map((t) => t.id)).toEqual(TOPIC_IDS);
    expect(topics.reduce((n, t) => n + t.count, 0)).toBe(30);
    expect(topics.find((t) => t.id === "ecommerce-tracking")?.label).toBe("E-Commerce-Tracking");
    expect(topicLabel("consent-privacy", "en")).toBe("Consent & Privacy");
  });

  it("filters by topic, platform, shop system, content type, level and recency", async () => {
    const all = await listArticles("en");
    const shopify = filterArticles(all, { shopSystem: "shopify" });
    expect(shopify.length).toBeGreaterThan(0);
    expect(shopify.every((a) => a.shopSystems.includes("shopify"))).toBe(true);
    const meta = filterArticles(all, { platform: "meta", topic: "pixel-platform-integrations" });
    expect(meta.every((a) => a.platforms.includes("meta") && a.topic === "pixel-platform-integrations")).toBe(true);
    expect(filterArticles(all, { contentType: "tutorial", level: "advanced" }).every((a) => a.contentType === "tutorial" && a.level === "advanced")).toBe(true);
    const now = new Date("2026-09-04T00:00:00Z");
    expect(filterArticles(all, { recency: "30d" }, now).every((a) => Date.parse(a.updatedAt ?? a.publishedAt) >= now.getTime() - 30 * 86_400_000)).toBe(true);
    expect(filterArticles(all, { recency: "365d" }, now)).toHaveLength(all.length);
    expect(await listArticles("en", { filters: { topic: "getting-started" } })).toEqual(filterArticles(all, { topic: "getting-started" }));
  });

  it("parses URL filters defensively", () => {
    expect(parseFilters({ topic: "consent-privacy", shop: "shopify", type: "guide", level: "beginner", recency: "90d", platform: "meta" })).toEqual({ topic: "consent-privacy", shopSystem: "shopify", contentType: "guide", level: "beginner", recency: "90d", platform: "meta" });
    expect(parseFilters({ topic: "nope", level: "<script>", recency: "1d" })).toEqual({});
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ level: "advanced" })).toBe(true);
  });

  it("maps the legacy author key to the Track editorial record with a localized name", () => {
    expect(authorFor("track-site-editorial", "en")).toMatchObject({ key: "track-editorial", displayName: "Track editorial team" });
    expect(authorFor("track-editorial", "de").displayName).toBe("Track-Redaktion");
  });

  it("suggests related articles from the same locale without the article itself", async () => {
    const article = (await getArticle("de", "shopify-server-side-purchases"))!;
    const related = await relatedArticles("de", article);
    expect(related).toHaveLength(3);
    expect(related.every((r) => r.locale === "de" && r.translationGroupId !== article.translationGroupId)).toBe(true);
  });

  it("exposes the fixed product name and localized social card alt text", () => {
    expect(KNOWLEDGE_NAME).toBe("Tracking Knowledge");
    expect(KNOWLEDGE_PATH).toBe("/tracking-knowledge");
    expect(socialCardAlt("Title", "de")).toContain("Tracking Knowledge");
  });
});
