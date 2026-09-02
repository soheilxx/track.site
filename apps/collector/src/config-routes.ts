import { Hono } from "hono";
import { normalizeTrackingId } from "@track-site/core";
import { browserView, buildManifest, type ConfigBundle, type SignedConfigBundle } from "@track-site/config";
import type { CollectorDeps } from "./app.ts";

/**
 * Config delivery: `GET /v1/c/:trackingId` returns the small manifest (30 s TTL) and
 * `GET /v1/c/:trackingId/:version.json` the immutable signed bundle (browser view).
 * In production the CDN host fronts these routes; locally the collector serves them directly.
 */
interface ActiveVersionRow {
  version: number;
  bundle: ConfigBundle;
  digest: string;
  signature: string;
  key_id: string;
  published_at: Date;
  kill_switch: boolean;
  org_kill_switch: boolean | null;
}

export function configRoutes(deps: Pick<CollectorDeps, "pool" | "env" | "now">): Hono {
  const app = new Hono();
  const now = deps.now ?? (() => new Date());
  const cache = new Map<string, { row: ActiveVersionRow | null; at: number }>();

  async function activeVersion(trackingId: string): Promise<ActiveVersionRow | null> {
    const cached = cache.get(trackingId);
    if (cached && now().getTime() - cached.at < 15_000) return cached.row;
    if (!deps.pool) return null;
    const res = await deps.pool.query<ActiveVersionRow>(
      `SELECT cv.version, cv.bundle, cv.digest, cv.signature, cv.key_id, cp.published_at, s.kill_switch, os.kill_switch AS org_kill_switch
       FROM sites s
       JOIN environments e ON e.site_id = s.id AND e.is_default
       JOIN config_publications cp ON cp.environment_id = e.id AND cp.is_active
       JOIN config_versions cv ON cv.id = cp.version_id
       LEFT JOIN organization_settings os ON os.organization_id = s.organization_id
       WHERE s.tracking_id = $1 AND s.status <> 'deleted' LIMIT 1`,
      [trackingId],
    );
    const row = res.rows[0] ?? null;
    cache.set(trackingId, { row, at: now().getTime() });
    return row;
  }

  async function version(trackingId: string, v: number): Promise<ActiveVersionRow | null> {
    if (!deps.pool) return null;
    const res = await deps.pool.query<ActiveVersionRow>(
      `SELECT cv.version, cv.bundle, cv.digest, cv.signature, cv.key_id, cv.created_at AS published_at, s.kill_switch, NULL::boolean AS org_kill_switch
       FROM sites s JOIN environments e ON e.site_id = s.id AND e.is_default
       JOIN config_versions cv ON cv.environment_id = e.id AND cv.version = $2
       WHERE s.tracking_id = $1 LIMIT 1`,
      [trackingId, v],
    );
    return res.rows[0] ?? null;
  }

  app.get("/:trackingId", async (c) => {
    const trackingId = normalizeTrackingId(c.req.param("trackingId"));
    c.header("access-control-allow-origin", "*");
    if (!trackingId) return c.json({ ok: false, reason: "invalid_tracking_id" }, 400);
    const row = await activeVersion(trackingId);
    c.header("cache-control", "public, max-age=30, s-maxage=30");
    if (!row) return c.json({ ok: false, reason: "no_published_config" }, 404);
    const signed: SignedConfigBundle = { payload: row.bundle, digest: row.digest, keyId: row.key_id, algorithm: "ed25519", signature: row.signature };
    const bundleUrl = `${deps.env.HOST_CDN.replace(/\/cdn$/, "")}/cdn/v1/c/${trackingId}/${row.version}.json`.replace("/cdn/v1/c", "/v1/c");
    const manifest = buildManifest(signed, bundleUrl, row.kill_switch || Boolean(row.org_kill_switch) || deps.env.KILL_SWITCH_GLOBAL, row.published_at.toISOString());
    return c.json(manifest);
  });

  app.get("/:trackingId/:version", async (c) => {
    const trackingId = normalizeTrackingId(c.req.param("trackingId"));
    const v = Number(c.req.param("version").replace(/\.json$/, ""));
    c.header("access-control-allow-origin", "*");
    if (!trackingId || !Number.isInteger(v)) return c.json({ ok: false, reason: "invalid_request" }, 400);
    const row = await version(trackingId, v);
    if (!row) return c.json({ ok: false, reason: "not_found" }, 404);
    c.header("cache-control", "public, max-age=31536000, immutable");
    const signed: SignedConfigBundle = { payload: row.bundle, digest: row.digest, keyId: row.key_id, algorithm: "ed25519", signature: row.signature };
    // The browser view strips server-only destinations; the signature covers the full payload, so the
    // SDK verifies the full signed bundle and applies the view locally.
    return c.json({ signed, browser: browserView(row.bundle) });
  });

  return app;
}
