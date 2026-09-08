-- Track Operations console foundation (docs/17-operations-console.md, docs/03 §B8).
--
--   1. Role `tracksite_ops`: the only role the operator console (`/ops`) ever assumes. It bypasses RLS like
--      `tracksite_worker` and is granted exactly the same privileges; the web app reaches it solely through
--      `withPlatform(ctx, …)` (apps/web/src/server/ops/platform.ts), which requires a resolved platform
--      context (platform role + two-factor step-up) — never through the tenant helpers.
--   2. `organization.suspended_at` / `suspended_reason`: tenant kill switch set by platform admins (Controls).
--   3. `feature_flags` (global defaults) and `feature_flag_overrides` (per organization). Customers' app reads
--      its own overrides through a SELECT-only tenant policy; only operators write flags and overrides.
--   4. `platform_announcements`: localized texts (`{locale: {title, body}}`) with an audience filter
--      (`{plans?, organizationIds?}`), a display window and a revocation timestamp. Readable by every role.
--   5. `worker_heartbeats`: one row per scheduled worker job, upserted by apps/worker/src/jobs/index.ts after
--      every run (Platform health). The worker writes, the app may read.
--   6. `ops_notes`: internal notes of operators about an organization. NOT tenant-visible: all privileges are
--      revoked from `tracksite_app` and RLS is enabled without any policy for it; only `tracksite_ops` (bypass)
--      reads and writes them.
--   7. `contact_requests`: the `status` column becomes text with the inbox workflow states
--      (new | in_progress | done | spam; legacy `handled` rows become `done`), plus `assignee_user_id`.
--   8. `break_glass_access`: `approved_at`, `mode` (read_only only — supplement B8: even an approved grant is
--      read-only), `customer_notified_at`, and the window check `ends_at > starts_at`.
--
-- Every statement is idempotent so the journal-driven run of the integration stage is a no-op on a database
-- where this file was already applied by hand (applied twice locally: dev + test databases).

-- 1. Operator role -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracksite_ops') THEN
    CREATE ROLE tracksite_ops NOLOGIN BYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT tracksite_ops TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO tracksite_ops;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tracksite_ops;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tracksite_ops;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tracksite_ops;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tracksite_ops;
--> statement-breakpoint

-- 2. Tenant kill switch (suspension) ----------------------------------------------------------
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
--> statement-breakpoint

-- 3. Feature flags -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_key_chk";
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_key_chk" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{1,63}$');
--> statement-breakpoint
-- the customer app reads flag defaults; only operators (tracksite_ops) change them
REVOKE INSERT, UPDATE, DELETE ON "feature_flags" FROM tracksite_app;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_flag_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_key_feature_flags_key_fk" FOREIGN KEY ("key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flag_overrides_org_key_uq" ON "feature_flag_overrides" USING btree ("organization_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_flag_overrides_org_idx" ON "feature_flag_overrides" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS feature_flag_overrides_tenant_isolation ON "feature_flag_overrides";
--> statement-breakpoint
-- read-only tenant policy: the customer app sees its own overrides, writes come from operators only
CREATE POLICY feature_flag_overrides_tenant_isolation ON "feature_flag_overrides" FOR SELECT TO tracksite_app USING (organization_id = app_organization_id());
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "feature_flag_overrides" FROM tracksite_app;
--> statement-breakpoint

-- 4. Platform announcements --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "platform_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"severity" text DEFAULT 'info' NOT NULL,
	"texts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link_url" text,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_announcements" DROP CONSTRAINT IF EXISTS "platform_announcements_severity_chk";
--> statement-breakpoint
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_severity_chk" CHECK ("severity" IN ('info', 'warn', 'bad'));
--> statement-breakpoint
ALTER TABLE "platform_announcements" DROP CONSTRAINT IF EXISTS "platform_announcements_texts_chk";
--> statement-breakpoint
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_texts_chk" CHECK (jsonb_typeof("texts") = 'object');
--> statement-breakpoint
ALTER TABLE "platform_announcements" DROP CONSTRAINT IF EXISTS "platform_announcements_audience_chk";
--> statement-breakpoint
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_audience_chk" CHECK (jsonb_typeof("audience") = 'object');
--> statement-breakpoint
ALTER TABLE "platform_announcements" DROP CONSTRAINT IF EXISTS "platform_announcements_window_chk";
--> statement-breakpoint
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_window_chk" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_announcements_window_idx" ON "platform_announcements" USING btree ("revoked_at","starts_at","ends_at");
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "platform_announcements" FROM tracksite_app;
--> statement-breakpoint

-- 5. Worker heartbeats -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
	"job" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"last_duration_ms" integer,
	"host" text
);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "worker_heartbeats" FROM tracksite_app;
--> statement-breakpoint

-- 6. Operator notes (never tenant-visible) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "ops_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ops_notes" ADD CONSTRAINT "ops_notes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_notes_org_idx" ON "ops_notes" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_notes_org_pinned_idx" ON "ops_notes" USING btree ("organization_id","pinned","created_at");
--> statement-breakpoint
-- RLS on, no policy for tracksite_app, and every privilege revoked from it: operators only (tracksite_ops bypasses RLS)
ALTER TABLE "ops_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "ops_notes" FROM tracksite_app;
--> statement-breakpoint

-- 7. Contact requests: inbox workflow ---------------------------------------------------------
ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "handled_at" timestamp with time zone;
--> statement-breakpoint
-- the baseline created `status` as the enum contact_status (new | handled | spam); convert it to text once
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_requests' AND column_name = 'status' AND udt_name = 'contact_status'
  ) THEN
    ALTER TABLE "contact_requests" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "contact_requests" ALTER COLUMN "status" TYPE text USING "status"::text;
    ALTER TABLE "contact_requests" ALTER COLUMN "status" SET DEFAULT 'new';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "contact_requests" SET "status" = 'done' WHERE "status" = 'handled';
--> statement-breakpoint
ALTER TABLE "contact_requests" DROP CONSTRAINT IF EXISTS "contact_requests_status_chk";
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_status_chk" CHECK ("status" IN ('new', 'in_progress', 'done', 'spam'));
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."contact_status";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_requests_assignee_idx" ON "contact_requests" USING btree ("assignee_user_id");
--> statement-breakpoint

-- 8. Break-glass grants -------------------------------------------------------------------------
ALTER TABLE "break_glass_access" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'read_only' NOT NULL;
--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD COLUMN IF NOT EXISTS "customer_notified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "break_glass_access" DROP CONSTRAINT IF EXISTS "break_glass_access_window_chk";
--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD CONSTRAINT "break_glass_access_window_chk" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "break_glass_access" DROP CONSTRAINT IF EXISTS "break_glass_access_mode_chk";
--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD CONSTRAINT "break_glass_access_mode_chk" CHECK ("mode" IN ('read_only'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "break_glass_user_org_idx" ON "break_glass_access" USING btree ("platform_user_id","organization_id","ends_at");
