-- Event lineage + Live Test Lab runs (Events module, redesign supplement §8 modules 3 and 5).
--
-- `event_lineage`: one row per pipeline stage and event — captured (collector receive time), accepted,
-- normalized, policy, deduplicated, routed (per destination) and delivered (per attempt) — with the
-- outcome, the machine-readable reason and a redacted detail object. Written by the worker stages
-- (`apps/worker/src/stages/lineage.ts`), read by the Live Event Explorer and the Test Lab timeline.
-- Rows for events that are never persisted (consent missing, PII, bot, invalid) carry no identifiers
-- and no payload: only name, source, environment, stage, reason and time.
--
-- `test_lab_runs`: audited guided test journeys sent through the real collector with an ephemeral
-- source key of the site's test-mode environment; `batch_id` is the collector's message id, which the
-- lineage rows also carry, so a run can be correlated with its pipeline stages.
--
-- Tenant tables: organization_id, org index, RLS policy for tracksite_app. Every statement is
-- idempotent so the journal-driven run of the integration stage is a no-op on a database where this
-- file was already applied by hand.
CREATE TABLE IF NOT EXISTS "event_lineage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid,
	"event_id" text NOT NULL,
	"source_event_id" text,
	"batch_id" text,
	"event_name" text NOT NULL,
	"source" text NOT NULL,
	"stage" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"integration_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_lineage" ADD CONSTRAINT "event_lineage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_lineage" ADD CONSTRAINT "event_lineage_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_lineage" ADD CONSTRAINT "event_lineage_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_lineage" ADD CONSTRAINT "event_lineage_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "event_lineage" DROP CONSTRAINT IF EXISTS "event_lineage_stage_chk";
--> statement-breakpoint
ALTER TABLE "event_lineage" ADD CONSTRAINT "event_lineage_stage_chk" CHECK ("stage" IN ('captured', 'accepted', 'normalized', 'policy', 'deduplicated', 'routed', 'delivered'));
--> statement-breakpoint
ALTER TABLE "event_lineage" DROP CONSTRAINT IF EXISTS "event_lineage_outcome_chk";
--> statement-breakpoint
ALTER TABLE "event_lineage" ADD CONSTRAINT "event_lineage_outcome_chk" CHECK ("outcome" IN ('ok', 'rejected', 'blocked', 'unique', 'duplicate', 'none', 'skipped', 'delivered', 'retry', 'failed', 'dead'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineage_site_event_idx" ON "event_lineage" USING btree ("site_id","event_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineage_site_time_idx" ON "event_lineage" USING btree ("site_id","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineage_site_batch_idx" ON "event_lineage" USING btree ("site_id","batch_id") WHERE "batch_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineage_site_source_event_idx" ON "event_lineage" USING btree ("site_id","source_event_id") WHERE "source_event_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineage_occurred_idx" ON "event_lineage" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineage_org_idx" ON "event_lineage" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "event_lineage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS event_lineage_tenant_isolation ON "event_lineage";
--> statement-breakpoint
CREATE POLICY event_lineage_tenant_isolation ON "event_lineage" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_lab_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"journey" text NOT NULL,
	"consent" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"collector_status" integer,
	"collector_reason" text,
	"batch_id" text,
	"source_key_id" uuid,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "test_lab_runs" ADD CONSTRAINT "test_lab_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "test_lab_runs" ADD CONSTRAINT "test_lab_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "test_lab_runs" ADD CONSTRAINT "test_lab_runs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "test_lab_runs" DROP CONSTRAINT IF EXISTS "test_lab_runs_status_chk";
--> statement-breakpoint
ALTER TABLE "test_lab_runs" ADD CONSTRAINT "test_lab_runs_status_chk" CHECK ("status" IN ('pending', 'sent', 'rejected', 'failed'));
--> statement-breakpoint
ALTER TABLE "test_lab_runs" DROP CONSTRAINT IF EXISTS "test_lab_runs_journey_chk";
--> statement-breakpoint
ALTER TABLE "test_lab_runs" ADD CONSTRAINT "test_lab_runs_journey_chk" CHECK ("journey" IN ('page_view', 'lead', 'add_to_cart', 'checkout', 'purchase'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_lab_runs_site_created_idx" ON "test_lab_runs" USING btree ("site_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_lab_runs_org_idx" ON "test_lab_runs" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "test_lab_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS test_lab_runs_tenant_isolation ON "test_lab_runs";
--> statement-breakpoint
CREATE POLICY test_lab_runs_tenant_isolation ON "test_lab_runs" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
