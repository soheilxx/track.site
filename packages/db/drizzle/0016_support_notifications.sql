-- Support desk: agent notifications and presence (docs/18-support-desk.md §"Notifications", task T8).
--
--   1. `support_agent_settings`: one row per operator — `last_seen_at` (refreshed by every notification poll
--      of the console; together with `support_presence` the "online" signal of round-robin and the sidebar)
--      and the e-mail preferences (assignment, customer reply). A missing row means the defaults.
--   2. `support_notifications`: per-recipient rows materialised from `support_events` (`assignee` →
--      `assignment`, customer `reply` → `customer_reply`, `sla_warning`, `sla_breach`) and from `@name`
--      mentions in internal notes (`mention`). Unique on (user, kind, source) so the fan-out is idempotent;
--      `payload` carries ids and field values only — never bodies. `mail_status` records whether the desk
--      e-mailed the agent (`pending` → `sent` / `failed` / `skipped` by preference; `none` for in-app only).
--   3. `support_notification_sync`: singleton (id = 1) cursor of the fan-out.
--   4. Indexes on `support_events (created_at)` and on notes in `support_messages` for the incremental scan.
--
-- All three tables are operator-only: every privilege revoked from tracksite_app; tracksite_ops (BYPASSRLS)
-- is the only path. Every statement is idempotent (applied twice locally). Enumerations are text + CHECK.

-- 1. Agent settings ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_agent_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_on_assignment" boolean DEFAULT true NOT NULL,
	"email_on_customer_reply" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_agent_settings" ADD CONSTRAINT "support_agent_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_agent_settings_seen_idx" ON "support_agent_settings" USING btree ("last_seen_at");
--> statement-breakpoint
ALTER TABLE "support_agent_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_agent_settings" FROM tracksite_app;
--> statement-breakpoint

-- 2. Notifications ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ticket_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"mail_status" text DEFAULT 'none' NOT NULL,
	"emailed_at" timestamp with time zone,
	"email_error" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_notifications" ADD CONSTRAINT "support_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_notifications" ADD CONSTRAINT "support_notifications_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_notifications" DROP CONSTRAINT IF EXISTS "support_notifications_kind_chk";
--> statement-breakpoint
ALTER TABLE "support_notifications" ADD CONSTRAINT "support_notifications_kind_chk" CHECK ("kind" IN ('assignment', 'customer_reply', 'sla_warning', 'sla_breach', 'mention'));
--> statement-breakpoint
ALTER TABLE "support_notifications" DROP CONSTRAINT IF EXISTS "support_notifications_source_kind_chk";
--> statement-breakpoint
ALTER TABLE "support_notifications" ADD CONSTRAINT "support_notifications_source_kind_chk" CHECK ("source_kind" IN ('event', 'message'));
--> statement-breakpoint
ALTER TABLE "support_notifications" DROP CONSTRAINT IF EXISTS "support_notifications_mail_status_chk";
--> statement-breakpoint
ALTER TABLE "support_notifications" ADD CONSTRAINT "support_notifications_mail_status_chk" CHECK ("mail_status" IN ('none', 'pending', 'sent', 'failed', 'skipped'));
--> statement-breakpoint
ALTER TABLE "support_notifications" DROP CONSTRAINT IF EXISTS "support_notifications_payload_chk";
--> statement-breakpoint
ALTER TABLE "support_notifications" ADD CONSTRAINT "support_notifications_payload_chk" CHECK (jsonb_typeof("payload") = 'object');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_notifications_source_uq" ON "support_notifications" USING btree ("user_id","kind","source_kind","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_notifications_user_idx" ON "support_notifications" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_notifications_unread_idx" ON "support_notifications" USING btree ("user_id") WHERE "read_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_notifications_mail_idx" ON "support_notifications" USING btree ("created_at") WHERE "mail_status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_notifications_created_idx" ON "support_notifications" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "support_notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_notifications" FROM tracksite_app;
--> statement-breakpoint

-- 3. Fan-out cursor (singleton) -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_notification_sync" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"events_through" timestamp with time zone,
	"messages_through" timestamp with time zone,
	"ran_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "support_notification_sync" DROP CONSTRAINT IF EXISTS "support_notification_sync_singleton_chk";
--> statement-breakpoint
ALTER TABLE "support_notification_sync" ADD CONSTRAINT "support_notification_sync_singleton_chk" CHECK ("id" = 1);
--> statement-breakpoint
ALTER TABLE "support_notification_sync" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_notification_sync" FROM tracksite_app;
--> statement-breakpoint
INSERT INTO "support_notification_sync" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 4. Scan indexes on the sources ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "support_events_created_idx" ON "support_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_notes_created_idx" ON "support_messages" USING btree ("created_at") WHERE "direction" = 'note';
