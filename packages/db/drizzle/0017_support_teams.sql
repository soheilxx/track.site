-- Support desk: teams / queues and agent-created tickets (docs/18-support-desk.md §"Agent-created tickets and
-- teams", task N).
--
--   1. `support_teams`: a named queue operators belong to — slug (unique, URL and filter key), name,
--      description, `is_default` (exactly one, partial unique index), `archived_at` (an archived team keeps
--      its tickets and members but is offered nowhere).
--   2. `support_team_members`: (team, operator) → role `member` | `lead`.
--   3. `support_tickets`: `team_id` (null = no team), `opened_by` (`customer` for every inbound path, `agent`
--      for a ticket an operator opened on the customer's behalf, `system`), `sla_pending_first_customer_reply`
--      (an agent-created ticket has no first-response target and a paused resolution clock until the first
--      customer reply starts the clocks — both due times stay null until then), and the channel `agent`.
--   4. Seeds: the teams "support" (default) and "sales" with fixed ids (`ON CONFLICT DO NOTHING`, so renames
--      made in Support → Settings → Teams survive re-runs).
--
-- Both team tables are operator-only: every privilege revoked from tracksite_app; tracksite_ops (BYPASSRLS) is
-- the console's path and tracksite_worker reads the members for the team-aware round robin of the inbound
-- store. Every statement is idempotent (applied twice locally). Enumerations are text + CHECK.

-- 1. Teams ------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_teams" DROP CONSTRAINT IF EXISTS "support_teams_slug_chk";
--> statement-breakpoint
ALTER TABLE "support_teams" ADD CONSTRAINT "support_teams_slug_chk" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,39}$');
--> statement-breakpoint
ALTER TABLE "support_teams" DROP CONSTRAINT IF EXISTS "support_teams_name_chk";
--> statement-breakpoint
ALTER TABLE "support_teams" ADD CONSTRAINT "support_teams_name_chk" CHECK (length("name") BETWEEN 1 AND 60);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_teams_slug_uq" ON "support_teams" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_teams_default_uq" ON "support_teams" USING btree ("is_default") WHERE "is_default";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_teams_archived_idx" ON "support_teams" USING btree ("archived_at");
--> statement-breakpoint
ALTER TABLE "support_teams" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_teams" FROM tracksite_app;
--> statement-breakpoint

-- 2. Team members ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "support_team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_team_id_support_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."support_teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_team_members" DROP CONSTRAINT IF EXISTS "support_team_members_role_chk";
--> statement-breakpoint
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_role_chk" CHECK ("role" IN ('member', 'lead'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_team_members_user_idx" ON "support_team_members" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "support_team_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "support_team_members" FROM tracksite_app;
--> statement-breakpoint

-- 3. Tickets: team, opened_by, SLA pending flag, channel `agent` ---------------------------------------
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "team_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_team_id_support_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."support_teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "opened_by" text DEFAULT 'customer' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_opened_by_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_opened_by_chk" CHECK ("opened_by" IN ('customer', 'agent', 'system'));
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "sla_pending_first_customer_reply" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_channel_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_channel_chk" CHECK ("channel" IN ('email', 'form', 'dashboard', 'api', 'agent'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_team_idx" ON "support_tickets" USING btree ("team_id","status");
--> statement-breakpoint

-- 4. Seeds ------------------------------------------------------------------------------------------
INSERT INTO "support_teams" ("id", "slug", "name", "description", "is_default")
VALUES
	('00000000-0000-4000-8000-000000000171', 'support', 'Support', 'Customer support — the default queue of every ticket without a team of its own.', true),
	('00000000-0000-4000-8000-000000000172', 'sales', 'Sales', 'Prospects, demos and plan questions.', false)
ON CONFLICT DO NOTHING;
