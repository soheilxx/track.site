import { describe, expect, it, vi } from "vitest";
import type { ArticleMeta } from "./knowledge";

vi.mock("server-only", () => ({}));

const { ARTICLE_BODY_ID, CTA_BY_TOPIC, articleSchemaType, collectHeadings, compileArticle, ctaForTopic, formatArticleDate, parseTakeaways, rankRelated, readingTimeDuration, readingTimeLabel, rehypeCodeMeta, rehypeCollectHeadings } = await import("./knowledge-article");
const { TOPIC_IDS } = await import("./knowledge");

type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; value?: string; data?: Record<string, unknown> };
const el = (tagName: string, properties: Record<string, unknown>, children: Node[]): Node => ({ type: "element", tagName, properties, children });
const text = (value: string): Node => ({ type: "text", value });

describe("table of contents extraction", () => {
  it("collects h2/h3 with their rehype-slug ids in document order, flattens inline markup and skips headings without id or outside h2–h3", () => {
    const tree: Node = {
      type: "root",
      children: [
        el("h1", { id: "title" }, [text("Title")]),
        el("h2", { id: "three-losses" }, [text("Three "), el("code", {}, [text("losses")])]),
        el("h3", { id: "blockers" }, [text("  Content   blockers ")]),
        el("h2", {}, [text("No id")]),
        { type: "mdxJsxFlowElement", children: [el("h3", { id: "inside" }, [text("Inside a callout")])] },
        el("h4", { id: "deep" }, [text("Too deep")]),
        el("h2", { id: "empty" }, []),
      ],
    };
    expect(collectHeadings(tree)).toEqual([
      { id: "three-losses", text: "Three losses", depth: 2 },
      { id: "blockers", text: "Content blockers", depth: 3 },
      { id: "inside", text: "Inside a callout", depth: 3 },
    ]);
  });

  it("works as a rehype plugin that fills the given sink", () => {
    const sink: Array<{ id: string; text: string; depth: 2 | 3 }> = [];
    rehypeCollectHeadings({ sink })({ type: "root", children: [el("h2", { id: "a" }, [text("A")])] });
    expect(sink).toEqual([{ id: "a", text: "A", depth: 2 }]);
  });

  it("copies the fence meta onto the code element so the block can show a title", () => {
    const code: Node = { ...el("code", { className: ["language-json"] }, [text("{}")]), data: { meta: 'title="request.json"' } };
    rehypeCodeMeta()({ type: "root", children: [el("pre", {}, [code])] });
    expect(code.properties?.metastring).toBe('title="request.json"');
    expect(code.properties?.className).toEqual(["language-json"]);
  });

  it("extracts the headings of compiled MDX with the ids rehype-slug assigns (duplicates suffixed)", async () => {
    const source = "## Hello World\n\ntext\n\n### Sub *heading*\n\n## Hello World\n\n#### Not listed\n";
    const { headings, content } = await compileArticle(source, {});
    expect(content).toBeTruthy();
    expect(headings).toEqual([
      { id: "hello-world", text: "Hello World", depth: 2 },
      { id: "sub-heading", text: "Sub heading", depth: 3 },
      { id: "hello-world-1", text: "Hello World", depth: 2 },
    ]);
    expect(ARTICLE_BODY_ID).toBe("article-body");
  });
});

function meta(overrides: Partial<ArticleMeta> & { translationGroupId: string }): ArticleMeta {
  return {
    slug: overrides.translationGroupId,
    locale: "en",
    title: overrides.translationGroupId,
    description: "",
    excerpt: "",
    category: "guides",
    tags: [],
    author: "track-editorial",
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
    reviewedAt: null,
    status: "published",
    topic: "getting-started",
    platforms: [],
    shopSystems: [],
    contentType: "guide",
    level: "intermediate",
    coverAlt: "",
    readingMinutes: 5,
    sources: [],
    legalNotice: false,
    featured: false,
    headings: [],
    ...overrides,
  };
}

