-- verified shop order sources (Shopify, WooCommerce, Shopware 6): one connection per site and platform
CREATE TYPE "public"."shop_platform" AS ENUM('shopify', 'woocommerce', 'shopware');
--> statement-breakpoint
CREATE TYPE "public"."shop_connection_status" AS ENUM('pending', 'connected', 'paused');
--> statement-breakpoint
CREATE TABLE "shop_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"platform" "shop_platform" NOT NULL,
	"shop_domain" text NOT NULL,
	"status" "shop_connection_status" DEFAULT 'pending' NOT NULL,
	"path_token" text NOT NULL,
	"credential_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_event_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shop_connections" ADD CONSTRAINT "shop_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shop_connections" ADD CONSTRAINT "shop_connections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shop_connections" ADD CONSTRAINT "shop_connections_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "shop_connections_site_platform_uq" ON "shop_connections" USING btree ("site_id","platform");
--> statement-breakpoint
CREATE UNIQUE INDEX "shop_connections_path_token_uq" ON "shop_connections" USING btree ("path_token");
--> statement-breakpoint
CREATE INDEX "shop_connections_org_idx" ON "shop_connections" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "shop_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS shop_connections_tenant_isolation ON "shop_connections";
--> statement-breakpoint
CREATE POLICY shop_connections_tenant_isolation ON "shop_connections" TO tracksite_app USING (organization_id = app_organization_id()) WITH CHECK (organization_id = app_organization_id());
