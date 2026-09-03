import type { z } from "zod";
import { baseEnvSchema, envBool, envEnum, envInt, envString, loadEnv } from "@track-site/core";

export const webEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: envString(),
  DATABASE_URL_UNPOOLED: envString(),
  AUTH_SECRET: envString(),
  MASTER_KEY: envString(),
  MASTER_KEY_ID: envString("local-v1"),
  KMS_DRIVER: envEnum(["local", "aws"], "local"),
  AWS_KMS_KEY_ID: envString(),
  AWS_REGION: envString("eu-central-1"),
  CONFIG_SIGNING_PRIVATE_KEY: envString(),
  CONFIG_SIGNING_PUBLIC_KEY: envString(),
  CONFIG_SIGNING_KEY_ID: envString("cfg-v1"),
  APPROVAL_TOKEN_SECRET: envString(),
  QUEUE_DRIVER: envEnum(["pg", "sqs", "memory"], "pg"),
  SQS_QUEUE_URL_PREFIX: envString(),
  EVENT_STORE_DRIVER: envEnum(["pg", "clickhouse"], "pg"),
  CLICKHOUSE_URL: envString(),
  CLICKHOUSE_USER: envString(),
  CLICKHOUSE_PASSWORD: envString(),
  MAIL_FROM: envString("track.site <no-reply@track.site>"),
  SMTP_URL: envString(),
  RESEND_API_KEY: envString(),
  CONTACT_INBOX_EMAIL: envString(),
  OPENAI_API_KEY: envString(),
  AI_MODEL_PRIMARY: envString("gpt-5.6-terra"),
  AI_MODEL_FAST: envString("gpt-5.6-luna"),
  AI_MODEL_COMPLEX: envString("gpt-5.6-sol"),
  AI_MAX_TOOL_CALLS_PER_TURN: envInt(8, 1, 32),
  AI_TURN_TIMEOUT_MS: envInt(45_000, 5_000, 120_000),
  AI_ENABLED: envBool(true),
  STRIPE_SECRET_KEY: envString(),
  STRIPE_PUBLISHABLE_KEY: envString(),
  STRIPE_WEBHOOK_SECRET: envString(),
  STRIPE_PRICE_STARTER_MONTHLY: envString(),
  STRIPE_PRICE_GROWTH_MONTHLY: envString(),
  STRIPE_PRICE_SCALE_MONTHLY: envString(),
  STRIPE_PRICE_STARTER_YEARLY: envString(),
  STRIPE_PRICE_GROWTH_YEARLY: envString(),
  STRIPE_PRICE_SCALE_YEARLY: envString(),
  GOOGLE_SITE_VERIFICATION: envString(),
  BING_SITE_VERIFICATION: envString(),
  VENDOR_ALLOW_PRIVATE: envBool(false),
  VENDOR_MOCK_BASE_URL: envString(),
  GOOGLE_OAUTH_CLIENT_ID: envString(),
  GOOGLE_OAUTH_CLIENT_SECRET: envString(),
  AMAZON_ADS_CLIENT_ID: envString(),
  AMAZON_ADS_CLIENT_SECRET: envString(),
  LINKEDIN_CLIENT_ID: envString(),
  LINKEDIN_CLIENT_SECRET: envString(),
  X_CONSUMER_KEY: envString(),
  X_CONSUMER_SECRET: envString(),
  GOOGLE_ADS_DEVELOPER_TOKEN: envString(),
  SEED_DEMO: envBool(false),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

export function env(): WebEnv {
  return loadEnv(webEnvSchema);
}

/** Public, non-secret values safe for client components. */
export function publicEnv() {
  const e = env();
  return {
    hostMarketing: e.HOST_MARKETING,
    hostApp: e.HOST_APP,
    hostCdn: e.HOST_CDN,
    hostIngest: e.HOST_INGEST,
    appEnv: e.APP_ENV,
    stripeEnabled: Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_PUBLISHABLE_KEY),
    aiEnabled: e.AI_ENABLED && Boolean(e.OPENAI_API_KEY),
  };
}
