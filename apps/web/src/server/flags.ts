import "server-only";
import { and, eq } from "drizzle-orm";
import { featureFlagOverrides, featureFlags, withTenant } from "@track-site/db";
import { db, logger } from "@/server/db";

/**
 * Feature flags for the customer app (migration 0014: `feature_flags` = global default per key,
 * `feature_flag_overrides` = per-organization override; both are written only by platform admins in
 * Track Operations → Controls). Every flag the app reads is registered here with the default that
 * applies while the row does not exist in the database — so a fresh database, a missing migration or
 * an unreachable database never changes product behaviour. The resolution order is
 * override (organization) → database default → code default, cached in memory for 60 s per
 * (organization, key); a flip in the console therefore reaches every web instance within a minute.
 */
export interface FeatureFlagDefinition {
  /** value while no `feature_flags` row exists */
  defaultEnabled: boolean;
  /** what the flag gates, shown in the console when the flag is registered from here */
  description: string;
}

export const FEATURE_FLAGS = {
  "ai.assistant": {
    defaultEnabled: true,
    description: "Track AI panel in the customer dashboard (assistant host). Off hides the panel for the organization.",
  },
  "revenue_leaks.beta": {
    defaultEnabled: true,
    description: "Signal Gap & Revenue Leak Detector at /app/data-quality/revenue-leaks. Off shows an honest 'not enabled' state.",
  },
  "knowledge.feedback": {
    defaultEnabled: true,
    description: "'Was this article helpful?' widget on Tracking Knowledge articles (global default only; the marketing site has no organization).",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === "string" && Object.hasOwn(FEATURE_FLAGS, value);
}

export const FEATURE_FLAG_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

/** Process-wide cache (Next.js dev re-imports modules; keep it on globalThis like the db singletons). */
const g = globalThis as unknown as { __trackSiteFlags?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__trackSiteFlags ??= new Map());

const UUID = /^[0-9a-f-]{36}$/i;

const cacheKey = (organizationId: string | null, key: string): string => `${organizationId ?? ""}|${key}`;

/** Drops every cached value (tests, and the console after a write in the same process). */
export function invalidateFeatureFlagCache(): void {
  cache.clear();
}

async function resolveFlag(organizationId: string | null, key: FeatureFlagKey): Promise<boolean> {
  const fallback = FEATURE_FLAGS[key].defaultEnabled;
  if (!organizationId) {
    const [row] = await db().select({ defaultEnabled: featureFlags.defaultEnabled }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    return row?.defaultEnabled ?? fallback;
  }
  if (!UUID.test(organizationId)) return fallback;
  // tenant transaction (RLS): the SELECT-only policy limits the overrides to the organization's own rows
  return withTenant(db(), organizationId, async (tx) => {
    const [override] = await tx
      .select({ enabled: featureFlagOverrides.enabled })
      .from(featureFlagOverrides)
      .where(and(eq(featureFlagOverrides.organizationId, organizationId), eq(featureFlagOverrides.key, key)))
      .limit(1);
    if (override) return override.enabled;
    const [flag] = await tx.select({ defaultEnabled: featureFlags.defaultEnabled }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    return flag?.defaultEnabled ?? fallback;
  });
}

/**
 * Whether a registered flag is on for an organization (`null` = no organization, e.g. the marketing site:
 * the global default applies). Cached for 60 s; a database error yields the code default and is logged
 * once per cache window instead of failing the page.
 */
export async function isFeatureEnabled(organizationId: string | null, key: FeatureFlagKey): Promise<boolean> {
  const id = cacheKey(organizationId, key);
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;
  let value: boolean;
  try {
    value = await resolveFlag(organizationId, key);
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e), key }, "feature flag lookup failed; using the code default");
    value = FEATURE_FLAGS[key].defaultEnabled;
  }
  cache.set(id, { value, expiresAt: now + FEATURE_FLAG_CACHE_TTL_MS });
  return value;
}

/** Several flags at once (dashboard layout). */
export async function featureFlagsFor<K extends FeatureFlagKey>(organizationId: string | null, keys: readonly K[]): Promise<Record<K, boolean>> {
  const values = await Promise.all(keys.map((key) => isFeatureEnabled(organizationId, key)));
  const out = {} as Record<K, boolean>;
  keys.forEach((key, i) => {
    out[key] = values[i] ?? FEATURE_FLAGS[key].defaultEnabled;
  });
  return out;
}
