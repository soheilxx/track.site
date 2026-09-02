import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageBatchCommand,
  type SQSClientConfig,
} from "@aws-sdk/client-sqs";
import { newUlid } from "@track-site/core";
import {
  DEFAULT_VISIBILITY_MS,
  type DeadLetter,
  type EnqueueInput,
  type Queue,
  type QueueMessage,
  type QueueStats,
  type ReceiveOptions,
} from "./queue.ts";

/**
 * AWS SQS adapter (FIFO queues, MessageGroupId = partition key, content-based dedup off,
 * explicit MessageDeduplicationId = dedupKey or message id). Dead letters use the redrive policy
 * configured in infra (`<queue>-dlq.fifo`); replay moves messages back.
 * Verified locally only through the contract tests with a fake client; production use requires a
 * staging verification (see IMPLEMENTATION_STATUS.md).
 */
export interface SqsQueueOptions {
  queueUrlPrefix: string;
  client?: SQSClient;
  clientConfig?: SQSClientConfig;
}

export class SqsQueue implements Queue {
  readonly driver = "sqs" as const;
  private readonly client: SQSClient;
  constructor(private readonly options: SqsQueueOptions) {
    this.client = options.client ?? new SQSClient(options.clientConfig ?? {});
  }

  private url(queue: string, dlq = false): string {
    return `${this.options.queueUrlPrefix}${queue.replace(/\./g, "-")}${dlq ? "-dlq" : ""}.fifo`;
  }

  async enqueue<T>(queue: string, messages: EnqueueInput<T>[]): Promise<{ ids: string[]; skipped: number }> {
    const ids: string[] = [];
    for (let i = 0; i < messages.length; i += 10) {
      const chunk = messages.slice(i, i + 10);
      const entries = chunk.map((m) => {
        const id = m.id ?? newUlid();
        ids.push(id);
        return {
          Id: id,
          MessageBody: JSON.stringify({ id, body: m.body, partitionKey: m.partitionKey, attempts: 0 }),
          MessageGroupId: m.partitionKey.replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 128),
          MessageDeduplicationId: (m.dedupKey ?? id).replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 128),
          ...(m.delayMs ? { DelaySeconds: Math.min(900, Math.ceil(m.delayMs / 1000)) } : {}),
        };
      });
      const res = await this.client.send(new SendMessageBatchCommand({ QueueUrl: this.url(queue), Entries: entries }));
      if (res.Failed?.length) throw new Error(`SQS enqueue failed for ${res.Failed.length} messages: ${res.Failed[0]?.Message}`);
    }
    return { ids, skipped: 0 };
  }

  async receive<T>(queue: string, options: ReceiveOptions = {}): Promise<QueueMessage<T>[]> {
    const res = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.url(queue),
        MaxNumberOfMessages: Math.min(10, options.max ?? 10),
        VisibilityTimeout: Math.ceil((options.visibilityMs ?? DEFAULT_VISIBILITY_MS) / 1000),
        WaitTimeSeconds: 5,
        MessageSystemAttributeNames: ["ApproximateReceiveCount", "SentTimestamp"],
      }),
    );
    return (res.Messages ?? []).map((m) => {
      const parsed = JSON.parse(m.Body ?? "{}") as { id: string; body: T; partitionKey: string };
      return {
        id: parsed.id,
        queue,
        body: parsed.body,
        partitionKey: parsed.partitionKey,
        attempts: Number(m.Attributes?.ApproximateReceiveCount ?? 1),
        enqueuedAt: new Date(Number(m.Attributes?.SentTimestamp ?? Date.now())),
        receipt: m.ReceiptHandle ?? "",
      };
    });
  }

  async ack(message: QueueMessage): Promise<void> {
    await this.client.send(new DeleteMessageCommand({ QueueUrl: this.url(message.queue), ReceiptHandle: message.receipt }));
  }

  async nack(message: QueueMessage, options: { delayMs: number }): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.url(message.queue),
        ReceiptHandle: message.receipt,
        VisibilityTimeout: Math.min(43_200, Math.ceil(options.delayMs / 1000)),
      }),
    );
  }

  async deadLetter(message: QueueMessage, reason: string): Promise<void> {
    await this.client.send(
      new SendMessageBatchCommand({
        QueueUrl: this.url(message.queue, true),
        Entries: [
          {
            Id: message.id,
            MessageBody: JSON.stringify({ id: message.id, body: message.body, partitionKey: message.partitionKey, attempts: message.attempts, reason }),
            MessageGroupId: message.partitionKey.replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 128),
            MessageDeduplicationId: `${message.id}-dead`,
          },
        ],
      }),
    );
    await this.ack(message);
  }

  async listDeadLetters<T>(queue: string, limit = 10): Promise<DeadLetter<T>[]> {
    const res = await this.client.send(
      new ReceiveMessageCommand({ QueueUrl: this.url(queue, true), MaxNumberOfMessages: Math.min(10, limit), VisibilityTimeout: 1, WaitTimeSeconds: 0 }),
    );
    return (res.Messages ?? []).map((m) => {
      const p = JSON.parse(m.Body ?? "{}") as { id: string; body: T; partitionKey: string; attempts: number; reason: string };
      const body = p.body as { organization_id?: string } | undefined;
      return { id: p.id, queue, body: p.body, partitionKey: p.partitionKey, attempts: p.attempts, reason: p.reason, organizationId: body?.organization_id ?? null, deadAt: new Date() };
    });
  }

  async replayDeadLetters(queue: string, options: { limit?: number } = {}): Promise<number> {
    let replayed = 0;
    const limit = options.limit ?? 100;
    while (replayed < limit) {
      const res = await this.client.send(
        new ReceiveMessageCommand({ QueueUrl: this.url(queue, true), MaxNumberOfMessages: 10, VisibilityTimeout: 30, WaitTimeSeconds: 0 }),
      );
      const msgs = res.Messages ?? [];
      if (msgs.length === 0) break;
      for (const m of msgs) {
        const p = JSON.parse(m.Body ?? "{}") as { id: string; body: unknown; partitionKey: string };
        await this.enqueue(queue, [{ id: p.id, body: p.body, partitionKey: p.partitionKey, dedupKey: `${p.id}-replay-${Date.now()}` }]);
        await this.client.send(new DeleteMessageCommand({ QueueUrl: this.url(queue, true), ReceiptHandle: m.ReceiptHandle }));
        replayed++;
      }
    }
    return replayed;
  }

  async stats(queue: string): Promise<QueueStats> {
    const attrs = ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "ApproximateNumberOfMessagesDelayed"] as const;
    const main = await this.client.send(new GetQueueAttributesCommand({ QueueUrl: this.url(queue), AttributeNames: [...attrs] }));
    const dlq = await this.client.send(new GetQueueAttributesCommand({ QueueUrl: this.url(queue, true), AttributeNames: ["ApproximateNumberOfMessages"] }));
    const n = (v: string | undefined) => Number(v ?? 0);
    return {
      queue,
      ready: n(main.Attributes?.ApproximateNumberOfMessages),
      inFlight: n(main.Attributes?.ApproximateNumberOfMessagesNotVisible),
      delayed: n(main.Attributes?.ApproximateNumberOfMessagesDelayed),
      deadLetters: n(dlq.Attributes?.ApproximateNumberOfMessages),
      oldestReadyAgeMs: null,
    };
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
