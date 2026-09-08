-- Support desk foundation (docs/18-support-desk.md, task T0).
--
--   1. `support_sla_policies`: response / resolution targets per priority in business minutes, business hours,
--      escalation; one default policy (partial unique index on is_default). Seeded with configurable defaults.
--   2. `support_tickets`: the ticket with its human-facing number (sequence `support_ticket_number_seq`),
--      requester, workflow state, SLA timestamps and pause clock. Tenant RLS: SELECT / INSERT / UPDATE limited
--      to the organisation's own rows, DELETE revoked; tickets without organisation stay invisible to tenants.
--   3. `support_messages`: inbound / outbound messages and internal notes (sanitised html_body only). Tenants
--      read only non-note rows of their tickets and insert only customer inbound messages.
--   4. `support_attachments`: bytea attachments (≤ 5 MB CHECK); note attachments excluded from tenant reads.
--   5. `support_macros`, `support_views`, `support_presence`, `support_inbound_events`, `support_settings`:
--      operator-only — every privilege revoked from tracksite_app; tracksite_ops (BYPASSRLS) is the only path.
--   6. `support_events`: ticket timeline without bodies; tenants read the customer-relevant kinds only.
--   7. `contact_requests.ticket_id`: a public-form request converted into a ticket.
--   8. Seeds: default SLA policy, three global macros, the settings singleton (id = 1) — ON CONFLICT DO NOTHING.
--
-- Every statement is idempotent (applied twice locally). Enumerations are text + CHECK like migration 0014.

-- 1. SLA policies ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"plan_ids" text[],
	"priorities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"business_hours" jsonb DEFAULT '{"timezone":"Europe/Berlin","days":{}}'::jsonb NOT NULL,
	"escalation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_sla_policies" DROP CONSTRAINT IF EXISTS "support_sla_policies_priorities_chk";
--> statement-breakpoint
ALTER TABLE "support_sla_policies" ADD CONSTRAINT "support_sla_policies_priorities_chk" CHECK (jsonb_typeof("priorities") = 'object');
--> statement-breakpoint
ALTER TABLE "support_sla_policies" DROP CONSTRAINT IF EXISTS "support_sla_policies_business_hours_chk";
--> statement-breakpoint
ALTER TABLE "support_sla_policies" ADD CONSTRAINT "support_sla_policies_business_hours_chk" CHECK (jsonb_typeof("business_hours") = 'object');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_sla_policies_default_uq" ON "support_sla_policies" USING btree ("is_default") WHERE "is_default";
--> statement-breakpoint
-- targets are not secret (the customer page may show them); only operators change them
REVOKE INSERT, UPDATE, DELETE ON "support_sla_policies" FROM tracksite_app;
--> statement-breakpoint

