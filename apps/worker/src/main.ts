import { config as loadDotenv } from "dotenv";
import { createServer } from "node:http";
import { QUEUES } from "@track-site/queue";
import path from "node:path";
import { createWorkerContext } from "./context.ts";
import { workerEnv } from "./env.ts";
import { runScheduledJobs } from "./jobs/index.ts";
import { startLoops } from "./loop.ts";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const env = workerEnv();
const ctx = await createWorkerContext(env);
ctx.logger.info({ queue: ctx.queue.driver, eventStore: ctx.eventStore.driver, kms: env.KMS_DRIVER, vault: Boolean(ctx.vault) }, "worker starting");
const loops = startLoops(ctx);
const jobs = runScheduledJobs(ctx);
const startedAt = Date.now();

/** Health for orchestrators: process alive, loops running, queue reachable. Never exposed publicly. */
const healthServer = createServer(async (req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  try {
    const stats = await ctx.queue.stats(QUEUES.ingest);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), queue: { driver: ctx.queue.driver, ready: stats?.ready ?? null, dlq: stats?.deadLetters ?? null }, ts: new Date().toISOString() }));
  } catch (e) {
    res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "health failed" }));
  }
});
healthServer.listen(env.WORKER_PORT, "0.0.0.0", () => ctx.logger.info({ port: env.WORKER_PORT }, "worker health endpoint listening"));

async function shutdown(signal: string): Promise<void> {
  ctx.logger.info({ signal }, "worker shutting down");
  jobs.stop();
  healthServer.close();
  await loops.stop();
  await ctx.queue.close();
  await ctx.eventStore.close();
  await ctx.pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
