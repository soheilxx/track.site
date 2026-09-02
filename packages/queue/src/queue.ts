/**
 * Durable queue abstraction. Every implementation must guarantee that `enqueue` only resolves
 * after the messages are durably stored (the collector answers 202 only afterwards).
 */
export interface QueueMessage<T = unknown> {
  id: string;
  queue: string;
  body: T;
  partitionKey: string;
  attempts: number;
  enqueuedAt: Date;
  /** opaque receipt used for ack/nack */
  receipt: string;
}

export interface EnqueueInput<T = unknown> {
  id?: string;
  body: T;
  partitionKey: string;
  /** deliver not before this delay */
  delayMs?: number;
  /** idempotency: an existing message with the same dedup key is not inserted again */
  dedupKey?: string;
}

export interface ReceiveOptions {
  max?: number;
  visibilityMs?: number;
  /** restrict to a partition (hot-tenant isolation) */
  partitionKey?: string;
}

export interface QueueStats {
  queue: string;
  ready: number;
  inFlight: number;
  delayed: number;
  deadLetters: number;
  oldestReadyAgeMs: number | null;
}

export interface DeadLetter<T = unknown> {
  id: string;
  queue: string;
  body: T;
  partitionKey: string;
  attempts: number;
  reason: string;
  organizationId: string | null;
  deadAt: Date;
}

export interface Queue {
  readonly driver: "memory" | "pg" | "sqs";
  enqueue<T>(queue: string, messages: EnqueueInput<T>[]): Promise<{ ids: string[]; skipped: number }>;
  receive<T>(queue: string, options?: ReceiveOptions): Promise<QueueMessage<T>[]>;
  ack(message: QueueMessage): Promise<void>;
  /** return the message to the queue; `delayMs` schedules the retry (backoff). */
  nack(message: QueueMessage, options: { delayMs: number; error?: string }): Promise<void>;
  /** permanently fail the message into the dead-letter store. */
  deadLetter(message: QueueMessage, reason: string): Promise<void>;
  listDeadLetters<T>(queue: string, limit?: number): Promise<DeadLetter<T>[]>;
  replayDeadLetters(queue: string, options?: { limit?: number; ids?: string[] }): Promise<number>;
  stats(queue: string): Promise<QueueStats>;
  close(): Promise<void>;
}

export const QUEUES = {
  ingest: "ingest",
  outbox: "outbox",
  destination: (connectorType: string) => `dest.${connectorType}`,
  jobs: "jobs",
} as const;

export const DEFAULT_VISIBILITY_MS = 60_000;
export const MAX_ATTEMPTS_DEFAULT = 8;

/** Stable partition key from organization + site so a hot tenant can be isolated. */
export function partitionKeyFor(organizationId: string, siteId: string, override?: string | null): string {
  return override ?? `${organizationId}:${siteId}`;
}
