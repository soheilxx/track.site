import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the helpers under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));
vi.mock("@/lib/knowledge", () => ({ listArticles: vi.fn(async () => []) }));

import {
  CONTACT_TRANSITIONS,
  DEFAULT_INBOX_FILTERS,
  canTransition,
  contactReference,
  deliveryState,
  dueTone,
  helpfulShare,
  inboxFiltered,
  inboxQueryString,
  knowledgeArticleHref,
  likePattern,
  messagePreview,
  parseInboxFilters,
} from "./inbox";

const ID = "11111111-1111-4111-8111-111111111111";

describe("parseInboxFilters", () => {
  it("reads valid values and falls back to the open view for anything else", () => {
    expect(parseInboxFilters({})).toEqual(DEFAULT_INBOX_FILTERS);
    expect(parseInboxFilters({ status: "done", kind: "demo", assignee: "me", q: "  acme  ", page: "3" })).toEqual({ status: "done", kind: "demo", assignee: "me", q: "acme", page: 3 });
    expect(parseInboxFilters({ status: "all", assignee: ID })).toMatchObject({ status: "all", assignee: ID });
    expect(parseInboxFilters({ status: "handled", kind: "x", assignee: "someone", page: "-2" })).toEqual(DEFAULT_INBOX_FILTERS);
    expect(parseInboxFilters({ status: ["spam", "new"], page: "999999" })).toMatchObject({ status: "spam", page: 10_000 });
    // 36 characters of hex and hyphens in the wrong layout are not a uuid for Postgres: fall back instead of a 500
    expect(parseInboxFilters({ assignee: "-".repeat(36) }).assignee).toBe("all");
    expect(parseInboxFilters({ assignee: "11111111111111111111111111111111-111" }).assignee).toBe("all");
    expect(parseInboxFilters({ q: "a".repeat(200) }).q).toHaveLength(80);
  });
});

describe("inboxQueryString", () => {
  it("omits defaults and keeps every other filter for page links", () => {
    expect(inboxQueryString(DEFAULT_INBOX_FILTERS)).toBe("");
    expect(inboxQueryString({ status: "open", kind: "all", assignee: "all", q: null, page: 2 })).toBe("?page=2");
    expect(inboxQueryString({ status: "spam", kind: "support", assignee: "unassigned", q: "a&b", page: 4 }, 1)).toBe("?status=spam&kind=support&assignee=unassigned&q=a%26b");
    expect(inboxFiltered(DEFAULT_INBOX_FILTERS)).toBe(false);
    expect(inboxFiltered({ ...DEFAULT_INBOX_FILTERS, q: "x" })).toBe(true);
    expect(inboxFiltered({ ...DEFAULT_INBOX_FILTERS, status: "all" })).toBe(true);
  });
});

describe("status workflow", () => {
  it("allows the documented transitions only", () => {
    expect(canTransition("new", "in_progress")).toBe(true);
    expect(canTransition("new", "spam")).toBe(true);
    expect(canTransition("done", "in_progress")).toBe(true);
    expect(canTransition("done", "spam")).toBe(false);
    expect(canTransition("spam", "new")).toBe(true);
    expect(canTransition("spam", "done")).toBe(false);
    for (const [from, targets] of Object.entries(CONTACT_TRANSITIONS)) expect(targets, from).not.toContain(from);
  });
});

describe("pure helpers", () => {
  it("escapes ILIKE wildcards and matches as a substring", () => {
    expect(likePattern("acme")).toBe("%acme%");
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("shortens the message to one line", () => {
    expect(messagePreview("  Hello\n\nworld  ")).toBe("Hello world");
    const long = messagePreview("x".repeat(300));
    expect(long).toHaveLength(120);
    expect(long.endsWith("…")).toBe(true);
  });

  it("derives a stable reference and the forwarding state", () => {
    expect(contactReference(ID)).toBe("1111111111");
    expect(contactReference("0198f2a3-1b2c-4d5e-8f90-abcdefabcdef")).toBe("0198F2A31B");
    expect(deliveryState({ deliveredAt: new Date(), deliveryError: null })).toBe("delivered");
    expect(deliveryState({ deliveredAt: null, deliveryError: "smtp down" })).toBe("failed");
    expect(deliveryState({ deliveredAt: null, deliveryError: null })).toBe("not_sent");
  });

  it("classifies due dates and computes the helpful share honestly", () => {
    const now = Date.parse("2026-09-08T12:00:00Z");
    expect(dueTone("2026-09-07T12:00:00Z", now)).toBe("overdue");
    expect(dueTone("2026-09-10T12:00:00Z", now)).toBe("soon");
    expect(dueTone("2026-10-01T12:00:00Z", now)).toBe("later");
    expect(helpfulShare(0, 0)).toBeNull();
    expect(helpfulShare(2, 3)).toBe(67);
  });

  it("links the article in the operator's language, then English, then any version", () => {
    const both = { en: "both-en", de: "both-de" };
    expect(knowledgeArticleHref(both, "de")).toBe("/de/tracking-knowledge/both-de");
    expect(knowledgeArticleHref(both, "fr")).toBe("/en/tracking-knowledge/both-en");
    expect(knowledgeArticleHref(both, "xx")).toBe("/en/tracking-knowledge/both-en");
    expect(knowledgeArticleHref({ de: "nur-deutsch" }, "en")).toBe("/de/tracking-knowledge/nur-deutsch");
    expect(knowledgeArticleHref({}, "en")).toBeNull();
  });
});
