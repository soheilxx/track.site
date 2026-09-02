import autocannon from "autocannon";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newUlid } from "@track-site/core";

/**
 * Load test for the collector (`pnpm load:collector`). Sends valid consented page_view batches for a
 * seeded site and reports throughput + latency percentiles. Results are written to
 * packages/testing/load-results/<timestamp>.json and summarised in docs/performance-baseline.md.
 *
 * Env: LOAD_INGEST_URL (default http://127.0.0.1:3100), LOAD_SITE_ID (default A7K2Q9),
 *      LOAD_CONNECTIONS (default 50), LOAD_DURATION_S (default 30), LOAD_BATCH (events per request, default 5)
 */
const url = `${process.env.LOAD_INGEST_URL ?? "http://127.0.0.1:3100"}/v1/e`;
const siteId = process.env.LOAD_SITE_ID ?? "A7K2Q9";
const connections = Number(process.env.LOAD_CONNECTIONS ?? 50);
const duration = Number(process.env.LOAD_DURATION_S ?? 30);
const batch = Number(process.env.LOAD_BATCH ?? 5);

function body(): string {
  const now = Date.now();
  return JSON.stringify({
    site_id: siteId,
    sent_at: now,
    events: Array.from({ length: batch }, (_, i) => ({
      id: newUlid(now + i),
      name: i === 0 ? "page_view" : "view_item",
      ts: now,
      page: { url: `https://shop.example.com/p/${i}?utm_source=load` },
      ids: { anonymous_id: newUlid(), session_id: newUlid() },
      consent: { granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: now, region: "DE", gpc: false },
      sdk: { name: "browser", version: "1.0.0", config_version: 1, schema_version: "1.0.0" },
      commerce: i === 0 ? undefined : { items: [{ item_id: `sku-${i}`, quantity: 1, price: 9.99 }], currency: "EUR", value: 9.99 },
    })),
  });
}

const result = await autocannon({
  url,
  connections,
  duration,
  method: "POST",
  headers: { "content-type": "text/plain", origin: "https://shop.example.com", "user-agent": "Mozilla/5.0 (load-test) Chrome/128" },
  setupClient: (client) => {
    client.setBody(body());
    client.on("response", () => client.setBody(body()));
  },
});

const non202 = Object.entries(result.statusCodeStats ?? {})
  .filter(([code]) => code !== "202")
  .reduce((acc, [, v]) => acc + (v as { count: number }).count, 0);
const summary = {
  url,
  siteId,
  connections,
  durationSeconds: duration,
  eventsPerRequest: batch,
  requestsPerSecond: result.requests.average,
  eventsPerSecond: result.requests.average * batch,
  latencyMs: { p50: result.latency.p50, p95: result.latency.p97_5 ?? result.latency.p99, p99: result.latency.p99, max: result.latency.max },
  statusCodes: result.statusCodeStats,
  errors: result.errors,
  timeouts: result.timeouts,
  non202,
  finishedAt: new Date().toISOString(),
};
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../load-results");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${summary.finishedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(summary, null, 2));
console.error(JSON.stringify(summary, null, 2));
console.error(`written ${file}`);
if (non202 > 0 || result.errors > 0) process.exitCode = 1;
