import type { Pool, PoolClient } from "pg";
import type { CanonicalEvent } from "@track-site/events";
import type { DeliveryMark, EventCountRow, EventFilter, EventStore, InsertResult, SubjectRef } from "./event-store.ts";

const COLUMNS = [
  "event_id",
  "source_event_id",
  "organization_id",
  "site_id",
  "site_tracking_id",
  "environment_id",
  "name",
  "is_standard",
  "category",
  "client_ts",
  "server_ts",
  "anonymous_id",
  "session_id",
  "user_id",
  "url",
  "host",
  "path",
  "referrer",
  "title",
  "utm",
  "click_ids",
  "vendor_ids",
  "consent",
  "consent_snapshot_id",
  "props",
  "commerce",
  "user_data",
  "ip_truncated",
  "ua_family",
  "locale",
  "source",
  "source_verified",
  "sdk_version",
  "config_version",
  "schema_version",
  "provenance",
  "processing_state",
  "drop_reason",
  "is_billable",
  "is_bot",
] as const;

const JSON_COLUMNS = new Set(["utm", "click_ids", "vendor_ids", "consent", "props", "commerce", "user_data", "provenance"]);

function rowValues(e: CanonicalEvent): unknown[] {
  return COLUMNS.map((c) => {
    const v = (e as unknown as Record<string, unknown>)[c];
    if (JSON_COLUMNS.has(c)) return v === null || v === undefined ? null : JSON.stringify(v);
    return v ?? null;
  });
}

function rowToEvent(r: Record<string, unknown>): CanonicalEvent {
  const e: Record<string, unknown> = { ...r };
  for (const k of ["client_ts", "server_ts"]) {
    const d = r[k];
    e[k] = d instanceof Date ? d.toISOString() : d;
  }
  delete e.deliveries;
  return e as unknown as CanonicalEvent;
}

/**
 * Reference event store on partitioned PostgreSQL. Runs as the data-plane role (RLS bypass)
 * because the worker only ever operates with server-resolved site context.
 */
export class PgEventStore implements EventStore {
  readonly driver = "pg" as const;
  constructor(private readonly pool: Pool) {}