describe("related articles ranking", () => {
  const subject = meta({ translationGroupId: "subject", topic: "consent-privacy", tags: ["consent", "gdpr"], platforms: ["meta"] });
  const pool = [
    subject,
    meta({ translationGroupId: "same-topic-two-tags", topic: "consent-privacy", tags: ["consent", "gdpr"] }),
    meta({ translationGroupId: "same-topic-no-tags", topic: "consent-privacy", publishedAt: "2026-03-01T00:00:00.000Z" }),
    meta({ translationGroupId: "same-topic-older", topic: "consent-privacy", publishedAt: "2026-02-01T00:00:00.000Z" }),
    meta({ translationGroupId: "other-topic-one-tag", topic: "troubleshooting", tags: ["consent"] }),
    meta({ translationGroupId: "other-topic-platform", topic: "troubleshooting", platforms: ["meta"] }),
    meta({ translationGroupId: "unrelated", topic: "product-updates" }),
    meta({ translationGroupId: "draft-same-topic", topic: "consent-privacy", tags: ["consent", "gdpr"], status: "draft" }),
    meta({ translationGroupId: "german-same-topic", topic: "consent-privacy", tags: ["consent", "gdpr"], locale: "de" }),
  ];

  it("ranks same topic first, then shared tags, then shared platforms, newest first; same locale and published only; never the article itself", () => {
    expect(rankRelated(pool, subject, 10).map((a) => a.translationGroupId)).toEqual(["same-topic-two-tags", "same-topic-no-tags", "same-topic-older", "other-topic-one-tag", "other-topic-platform"]);
  });

  it("respects the limit and returns nothing when no candidate shares topic, tags or context", () => {
    expect(rankRelated(pool, subject, 2).map((a) => a.translationGroupId)).toEqual(["same-topic-two-tags", "same-topic-no-tags"]);
    expect(rankRelated(pool, meta({ translationGroupId: "lonely", topic: "ai-data-quality" }), 3)).toEqual([]);
    expect(rankRelated(pool, subject, 0)).toEqual([]);
  });

  it("uses the update date over the publish date as the recency tie-break", () => {
    const fresh = meta({ translationGroupId: "same-topic-updated", topic: "consent-privacy", publishedAt: "2025-12-01T00:00:00.000Z", updatedAt: "2026-04-01T00:00:00.000Z" });
    expect(
      rankRelated([...pool, fresh], subject, 3)
        .map((a) => a.translationGroupId)
        .slice(1),
    ).toEqual(["same-topic-updated", "same-topic-no-tags"]);
  });
});

describe("template helpers", () => {
  it("reads key takeaways defensively: strings only, trimmed, capped", () => {
    expect(parseTakeaways(undefined)).toEqual([]);
    expect(parseTakeaways("not a list")).toEqual([]);
    expect(parseTakeaways(["  one  ", "", 2, null, "two\nlines"])).toEqual(["one", "two lines"]);
    expect(parseTakeaways(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("uses TechArticle for reference and tutorial content, BlogPosting otherwise", () => {
    expect(articleSchemaType("reference")).toBe("TechArticle");
    expect(articleSchemaType("tutorial")).toBe("TechArticle");
    expect(articleSchemaType("guide")).toBe("BlogPosting");
    expect(articleSchemaType("explainer")).toBe("BlogPosting");
    expect(articleSchemaType("update")).toBe("BlogPosting");
  });

  it("maps every topic to a CTA with an internal target", () => {
    for (const topic of TOPIC_IDS) {
      const cta = ctaForTopic(topic);
      expect(cta).toBe(CTA_BY_TOPIC[topic]);
      expect(cta.href.startsWith("/")).toBe(true);
    }
  });

  it("formats dates per locale in UTC and reading time from the copy template", () => {
    expect(formatArticleDate("en", "2026-08-17T00:00:00.000Z")).toBe("17 August 2026");
    expect(formatArticleDate("de", "2026-08-17T00:00:00.000Z")).toBe("17. August 2026");
    expect(formatArticleDate("xx", "2026-08-17T00:00:00.000Z")).toBe("17 August 2026");
    expect(readingTimeLabel("{n} min read", 4)).toBe("4 min read");
    expect(readingTimeDuration(4)).toBe("PT4M");
    expect(readingTimeDuration(0)).toBe("PT1M");
  });
});
