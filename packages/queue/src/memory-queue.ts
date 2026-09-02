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

interface Stored {
  id: string;
  queue: string;
  body: unknown;
  partitionKey: string;
  attempts: number;
  enqueuedAt: Date;
  availableAt: number;
  lockedUntil: number;
  lockToken: string | null;
  dedupKey: string | null;
  lastError: string | null;
}

/** In-memory queue for unit tests and single-process demos. Not durable. */
export class MemoryQueue implements Queue {
  readonly driver = "memory" as const;
  private readonly messages = new Map<string, Stored[]>();
  private readonly dead = new Map<string, DeadLetter[]>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private list(queue: string): Stored[] {
    let l = this.messages.get(queue);
    if (!l) {
      l = [];
      this.messages.set(queue, l);
    }
    return l;
  }

  async enqueue<T>(queue: string, messages: EnqueueInput<T>[]): Promise<{ ids: string[]; skipped: number }> {
    const list = this.list(queue);
    const ids: string[] = [];
    let skipped = 0;
    for (const m of messages) {
      if (m.dedupKey && list.some((s) => s.dedupKey === m.dedupKey)) {
        skipped++;
        continue;
      }
      const id = m.id ?? newUlid();
      list.push({
        id,
        queue,
        body: m.body,
        partitionKey: m.partitionKey,
        attempts: 0,
        enqueuedAt: new Date(this.now()),
        availableAt: this.now() + (m.delayMs ?? 0),
        lockedUntil: 0,
        lockToken: null,
        dedupKey: m.dedupKey ?? null,
        lastError: null,
      });
      ids.push(id);
    }
    return { ids, skipped };
  }

  async receive<T>(queue: string, options: ReceiveOptions = {}): Promise<QueueMessage<T>[]> {
    const t = this.now();
    const max = options.max ?? 10;
    const vis = options.visibilityMs ?? DEFAULT_VISIBILITY_MS;
    const out: QueueMessage<T>[] = [];
    for (const s of this.list(queue)) {
      if (out.length >= max) break;
      if (s.availableAt > t || s.lockedUntil > t) continue;
      if (options.partitionKey && s.partitionKey !== options.partitionKey) continue;
      s.attempts += 1;
      s.lockedUntil = t + vis;
      s.lockToken = newUlid();
      out.push({
        id: s.id,
        queue,
        body: s.body as T,
        partitionKey: s.partitionKey,
        attempts: s.attempts,
        enqueuedAt: s.enqueuedAt,
        receipt: s.lockToken,
      });
    }
    return out;
  }

  private find(message: QueueMessage): { list: Stored[]; index: number; stored: Stored } | null {
    const list = this.list(message.queue);
    const index = list.findIndex((s) => s.id === message.id && s.lockToken === message.receipt);
    if (index === -1) return null;
    return { list, index, stored: list[index]! };
  }

  async ack(message: QueueMessage): Promise<void> {
    const f = this.find(message);
    if (f) f.list.splice(f.index, 1);
  }

  async nack(message: QueueMessage, options: { delayMs: number; error?: string }): Promise<void> {
    const f = this.find(message);
    if (!f) return;
    f.stored.lockedUntil = 0;
    f.stored.lockToken = null;
    f.stored.availableAt = this.now() + options.delayMs;
    f.stored.lastError = options.error ?? null;
  }

  async deadLetter(message: QueueMessage, reason: string): Promise<void> {
    const f = this.find(message);
    if (!f) return;
    f.list.splice(f.index, 1);
    const body = f.stored.body as { organization_id?: string } | undefined;
    const dl = this.dead.get(message.queue) ?? [];
    dl.push({
      id: f.stored.id,
      queue: message.queue,
      body: f.stored.body,
      partitionKey: f.stored.partitionKey,
      attempts: f.stored.attempts,
      reason,
      organizationId: body?.organization_id ?? null,
      deadAt: new Date(this.now()),
    });
    this.dead.set(message.queue, dl);
  }

  async listDeadLetters<T>(queue: string, limit = 100): Promise<DeadLetter<T>[]> {
    return (this.dead.get(queue) ?? []).slice(0, limit) as DeadLetter<T>[];
  }

  async replayDeadLetters(queue: string, options: { limit?: number; ids?: string[] } = {}): Promise<number> {
    const dl = this.dead.get(queue) ?? [];
    const selected = dl.filter((d) => !options.ids || options.ids.includes(d.id)).slice(0, options.limit ?? 100);
    for (const d of selected) {
      await this.enqueue(queue, [{ id: d.id, body: d.body, partitionKey: d.partitionKey }]);
    }
    this.dead.set(
      queue,
      dl.filter((d) => !selected.includes(d)),
    );
    return selected.length;
  }

  async stats(queue: string): Promise<QueueStats> {
    const t = this.now();
    const list = this.list(queue);
    let ready = 0;
    let inFlight = 0;
    let delayed = 0;
    let oldest: number | null = null;
    for (const s of list) {
      if (s.lockedUntil > t) inFlight++;
      else if (s.availableAt > t) delayed++;
      else {
        ready++;
        const age = t - s.enqueuedAt.getTime();
        oldest = oldest === null ? age : Math.max(oldest, age);
      }
    }
    return { queue, ready, inFlight, delayed, deadLetters: (this.dead.get(queue) ?? []).length, oldestReadyAgeMs: oldest };
  }

  async close(): Promise<void> {
    this.messages.clear();
    this.dead.clear();
  }
}
