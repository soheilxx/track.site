import type { z } from "zod";
import { baseEnvSchema, envBool, envEnum, envInt, envString, loadEnv } from "@track-site/core";

export const workerEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: envString(),
  QUEUE_DRIVER: envEnum(["pg", "sqs", "memory"], "pg"),
  SQS_QUEUE_URL_PREFIX: envString(),
  AWS_REGION: envString("eu-central-1"),
  EVENT_STORE_DRIVER: envEnum(["pg", "clickhouse"], "pg"),
  CLICKHOUSE_URL: envString(),
  CLICKHOUSE_USER: envString(),
  CLICKHOUSE_PASSWORD: envString(),
  MASTER_KEY: envString(),
  MASTER_KEY_ID: envString("local-v1"),
  LEGACY_MASTER_KEY: envString(),
  LEGACY_MASTER_KEY_ID: envString(),
  KMS_DRIVER: envEnum(["local", "aws"], "local"),
  AWS_KMS_KEY_ID: envString(),
  WORKER_CONCURRENCY: envInt(4, 1, 64),
  /** local health endpoint for orchestrators (no business traffic) */
  WORKER_PORT: envInt(3199, 1, 65535),
  WORKER_POLL_MS: envInt(500, 50, 10_000),
  WORKER_BATCH_SIZE: envInt(10, 1, 50),
  MAX_DELIVERY_ATTEMPTS: envInt(8, 1, 20),
  VENDOR_ALLOW_PRIVATE: envBool(false),
  VENDOR_MOCK_BASE_URL: envString(),
  GOOGLE_ADS_DEVELOPER_TOKEN: envString(),
  GOOGLE_OAUTH_CLIENT_ID: envString(),
  GOOGLE_OAUTH_CLIENT_SECRET: envString(),
  X_CONSUMER_KEY: envString(),
  X_CONSUMER_SECRET: envString(),
  AMAZON_ADS_CLIENT_ID: envString(),
  AMAZON_ADS_CLIENT_SECRET: envString(),
  LINKEDIN_CLIENT_ID: envString(),
  LINKEDIN_CLIENT_SECRET: envString(),
  CONFIG_CACHE_TTL_MS: envInt(15_000, 1_000, 300_000),
  /**
   * Signing key of the `scheduled-publish` job (same variables as the web app). Without it a due draft
   * is refused with `schedule_error = signing_key_missing` and shown as such in the release center.
   */
  CONFIG_SIGNING_PRIVATE_KEY: envString(),
  CONFIG_SIGNING_KEY_ID: envString(),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function workerEnv(): WorkerEnv {
  return loadEnv(workerEnvSchema);
}
