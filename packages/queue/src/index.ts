import type { Pool } from "pg";
import { MemoryQueue } from "./memory-queue.ts";
import { PgQueue } from "./pg-queue.ts";
import { SqsQueue } from "./sqs-queue.ts";
import type { Queue } from "./queue.ts";

export * from "./queue.ts";
export { MemoryQueue } from "./memory-queue.ts";
export { PgQueue } from "./pg-queue.ts";
export { SqsQueue } from "./sqs-queue.ts";

export interface QueueFactoryOptions {
  driver: "memory" | "pg" | "sqs";
  pool?: Pool;
  sqsQueueUrlPrefix?: string;
  awsRegion?: string;
}

export function createQueue(options: QueueFactoryOptions): Queue {
  switch (options.driver) {
    case "memory":
      return new MemoryQueue();
    case "pg":
      if (!options.pool) throw new Error("QUEUE_DRIVER=pg requires a pg Pool");
      return new PgQueue(options.pool);
    case "sqs":
      if (!options.sqsQueueUrlPrefix) throw new Error("QUEUE_DRIVER=sqs requires SQS_QUEUE_URL_PREFIX");
      return new SqsQueue({
        queueUrlPrefix: options.sqsQueueUrlPrefix,
        clientConfig: options.awsRegion ? { region: options.awsRegion } : {},
      });
  }
}
