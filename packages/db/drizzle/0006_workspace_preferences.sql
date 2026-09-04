-- Workspace preferences (dashboard shell, redesign supplement §8/§9): the site and environment a user works on
-- inside an organization plus the per-user Track AI motion setting. One row per (organization, user), created
-- lazily by the workspace switcher. Tenant table: organization_id, org index, RLS policy for tracksite_app.
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database
-- where this file was already applied by hand.
CREATE TABLE IF NOT EXISTS "workspace_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"active_site_id" uuid,
	"active_environment_id" uuid,
	"ai_motion" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_active_site_id_sites_id_fk" FOREIGN KEY ("active_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_active_environment_id_environments_id_fk" FOREIGN KEY ("active_environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "workspace_preferences" DROP CONSTRAINT IF EXISTS "workspace_preferences_ai_motion_chk";
--> statement-breakpoint
ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_ai_motion_chk" CHECK ("ai_motion" IN ('system', 'full', 'reduced', 'off'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_preferences_org_user_uq" ON "workspace_preferences" USING btree ("organization_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_preferences_org_idx" ON "workspace_preferences" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "workspace_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS workspace_preferences_tenant_isolation ON "workspace_preferences";
--> statement-breakpoint
CREATE POLICY workspace_preferences_tenant_isolation ON "workspace_preferences" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
