-- Tariff catalogue (packages/catalog): the third plan is "Pro" (was "scale"), usage warnings at 70/90/100 %,
-- overage policy per organization. Plan rows are synced from the catalogue by the seed; the values here
-- only make the migration self-contained for databases that are migrated before the next seed run.
INSERT INTO "plans" ("id", "name", "sort_order", "limits", "features", "stripe_price_env", "is_public", "contact_sales")
VALUES (
	'pro',
	'Pro',
	3,
	'{"sites":25,"eventsPerMonth":20000000,"destinations":null,"retentionDays":761,"teamMembers":null,"serverSide":true,"exports":true,"sso":false}'::jsonb,
	'["server_side_tracking","all_standard_destinations","ai_assistant","consent_engine","event_debugger","tracking_health","config_versioning","standard_ecommerce_events","email_support","advanced_ecommerce_events","cross_domain_tracking","offline_conversions","enhanced_matching","data_quality_inbox","funnel_revenue_reconciliation","anomaly_detection","scheduled_ai_audits","priority_support","multi_store_agency","fine_grained_roles","approval_workflows","four_eyes_principle","full_audit_log","event_replay","advanced_attribution","warehouse_exports","streaming_exports","scheduled_exports","advanced_alerts","priority_onboarding"]'::jsonb,
	'{"monthly":"STRIPE_PRICE_PRO_MONTHLY","yearly":"STRIPE_PRICE_PRO_YEARLY"}'::jsonb,
	true,
	false
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "subscriptions" SET "plan_id" = 'pro', "updated_at" = now() WHERE "plan_id" = 'scale';
--> statement-breakpoint
DELETE FROM "plans" WHERE "id" = 'scale';
--> statement-breakpoint
ALTER TABLE "usage_periods" ADD COLUMN IF NOT EXISTS "warned_70_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "usage_periods" ADD COLUMN IF NOT EXISTS "warned_90_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "usage_overage_policy" text DEFAULT 'pause' NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "usage_cost_limit_cents" bigint;
--> statement-breakpoint
ALTER TABLE "organization_settings" DROP CONSTRAINT IF EXISTS "organization_settings_usage_overage_policy_chk";
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_usage_overage_policy_chk" CHECK ("usage_overage_policy" IN ('allow', 'cost_limit', 'pause'));