-- 2. Tickets ----------------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS "support_ticket_number_seq" AS bigint START WITH 1000 INCREMENT BY 1;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "support_ticket_number_seq" TO tracksite_app, tracksite_worker, tracksite_ops;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigint DEFAULT nextval('support_ticket_number_seq') NOT NULL,
	"organization_id" uuid,
	"requester_user_id" uuid,
	"requester_email" text NOT NULL,
	"requester_name" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"channel" text NOT NULL,
	"category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"assignee_user_id" uuid,
	"sla_policy_id" uuid,
	"first_response_due_at" timestamp with time zone,
	"resolution_due_at" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"last_customer_message_at" timestamp with time zone,
	"last_agent_message_at" timestamp with time zone,
	"breached_first_response" boolean DEFAULT false NOT NULL,
	"breached_resolution" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"pause_total_ms" bigint DEFAULT 0 NOT NULL,
	"merged_into_id" uuid,
	"locale" text DEFAULT 'en' NOT NULL,
	"satisfaction" jsonb,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_sla_policy_id_support_sla_policies_id_fk" FOREIGN KEY ("sla_policy_id") REFERENCES "public"."support_sla_policies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_merged_into_id_support_tickets_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_status_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_status_chk" CHECK ("status" IN ('new', 'open', 'pending', 'on_hold', 'solved', 'closed', 'spam'));
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_priority_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_priority_chk" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_channel_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_channel_chk" CHECK ("channel" IN ('email', 'form', 'dashboard', 'api'));
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_pause_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_pause_chk" CHECK ("pause_total_ms" >= 0 AND "reopen_count" >= 0);
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_merge_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_merge_chk" CHECK ("merged_into_id" IS NULL OR "merged_into_id" <> "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_number_uq" ON "support_tickets" USING btree ("number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_status_updated_idx" ON "support_tickets" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_assignee_idx" ON "support_tickets" USING btree ("assignee_user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_org_idx" ON "support_tickets" USING btree ("organization_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_updated_idx" ON "support_tickets" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_requester_idx" ON "support_tickets" USING btree ("requester_email");
--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS support_tickets_tenant_isolation ON "support_tickets";
--> statement-breakpoint
-- tenants see, create and update their own tickets (organization_id NULL matches nobody); DELETE stays with operators
CREATE POLICY support_tickets_tenant_isolation ON "support_tickets" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
REVOKE DELETE ON "support_tickets" FROM tracksite_app;
--> statement-breakpoint

-- 3. Macros (before messages: messages reference them) ---------------------------------------------
CREATE TABLE IF NOT EXISTS "support_macros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"body_text" text NOT NULL,
	"body_html" text,
	"actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" text DEFAULT 'personal' NOT NULL,
	"owner_user_id" uuid,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_macros" DROP CONSTRAINT IF EXISTS "support_macros_scope_chk";
--> statement-breakpoint
ALTER TABLE "support_macros" ADD CONSTRAINT "support_macros_scope_chk" CHECK (("scope" = 'global' AND "owner_user_id" IS NULL) OR ("scope" = 'personal' AND "owner_user_id" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "support_macros" DROP CONSTRAINT IF EXISTS "support_macros_actions_chk";
--> statement-breakpoint
ALTER TABLE "support_macros" ADD CONSTRAINT "support_macros_actions_chk" CHECK (jsonb_typeof("actions") = 'object');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_macros_scope_owner_idx" ON "support_macros" USING btree ("scope","owner_user_id");
--> statement-breakpoint
ALTER TABLE "support_macros" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_macros" FROM tracksite_app;
--> statement-breakpoint

-- 4. Messages ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"organization_id" uuid,
	"direction" text NOT NULL,
	"author_kind" text NOT NULL,
	"author_user_id" uuid,
	"from_email" text,
	"to_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"cc_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text,
	"text_body" text DEFAULT '' NOT NULL,
	"html_body" text,
	"message_id" text,
	"in_reply_to" text,
	"references" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider_message_id" text,
	"delivery_status" text DEFAULT 'na' NOT NULL,
	"delivery_error" text,
	"macro_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_macro_id_support_macros_id_fk" FOREIGN KEY ("macro_id") REFERENCES "public"."support_macros"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_messages" DROP CONSTRAINT IF EXISTS "support_messages_direction_chk";
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_direction_chk" CHECK ("direction" IN ('inbound', 'outbound', 'note'));
--> statement-breakpoint
ALTER TABLE "support_messages" DROP CONSTRAINT IF EXISTS "support_messages_author_kind_chk";
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_kind_chk" CHECK ("author_kind" IN ('customer', 'agent', 'system'));
--> statement-breakpoint
ALTER TABLE "support_messages" DROP CONSTRAINT IF EXISTS "support_messages_delivery_status_chk";
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_delivery_status_chk" CHECK ("delivery_status" IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'na'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_org_idx" ON "support_messages" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_message_id_idx" ON "support_messages" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_provider_id_idx" ON "support_messages" USING btree ("provider_message_id");
--> statement-breakpoint
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS support_messages_tenant_isolation ON "support_messages";
--> statement-breakpoint
-- tenants read their own tickets' messages except internal notes
CREATE POLICY support_messages_tenant_isolation ON "support_messages" FOR SELECT TO tracksite_app USING (organization_id = app_organization_id() AND direction <> 'note');
--> statement-breakpoint
DROP POLICY IF EXISTS support_messages_tenant_insert ON "support_messages";
--> statement-breakpoint
-- a customer reply from the dashboard: inbound, authored by the customer, on the tenant's own ticket
CREATE POLICY support_messages_tenant_insert ON "support_messages" FOR INSERT TO tracksite_app WITH CHECK (organization_id = app_organization_id() AND direction = 'inbound' AND author_kind = 'customer');
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "support_messages" FROM tracksite_app;
--> statement-breakpoint

-- 5. Attachments --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"organization_id" uuid,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_id_support_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_attachments" DROP CONSTRAINT IF EXISTS "support_attachments_size_chk";
--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_size_chk" CHECK ("size_bytes" >= 0 AND "size_bytes" <= 5242880);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_attachments_message_idx" ON "support_attachments" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_attachments_ticket_idx" ON "support_attachments" USING btree ("ticket_id");
--> statement-breakpoint
ALTER TABLE "support_attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS support_attachments_tenant_isolation ON "support_attachments";
--> statement-breakpoint
-- tenant reads follow the message: own ticket, and never an attachment of an internal note
CREATE POLICY support_attachments_tenant_isolation ON "support_attachments" FOR SELECT TO tracksite_app USING (
	organization_id = app_organization_id()
	AND EXISTS (SELECT 1 FROM "support_messages" m WHERE m.id = "support_attachments"."message_id" AND m.direction <> 'note')
);
--> statement-breakpoint
DROP POLICY IF EXISTS support_attachments_tenant_insert ON "support_attachments";
--> statement-breakpoint
CREATE POLICY support_attachments_tenant_insert ON "support_attachments" FOR INSERT TO tracksite_app WITH CHECK (
	organization_id = app_organization_id()
	AND EXISTS (SELECT 1 FROM "support_messages" m WHERE m.id = "support_attachments"."message_id" AND m.direction = 'inbound' AND m.author_kind = 'customer')
);
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "support_attachments" FROM tracksite_app;
--> statement-breakpoint

-- 6. Saved views, presence ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" text DEFAULT 'updated_desc' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_views_owner_idx" ON "support_views" USING btree ("owner_user_id","position");
--> statement-breakpoint
ALTER TABLE "support_views" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_views" FROM tracksite_app;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_presence" (
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mode" text DEFAULT 'viewing' NOT NULL,
	CONSTRAINT "support_presence_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_presence" ADD CONSTRAINT "support_presence_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_presence" DROP CONSTRAINT IF EXISTS "support_presence_mode_chk";
--> statement-breakpoint
ALTER TABLE "support_presence" ADD CONSTRAINT "support_presence_mode_chk" CHECK ("mode" IN ('viewing', 'typing'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_presence_seen_idx" ON "support_presence" USING btree ("last_seen_at");
--> statement-breakpoint
ALTER TABLE "support_presence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_presence" FROM tracksite_app;
--> statement-breakpoint

-- 7. Events -------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"organization_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_events" ADD CONSTRAINT "support_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_events" DROP CONSTRAINT IF EXISTS "support_events_actor_kind_chk";
--> statement-breakpoint
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_actor_kind_chk" CHECK ("actor_kind" IN ('customer', 'agent', 'system'));
--> statement-breakpoint
ALTER TABLE "support_events" DROP CONSTRAINT IF EXISTS "support_events_kind_chk";
--> statement-breakpoint
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_kind_chk" CHECK ("kind" IN ('created', 'status', 'priority', 'assignee', 'tags', 'merged', 'sla_breach', 'sla_warning', 'reply', 'note', 'csat', 'reopened'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_events_ticket_idx" ON "support_events" USING btree ("ticket_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_events_org_idx" ON "support_events" USING btree ("organization_id","created_at");
--> statement-breakpoint
ALTER TABLE "support_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS support_events_tenant_isolation ON "support_events";
--> statement-breakpoint
-- customers see the customer-relevant timeline of their own tickets: no assignee / tag / note / SLA internals
CREATE POLICY support_events_tenant_isolation ON "support_events" FOR SELECT TO tracksite_app USING (organization_id = app_organization_id() AND kind IN ('created', 'status', 'priority', 'merged', 'reply', 'csat', 'reopened'));
--> statement-breakpoint
DROP POLICY IF EXISTS support_events_tenant_insert ON "support_events";
--> statement-breakpoint
CREATE POLICY support_events_tenant_insert ON "support_events" FOR INSERT TO tracksite_app WITH CHECK (organization_id = app_organization_id() AND actor_kind = 'customer' AND kind IN ('created', 'status', 'reply', 'csat', 'reopened'));
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "support_events" FROM tracksite_app;
--> statement-breakpoint

-- 8. Inbound webhook ledger, settings ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"provider_event_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text DEFAULT 'received' NOT NULL,
	"ticket_id" uuid,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_inbound_events" ADD CONSTRAINT "support_inbound_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_inbound_events" DROP CONSTRAINT IF EXISTS "support_inbound_events_status_chk";
--> statement-breakpoint
ALTER TABLE "support_inbound_events" ADD CONSTRAINT "support_inbound_events_status_chk" CHECK ("status" IN ('received', 'processed', 'ignored', 'failed'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_inbound_events_provider_event_uq" ON "support_inbound_events" USING btree ("provider_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_inbound_events_status_idx" ON "support_inbound_events" USING btree ("status","received_at");
--> statement-breakpoint
ALTER TABLE "support_inbound_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_inbound_events" FROM tracksite_app;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"inbound_domain" text DEFAULT 'support.track.site' NOT NULL,
	"from_name" text DEFAULT 'Track Support' NOT NULL,
	"from_address" text DEFAULT 'support@track.site' NOT NULL,
	"signature_text" text DEFAULT '' NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"auto_assign_strategy" text DEFAULT 'none' NOT NULL,
	"business_hours" jsonb DEFAULT '{"timezone":"Europe/Berlin","days":{}}'::jsonb NOT NULL,
	"csat_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_settings" DROP CONSTRAINT IF EXISTS "support_settings_singleton_chk";
--> statement-breakpoint
ALTER TABLE "support_settings" ADD CONSTRAINT "support_settings_singleton_chk" CHECK ("id" = 1);
--> statement-breakpoint
ALTER TABLE "support_settings" DROP CONSTRAINT IF EXISTS "support_settings_auto_assign_chk";
--> statement-breakpoint
ALTER TABLE "support_settings" ADD CONSTRAINT "support_settings_auto_assign_chk" CHECK ("auto_assign_strategy" IN ('none', 'round_robin'));
--> statement-breakpoint
ALTER TABLE "support_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_settings" FROM tracksite_app;
--> statement-breakpoint

-- 9. Contact requests → tickets -----------------------------------------------------------------------
ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "ticket_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_requests_ticket_idx" ON "contact_requests" USING btree ("ticket_id");
--> statement-breakpoint

-- 10. Seeds (configurable defaults; ON CONFLICT DO NOTHING keeps later edits) ---------------------------
-- Default SLA policy: business minutes per priority — urgent 1 h / 8 h, high 4 h / 24 h, normal 8 h / 72 h,
-- low 24 h / 7 d — Mon–Fri 09:00–18:00 Europe/Berlin, warning at 80 % of the target. Adjust in Support → Settings.
INSERT INTO "support_sla_policies" ("id", "name", "description", "plan_ids", "priorities", "business_hours", "escalation", "is_default")
VALUES (
	'a0000000-0000-4000-8000-000000000501',
	'Default (all plans)',
	'Configurable default targets in business minutes. Applies to every plan without a policy of its own; adjust the values in Support → Settings → SLA.',
	NULL,
	'{"urgent":{"first_response_minutes":60,"resolution_minutes":480},"high":{"first_response_minutes":240,"resolution_minutes":1440},"normal":{"first_response_minutes":480,"resolution_minutes":4320},"low":{"first_response_minutes":1440,"resolution_minutes":10080}}'::jsonb,
	'{"timezone":"Europe/Berlin","days":{"mon":[[540,1080]],"tue":[[540,1080]],"wed":[[540,1080]],"thu":[[540,1080]],"fri":[[540,1080]]}}'::jsonb,
	'{"warning_percent":80}'::jsonb,
	true
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "support_macros" ("id", "name", "category", "body_text", "actions", "scope", "owner_user_id")
VALUES
	(
		'a0000000-0000-4000-8000-000000000601',
		'Acknowledge receipt',
		'general',
		E'Hello {requester_name},\n\nthank you for your message — we have received it as ticket #{ticket_number} and are looking into it. We will get back to you as soon as we know more.\n\nKind regards\n{agent_name}\nTrack Support',
		'{"status":"open","assign_to_self":true}'::jsonb,
		'global',
		NULL
	),
	(
		'a0000000-0000-4000-8000-000000000602',
		'Need more information',
		'general',
		E'Hello {requester_name},\n\nto look into this we need a little more information from you:\n\n- \n- \n\nSimply reply to this e-mail; the ticket (#{ticket_number}) stays open until we hear from you.\n\nKind regards\n{agent_name}\nTrack Support',
		'{"status":"pending"}'::jsonb,
		'global',
		NULL
	),
	(
		'a0000000-0000-4000-8000-000000000603',
		'Resolved – closing',
		'general',
		E'Hello {requester_name},\n\nwe consider ticket #{ticket_number} resolved and are closing it. If anything is still open, reply to this e-mail and the ticket reopens automatically.\n\nKind regards\n{agent_name}\nTrack Support',
		'{"status":"solved"}'::jsonb,
		'global',
		NULL
	)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- placeholders until DNS / Resend are set up (docs/18 §"DNS and Resend"): SUPPORT_FROM_ADDRESS and
-- SUPPORT_INBOUND_DOMAIN override them per environment, the settings page edits them in the console
INSERT INTO "support_settings" ("id", "inbound_domain", "from_name", "from_address", "signature_text", "auto_reply_enabled", "auto_assign_strategy", "business_hours", "csat_enabled")
VALUES (
	1,
	'support.track.site',
	'Track Support',
	'support@track.site',
	'',
	false,
	'none',
	'{"timezone":"Europe/Berlin","days":{"mon":[[540,1080]],"tue":[[540,1080]],"wed":[[540,1080]],"thu":[[540,1080]],"fri":[[540,1080]]}}'::jsonb,
	true
)
ON CONFLICT ("id") DO NOTHING;
