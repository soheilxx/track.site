import type { Pool, PoolClient } from "pg";
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
 * PostgreSQL-backed durable queue (reference implementation).
 * Tables are created by the @track-site/db migrations:
 *   queue_messages(id, queue, partition_key, body, attempts, available_at, locked_until, lock_token,
 *                  dedup_key, organization_id, enqueued_at, last_error)
 *   queue_dead_letters(id, queue, partition_key, body, attempts, reason, organization_id, dead_at, replayed_at)
 * Receive uses `FOR UPDATE SKIP LOCKED` so many workers can poll concurrently. A message is
 * durably committed before `enqueue` resolves; a crash before `ack` makes it visible again after
 * the visibility timeout.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Organization id carried by a message body (only when it is a real uuid; otherwise null). */
function organizationIdOf(body: unknown): string | null {
  const id = body && typeof body === "object" ? (body as { organization_id?: unknown }).organization_id : undefined;
  return typeof id === "string" && UUID_RE.test(id) ? id : null;
}

export class PgQueue implements Queue {
  readonly driver = "pg" as const;
  constructor(private readonly pool: Pool) {}

  async enqueue<T>(queue: string, messages: EnqueueInput<T>[]): Promise<{ ids: string[]; skipped: number }> {
    if (messages.length === 0) return { ids: [], skipped: 0 };
    const ids: string[] = [];
    const values: unknown[] = [];
    const rows: string[] = [];
    let i = 1;
    for (const m of messages) {
      const id = m.id ?? newUlid();
      ids.push(id);
      rows.push(`($${i++}, $${i++}, $${i++}, $${i++}::jsonb, now() + ($${i++}::int * interval '1 millisecond'), $${i++}, $${i++})`);
      values.push(id, queue, m.partitionKey, JSON.stringify(m.body), m.delayMs ?? 0, m.dedupKey ?? null, organizationIdOf(m.body));
    }
    const res = await this.pool.query(
      `INSERT INTO queue_messages (id, queue, partition_key, body, available_at, dedup_key, organization_id)
       VALUES ${rows.join(",")}
       ON CONFLICT (queue, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
       RETURNING id`,
      values,
    );
    const inserted = new Set(res.rows.map((r: { id: string }) => r.id));
    return { ids: ids.filter((id) => inserted.has(id)), skipped: ids.length - inserted.size };
  }

  async receive<T>(queue: string, options: ReceiveOptions = {}): Promise<QueueMessage<T>[]> {
    const max = options.max ?? 10;
    const vis = options.visibilityMs ?? DEFAULT_VISIBILITY_MS;
    const token = newUlid();
    const params: unknown[] = [queue, max, vis, token];
    let partitionFilter = "";
    if (options.partitionKey) {
      params.push(options.partitionKey);
      partitionFilter = `AND partition_key = $${params.length}`;
    }
    const res = await this.pool.query(
      `WITH picked AS (
         SELECT id FROM queue_messages
         WHERE queue = $1 AND available_at <= now() AND (locked_until IS NULL OR locked_until <= now()) ${partitionFilter}
         ORDER BY available_at, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE queue_messages q
       SET attempts = q.attempts + 1,
           locked_until = now() + ($3::int * interval '1 millisecond'),
           lock_token = $4
       FROM picked WHERE q.id = picked.id
       RETURNING q.id, q.body, q.partition_key, q.attempts, q.enqueued_at`,
      params,
    );
    return res.rows.map((r: { id: string; body: T; partition_key: string; attempts: number; enqueued_at: Date }) => ({
      id: r.id,
      queue,
      body: r.body,
      partitionKey: r.partition_key,
      attempts: r.attempts,
      enqueuedAt: r.enqueued_at,
      receipt: token,
    }));
  }

  async ack(message: QueueMessage): Promise<void> {
    await this.pool.query(`DELETE FROM queue_messages WHERE id = $1 AND lock_token = $2`, [message.id, message.receipt]);
  }

