import type { Pool } from "pg";
import type { AppLogger } from "@track-site/core";

/**
 * Global kill switch of the collector (docs/03 §B8, docs/17 → Controls). Two sources, either one stops
 * ingestion and config delivery:
 *   - `KILL_SWITCH_GLOBAL` (environment variable): deployment-level, needs a restart to change;
 *   - the platform switch in the database: the reserved feature flag `platform.kill_switch`
 *     (`feature_flags.default_enabled`), flipped by platform admins in Track Operations → Controls with a
 *     typed confirmation and an audit entry, effective here within `ttlMs`.
 * A database hiccup keeps the last known state: a lookup failure must neither pause nor resume traffic.
 */
export const KILL_SWITCH_FLAG_KEY = "platform.kill_switch";

export interface GlobalKillSwitch {
  /** true when the platform switch is engaged; false when off or unknown (the environment variable still applies) */
  engaged(): Promise<boolean>;
}

export class PgGlobalKillSwitch implements GlobalKillSwitch {
  private value = false;
  private at = Number.NEGATIVE_INFINITY;
  private inflight: Promise<boolean> | null = null;
  private warned = false;

  constructor(
    private readonly pool: Pool,
    private readonly ttlMs = 5_000,
    private readonly logger?: AppLogger,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async engaged(): Promise<boolean> {
    if (this.now() - this.at < this.ttlMs) return this.value;
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async refresh(): Promise<boolean> {
    try {
      const res = await this.pool.query<{ default_enabled: boolean }>(`SELECT default_enabled FROM feature_flags WHERE key = $1 LIMIT 1`, [KILL_SWITCH_FLAG_KEY]);
      this.value = res.rows[0]?.default_enabled === true;
      this.warned = false;
    } catch (e) {
      if (!this.warned) {
        this.logger?.warn({ err: e instanceof Error ? e.message : String(e) }, "kill switch lookup failed; keeping the last known state");
        this.warned = true;
      }
    }
    this.at = this.now();
    return this.value;
  }
}

export type KillSwitchSource = "env" | "platform";

export interface KillSwitchState {
  engaged: boolean;
  /** which source engaged it; null while traffic flows */
  source: KillSwitchSource | null;
}

/** Effective global kill switch: the environment variable first, then the platform switch in the database. */
export async function killSwitchState(deps: { env: { KILL_SWITCH_GLOBAL: boolean }; killSwitch?: GlobalKillSwitch | null }): Promise<KillSwitchState> {
  if (deps.env.KILL_SWITCH_GLOBAL) return { engaged: true, source: "env" };
  if (deps.killSwitch && (await deps.killSwitch.engaged())) return { engaged: true, source: "platform" };
  return { engaged: false, source: null };
}
