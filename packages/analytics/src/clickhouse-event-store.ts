import type { ClickHouseClient } from "@clickhouse/client";
import type { CanonicalEvent } from "@track-site/events";
import type { DeliveryMark, EventCountRow, EventFilter, EventStore, InsertResult, SubjectRef } from "./event-store.ts";

/**
 * ClickHouse adapter (production, EU). Table DDL: `sql/clickhouse.sql` (ReplacingMergeTree keyed by
 * (site_id, event_id) with monthly partitions). Dedup on (site_id, source_event_id) is still enforced
 * through the PostgreSQL `event_dedup` guard by the worker before insert, so this adapter never
 * decides idempotency on its own. Not verified locally (no ClickHouse on the build machine): covered
 * by contract tests with a fake client, must be verified in staging before use.
 */
export class ClickHouseEventStore implements EventStore {
  readonly driver = "clickhouse" as const;
  constructor(
    private readonly client: Pick<ClickHouseClient, "insert" | "query" | "command" | "close">,
    private readonly table = "events",
  ) {}

  async insert(events: CanonicalEvent[]): Promise<InsertResult> {
    if (!events.length) return { inserted: 0, duplicates: 0, duplicateEventIds: [] };
    await this.client.insert({
      table: this.table,
      values: events.map((e) => ({ ...e, deliveries: null })),
      format: "JSONEachRow",
    });
    return { inserted: events.length, duplicates: 0, duplicateEventIds: [] };
  }

  async getById(siteId: string, eventId: string): Promise<CanonicalEvent | null> {
    const rs = await this.client.query({
      query: `SELECT * FROM ${this.table} FINAL WHERE site_id = {site:String} AND event_id = {id:String} LIMIT 1`,
      query_params: { site: siteId, id: eventId },
      format: "JSONEachRow",
    });
    const rows = (await rs.json()) as CanonicalEvent[];
    return rows[0] ?? null;
  }

  async query(filter: EventFilter): Promise<CanonicalEvent[]> {
    const conds = ["site_id = {site:String}"];
    const params: Record<string, unknown> = { site: filter.siteId, limit: Math.min(500, filter.limit ?? 100) };
    const add = (clause: string, key: string, value: unknown) => {
      conds.push(clause);
      params[key] = value;
    };
    if (filter.environmentId) add("environment_id = {env:String}", "env", filter.environmentId);
    if (filter.from) add("server_ts >= {from:DateTime64(3)}", "from", filter.from.toISOString());
    if (filter.to) add("server_ts < {to:DateTime64(3)}", "to", filter.to.toISOString());
    if (filter.name) add("name = {name:String}", "name", filter.name);
    if (filter.processingState) add("processing_state = {state:String}", "state", filter.processingState);
    if (filter.anonymousId) add("anonymous_id = {anon:String}", "anon", filter.anonymousId);
    if (filter.source) add("source = {source:String}", "source", filter.source);
    if (filter.before) add("event_id < {before:String}", "before", filter.before);
    const rs = await this.client.query({
      query: `SELECT * FROM ${this.table} FINAL WHERE ${conds.join(" AND ")} ORDER BY server_ts DESC, event_id DESC LIMIT {limit:UInt32}`,
      query_params: params,
      format: "JSONEachRow",
    });
    return (await rs.json()) as CanonicalEvent[];
  }

  async counts(siteId: string, from: Date, to: Date, bucket: "hour" | "day"): Promise<EventCountRow[]> {
    const fn = bucket === "hour" ? "toStartOfHour" : "toStartOfDay";
    const rs = await this.client.query({
      query: `SELECT ${fn}(server_ts) AS bucket, name, source,
                countIf(processing_state NOT IN ('rejected','policy_blocked')) AS count,
                countIf(processing_state IN ('rejected','policy_blocked')) AS dropped
              FROM ${this.table} WHERE site_id = {site:String} AND server_ts >= {from:DateTime64(3)} AND server_ts < {to:DateTime64(3)}
              GROUP BY bucket, name, source ORDER BY bucket`,
      query_params: { site: siteId, from: from.toISOString(), to: to.toISOString() },
      format: "JSONEachRow",
    });
    const rows = (await rs.json()) as Array<{ bucket: string; name: string; source: string; count: string | number; dropped: string | number }>;
    return rows.map((r) => ({ bucket: new Date(r.bucket).toISOString(), name: r.name, source: r.source, count: Number(r.count), dropped: Number(r.dropped) }));
  }

