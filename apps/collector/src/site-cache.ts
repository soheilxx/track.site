import type { Pool } from "pg";
import { normalizeTrackingId, sha256Hex } from "@track-site/core";

/**
 * Read-mostly site resolution for the hot path. Cached per tracking id for a short TTL so a
 * publish, kill switch or domain change becomes effective within seconds.
 */
export interface ResolvedSite {
  organizationId: string;
  siteId: string;
  trackingId: string;
  environments: Array<{ id: string; kind: string; isDefault: boolean }>;
  status: "active" | "paused" | "deleted";
  killSwitch: boolean;
  orgKillSwitch: boolean;
  partitionOverride: string | null;
  allowedHosts: string[];
  activeConfigVersion: number | null;
  fetchedAt: number;
}

export interface ResolvedSourceKey {
  sourceKeyId: string;
  siteId: string;
  environmentId: string;
  organizationId: string;
  scopes: string[];
}

export interface SiteResolver {
  byTrackingId(trackingId: string): Promise<ResolvedSite | null>;
  bySourceKey(secret: string): Promise<ResolvedSourceKey | null>;
  invalidate(trackingId: string): void;
}

export class PgSiteResolver implements SiteResolver {
  private readonly cache = new Map<string, ResolvedSite | null>();
  private readonly keyCache = new Map<string, { value: ResolvedSourceKey | null; at: number }>();
  constructor(
    private readonly pool: Pool,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async byTrackingId(input: string): Promise<ResolvedSite | null> {
    const trackingId = normalizeTrackingId(input);
    if (!trackingId) return null;
    const cached = this.cache.get(trackingId);
    if (cached !== undefined && cached !== null && this.now() - cached.fetchedAt < this.ttlMs) return cached;
    if (cached === null) return null;
    const res = await this.pool.query<{
      organization_id: string;
      site_id: string;
      status: ResolvedSite["status"];
      kill_switch: boolean;
      org_kill_switch: boolean | null;
      partition_override: string | null;
      environments: Array<{ id: string; kind: string; isDefault: boolean }>;
      hosts: string[] | null;
      active_version: number | null;
    }>(
      `SELECT s.organization_id, s.id AS site_id, s.status, s.kill_switch, os.kill_switch AS org_kill_switch, s.partition_override,
              (SELECT coalesce(json_agg(json_build_object('id', e.id, 'kind', e.kind, 'isDefault', e.is_default)), '[]'::json)
                 FROM environments e WHERE e.site_id = s.id) AS environments,
              (SELECT array_agg(d.hostname) FROM domains d WHERE d.site_id = s.id) AS hosts,
              (SELECT cv.version FROM config_publications cp JOIN config_versions cv ON cv.id = cp.version_id
                 JOIN environments e2 ON e2.id = cp.environment_id
                 WHERE cp.site_id = s.id AND cp.is_active AND e2.is_default LIMIT 1) AS active_version
       FROM sites s LEFT JOIN organization_settings os ON os.organization_id = s.organization_id
       WHERE s.tracking_id = $1 LIMIT 1`,
      [trackingId],
    );
    const row = res.rows[0];
    if (!row) {
      this.cache.set(trackingId, null);
      setTimeout(() => this.cache.delete(trackingId), this.ttlMs).unref();
      return null;
    }
    const value: ResolvedSite = {
      organizationId: row.organization_id,
      siteId: row.site_id,
      trackingId,
      environments: row.environments,
      status: row.status,
      killSwitch: row.kill_switch,
      orgKillSwitch: row.org_kill_switch ?? false,
      partitionOverride: row.partition_override,
      allowedHosts: row.hosts ?? [],
      activeConfigVersion: row.active_version,
      fetchedAt: this.now(),
    };
    this.cache.set(trackingId, value);
    return value;
  }

  async bySourceKey(secret: string): Promise<ResolvedSourceKey | null> {
    if (!secret.startsWith("tsk_")) return null;
    const hash = sha256Hex(secret);
    const cached = this.keyCache.get(hash);
    if (cached && this.now() - cached.at < this.ttlMs) return cached.value;
    const res = await this.pool.query<{ id: string; site_id: string; environment_id: string; organization_id: string; scopes: string[] }>(
      `UPDATE source_keys SET last_used_at = now()
       WHERE key_hash = $1 AND status = 'active' AND (valid_until IS NULL OR valid_until > now())
       RETURNING id, site_id, environment_id, organization_id, scopes`,
      [hash],
    );
    const row = res.rows[0];
    const value = row ? { sourceKeyId: row.id, siteId: row.site_id, environmentId: row.environment_id, organizationId: row.organization_id, scopes: row.scopes } : null;
    this.keyCache.set(hash, { value, at: this.now() });
    return value;
  }

  invalidate(trackingId: string): void {
    this.cache.delete(trackingId);
  }
}
