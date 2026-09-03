import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { AwsKmsKeyProvider, LocalKeyProvider, SecretVault, createLogger, type KeyProvider } from "@track-site/core";
import { createPool } from "@track-site/db/client";
import { createQueue } from "@track-site/queue";
import { createCollectorApp } from "./app.ts";
import { collectorEnv } from "./env.ts";
import { PgSiteResolver } from "./site-cache.ts";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const env = collectorEnv();
const logger = createLogger("collector");
if (!env.DATABASE_URL) {
  logger.error("DATABASE_URL is required");
  process.exit(1);
}
const pool = createPool(env.DATABASE_URL, { max: 20 });
const queue = createQueue({
  driver: env.QUEUE_DRIVER,
  pool,
  sqsQueueUrlPrefix: env.SQS_QUEUE_URL_PREFIX ?? undefined,
  awsRegion: env.AWS_REGION ?? undefined,
});
let primary: KeyProvider | null = null;
if (env.KMS_DRIVER === "aws" && env.AWS_KMS_KEY_ID) primary = new AwsKmsKeyProvider(env.AWS_KMS_KEY_ID, env.AWS_REGION ?? "eu-central-1", "aws-kms-v1");
else if (env.MASTER_KEY) primary = new LocalKeyProvider(env.MASTER_KEY, env.MASTER_KEY_ID ?? "local-v1");
const vault = primary ? new SecretVault(primary, env.LEGACY_MASTER_KEY ? [new LocalKeyProvider(env.LEGACY_MASTER_KEY, env.LEGACY_MASTER_KEY_ID ?? "local-v0")] : []) : null;
const app = createCollectorApp({ env, queue, sites: new PgSiteResolver(pool, env.SITE_CACHE_TTL_MS), pool, logger, vault });

const server = serve({ fetch: app.fetch, port: env.COLLECTOR_PORT, hostname: "0.0.0.0" }, (info) => {
  logger.info({ port: info.port, queue: queue.driver }, "collector listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.close();
  await queue.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
