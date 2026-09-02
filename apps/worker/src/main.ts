import { config as loadDotenv } from "dotenv";
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

async function shutdown(signal: string): Promise<void> {
  ctx.logger.info({ signal }, "worker shutting down");
  jobs.stop();
  await loops.stop();
  await ctx.queue.close();
  await ctx.eventStore.close();
  await ctx.pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
