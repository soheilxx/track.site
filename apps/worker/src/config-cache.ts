import type { Pool } from "pg";
import { configBundleSchema, type ConfigBundle } from "@track-site/config";
import { DEFAULT_SITE_POLICY, type SitePolicy } from "@track-site/policy";

/**
 * Site-level runtime configuration for the pipeline: the active signed bundle for an environment
 * and the published consent policy. Cached briefly so publishes take effect within seconds.
 */
export interface SiteRuntimeConfig {
  bundle: ConfigBundle | null;
  configVersion: number | null;
  policy: SitePolicy;
  testMode: boolean;
  integrations: Map<string, IntegrationRow>;
  fetchedAt: number;
}

export interface IntegrationRow {
  id: string;
  connectorType: string;
  status: "draft" | "not_connected" | "connected" | "paused" | "error";
  publicConfig: Record<string, unknown>;
  settings: Record<string, unknown>;
  requiredPurpose: string | null;
  testMode: boolean;
}

export class ConfigCache {
  private readonly cache = new Map<string, SiteRuntimeConfig>();
  constructor(
    private readonly pool: Pool,
    private readonly ttlMs = 15_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  invalidate(siteId?: string): void {
    if (!siteId) this.cache.clear();
    for (const k of this.cache.keys()) if (k.startsWith(`${siteId}:`)) this.cache.delete(k);
  }

  async get(siteId: string, environmentId: string): Promise<SiteRuntimeConfig> {
    const key = `${siteId}:${environmentId}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) return cached;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE tracksite_worker");
      const cfg = await client.query<{ version: number; bundle: unknown }>(
        `SELECT cv.version, cv.bundle FROM config_publications cp JOIN config_versions cv ON cv.id = cp.version_id
         WHERE cp.site_id = $1 AND cp.environment_id = $2 AND cp.is_active ORDER BY cp.published_at DESC LIMIT 1`,
        [siteId, environmentId],
      );
      const env = await client.query<{ test_mode: boolean }>(`SELECT test_mode FROM environments WHERE id = $1`, [environmentId]);
      const policyRow = await client.query<{ version: number; region_policies: SitePolicy["regionPolicies"]; destination_purposes: SitePolicy["destinationPurposes"]; operational_events: string[] }>(
        `SELECT version, region_policies, destination_purposes, operational_events FROM consent_policies WHERE site_id = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`,
        [siteId],
      );
      const ints = await client.query<{ id: string; connector_type: string; status: IntegrationRow["status"]; public_config: Record<string, unknown>; settings: Record<string, unknown>; required_purpose: string | null; test_mode: boolean }>(
        `SELECT id, connector_type, status, public_config, settings, required_purpose, test_mode FROM integrations WHERE site_id = $1`,
        [siteId],
      );
      await client.query("COMMIT");
      const parsed = cfg.rows[0] ? configBundleSchema.safeParse(cfg.rows[0].bundle) : null;
      const p = policyRow.rows[0];
      const policy: SitePolicy = p
        ? {
            version: `v${p.version}`,
            regionPolicies: { ...DEFAULT_SITE_POLICY.regionPolicies, ...(p.region_policies ?? {}) },
            destinationPurposes: (p.destination_purposes ?? {}) as SitePolicy["destinationPurposes"],
            operationalEvents: p.operational_events ?? DEFAULT_SITE_POLICY.operationalEvents,
            persistWithoutSignal: false,
          }
        : DEFAULT_SITE_POLICY;
      const value: SiteRuntimeConfig = {
        bundle: parsed?.success ? parsed.data : null,
        configVersion: parsed?.success ? cfg.rows[0]!.version : null,
        policy,
        testMode: env.rows[0]?.test_mode ?? false,
        integrations: new Map(
          ints.rows.map((r) => [
            r.id,
            { id: r.id, connectorType: r.connector_type, status: r.status, publicConfig: r.public_config, settings: r.settings, requiredPurpose: r.required_purpose, testMode: r.test_mode },
          ]),
        ),
        fetchedAt: this.now(),
      };
      this.cache.set(key, value);
      return value;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
