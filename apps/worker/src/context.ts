import type { Pool } from "pg";
import { AwsKmsKeyProvider, LocalKeyProvider, SecretVault, createLogger, type AppLogger, type KeyProvider } from "@track-site/core";
import { createPool } from "@track-site/db/client";
import { createEventStore, type EventStore } from "@track-site/analytics";
import { createQueue, type Queue } from "@track-site/queue";
import { ConfigCache } from "./config-cache.ts";
import type { WorkerEnv } from "./env.ts";

export interface WorkerContext {
  env: WorkerEnv;
  pool: Pool;
  queue: Queue;
  eventStore: EventStore;
  vault: SecretVault | null;
  configs: ConfigCache;
  logger: AppLogger;
  now: () => Date;
  fetch: typeof fetch;
}

export function buildVault(env: Pick<WorkerEnv, "KMS_DRIVER" | "MASTER_KEY" | "MASTER_KEY_ID" | "LEGACY_MASTER_KEY" | "LEGACY_MASTER_KEY_ID" | "AWS_KMS_KEY_ID" | "AWS_REGION">): SecretVault | null {
  let primary: KeyProvider | null = null;
  if (env.KMS_DRIVER === "aws" && env.AWS_KMS_KEY_ID) primary = new AwsKmsKeyProvider(env.AWS_KMS_KEY_ID, env.AWS_REGION ?? "eu-central-1", "aws-kms-v1");
  else if (env.MASTER_KEY) primary = new LocalKeyProvider(env.MASTER_KEY, env.MASTER_KEY_ID ?? "local-v1");
  if (!primary) return null;
  const legacy: KeyProvider[] = [];
  if (env.LEGACY_MASTER_KEY) legacy.push(new LocalKeyProvider(env.LEGACY_MASTER_KEY, env.LEGACY_MASTER_KEY_ID ?? "local-v0"));
  return new SecretVault(primary, legacy);
}

export async function createWorkerContext(env: WorkerEnv): Promise<WorkerContext> {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = createPool(env.DATABASE_URL, { max: env.WORKER_CONCURRENCY + 4 });
  const queue = createQueue({ driver: env.QUEUE_DRIVER, pool, sqsQueueUrlPrefix: env.SQS_QUEUE_URL_PREFIX ?? undefined, awsRegion: env.AWS_REGION ?? undefined });
  const eventStore = await createEventStore({
    driver: env.EVENT_STORE_DRIVER,
    pool,
    clickhouse: env.CLICKHOUSE_URL ? { url: env.CLICKHOUSE_URL, username: env.CLICKHOUSE_USER ?? undefined, password: env.CLICKHOUSE_PASSWORD ?? undefined } : undefined,
  });
  return {
    env,
    pool,
    queue,
    eventStore,
    vault: buildVault(env),
    configs: new ConfigCache(pool, env.CONFIG_CACHE_TTL_MS),
    logger: createLogger("worker"),
    now: () => new Date(),
    fetch,
  };
}
