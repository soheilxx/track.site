import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { createWorkerContext } from "./context.ts";
import { workerEnv } from "./env.ts";
import { ensureEventPartitions, runRetention } from "./jobs/retention.ts";
import { relayOutbox } from "./jobs/outbox.ts";

/**
 * Operations CLI:
 *   pnpm --filter @track-site/worker cli dlq:list --queue dest.meta
 *   pnpm --filter @track-site/worker cli dlq:replay --queue dest.meta --limit 100 [--ids id1,id2]
 *   pnpm --filter @track-site/worker cli retention:run | partitions:ensure | outbox:relay | queue:stats --queue ingest
 */
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
loadDotenv({ quiet: true });

const [command, ...rest] = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i += 2) if (rest[i]?.startsWith("--")) args[rest[i]!.slice(2)] = rest[i + 1] ?? "";

const ctx = await createWorkerContext(workerEnv());
try {
  switch (command) {
    case "dlq:list": {
      const items = await ctx.queue.listDeadLetters(args.queue ?? "ingest", Number(args.limit ?? 50));
      for (const d of items) console.error(`${d.id}\t${d.deadAt.toISOString()}\tattempts=${d.attempts}\torg=${d.organizationId ?? "-"}\t${d.reason}`);
      console.error(`${items.length} dead letters`);
      break;
    }
    case "dlq:replay": {
      const n = await ctx.queue.replayDeadLetters(args.queue ?? "ingest", { limit: Number(args.limit ?? 100), ids: args.ids ? args.ids.split(",") : undefined });
      await ctx.pool.query(`UPDATE dead_letter_references SET replayed_at = now() WHERE queue = $1 AND replayed_at IS NULL`, [args.queue ?? "ingest"]);
      console.error(`replayed ${n}`);
      break;
    }
    case "queue:stats":
      console.error(JSON.stringify(await ctx.queue.stats(args.queue ?? "ingest")));
      break;
    case "retention:run":
      console.error(JSON.stringify(await runRetention(ctx)));
      break;
    case "partitions:ensure":
      await ensureEventPartitions(ctx);
      console.error("partitions ok");
      break;
    case "outbox:relay":
      console.error(`relayed ${await relayOutbox(ctx)}`);
      break;
    default:
      console.error("unknown command");
      process.exitCode = 1;
  }
} finally {
  await ctx.queue.close();
  await ctx.eventStore.close();
  await ctx.pool.end();
}
