-- Destination Health Center (redesign supplement §8 module 6): latest health measurement per destination,
-- written by the worker job `destination-health` from delivery_attempts and the queue tables the dashboard
-- role cannot read (queue_messages / queue_dead_letters are revoked from tracksite_app). One row per
-- integration, upserted on every run. Tenant table: organization_id, org index, RLS policy for tracksite_app.
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database
-- where this file was already applied by hand.
CREATE TABLE IF NOT EXISTS "destination_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_minutes" integer DEFAULT 1440 NOT NULL,
	"attempts_total" integer DEFAULT 0 NOT NULL,
	"attempts_success" integer DEFAULT 0 NOT NULL,
	"attempts_failed" integer DEFAULT 0 NOT NULL,
	"attempts_retry" integer DEFAULT 0 NOT NULL,
	"attempts_skipped" integer DEFAULT 0 NOT NULL,
	"attempts_rate_limited" integer DEFAULT 0 NOT NULL,
	"attempts_auth_failed" integer DEFAULT 0 NOT NULL,
	"error_rate" double precision,
	"queue_ready" integer,
	"queue_scheduled" integer,
	"queue_in_flight" integer,
	"queue_oldest_available_at" timestamp with time zone,
	"queue_dead" integer,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error_class" text,
	"last_error_code" text,
	"last_error_message" text,
	"last_error_http_status" integer,
	"last_rate_limit_at" timestamp with time zone,
	"last_rate_limit_wait_ms" integer
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "destination_health_snapshots" ADD CONSTRAINT "destination_health_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "destination_health_snapshots" ADD CONSTRAINT "destination_health_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "destination_health_snapshots" ADD CONSTRAINT "destination_health_snapshots_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "destination_health_integration_uq" ON "destination_health_snapshots" USING btree ("integration_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "destination_health_org_idx" ON "destination_health_snapshots" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "destination_health_site_idx" ON "destination_health_snapshots" USING btree ("site_id");
--> statement-breakpoint
ALTER TABLE "destination_health_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS destination_health_snapshots_tenant_isolation ON "destination_health_snapshots";
--> statement-breakpoint
CREATE POLICY destination_health_snapshots_tenant_isolation ON "destination_health_snapshots" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