  async markDelivery(siteId: string, eventId: string, mark: DeliveryMark): Promise<void> {
    await this.client.command({
      query: `ALTER TABLE ${this.table} UPDATE deliveries = concat(ifNull(deliveries, '{}'), {patch:String}) WHERE site_id = {site:String} AND event_id = {id:String}`,
      query_params: { site: siteId, id: eventId, patch: JSON.stringify({ [mark.integrationId]: mark }) },
    });
  }

  async updateState(siteId: string, eventId: string, state: string, dropReason: string | null): Promise<void> {
    await this.client.command({
      query: `ALTER TABLE ${this.table} UPDATE processing_state = {state:String}, drop_reason = {reason:Nullable(String)} WHERE site_id = {site:String} AND event_id = {id:String}`,
      query_params: { site: siteId, id: eventId, state, reason: dropReason },
    });
  }

  async findConversionEvent(siteId: string, orderId: string, name: "purchase" | "refund", source: "browser" | "server", since: Date): Promise<CanonicalEvent | null> {
    const cond = source === "browser" ? "source = 'browser'" : "source <> 'browser'";
    const rs = await this.client.query({
      query: `SELECT * FROM ${this.table} FINAL WHERE site_id = {site:String} AND name = {name:String} AND JSONExtractString(commerce, 'order_id') = {order:String} AND server_ts >= {since:DateTime64(3)} AND ${cond} ORDER BY server_ts DESC LIMIT 1`,
      query_params: { site: siteId, name, order: orderId, since: since.toISOString() },
      format: "JSONEachRow",
    });
    const rows = (await rs.json()) as CanonicalEvent[];
    return rows[0] ?? null;
  }

  async lastEventAt(siteId: string, source?: "browser" | "server"): Promise<Date | null> {
    const cond = source === "browser" ? "AND source = 'browser'" : source === "server" ? "AND source <> 'browser'" : "";
    const rs = await this.client.query({
      query: `SELECT max(server_ts) AS ts FROM ${this.table} WHERE site_id = {site:String} ${cond}`,
      query_params: { site: siteId },
      format: "JSONEachRow",
    });
    const rows = (await rs.json()) as Array<{ ts: string | null }>;
    return rows[0]?.ts ? new Date(rows[0].ts) : null;
  }

  async deleteSubject(siteId: string, subject: SubjectRef): Promise<number> {
    const conds: string[] = [];
    const params: Record<string, unknown> = { site: siteId };
    if (subject.anonymousId) {
      conds.push("anonymous_id = {anon:String}");
      params.anon = subject.anonymousId;
    }
    if (subject.userId) {
      conds.push("user_id = {uid:String}");
      params.uid = subject.userId;
    }
    if (subject.emailHash) {
      conds.push("JSONExtractString(user_data, 'em') = {em:String}");
      params.em = subject.emailHash;
    }
    if (!conds.length) return 0;
    await this.client.command({ query: `ALTER TABLE ${this.table} DELETE WHERE site_id = {site:String} AND (${conds.join(" OR ")})`, query_params: params });
    return -1; // ClickHouse mutations are asynchronous; the deletion job records completion separately
  }

  async deleteOlderThan(siteId: string | null, before: Date): Promise<number> {
    await this.client.command({
      query: siteId
        ? `ALTER TABLE ${this.table} DELETE WHERE site_id = {site:String} AND server_ts < {before:DateTime64(3)}`
        : `ALTER TABLE ${this.table} DELETE WHERE server_ts < {before:DateTime64(3)}`,
      query_params: { site: siteId, before: before.toISOString() },
    });
    return -1;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
