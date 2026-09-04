-- Data Quality Inbox workflow + Signal Gap & Revenue Leak Detector (redesign supplement §8 modules 4 and 7).
--
--   1. `issue_status` gains `acknowledged` and `muted` (`ignored` stays as the legacy value of the first inbox).
--   2. `data_quality_issues` gains the workflow columns (who acknowledged, mute reason/until, status note), the
--      environment, a coarse category, the impact score and the redacted evidence the worker scan writes, and the
--      config draft prepared for the issue (never published automatically).
--   3. `revenue_reconciliation_snapshots`: one row per site, kind, day and destination (NULL = site-level capture
--      row) comparing authoritative conversion records with observed events and delivery attempts.
--   4. Findings of one environment are keyed per environment (`fingerprint = <kind>@<environment_id>`, see
--      apps/worker/src/jobs/reconciliation.ts) so two non-test environments never overwrite each other's evidence;
--      rows an earlier scan wrote with the bare kind are re-keyed once at the end of this file.
--
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database where
-- this file was already applied by hand. Tenant table: organization_id, org index, RLS policy for tracksite_app.
ALTER TYPE "public"."issue_status" ADD VALUE IF NOT EXISTS 'acknowledged';
--> statement-breakpoint
ALTER TYPE "public"."issue_status" ADD VALUE IF NOT EXISTS 'muted';
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "environment_id" uuid;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "impact_score" integer;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "evidence" jsonb;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "acknowledged_by" uuid;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "muted_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "mute_reason" text;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "status_note" text;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "status_changed_by" uuid;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "fix_draft_id" uuid;
--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD COLUMN IF NOT EXISTS "fix_draft_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_fix_draft_id_config_drafts_id_fk" FOREIGN KEY ("fix_draft_id") REFERENCES "public"."config_drafts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dq_issues_site_status_impact_idx" ON "data_quality_issues" USING btree ("site_id","status","impact_score");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revenue_reconciliation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"integration_id" uuid,
	"kind" text NOT NULL,
	"granularity" text DEFAULT 'day' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"authoritative_count" integer DEFAULT 0 NOT NULL,
	"authoritative_valued_count" integer DEFAULT 0 NOT NULL,
	"authoritative_value" numeric(14, 2),
	"currency" text,
	"currency_mixed" boolean DEFAULT false NOT NULL,
	"observed_browser_count" integer DEFAULT 0 NOT NULL,
	"deduplicated_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"gap_no_consent" integer DEFAULT 0 NOT NULL,
	"gap_blocked" integer DEFAULT 0 NOT NULL,
	"gap_not_captured" integer DEFAULT 0 NOT NULL,
	"gap_delivery_failed" integer DEFAULT 0 NOT NULL,
	"gap_unknown" integer DEFAULT 0 NOT NULL,
	"leak_value_min" numeric(14, 2),
	"leak_value_max" numeric(14, 2),
	"leak_unvalued_count" integer DEFAULT 0 NOT NULL,
	"sources" jsonb DEFAULT '{"shop_connections":[],"server_keys":0,"delivery_attempts":0,"destination_mode":null}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revenue_reconciliation_snapshots" ADD CONSTRAINT "revenue_reconciliation_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revenue_reconciliation_snapshots" ADD CONSTRAINT "revenue_reconciliation_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revenue_reconciliation_snapshots" ADD CONSTRAINT "revenue_reconciliation_snapshots_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revenue_reconciliation_snapshots" ADD CONSTRAINT "revenue_reconciliation_period_uq" UNIQUE NULLS NOT DISTINCT ("site_id","integration_id","kind","granularity","period_start");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_reconciliation_site_period_idx" ON "revenue_reconciliation_snapshots" USING btree ("site_id","period_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_reconciliation_org_idx" ON "revenue_reconciliation_snapshots" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "revenue_reconciliation_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS revenue_reconciliation_snapshots_tenant_isolation ON "revenue_reconciliation_snapshots";
--> statement-breakpoint
CREATE POLICY revenue_reconciliation_snapshots_tenant_isolation ON "revenue_reconciliation_snapshots" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
-- Re-key environment-scoped issues written with the bare kind (see 4. above). Site-wide rows (environment_id NULL:
-- revenue leaks, signal gaps, usage) keep their kind as fingerprint. A row whose per-environment key already exists
-- is left untouched so the unique index (site_id, fingerprint) can never be violated; re-running changes nothing.
UPDATE "data_quality_issues" d SET "fingerprint" = d."kind" || '@' || d."environment_id"::text
WHERE d."environment_id" IS NOT NULL AND d."fingerprint" = d."kind"
  AND NOT EXISTS (SELECT 1 FROM "data_quality_issues" x WHERE x."site_id" = d."site_id" AND x."fingerprint" = d."kind" || '@' || d."environment_id"::text);
