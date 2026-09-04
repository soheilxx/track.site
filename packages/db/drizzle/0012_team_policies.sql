-- Team & Access (redesign supplement §5 Pro entitlements: approval processes, four-eyes principle, full audit log).
--
--   1. `organization_settings.approval_policy` stores which change types need a second, different member
--      before they run (see `ApprovalPolicy` in packages/db/src/schema/tenancy.ts and
--      apps/web/src/server/team.ts). `{}` = nothing configured.
--   2. `approval_requests`: a change behind four eyes is stored here instead of executed; a different member
--      with an approver role applies or rejects it, the requester can withdraw it, expiry is evaluated on read.
--   The audit log itself needs no schema change: the dashboard reads the existing append-only `audit_log`
--   table through the tenant policy.
--
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database
-- where this file was already applied by hand. `organization_settings` already has RLS and the tenant policy
-- (migration 0001); an added column inherits them. Tenant table: organization_id, org index, RLS policy for
-- tracksite_app.
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "approval_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization_settings" DROP CONSTRAINT IF EXISTS "organization_settings_approval_policy_chk";
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_approval_policy_chk" CHECK (jsonb_typeof("approval_policy") = 'object');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT IF EXISTS "approval_requests_change_type_chk";
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_change_type_chk" CHECK ("change_type" IN ('config_publish', 'config_rollback', 'consent_publish', 'credential_change', 'destination_pause', 'member_role_change', 'kill_switch'));
--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT IF EXISTS "approval_requests_status_chk";
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_status_chk" CHECK ("status" IN ('pending', 'applied', 'rejected', 'withdrawn', 'expired'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_org_idx" ON "approval_requests" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_org_status_idx" ON "approval_requests" USING btree ("organization_id","status","created_at");
--> statement-breakpoint
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS approval_requests_tenant_isolation ON "approval_requests";
--> statement-breakpoint
CREATE POLICY approval_requests_tenant_isolation ON "approval_requests" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
