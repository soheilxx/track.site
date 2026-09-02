import type { Pool } from "pg";
import { ClickHouseEventStore } from "./clickhouse-event-store.ts";
import type { EventStore } from "./event-store.ts";
import { PgEventStore } from "./pg-event-store.ts";

export * from "./event-store.ts";
export { PgEventStore } from "./pg-event-store.ts";
export { ClickHouseEventStore } from "./clickhouse-event-store.ts";
export * from "./health.ts";

export interface EventStoreFactoryOptions {
  driver: "pg" | "clickhouse";
  pool?: Pool;
  clickhouse?: { url: string; username?: string; password?: string; database?: string };
}

export async function createEventStore(options: EventStoreFactoryOptions): Promise<EventStore> {
  if (options.driver === "pg") {
    if (!options.pool) throw new Error("EVENT_STORE_DRIVER=pg requires a pg Pool");
    return new PgEventStore(options.pool);
  }
  if (!options.clickhouse?.url) throw new Error("EVENT_STORE_DRIVER=clickhouse requires CLICKHOUSE_URL");
  const { createClient } = await import("@clickhouse/client");
  const client = createClient({
    url: options.clickhouse.url,
    username: options.clickhouse.username ?? "default",
    password: options.clickhouse.password ?? "",
    database: options.clickhouse.database ?? "default",
    clickhouse_settings: { async_insert: 1, wait_for_async_insert: 1 },
  });
  return new ClickHouseEventStore(client);
}
