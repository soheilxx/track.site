-- Support desk: hardening slice (docs/18-support-desk.md §"Hardening", task H).
--
--   1. `support_tickets`: the SLA clock run is persisted — `sla_clock_started_at` (creation, or the last
--      reopening) and the targets the running clocks were booked against (`first_response_target_ms`,
--      `resolution_target_ms`, business milliseconds), so a priority change on a reopened ticket measures
--      from the reopening and the worker scopes its warnings to the current run. Backfill: the latest
--      `reopened` event, else `created_at`; targets from the ticket's policy and priority.
--   2. `support_messages`: the transient `sending` delivery state + `delivery_claimed_at` (the console's
--      atomic send claim: two clicks never mail the customer twice) and the partial unique index on
--      `(provider_message_id) WHERE direction = 'inbound'` — one stored row per received mail (the structural
--      replay guard of §4 step 2; the store maps a violation to the stored route).
--   3. `support_inbound_events.payload`: the parsed `email.received` event without bodies or attachment bytes,
--      so an admin can reprocess a failed delivery from Support → Settings.
--
-- Every statement is idempotent (applied twice locally). Enumerations stay text + CHECK.

-- 1. Persisted SLA clock run -------------------------------------------------------------------------
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "sla_clock_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "first_response_target_ms" bigint;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "resolution_target_ms" bigint;
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_sla_targets_chk";
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_sla_targets_chk" CHECK (("first_response_target_ms" IS NULL OR "first_response_target_ms" > 0) AND ("resolution_target_ms" IS NULL OR "resolution_target_ms" > 0));
--> statement-breakpoint
-- clock start of every existing ticket: the last reopening, else the creation (rows written later carry it from the engine)
UPDATE "support_tickets" t
SET "sla_clock_started_at" = COALESCE((SELECT max(e."created_at") FROM "support_events" e WHERE e."ticket_id" = t."id" AND e."kind" = 'reopened'), t."created_at")
WHERE t."sla_clock_started_at" IS NULL;
--> statement-breakpoint
-- targets of the existing tickets from their policy and priority (null stays null: no policy, no entry — never a guess)
UPDATE "support_tickets" t
SET "first_response_target_ms" = (p."priorities" -> t."priority" ->> 'first_response_minutes')::bigint * 60000
FROM "support_sla_policies" p
WHERE p."id" = t."sla_policy_id" AND t."first_response_target_ms" IS NULL AND t."first_response_due_at" IS NOT NULL
	AND (p."priorities" -> t."priority" ->> 'first_response_minutes') ~ '^[0-9]+$' AND (p."priorities" -> t."priority" ->> 'first_response_minutes')::bigint > 0;
--> statement-breakpoint
UPDATE "support_tickets" t
SET "resolution_target_ms" = (p."priorities" -> t."priority" ->> 'resolution_minutes')::bigint * 60000
FROM "support_sla_policies" p
WHERE p."id" = t."sla_policy_id" AND t."resolution_target_ms" IS NULL AND t."resolution_due_at" IS NOT NULL
	AND (p."priorities" -> t."priority" ->> 'resolution_minutes') ~ '^[0-9]+$' AND (p."priorities" -> t."priority" ->> 'resolution_minutes')::bigint > 0;
--> statement-breakpoint

-- 2. Send claim and the structural replay guard --------------------------------------------------------
ALTER TABLE "support_messages" ADD COLUMN IF NOT EXISTS "delivery_claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "support_messages" DROP CONSTRAINT IF EXISTS "support_messages_delivery_status_chk";
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_delivery_status_chk" CHECK ("delivery_status" IN ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'na'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "support_messages_inbound_provider_uq" ON "support_messages" USING btree ("provider_message_id") WHERE "direction" = 'inbound' AND "provider_message_id" IS NOT NULL;
--> statement-breakpoint

-- 3. Inbound ledger payload (ids, addresses, subject, headers, attachment names — never bodies) ---------
ALTER TABLE "support_inbound_events" ADD COLUMN IF NOT EXISTS "payload" jsonb;
--> statement-breakpoint
ALTER TABLE "support_inbound_events" DROP CONSTRAINT IF EXISTS "support_inbound_events_payload_chk";
--> statement-breakpoint
ALTER TABLE "support_inbound_events" ADD CONSTRAINT "support_inbound_events_payload_chk" CHECK ("payload" IS NULL OR jsonb_typeof("payload") = 'object');
