-- Alerts & Incident Mode (redesign supplement §8 module 13): notification channels, alert rules and the
-- alert history written by the worker job `alerts` (apps/worker/src/jobs/alerts.ts).
--
--   1. `alert_channels`: e-mail address (clear), webhook or Slack incoming webhook. URLs and webhook secrets are
--      envelope encrypted (`target_ciphertext` / `secret_ciphertext` + `key_id`); the dashboard sees `target_hint`
--      (host name) only and never the URL or secret again after saving.
--   2. `alert_rules`: what to watch (event_drop, vendor_outage, credential_expiry, consent_errors, queue_lag,
--      conversion_anomaly), for one site or every site (`site_id` NULL), thresholds as a flat numeric jsonb object,
--      channel ids, enabled flag and a cooldown after a notification.
--   3. `alert_events`: one row per triggered condition and subject with severity, redacted detail (counts, rates,
--      the organization's own destination names — never visitor identifiers or payload fields), the per-channel
--      delivery outcome and the resolution timestamp. The rule reference is kept as history when a rule is deleted.
--
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database
-- where this file was already applied by hand. Tenant tables: organization_id, org index, RLS policy for
-- tracksite_app (the worker role bypasses RLS and writes the events).
CREATE TABLE IF NOT EXISTS "alert_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"target" text,
	"target_ciphertext" text,
	"secret_ciphertext" text,
	"key_id" text,
	"target_hint" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"last_test_at" timestamp with time zone,
	"last_test_status" text,
	"last_test_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "alert_channels" DROP CONSTRAINT IF EXISTS "alert_channels_kind_chk";
--> statement-breakpoint
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_kind_chk" CHECK ("kind" IN ('email', 'webhook', 'slack'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_channels_org_idx" ON "alert_channels" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_channels_org_kind_idx" ON "alert_channels" USING btree ("organization_id","kind");
--> statement-breakpoint
ALTER TABLE "alert_channels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS alert_channels_tenant_isolation ON "alert_channels";
--> statement-breakpoint
CREATE POLICY alert_channels_tenant_isolation ON "alert_channels" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"threshold" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"created_by" uuid,
	"last_evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "alert_rules" DROP CONSTRAINT IF EXISTS "alert_rules_kind_chk";
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_kind_chk" CHECK ("kind" IN ('event_drop', 'vendor_outage', 'credential_expiry', 'consent_errors', 'queue_lag', 'conversion_anomaly'));
--> statement-breakpoint
ALTER TABLE "alert_rules" DROP CONSTRAINT IF EXISTS "alert_rules_threshold_chk";
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_threshold_chk" CHECK (jsonb_typeof("threshold") = 'object');
--> statement-breakpoint
ALTER TABLE "alert_rules" DROP CONSTRAINT IF EXISTS "alert_rules_channel_ids_chk";
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_channel_ids_chk" CHECK (jsonb_typeof("channel_ids") = 'array');
--> statement-breakpoint
ALTER TABLE "alert_rules" DROP CONSTRAINT IF EXISTS "alert_rules_cooldown_chk";
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_cooldown_chk" CHECK ("cooldown_minutes" BETWEEN 5 AND 1440);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_org_idx" ON "alert_rules" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_org_enabled_idx" ON "alert_rules" USING btree ("organization_id","enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_site_idx" ON "alert_rules" USING btree ("site_id");
--> statement-breakpoint
ALTER TABLE "alert_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS alert_rules_tenant_isolation ON "alert_rules";
--> statement-breakpoint
CREATE POLICY alert_rules_tenant_isolation ON "alert_rules" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid,
	"site_id" uuid,
	"kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"notified_at" timestamp with time zone,
	"delivery" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "alert_events" DROP CONSTRAINT IF EXISTS "alert_events_kind_chk";
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_kind_chk" CHECK ("kind" IN ('event_drop', 'vendor_outage', 'credential_expiry', 'consent_errors', 'queue_lag', 'conversion_anomaly'));
--> statement-breakpoint
ALTER TABLE "alert_events" DROP CONSTRAINT IF EXISTS "alert_events_severity_chk";
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_severity_chk" CHECK ("severity" IN ('info', 'warning', 'critical'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_events_org_idx" ON "alert_events" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_events_org_triggered_idx" ON "alert_events" USING btree ("organization_id","triggered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_events_rule_subject_idx" ON "alert_events" USING btree ("rule_id","subject_key","triggered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_events_site_idx" ON "alert_events" USING btree ("site_id");
--> statement-breakpoint
ALTER TABLE "alert_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS alert_events_tenant_isolation ON "alert_events";
--> statement-breakpoint
CREATE POLICY alert_events_tenant_isolation ON "alert_events" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
