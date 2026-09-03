import { Hono } from "hono";
import type { Pool } from "pg";
import {
  MemoryRateLimiter,
  hostOf,
  isLocalhost,
  hostMatches,
  newUlid,
  normalizeTrackingId,
  rateLimitHeaders,
  rotatingHash,
  type AppLogger,
  type RateLimiter,
} from "@track-site/core";
import type { SecretVault } from "@track-site/core";
import { incomingBrowserBatchSchema, incomingServerBatchSchema, truncateIp, uaFamily, type IngestMessage } from "@track-site/events";
import { QUEUES, partitionKeyFor, type Queue } from "@track-site/queue";
import { configRoutes } from "./config-routes.ts";
import type { CollectorEnv } from "./env.ts";
import type { ResolvedSite, SiteResolver } from "./site-cache.ts";
import { registerAffiliateInbound } from "./affiliate-inbound.ts";

export interface CollectorDeps {
  env: CollectorEnv;
  queue: Queue;
  sites: SiteResolver;
  pool: Pool | null;
  /** decrypts inbound-postback secrets (Digistore24 IPN passphrase, shared tokens) */
  vault?: SecretVault | null;
  logger: AppLogger;
  rateLimiter?: RateLimiter;
  now?: () => Date;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-tracksite-signature",
  "access-control-max-age": "86400",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? null;
}

function originHost(headers: Headers): string | null {
  const origin = headers.get("origin");
  if (origin) return hostOf(origin);
  const referer = headers.get("referer");
  return referer ? hostOf(referer) : null;
}

function originAllowed(site: ResolvedSite, host: string | null, allowLocalhost: boolean): boolean {
  if (!host) return site.allowedHosts.length === 0;
  if (allowLocalhost && isLocalhost(host)) return true;
  if (site.allowedHosts.length === 0) return true; // no domains yet: onboarding phase, still consent-gated downstream
  return site.allowedHosts.some((h) => hostMatches(host, h) || hostMatches(host, `*.${h.replace(/^www\./, "")}`));
}

