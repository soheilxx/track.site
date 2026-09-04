-- Change & Release Center with Change Impact Preview (redesign supplement §8 modules 9 and 10).
--
--   1. `config_drafts` gains the scheduled-publication columns: when the draft is due, who scheduled it,
--      the bundle digest at scheduling time (the worker refuses a draft that changed since), the approval
--      that satisfied the four-eyes rule, and the worker's attempt marker / error text.
--   2. `config_approvals`: four-eyes approval requests for a draft (or, later, a version): requester,
--      approver, decision, reason, the frozen change summary and the bundle digest the decision refers to.
--
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database
-- where this file was already applied by hand. Tenant table: organization_id, org index, RLS policy for
-- tracksite_app (same pattern as 0003_shop_connections); table privileges come from the default privileges
-- of 0001_rls_partitions.
ALTER TABLE "config_drafts" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "config_drafts" ADD COLUMN IF NOT EXISTS "scheduled_by" uuid;
--> statement-breakpoint
ALTER TABLE "config_drafts" ADD COLUMN IF NOT EXISTS "schedule_digest" text;
--> statement-breakpoint
ALTER TABLE "config_drafts" ADD COLUMN IF NOT EXISTS "schedule_approval_id" uuid;
--> statement-breakpoint
ALTER TABLE "config_drafts" ADD COLUMN IF NOT EXISTS "schedule_attempted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "config_drafts" ADD COLUMN IF NOT EXISTS "schedule_error" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "config_drafts_scheduled_idx" ON "config_drafts" USING btree ("scheduled_at") WHERE scheduled_at IS NOT NULL AND status = 'open';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"kind" text DEFAULT 'publish' NOT NULL,
	"draft_id" uuid,
	"version_id" uuid,
	"bundle_digest" text NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"critical_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"requested_by" uuid NOT NULL,
	"request_note" text,
	"approver_id" uuid,
	"decision" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "config_approvals" ADD CONSTRAINT "config_approvals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "config_approvals" ADD CONSTRAINT "config_approvals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "config_approvals" ADD CONSTRAINT "config_approvals_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "config_approvals" ADD CONSTRAINT "config_approvals_draft_id_config_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."config_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "config_approvals" ADD CONSTRAINT "config_approvals_version_id_config_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."config_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "config_approvals_draft_idx" ON "config_approvals" USING btree ("draft_id","decision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "config_approvals_env_created_idx" ON "config_approvals" USING btree ("environment_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "config_approvals_org_idx" ON "config_approvals" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "config_approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS config_approvals_tenant_isolation ON "config_approvals";
--> statement-breakpoint
CREATE POLICY config_approvals_tenant_isolation ON "config_approvals" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