  async insert(events: CanonicalEvent[]): Promise<InsertResult> {
    if (events.length === 0) return { inserted: 0, duplicates: 0, duplicateEventIds: [] };
    return this.tx(async (c) => {
      // global idempotency guard (independent of partitions)
      const dedupValues: unknown[] = [];
      const dedupRows = events.map((e, i) => {
        dedupValues.push(e.site_id, e.source_event_id, e.event_id);
        return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`;
      });
      const accepted = await c.query<{ event_id: string }>(
        `INSERT INTO event_dedup (site_id, source_event_id, event_id) VALUES ${dedupRows.join(",")}
         ON CONFLICT (site_id, source_event_id) DO NOTHING RETURNING event_id`,
        dedupValues,
      );
      const acceptedIds = new Set(accepted.rows.map((r) => r.event_id));
      const fresh = events.filter((e) => acceptedIds.has(e.event_id));
      const duplicateEventIds = events.filter((e) => !acceptedIds.has(e.event_id)).map((e) => e.event_id);
      if (fresh.length) {
        const values: unknown[] = [];
        const rows = fresh.map((e, i) => {
          const base = i * COLUMNS.length;
          values.push(...rowValues(e));
          return `(${COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`;
        });
        await c.query(`INSERT INTO events (${COLUMNS.join(",")}) VALUES ${rows.join(",")}`, values);
      }
      return { inserted: fresh.length, duplicates: duplicateEventIds.length, duplicateEventIds };
    });
  }

  async getById(siteId: string, eventId: string): Promise<CanonicalEvent | null> {
    const res = await this.worker((c) => c.query(`SELECT * FROM events WHERE site_id = $1 AND event_id = $2 LIMIT 1`, [siteId, eventId]));
    const row = res.rows[0];
    return row ? rowToEvent(row) : null;
  }

  async query(filter: EventFilter): Promise<CanonicalEvent[]> {
    const params: unknown[] = [filter.siteId];
    const where = ["site_id = $1"];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };
    if (filter.environmentId) add("environment_id = ?", filter.environmentId);
    if (filter.from) add("server_ts >= ?", filter.from);
    if (filter.to) add("server_ts < ?", filter.to);
    if (filter.name) add("name = ?", filter.name);
    if (filter.processingState) add("processing_state = ?", filter.processingState);
    if (filter.anonymousId) add("anonymous_id = ?", filter.anonymousId);
    if (filter.source) add("source = ?", filter.source);
    if (filter.before) add("event_id < ?", filter.before);
    params.push(Math.min(500, filter.limit ?? 100));
    const res = await this.worker((c) =>
      c.query(`SELECT * FROM events WHERE ${where.join(" AND ")} ORDER BY server_ts DESC, event_id DESC LIMIT $${params.length}`, params),
    );
    return res.rows.map(rowToEvent);
  }

  async counts(siteId: string, from: Date, to: Date, bucket: "hour" | "day"): Promise<EventCountRow[]> {
    const res = await this.worker((c) =>
      c.query<{ bucket: Date; name: string; source: string; count: string; dropped: string }>(
        `SELECT date_trunc($4, server_ts) AS bucket, name, source,
                count(*) FILTER (WHERE processing_state NOT IN ('rejected','policy_blocked'))::text AS count,
                count(*) FILTER (WHERE processing_state IN ('rejected','policy_blocked'))::text AS dropped
         FROM events WHERE site_id = $1 AND server_ts >= $2 AND server_ts < $3
         GROUP BY 1, 2, 3 ORDER BY 1`,
        [siteId, from, to, bucket],
      ),
    );
    return res.rows.map((r) => ({ bucket: r.bucket.toISOString(), name: r.name, source: r.source, count: Number(r.count), dropped: Number(r.dropped) }));
  }

  async markDelivery(siteId: string, eventId: string, mark: DeliveryMark): Promise<void> {
    await this.worker((c) =>
      c.query(
        `UPDATE events SET deliveries = coalesce(deliveries, '{}'::jsonb) || jsonb_build_object($3::text, $4::jsonb),
                processing_state = CASE WHEN $5 = 'delivered' THEN 'delivered' ELSE processing_state END
         WHERE site_id = $1 AND event_id = $2`,
        [siteId, eventId, mark.integrationId, JSON.stringify({ status: mark.status, at: mark.at, attempts: mark.attempts }), mark.status],
      ),
    );
  }

  async updateState(siteId: string, eventId: string, state: string, dropReason: string | null): Promise<void> {
    await this.worker((c) => c.query(`UPDATE events SET processing_state = $3, drop_reason = $4 WHERE site_id = $1 AND event_id = $2`, [siteId, eventId, state, dropReason]));
  }

  async lastEventAt(siteId: string, source?: "browser" | "server"): Promise<Date | null> {
    const params: unknown[] = [siteId];
    let clause = "";
    if (source === "browser") clause = "AND source = 'browser'";
    if (source === "server") clause = "AND source <> 'browser'";
    const res = await this.worker((c) => c.query<{ ts: Date | null }>(`SELECT max(server_ts) AS ts FROM events WHERE site_id = $1 ${clause}`, params));
    return res.rows[0]?.ts ?? null;
  }

  async deleteSubject(siteId: string, subject: SubjectRef): Promise<number> {
    const clauses: string[] = [];
    const params: unknown[] = [siteId];
    if (subject.anonymousId) {
      params.push(subject.anonymousId);
      clauses.push(`anonymous_id = $${params.length}`);
    }
    if (subject.userId) {
      params.push(subject.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (subject.emailHash) {
      params.push(subject.emailHash);
      clauses.push(`user_data->>'em' = $${params.length}`);
    }
    if (!clauses.length) return 0;
    const res = await this.worker((c) => c.query(`DELETE FROM events WHERE site_id = $1 AND (${clauses.join(" OR ")})`, params));
    return res.rowCount ?? 0;
  }

  async deleteOlderThan(siteId: string | null, before: Date): Promise<number> {
    const res = siteId
      ? await this.worker((c) => c.query(`DELETE FROM events WHERE site_id = $1 AND server_ts < $2`, [siteId, before]))
      : await this.worker((c) => c.query(`DELETE FROM events WHERE server_ts < $1`, [before]));
    return res.rowCount ?? 0;
  }

  async close(): Promise<void> {
    // pool owned by caller
  }

  private async worker<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return this.tx(fn);
  }

  private async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE tracksite_worker");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }
}
