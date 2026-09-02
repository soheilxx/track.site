CREATE TYPE "public"."business_type" AS ENUM('ecommerce', 'lead_generation', 'saas', 'content', 'other');--> statement-breakpoint
CREATE TYPE "public"."domain_verification_method" AS ENUM('dns_txt', 'file', 'meta_tag');--> statement-breakpoint
CREATE TYPE "public"."environment_kind" AS ENUM('production', 'staging', 'development');--> statement-breakpoint
CREATE TYPE "public"."site_platform" AS ENUM('shopify', 'woocommerce', 'shopware', 'wordpress', 'headless', 'custom', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('active', 'paused', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."source_key_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."consent_policy_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."event_capture" AS ENUM('auto_page', 'data_layer', 'shop_integration', 'manual_api', 'form_submit', 'click_selector');--> statement-breakpoint
CREATE TYPE "public"."config_draft_status" AS ENUM('open', 'validated', 'published', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."connector_type" AS ENUM('webhook', 'meta', 'google_ads', 'ga4', 'tiktok', 'microsoft', 'linkedin', 'reddit', 'pinterest', 'snapchat', 'x', 'taboola', 'outbrain', 'amazon', 'spotify', 'quora', 'yahoo', 'tradedesk', 'gmp', 'adroll', 'criteo', 'affiliate');--> statement-breakpoint
CREATE TYPE "public"."credential_kind" AS ENUM('access_token', 'api_secret', 'oauth_refresh_token', 'oauth_access_token', 'webhook_secret', 'signing_secret');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('active', 'rotated', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."event_definition_status" AS ENUM('draft', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('draft', 'not_connected', 'connected', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."publication_kind" AS ENUM('publish', 'rollback');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'success', 'retry', 'failed', 'dead', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."delivery_error_class" AS ENUM('none', 'temporary', 'permanent', 'rate_limited', 'auth', 'credential_expired', 'invalid_payload', 'policy_blocked', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'consumed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tool_run_status" AS ENUM('ok', 'error', 'denied', 'needs_confirmation', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('plan', 'override', 'trial');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused');--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('accepted_event', 'billable_event', 'dropped_event', 'deduplicated_event');--> statement-breakpoint
CREATE TYPE "public"."retention_data_kind" AS ENUM('events', 'click_ids', 'consent_snapshots', 'delivery_attempts', 'audit_log', 'chat_transcripts', 'raw_archive', 'dsar_records', 'ip_hashes');--> statement-breakpoint
CREATE TYPE "public"."deletion_job_status" AS ENUM('pending', 'running', 'done', 'failed', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."dsar_kind" AS ENUM('export', 'delete', 'restrict', 'rectify', 'object', 'portability');--> statement-breakpoint
CREATE TYPE "public"."dsar_status" AS ENUM('received', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."conversion_kind" AS ENUM('purchase', 'refund', 'lead', 'sign_up', 'subscribe');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('contact', 'demo', 'support');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('new', 'handled', 'spam');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'READ_ONLY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"active_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT false,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"platform_role" text DEFAULT 'NONE' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verification_token" text NOT NULL,
	"verification_method" "domain_verification_method",
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_check_result" jsonb,
	"cname_host" text,
	"cname_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" "environment_kind" NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"data_region" text DEFAULT 'eu' NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"retention_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"benchmark_opt_in" boolean DEFAULT false NOT NULL,
	"max_sites" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tracking_id" char(6) NOT NULL,
	"name" text NOT NULL,
	"primary_domain" text,
	"business_type" "business_type",
	"platform" "site_platform" DEFAULT 'unknown' NOT NULL,
	"platform_evidence" jsonb,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"currency" char(3),
	"status" "site_status" DEFAULT 'active' NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"partition_override" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last4" text NOT NULL,
	"scopes" jsonb DEFAULT '["events:write"]'::jsonb NOT NULL,
	"status" "source_key_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_id_tombstones" (
	"tracking_id" char(6) PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "consent_policy_status" DEFAULT 'draft' NOT NULL,
	"region_policies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"purposes" jsonb DEFAULT '["necessary","analytics","marketing","personalization"]'::jsonb NOT NULL,
	"destination_purposes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"operational_events" jsonb DEFAULT '["purchase","refund"]'::jsonb NOT NULL,
	"cmp" jsonb,
	"consent_mode" jsonb DEFAULT '{"mode":"basic","legalReviewNote":null}'::jsonb NOT NULL,
	"legal_basis_note" text,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"policy_version" text,
	"granted" jsonb NOT NULL,
	"vendors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"region" text,
	"gpc" boolean,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"base_version" integer,
	"bundle" jsonb NOT NULL,
	"lint" jsonb,
	"status" "config_draft_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" "publication_kind" DEFAULT 'publish' NOT NULL,
	"rollback_of_version_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"approval_id" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"bundle" jsonb NOT NULL,
	"digest" text NOT NULL,
	"signature" text NOT NULL,
	"key_id" text NOT NULL,
	"summary" text,
	"diff" jsonb,
	"draft_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_id" uuid,
	"kind" "credential_kind" NOT NULL,
	"label" text NOT NULL,
	"ciphertext" text NOT NULL,
	"key_id" text NOT NULL,
	"last4" text,
	"scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "credential_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_validated_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_standard" boolean NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"capture" "event_capture" DEFAULT 'manual_api' NOT NULL,
	"schema" jsonb,
	"purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_of_truth" text,
	"status" "event_definition_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"vendor_event_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"field_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"connector_type" "connector_type" NOT NULL,
	"name" text NOT NULL,
	"status" "integration_status" DEFAULT 'draft' NOT NULL,
	"public_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_purpose" text,
	"health" jsonb DEFAULT '{"status":"unknown","checkedAt":null,"detail":null,"apiVersion":null}'::jsonb NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text,
	"external_account_name" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refresh_credential_id" uuid,
	"access_credential_id" uuid,
	"access_expires_at" timestamp with time zone,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dead_letter_references" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"queue" text NOT NULL,
	"event_id" text,
	"integration_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replayed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"integration_id" uuid NOT NULL,
	"connector_type" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" "delivery_status" NOT NULL,
	"error_class" "delivery_error_class" DEFAULT 'none' NOT NULL,
	"error_code" text,
	"error_message" text,
	"http_status" integer,
	"vendor_event_id" text,
	"request_digest" text,
	"payload_preview" jsonb,
	"response_excerpt" text,
	"duration_ms" integer,
	"next_retry_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_dedup" (
	"site_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "queue_dead_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"partition_key" text NOT NULL,
	"body" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"organization_id" uuid,
	"dead_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replayed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "queue_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"partition_key" text NOT NULL,
	"body" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"lock_token" text,
	"dedup_key" text,
	"organization_id" uuid,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "agent_tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_name" text NOT NULL,
	"call_id" text NOT NULL,
	"args_digest" text NOT NULL,
	"args_redacted" jsonb NOT NULL,
	"result_code" text NOT NULL,
	"result_redacted" jsonb,
	"status" "tool_run_status" NOT NULL,
	"duration_ms" integer,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_session_id" uuid,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"diff_hash" text NOT NULL,
	"summary" jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content_encrypted" text NOT NULL,
	"content_digest" text NOT NULL,
	"ui" jsonb,
	"redaction_count" integer DEFAULT 0 NOT NULL,
	"token_usage" jsonb,
	"response_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"user_id" uuid NOT NULL,
	"status" "chat_session_status" DEFAULT 'active' NOT NULL,
	"title" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"token_usage" jsonb DEFAULT '{"input":0,"output":0,"cached":0}'::jsonb NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"human_confirmed_at" timestamp with time zone,
	"human_rejected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_setup_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_step" text NOT NULL,
	"steps" jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" "entitlement_source" DEFAULT 'plan' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_price_env" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"contact_sales" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"api_version" text,
	"organization_id" uuid,
	"payload_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'none' NOT NULL,
	"interval" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"last_stripe_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"event_id" text NOT NULL,
	"kind" "usage_kind" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"accepted_events" bigint DEFAULT 0 NOT NULL,
	"billable_events" bigint DEFAULT 0 NOT NULL,
	"dropped_events" bigint DEFAULT 0 NOT NULL,
	"deduplicated_events" bigint DEFAULT 0 NOT NULL,
	"site_count" integer DEFAULT 0 NOT NULL,
	"destination_count" integer DEFAULT 0 NOT NULL,
	"limit_events" bigint,
	"warned_80_at" timestamp with time zone,
	"warned_100_at" timestamp with time zone,
	"soft_limit_hit_at" timestamp with time zone,
	"hard_limit_hit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"kind" "dsar_kind" NOT NULL,
	"subject" jsonb NOT NULL,
	"status" "dsar_status" DEFAULT 'received' NOT NULL,
	"requested_by" uuid,
	"note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"report" jsonb
);
--> statement-breakpoint
CREATE TABLE "deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dsar_id" uuid NOT NULL,
	"store" text NOT NULL,
	"status" "deletion_job_status" DEFAULT 'pending' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"data_kind" "retention_data_kind" NOT NULL,
	"days" integer NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_policies_scope_uq" UNIQUE NULLS NOT DISTINCT("organization_id","site_id","data_kind")
);
--> statement-breakpoint
CREATE TABLE "attribution_touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"anonymous_id" text NOT NULL,
	"channel" text NOT NULL,
	"source" text,
	"medium" text,
	"campaign" text,
	"click_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"kind" "conversion_kind" NOT NULL,
	"order_id" text,
	"value" numeric(14, 2),
	"currency" text,
	"source" text NOT NULL,
	"source_verified" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"fix_tool" text,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"event_name" text NOT NULL,
	"source" text NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"dropped" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deduplicated" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"billable" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"components" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor" jsonb NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"diff" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_glass_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ticket_ref" text,
	"approved_by" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"message" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" "contact_status" DEFAULT 'new' NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"ip_hash" text,
	"ua_family" text,
	"delivered_at" timestamp with time zone,
	"delivery_error" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_keys" ADD CONSTRAINT "source_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_keys" ADD CONSTRAINT "source_keys_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_keys" ADD CONSTRAINT "source_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_policies" ADD CONSTRAINT "consent_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_policies" ADD CONSTRAINT "consent_policies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_snapshots" ADD CONSTRAINT "consent_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_snapshots" ADD CONSTRAINT "consent_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_drafts" ADD CONSTRAINT "config_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_drafts" ADD CONSTRAINT "config_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_drafts" ADD CONSTRAINT "config_drafts_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_publications" ADD CONSTRAINT "config_publications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_publications" ADD CONSTRAINT "config_publications_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_publications" ADD CONSTRAINT "config_publications_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_publications" ADD CONSTRAINT "config_publications_version_id_config_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."config_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_publications" ADD CONSTRAINT "config_publications_rollback_of_version_id_config_versions_id_fk" FOREIGN KEY ("rollback_of_version_id") REFERENCES "public"."config_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_draft_id_config_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."config_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_mappings" ADD CONSTRAINT "event_mappings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_mappings" ADD CONSTRAINT "event_mappings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_mappings" ADD CONSTRAINT "event_mappings_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_refresh_credential_id_credentials_id_fk" FOREIGN KEY ("refresh_credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_access_credential_id_credentials_id_fk" FOREIGN KEY ("access_credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_references" ADD CONSTRAINT "dead_letter_references_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_references" ADD CONSTRAINT "dead_letter_references_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_references" ADD CONSTRAINT "dead_letter_references_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_runs" ADD CONSTRAINT "agent_tool_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_runs" ADD CONSTRAINT "agent_tool_runs_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_runs" ADD CONSTRAINT "agent_tool_runs_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inferences" ADD CONSTRAINT "inferences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inferences" ADD CONSTRAINT "inferences_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_setup_states" ADD CONSTRAINT "site_setup_states_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_setup_states" ADD CONSTRAINT "site_setup_states_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_jobs" ADD CONSTRAINT "deletion_jobs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_jobs" ADD CONSTRAINT "deletion_jobs_dsar_id_data_subject_requests_id_fk" FOREIGN KEY ("dsar_id") REFERENCES "public"."data_subject_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touchpoints" ADD CONSTRAINT "attribution_touchpoints_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touchpoints" ADD CONSTRAINT "attribution_touchpoints_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_records" ADD CONSTRAINT "conversion_records_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_records" ADD CONSTRAINT "conversion_records_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_aggregates" ADD CONSTRAINT "event_aggregates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_aggregates" ADD CONSTRAINT "event_aggregates_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_aggregates" ADD CONSTRAINT "event_aggregates_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_health_snapshots" ADD CONSTRAINT "site_health_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_health_snapshots" ADD CONSTRAINT "site_health_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uq" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uq" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uq" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_uq" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_site_hostname_uq" ON "domains" USING btree ("site_id","hostname");--> statement-breakpoint
CREATE INDEX "domains_org_idx" ON "domains" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "domains_hostname_idx" ON "domains" USING btree ("hostname");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_site_kind_uq" ON "environments" USING btree ("site_id","kind");--> statement-breakpoint
CREATE INDEX "environments_org_idx" ON "environments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "nonces_expires_idx" ON "nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_tracking_id_uq" ON "sites" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_org_id_uq" ON "sites" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_keys_hash_uq" ON "source_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "source_keys_org_idx" ON "source_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "source_keys_site_idx" ON "source_keys" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_policies_site_version_uq" ON "consent_policies" USING btree ("site_id","version");--> statement-breakpoint
CREATE INDEX "consent_policies_org_idx" ON "consent_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_snapshots_site_hash_uq" ON "consent_snapshots" USING btree ("site_id","hash");--> statement-breakpoint
CREATE INDEX "consent_snapshots_org_idx" ON "consent_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "config_drafts_site_env_idx" ON "config_drafts" USING btree ("site_id","environment_id");--> statement-breakpoint
CREATE INDEX "config_drafts_org_idx" ON "config_drafts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "config_publications_env_active_idx" ON "config_publications" USING btree ("environment_id","is_active");--> statement-breakpoint
CREATE INDEX "config_publications_org_idx" ON "config_publications" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "config_versions_env_version_uq" ON "config_versions" USING btree ("environment_id","version");--> statement-breakpoint
CREATE INDEX "config_versions_org_idx" ON "config_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credentials_org_idx" ON "credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credentials_integration_idx" ON "credentials" USING btree ("integration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_definitions_site_name_uq" ON "event_definitions" USING btree ("site_id","name");--> statement-breakpoint
CREATE INDEX "event_definitions_org_idx" ON "event_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_mappings_integration_event_uq" ON "event_mappings" USING btree ("integration_id","event_name");--> statement-breakpoint
CREATE INDEX "event_mappings_org_idx" ON "event_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integrations_org_idx" ON "integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integrations_site_idx" ON "integrations" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_id_uq" ON "integrations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_connections_integration_uq" ON "oauth_connections" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_org_idx" ON "oauth_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dead_letter_refs_org_idx" ON "dead_letter_references" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dead_letter_refs_queue_idx" ON "dead_letter_references" USING btree ("queue");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_event_integration_attempt_uq" ON "delivery_attempts" USING btree ("event_id","integration_id","attempt");--> statement-breakpoint
CREATE INDEX "delivery_attempts_site_started_idx" ON "delivery_attempts" USING btree ("site_id","started_at");--> statement-breakpoint
CREATE INDEX "delivery_attempts_integration_started_idx" ON "delivery_attempts" USING btree ("integration_id","started_at");--> statement-breakpoint
CREATE INDEX "delivery_attempts_org_idx" ON "delivery_attempts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_dedup_site_source_uq" ON "event_dedup" USING btree ("site_id","source_event_id");--> statement-breakpoint
CREATE INDEX "event_dedup_created_idx" ON "event_dedup" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE INDEX "queue_dead_letters_queue_idx" ON "queue_dead_letters" USING btree ("queue","replayed_at");--> statement-breakpoint
CREATE INDEX "queue_messages_poll_idx" ON "queue_messages" USING btree ("queue","available_at","locked_until");--> statement-breakpoint
CREATE INDEX "queue_messages_partition_idx" ON "queue_messages" USING btree ("queue","partition_key");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_messages_dedup_uq" ON "queue_messages" USING btree ("queue","dedup_key") WHERE dedup_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tool_runs_idempotency_uq" ON "agent_tool_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_tool_runs_session_idx" ON "agent_tool_runs" USING btree ("chat_session_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_tool_runs_org_idx" ON "agent_tool_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_token_hash_uq" ON "approvals" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "approvals_org_idx" ON "approvals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("chat_session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_org_idx" ON "chat_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_org_user_idx" ON "chat_sessions" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_site_idx" ON "chat_sessions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "inferences_subject_idx" ON "inferences" USING btree ("site_id","subject_type","subject_id","field");--> statement-breakpoint
CREATE INDEX "inferences_org_idx" ON "inferences" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_setup_states_site_uq" ON "site_setup_states" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_setup_states_org_idx" ON "site_setup_states" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_org_key_uq" ON "entitlements" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "stripe_events_type_idx" ON "stripe_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_uq" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_sub_uq" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_event_kind_uq" ON "usage_ledger" USING btree ("event_id","kind");--> statement-breakpoint
CREATE INDEX "usage_ledger_org_period_idx" ON "usage_ledger" USING btree ("organization_id","period_key","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_periods_org_period_uq" ON "usage_periods" USING btree ("organization_id","period_key");--> statement-breakpoint
CREATE INDEX "dsar_org_status_idx" ON "data_subject_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "deletion_jobs_dsar_idx" ON "deletion_jobs" USING btree ("dsar_id");--> statement-breakpoint
CREATE INDEX "deletion_jobs_org_idx" ON "deletion_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attribution_site_anon_idx" ON "attribution_touchpoints" USING btree ("site_id","anonymous_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attribution_org_idx" ON "attribution_touchpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_records_site_kind_order_uq" ON "conversion_records" USING btree ("site_id","kind","order_id") WHERE order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversion_records_org_idx" ON "conversion_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversion_records_site_time_idx" ON "conversion_records" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dq_issues_site_fingerprint_uq" ON "data_quality_issues" USING btree ("site_id","fingerprint");--> statement-breakpoint
CREATE INDEX "dq_issues_org_status_idx" ON "data_quality_issues" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "event_aggregates_bucket_uq" ON "event_aggregates" USING btree ("site_id","environment_id","bucket_start","event_name","source");--> statement-breakpoint
CREATE INDEX "event_aggregates_org_idx" ON "event_aggregates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "site_health_site_time_idx" ON "site_health_snapshots" USING btree ("site_id","computed_at");--> statement-breakpoint
CREATE INDEX "site_health_org_idx" ON "site_health_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_time_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "break_glass_org_idx" ON "break_glass_access" USING btree ("organization_id","ends_at");--> statement-breakpoint
CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status","created_at");