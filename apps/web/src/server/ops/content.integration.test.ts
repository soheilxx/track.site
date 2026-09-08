import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { knowledgeFeedback, type Db } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { PlatformContext } from "@/server/ops/platform";

/**
 * Runs the content feedback loader against the migrated test database as `tracksite_ops`: votes for a real
 * translation group (published in every locale) and for an unknown group, old and recent, across two
 * locales. The platform access layer is replaced by the same transaction helper the inbox test uses; the
 * board itself is read from the real content under apps/web/content. Asserts the all-time / recent split,
 * the per-locale breakdown, the join with the board (title + public link) and the ordering.
 */
const holder = vi.hoisted(() => ({ db: null as unknown as Db, ctx: null as unknown as PlatformContext }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/ops/platform", async () => {
  const { withPlatform: asOps } = await import("@track-site/db");
  return { withPlatform: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => asOps(holder.db, fn as never) };
});

import { FEEDBACK_WINDOW_DAYS, loadContentFeedback } from "./content";

const t = testDb();
/** A group that is published in every locale (content/knowledge/<locale>/tracking-health-score.mdx). */
const KNOWN_GROUP = "tracking-health-score";
const MISSING_GROUP = "ops-content-integration-missing-group";
const OLD = new Date(Date.now() - (FEEDBACK_WINDOW_DAYS + 10) * 86_400_000);

beforeAll(async () => {
  holder.db = t.db;
  holder.ctx = {
    user: { id: "00000000-0000-4000-8000-00000000c0de" },
    platformRole: "PLATFORM_SUPPORT",
    actor: { kind: "platform", userId: "00000000-0000-4000-8000-00000000c0de", email: "ops@test", platformRole: "PLATFORM_SUPPORT" },
    requestId: "content-integration",
  } as unknown as PlatformContext;
  await t.db.delete(knowledgeFeedback).where(inArray(knowledgeFeedback.translationGroupId, [KNOWN_GROUP, MISSING_GROUP]));
  await t.db.insert(knowledgeFeedback).values([
    { translationGroupId: KNOWN_GROUP, locale: "en", helpful: true },
    { translationGroupId: KNOWN_GROUP, locale: "en", helpful: true, createdAt: OLD },
    { translationGroupId: KNOWN_GROUP, locale: "de", helpful: false },
    { translationGroupId: KNOWN_GROUP, locale: "de", helpful: false, createdAt: OLD },
    { translationGroupId: MISSING_GROUP, locale: "fr", helpful: true, createdAt: OLD },
  ]);
});

afterAll(async () => {
  await t.db.delete(knowledgeFeedback).where(inArray(knowledgeFeedback.translationGroupId, [KNOWN_GROUP, MISSING_GROUP]));
  await t.close();
});

describe("content feedback loader (test database, tracksite_ops)", () => {
  it("aggregates votes per article, all-time and recent, per locale, joined with the board", async () => {
    const feedback = await loadContentFeedback(holder.ctx, "de");
    expect(feedback.available).toBe(true);
    expect(feedback.windowDays).toBe(FEEDBACK_WINDOW_DAYS);

    const known = feedback.rows.find((r) => r.translationGroupId === KNOWN_GROUP)!;
    expect(known.allTime).toEqual({ helpful: 2, notHelpful: 2, total: 4, helpfulShare: 50 });
    expect(known.recent).toEqual({ helpful: 1, notHelpful: 1, total: 2, helpfulShare: 50 });
    expect(known.byLocale.en).toEqual({ helpful: 2, notHelpful: 0, total: 2, helpfulShare: 100 });
    expect(known.byLocale.de).toEqual({ helpful: 0, notHelpful: 2, total: 2, helpfulShare: 0 });
    expect(known.title).toBeTruthy();
    expect(known.href).toBe(`/de/tracking-knowledge/${KNOWN_GROUP}`);
    expect(known.lastVoteAt).toBeTruthy();

    const missing = feedback.rows.find((r) => r.translationGroupId === MISSING_GROUP)!;
    expect(missing).toMatchObject({ title: null, href: null, allTime: { helpful: 1, notHelpful: 0, total: 1, helpfulShare: 100 }, recent: { total: 0, helpfulShare: null } });
    expect(missing.byLocale.fr).toEqual({ helpful: 1, notHelpful: 0, total: 1, helpfulShare: 100 });

    // most "not helpful" votes first
    expect(feedback.rows.indexOf(known)).toBeLessThan(feedback.rows.indexOf(missing));
    expect(feedback.totals.articlesWithVotes).toBeGreaterThanOrEqual(2);
    expect(feedback.totals.allTime.total).toBeGreaterThanOrEqual(5);
    // every published group without a vote is counted, never invented as a rate
    expect(feedback.totals.publishedWithoutVotes).toBeGreaterThanOrEqual(0);
  });
});
