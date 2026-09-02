import { describe, expect, it } from "vitest";
import { newUlid } from "@track-site/core";
import type { CanonicalEvent } from "@track-site/events";
import { ClickHouseEventStore } from "./clickhouse-event-store.ts";
import { computeHealthScore } from "./health.ts";

describe("health score", () => {
  it("rewards full coverage and penalizes missing conversions and credential problems", () => {
    const good = computeHealthScore({
      consentCoverage: 0.98,
      criticalEventsSeen: 3,
      criticalEventsPlanned: 3,
      schemaQuality: 1,
      duplicateRate: 0.01,
      deliverySuccess: 0.99,
      unhealthyIntegrations: 0,
      totalIntegrations: 2,
      minutesSinceLastBrowserEvent: 5,
    });
    expect(good.score).toBeGreaterThanOrEqual(95);
    const bad = computeHealthScore({
      consentCoverage: 0.2,
      criticalEventsSeen: 0,
      criticalEventsPlanned: 3,
      schemaQuality: 0.5,
      duplicateRate: 0.3,
      deliverySuccess: 0.4,
      unhealthyIntegrations: 2,
      totalIntegrations: 2,
      minutesSinceLastBrowserEvent: null,
    });
    expect(bad.score).toBeLessThan(30);
    expect(bad.components.delivery?.detail).toContain("credential");
  });
});

describe("ClickHouseEventStore (fake client contract)", () => {
  it("maps operations to parameterised queries", async () => {
    const calls: Array<{ kind: string; query?: string; params?: Record<string, unknown> }> = [];
    const fake = {
      insert: async (args: { table: string; values: unknown[] }) => {
        calls.push({ kind: `insert:${args.table}:${args.values.length}` });
      },
      query: async (args: { query: string; query_params?: Record<string, unknown> }) => {
        calls.push({ kind: "query", query: args.query, params: args.query_params });
        return { json: async () => [{ ts: "2026-09-02T10:00:00.000Z" }] };
      },
      command: async (args: { query: string; query_params?: Record<string, unknown> }) => {
        calls.push({ kind: "command", query: args.query, params: args.query_params });
        return {};
      },
      close: async () => undefined,
    };
    const store = new ClickHouseEventStore(fake as never);
    const e = { event_id: newUlid(), site_id: "s", source_event_id: "x" } as unknown as CanonicalEvent;
    expect(await store.insert([e])).toMatchObject({ inserted: 1 });
    expect(calls[0]?.kind).toBe("insert:events:1");
    await store.query({ siteId: "s", name: "purchase", limit: 10 });
    expect(calls[1]?.query).toContain("name = {name:String}");
    expect(calls[1]?.params).toMatchObject({ site: "s", name: "purchase", limit: 10 });
    expect(await store.lastEventAt("s", "browser")).toEqual(new Date("2026-09-02T10:00:00.000Z"));
    await store.updateState("s", "e1", "rejected", "pii_blocked");
    expect(calls.at(-1)?.query).toContain("ALTER TABLE events UPDATE processing_state");
    expect(await store.deleteSubject("s", {})).toBe(0);
  });
});