  async nack(message: QueueMessage, options: { delayMs: number; error?: string }): Promise<void> {
    await this.pool.query(
      `UPDATE queue_messages
       SET locked_until = NULL, lock_token = NULL,
           available_at = now() + ($3::int * interval '1 millisecond'),
           last_error = $4
       WHERE id = $1 AND lock_token = $2`,
      [message.id, message.receipt, options.delayMs, options.error?.slice(0, 500) ?? null],
    );
  }

  async deadLetter(message: QueueMessage, reason: string): Promise<void> {
    await this.withTx(async (c) => {
      const moved = await c.query(
        `DELETE FROM queue_messages WHERE id = $1 AND lock_token = $2
         RETURNING id, queue, partition_key, body, attempts, organization_id`,
        [message.id, message.receipt],
      );
      const row = moved.rows[0];
      if (!row) return;
      await c.query(
        `INSERT INTO queue_dead_letters (id, queue, partition_key, body, attempts, reason, organization_id)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
        [row.id, row.queue, row.partition_key, JSON.stringify(row.body), row.attempts, reason.slice(0, 500), row.organization_id],
      );
    });
  }

  async listDeadLetters<T>(queue: string, limit = 100): Promise<DeadLetter<T>[]> {
    const res = await this.pool.query(
      `SELECT id, queue, partition_key, body, attempts, reason, organization_id, dead_at
       FROM queue_dead_letters WHERE queue = $1 AND replayed_at IS NULL ORDER BY dead_at LIMIT $2`,
      [queue, limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      queue: r.queue,
      body: r.body as T,
      partitionKey: r.partition_key,
      attempts: r.attempts,
      reason: r.reason,
      organizationId: r.organization_id,
      deadAt: r.dead_at,
    }));
  }

  async replayDeadLetters(queue: string, options: { limit?: number; ids?: string[] } = {}): Promise<number> {
    return this.withTx(async (c) => {
      const params: unknown[] = [queue, options.limit ?? 100];
      let idFilter = "";
      if (options.ids?.length) {
        params.push(options.ids);
        idFilter = `AND id = ANY($${params.length}::text[])`;
      }
      const res = await c.query(
        `UPDATE queue_dead_letters SET replayed_at = now()
         WHERE id IN (SELECT id FROM queue_dead_letters WHERE queue = $1 AND replayed_at IS NULL ${idFilter} ORDER BY dead_at LIMIT $2)
         RETURNING id, partition_key, body, organization_id`,
        params,
      );
      for (const r of res.rows) {
        await c.query(
          `INSERT INTO queue_messages (id, queue, partition_key, body, organization_id, attempts)
           VALUES ($1, $2, $3, $4::jsonb, $5, 0) ON CONFLICT (id) DO NOTHING`,
          [r.id, queue, r.partition_key, JSON.stringify(r.body), r.organization_id],
        );
      }
      return res.rowCount ?? 0;
    });
  }

  async stats(queue: string): Promise<QueueStats> {
    const res = await this.pool.query(
      `SELECT
         count(*) FILTER (WHERE available_at <= now() AND (locked_until IS NULL OR locked_until <= now()))::int AS ready,
         count(*) FILTER (WHERE locked_until > now())::int AS in_flight,
         count(*) FILTER (WHERE available_at > now())::int AS delayed,
         (SELECT count(*)::int FROM queue_dead_letters d WHERE d.queue = $1 AND d.replayed_at IS NULL) AS dead,
         extract(epoch FROM (now() - min(enqueued_at) FILTER (WHERE available_at <= now() AND (locked_until IS NULL OR locked_until <= now())))) * 1000 AS oldest_ms
       FROM queue_messages WHERE queue = $1`,
      [queue],
    );
    const r = res.rows[0];
    return {
      queue,
      ready: r.ready,
      inFlight: r.in_flight,
      delayed: r.delayed,
      deadLetters: r.dead,
      oldestReadyAgeMs: r.oldest_ms === null ? null : Math.round(Number(r.oldest_ms)),
    };
  }

  async close(): Promise<void> {
    // pool is owned by the caller
  }

  private async withTx<R>(fn: (c: PoolClient) => Promise<R>): Promise<R> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
