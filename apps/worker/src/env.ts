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
  WORKER_POLL_MS: envInt(500, 50, 10_000),
  WORKER_BATCH_SIZE: envInt(10, 1, 50),
  MAX_DELIVERY_ATTEMPTS: envInt(8, 1, 20),
  VENDOR_ALLOW_PRIVATE: envBool(false),
  VENDOR_MOCK_BASE_URL: envString(),
  CONFIG_CACHE_TTL_MS: envInt(15_000, 1_000, 300_000),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function workerEnv(): WorkerEnv {
  return loadEnv(workerEnvSchema);
}
