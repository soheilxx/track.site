-- Custom migration: runtime roles, Row-Level Security, append-only triggers and the partitioned event store.
-- Applied after the drizzle-kit generated baseline. Idempotent where PostgreSQL allows it.

-- 1. Runtime roles ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracksite_app') THEN
    CREATE ROLE tracksite_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracksite_worker') THEN
    CREATE ROLE tracksite_worker NOLOGIN BYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT tracksite_app, tracksite_worker TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO tracksite_app, tracksite_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tracksite_app, tracksite_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tracksite_app, tracksite_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tracksite_app, tracksite_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tracksite_app, tracksite_worker;
--> statement-breakpoint

-- 2. Partitioned event store ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "events" (
  "event_id" text NOT NULL,
  "source_event_id" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "site_id" uuid NOT NULL,
  "site_tracking_id" char(6) NOT NULL,
  "environment_id" uuid NOT NULL,
  "name" text NOT NULL,
  "is_standard" boolean NOT NULL,
  "category" text NOT NULL,
  "client_ts" timestamptz,
  "server_ts" timestamptz NOT NULL,
  "anonymous_id" text,
  "session_id" text,
  "user_id" text,
  "url" text,
  "host" text,
  "path" text,
  "referrer" text,
  "title" text,
  "utm" jsonb,
  "click_ids" jsonb,
  "vendor_ids" jsonb,
  "consent" jsonb NOT NULL,
  "consent_snapshot_id" uuid,
  "props" jsonb,
  "commerce" jsonb,
  "user_data" jsonb,
  "ip_truncated" text,
  "ua_family" text,
  "locale" text,
  "source" text NOT NULL,
  "source_verified" boolean NOT NULL,
  "sdk_version" text NOT NULL,
  "config_version" integer,
  "schema_version" text NOT NULL,
  "provenance" jsonb NOT NULL,
  "processing_state" text NOT NULL,
  "drop_reason" text,
  "is_billable" boolean NOT NULL,
  "is_bot" boolean NOT NULL,
  "deliveries" jsonb,
  PRIMARY KEY ("site_id", "event_id", "server_ts")
) PARTITION BY RANGE ("server_ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_site_ts_idx" ON "events" ("site_id", "server_ts" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_site_name_ts_idx" ON "events" ("site_id", "name", "server_ts" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_org_ts_idx" ON "events" ("organization_id", "server_ts" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_site_anon_idx" ON "events" ("site_id", "anonymous_id", "server_ts" DESC) WHERE "anonymous_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_site_order_idx" ON "events" ("site_id", (("commerce"->>'order_id'))) WHERE "commerce" ? 'order_id';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_event_partition(month_start date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  part_name text := 'events_' || to_char(month_start, 'YYYYMM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF "events" FOR VALUES FROM (%L) TO (%L)',
    part_name, month_start, (month_start + interval '1 month')::date
  );
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events_default" PARTITION OF "events" DEFAULT;
--> statement-breakpoint
DO $$
DECLARE m date := date_trunc('month', now())::date - interval '1 month';
BEGIN
  FOR i IN 0..4 LOOP
    PERFORM ensure_event_partition((m + (i || ' month')::interval)::date);
  END LOOP;
END $$;
--> statement-breakpoint

-- 3. Append-only tables -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forbid_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.retention_job', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_append_only ON "audit_log";
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS usage_ledger_append_only ON "usage_ledger";
--> statement-breakpoint
CREATE TRIGGER usage_ledger_append_only BEFORE UPDATE OR DELETE ON "usage_ledger" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS config_versions_immutable ON "config_versions";
--> statement-breakpoint
CREATE TRIGGER config_versions_immutable BEFORE UPDATE ON "config_versions" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
--> statement-breakpoint

-- 4. Row-Level Security -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites','domains','environments','source_keys','organization_settings',
    'consent_policies','consent_snapshots','event_definitions','integrations','credentials',
    'oauth_connections','event_mappings','config_drafts','config_versions','config_publications',
    'delivery_attempts','dead_letter_references','chat_sessions','chat_messages','agent_tool_runs',
    'approvals','site_setup_states','inferences','subscriptions','entitlements','usage_ledger',
    'usage_periods','retention_policies','data_subject_requests','deletion_jobs','data_quality_issues',
    'site_health_snapshots','event_aggregates','conversion_records','attribution_touchpoints',
    'member','invitation','events','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS organization_tenant_isolation ON "organization";
--> statement-breakpoint
CREATE POLICY organization_tenant_isolation ON "organization" TO tracksite_app USING (id = app_organization_id()) WITH CHECK (id = app_organization_id());
--> statement-breakpoint
-- shared, non-tenant tables stay readable for the app role; queue/outbox/nonces are data-plane only
REVOKE ALL ON "queue_messages", "queue_dead_letters", "stripe_events", "break_glass_access" FROM tracksite_app;
--> statement-breakpoint
-- the control plane appends outbox events inside tenant transactions; only the worker reads/relays them
REVOKE ALL ON "outbox" FROM tracksite_app;
--> statement-breakpoint
GRANT INSERT ON "outbox" TO tracksite_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "nonces" TO tracksite_app;
