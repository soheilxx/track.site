import type { z } from "zod";
import { baseEnvSchema, envBool, envEnum, envInt, envString, loadEnv } from "@track-site/core";

export const collectorEnvSchema = baseEnvSchema.extend({
  COLLECTOR_PORT: envInt(3100, 1, 65535),
  COLLECTOR_MAX_BODY_BYTES: envInt(65_536, 1_024, 1_048_576),
  COLLECTOR_MAX_EVENTS_PER_BATCH: envInt(50, 1, 50),
  DATABASE_URL: envString(),
  QUEUE_DRIVER: envEnum(["pg", "sqs", "memory"], "pg"),
  SQS_QUEUE_URL_PREFIX: envString(),
  AWS_REGION: envString("eu-central-1"),
  RATE_LIMIT_IP_PER_MIN: envInt(600, 10, 100_000),
  RATE_LIMIT_SITE_PER_MIN: envInt(20_000, 10, 10_000_000),
  RATE_LIMIT_SALT: envString("local-salt"),
  ALLOW_LOCALHOST_ORIGINS: envBool(true),
  SITE_CACHE_TTL_MS: envInt(30_000, 1_000, 600_000),
});
export type CollectorEnv = z.infer<typeof collectorEnvSchema>;

export function collectorEnv(): CollectorEnv {
  return loadEnv(collectorEnvSchema);
}
