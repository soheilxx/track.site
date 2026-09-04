-- Tracking Knowledge feedback ("Was this article helpful?", redesign supplement §6): one anonymous row per
-- vote with the article's translation group, the locale and the answer. No IP, user agent, session or tenant
-- is stored; abuse is limited in memory by the API route. Totals are never published — the table only tells
-- the editorial team which articles need work. Not tenant data: no organization_id, no RLS policy.
CREATE TABLE "knowledge_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_group_id" text NOT NULL,
	"locale" text NOT NULL,
	"helpful" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_feedback_group_chk" CHECK ("translation_group_id" ~ '^[a-z0-9-]{3,120}$'),
	CONSTRAINT "knowledge_feedback_locale_chk" CHECK ("locale" ~ '^[a-z]{2}$')
);
--> statement-breakpoint
CREATE INDEX "knowledge_feedback_article_idx" ON "knowledge_feedback" USING btree ("translation_group_id","locale","created_at");