export function createCollectorApp(deps: CollectorDeps): Hono {
  const app = new Hono();
  const limiter = deps.rateLimiter ?? new MemoryRateLimiter();
  const now = deps.now ?? (() => new Date());
  const { env } = deps;

  app.use("*", async (c, next) => {
    c.header("x-request-id", newUlid());
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
    if (c.req.method === "OPTIONS") {
      for (const [k, v] of Object.entries(CORS_HEADERS)) c.header(k, v);
      return c.body(null, 204);
    }
    await next();
  });

  app.get("/health", async (c) => {
    let db: "ok" | "error" | "none" = "none";
    if (deps.pool) {
      try {
        await deps.pool.query("SELECT 1");
        db = "ok";
      } catch {
        db = "error";
      }
    }
    const stats = await deps.queue.stats(QUEUES.ingest).catch(() => null);
    const ok = db !== "error" && stats !== null && !env.KILL_SWITCH_GLOBAL;
    return c.json({ ok, db, queue: { driver: deps.queue.driver, ready: stats?.ready ?? null, dlq: stats?.deadLetters ?? null }, killSwitch: env.KILL_SWITCH_GLOBAL, ts: now().toISOString() }, ok ? 200 : 503);
  });

  app.route("/v1/c", configRoutes(deps));

  /** Browser batches from tracker.js (sendBeacon sends text/plain). */
  app.post("/v1/e", async (c) => {
    for (const [k, v] of Object.entries(CORS_HEADERS)) c.header(k, v);
    if (env.KILL_SWITCH_GLOBAL) {
      c.header("retry-after", "300");
      return c.json({ ok: false, reason: "kill_switch" }, 503);
    }
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > env.COLLECTOR_MAX_BODY_BYTES) return c.json({ ok: false, reason: "payload_too_large" }, 413);
    const raw = await c.req.text();
    if (raw.length > env.COLLECTOR_MAX_BODY_BYTES) return c.json({ ok: false, reason: "payload_too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return c.json({ ok: false, reason: "invalid_json" }, 400);
    }
    const parsed = incomingBrowserBatchSchema.safeParse(json);
    if (!parsed.success) return c.json({ ok: false, reason: "invalid_batch", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
    const batch = parsed.data;
    if (batch.events.length > env.COLLECTOR_MAX_EVENTS_PER_BATCH) return c.json({ ok: false, reason: "too_many_events" }, 413);

    const ip = clientIp(c.req.raw.headers);
    const ipKey = ip ? rotatingHash(ip, env.RATE_LIMIT_SALT ?? "local-salt", now()) : "unknown";
    const ipLimit = await limiter.hit(`ip:${ipKey}`, env.RATE_LIMIT_IP_PER_MIN, 60_000, batch.events.length);
    if (!ipLimit.allowed) {
      for (const [k, v] of Object.entries(rateLimitHeaders(ipLimit, now().getTime()))) c.header(k, v);
      return c.json({ ok: false, reason: "rate_limited" }, 429);
    }

    const trackingId = normalizeTrackingId(batch.site_id);
    const site = trackingId ? await deps.sites.byTrackingId(trackingId) : null;
    if (!site || site.status === "deleted") return c.json({ ok: false, reason: "unknown_site" }, 404);
    if (site.killSwitch || site.orgKillSwitch || site.status === "paused") return c.json({ ok: false, reason: "site_paused" }, 200);
    const host = originHost(c.req.raw.headers);
    if (!originAllowed(site, host, env.ALLOW_LOCALHOST_ORIGINS)) {
      deps.logger.warn({ site: site.trackingId, host }, "origin not allowed");
      return c.json({ ok: false, reason: "origin_not_allowed" }, 403);
    }
    const siteLimit = await limiter.hit(`site:${site.siteId}`, env.RATE_LIMIT_SITE_PER_MIN, 60_000, batch.events.length);
    if (!siteLimit.allowed) {
      for (const [k, v] of Object.entries(rateLimitHeaders(siteLimit, now().getTime()))) c.header(k, v);
      return c.json({ ok: false, reason: "rate_limited" }, 429);
    }

    const environment = site.environments.find((e) => e.isDefault) ?? site.environments[0];
    if (!environment) return c.json({ ok: false, reason: "site_not_ready" }, 409);
    const ua = c.req.header("user-agent") ?? null;
    const family = uaFamily(ua);
    const message: IngestMessage = {
      kind: "browser_batch",
      message_id: newUlid(),
      received_at: now().toISOString(),
      site: {
        organization_id: site.organizationId,
        site_id: site.siteId,
        tracking_id: site.trackingId,
        environment_id: environment.id,
        partition_key: partitionKeyFor(site.organizationId, site.siteId, site.partitionOverride),
      },
      ip_truncated: truncateIp(ip),
      ua_family: family,
      is_bot_hint: family === "bot" || !ua,
      origin_host: host,
      events: batch.events,
    };
    try {
      await deps.queue.enqueue(QUEUES.ingest, [{ id: message.message_id, body: message, partitionKey: message.site.partition_key }]);
    } catch (e) {
      deps.logger.error({ err: e instanceof Error ? e.message : String(e) }, "enqueue failed");
      c.header("retry-after", "5");
      return c.json({ ok: false, reason: "queue_unavailable" }, 503);
    }
    return c.json({ ok: true, accepted: batch.events.length, id: message.message_id }, 202);
  });

  /** Server events authenticated with a source key (Bearer tsk_...). */
  app.post("/v1/s", async (c) => {
    if (env.KILL_SWITCH_GLOBAL) {
      c.header("retry-after", "300");
      return c.json({ ok: false, reason: "kill_switch" }, 503);
    }
    const auth = c.req.header("authorization") ?? "";
    const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!secret) return c.json({ ok: false, reason: "unauthorized" }, 401);
    const key = await deps.sites.bySourceKey(secret);
    if (!key || !key.scopes.includes("events:write")) return c.json({ ok: false, reason: "unauthorized" }, 401);
    const raw = await c.req.text();
    if (raw.length > env.COLLECTOR_MAX_BODY_BYTES * 4) return c.json({ ok: false, reason: "payload_too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return c.json({ ok: false, reason: "invalid_json" }, 400);
    }
    const parsed = incomingServerBatchSchema.safeParse(json);
    if (!parsed.success) return c.json({ ok: false, reason: "invalid_batch", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
    const siteLimit = await limiter.hit(`site:${key.siteId}`, env.RATE_LIMIT_SITE_PER_MIN, 60_000, parsed.data.events.length);
    if (!siteLimit.allowed) return c.json({ ok: false, reason: "rate_limited" }, 429);
    const site = await deps.sites.byTrackingId((await trackingIdOf(deps, key.siteId)) ?? "");
    if (!site || site.status !== "active" || site.killSwitch || site.orgKillSwitch) return c.json({ ok: false, reason: "site_paused" }, 200);
    const ip = clientIp(c.req.raw.headers);
    const message: IngestMessage = {
      kind: "server_batch",
      message_id: newUlid(),
      received_at: now().toISOString(),
      site: {
        organization_id: key.organizationId,
        site_id: key.siteId,
        tracking_id: site.trackingId,
        environment_id: key.environmentId,
        partition_key: partitionKeyFor(key.organizationId, key.siteId, site.partitionOverride),
      },
      source_key_id: key.sourceKeyId,
      ip_truncated: truncateIp(ip),
      ua_family: uaFamily(c.req.header("user-agent")),
      events: parsed.data.events,
    };
    try {
      await deps.queue.enqueue(QUEUES.ingest, [{ id: message.message_id, body: message, partitionKey: message.site.partition_key }]);
    } catch (e) {
      deps.logger.error({ err: e instanceof Error ? e.message : String(e) }, "enqueue failed");
      c.header("retry-after", "5");
      return c.json({ ok: false, reason: "queue_unavailable" }, 503);
    }
    return c.json({ ok: true, accepted: parsed.data.events.length, id: message.message_id }, 202);
  });

  registerAffiliateInbound(app, deps, now);

  app.notFound((c) => c.json({ ok: false, reason: "not_found" }, 404));
  app.onError((err, c) => {
    deps.logger.error({ err: err.message }, "unhandled");
    return c.json({ ok: false, reason: "internal_error" }, 500);
  });
  return app;
}

const trackingIdBySite = new Map<string, string>();
async function trackingIdOf(deps: CollectorDeps, siteId: string): Promise<string | null> {
  const cached = trackingIdBySite.get(siteId);
  if (cached) return cached;
  if (!deps.pool) return null;
  const res = await deps.pool.query<{ tracking_id: string }>(`SELECT tracking_id FROM sites WHERE id = $1`, [siteId]);
  const id = res.rows[0]?.tracking_id ?? null;
  if (id) trackingIdBySite.set(siteId, id);
  return id;
}
