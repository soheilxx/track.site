import { ingestMessageSchema, deliveryMessageSchema, type DeliveryMessage, type IngestMessage } from "@track-site/events";
import { QUEUES, type QueueMessage } from "@track-site/queue";
import { availableConnectorTypes } from "@track-site/connectors";
import type { WorkerContext } from "./context.ts";
import { processDeliveryMessage } from "./stages/deliver.ts";
import { processIngestMessage } from "./stages/ingest.ts";

/**
 * Polling loops with bounded concurrency. Each queue family runs independently so a slow vendor
 * never blocks ingestion or other destinations.
 */
export interface LoopHandle {
  stop(): Promise<void>;
}

export function startLoops(ctx: WorkerContext): LoopHandle {
  const stopped = { value: false };
  const runners: Promise<void>[] = [];
  runners.push(runQueue(ctx, QUEUES.ingest, stopped, handleIngest));
  for (const type of availableConnectorTypes()) runners.push(runQueue(ctx, QUEUES.destination(type), stopped, handleDelivery));
  return {
    async stop() {
      stopped.value = true;
      await Promise.allSettled(runners);
    },
  };
}

type Handler = (ctx: WorkerContext, message: QueueMessage) => Promise<void>;

async function runQueue(ctx: WorkerContext, queue: string, stopped: { value: boolean }, handler: Handler): Promise<void> {
  const log = ctx.logger.child({ queue });
  while (!stopped.value) {
    let messages: QueueMessage[];
    try {
      messages = await ctx.queue.receive(queue, { max: ctx.env.WORKER_BATCH_SIZE, visibilityMs: 120_000 });
    } catch (e) {
      log.error({ err: e instanceof Error ? e.message : String(e) }, "receive failed");
      await sleep(Math.min(10_000, ctx.env.WORKER_POLL_MS * 4));
      continue;
    }
    if (messages.length === 0) {
      await sleep(ctx.env.WORKER_POLL_MS);
      continue;
    }
    const chunks: QueueMessage[][] = [];
    for (let i = 0; i < messages.length; i += ctx.env.WORKER_CONCURRENCY) chunks.push(messages.slice(i, i + ctx.env.WORKER_CONCURRENCY));
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (m) => {
          try {
            await handler(ctx, m);
          } catch (e) {
            log.error({ err: e instanceof Error ? e.message : String(e), id: m.id, attempts: m.attempts }, "handler failed");
            if (m.attempts >= ctx.env.MAX_DELIVERY_ATTEMPTS) await ctx.queue.deadLetter(m, `handler_error after ${m.attempts} attempts`);
            else await ctx.queue.nack(m, { delayMs: Math.min(5 * 60_000, 1_000 * 2 ** m.attempts), error: e instanceof Error ? e.message : String(e) });
          }
        }),
      );
    }
  }
}

export async function handleIngest(ctx: WorkerContext, message: QueueMessage): Promise<void> {
  const parsed = ingestMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    ctx.logger.warn({ id: message.id }, "invalid ingest message");
    await ctx.queue.deadLetter(message, "invalid_message");
    return;
  }
  const stats = await processIngestMessage(ctx, parsed.data as IngestMessage);
  ctx.logger.debug({ id: message.id, ...stats }, "ingested");
  await ctx.queue.ack(message);
}

export async function handleDelivery(ctx: WorkerContext, message: QueueMessage): Promise<void> {
  const parsed = deliveryMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    await ctx.queue.deadLetter(message, "invalid_message");
    return;
  }
  await processDeliveryMessage(ctx, message as QueueMessage<DeliveryMessage>);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
