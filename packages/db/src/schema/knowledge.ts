import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_helpers.ts";

/**
 * "Was this article helpful?" votes from the public Tracking Knowledge articles (redesign
 * supplement §6). Anonymous by design: one row per vote with the article's translation group, the
 * locale and the answer — no IP, no user agent, no session, no tenant. Abuse is limited by an
 * in-memory per-address rate limit in the API route, not by stored identifiers. Totals are never
 * shown publicly (no invented success rates); the table only tells the editorial team which
 * articles need work. Migration: `drizzle/0005_knowledge_feedback.sql` (hand-written, like 0004).
 */
export const knowledgeFeedback = pgTable(
  "knowledge_feedback",
  {
    id: id(),
    /** Stable id shared by every language version of an article (= the English file name). */
    translationGroupId: text("translation_group_id").notNull(),
    /** Locale of the version that was voted on (`en`, `de`, …). */
    locale: text("locale").notNull(),
    helpful: boolean("helpful").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("knowledge_feedback_article_idx").on(t.translationGroupId, t.locale, t.createdAt),
    check("knowledge_feedback_group_chk", sql`${t.translationGroupId} ~ '^[a-z0-9-]{3,120}$'`),
    check("knowledge_feedback_locale_chk", sql`${t.locale} ~ '^[a-z]{2}$'`),
  ],
);
