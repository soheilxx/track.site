import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const withTenant = vi.fn();
const select = vi.fn();
vi.mock("@track-site/db", () => ({
  featureFlags: { key: "key", defaultEnabled: "default_enabled" },
  featureFlagOverrides: { organizationId: "organization_id", key: "key", enabled: "enabled" },
  withTenant: (...args: unknown[]) => withTenant(...args),
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("@/server/db", () => ({ db: () => ({ select }), logger: { warn: vi.fn() } }));

import { FEATURE_FLAGS, invalidateFeatureFlagCache, isFeatureEnabled } from "./flags";

const ORG = "73d2324e-153d-405b-9cfd-54a6e0ecfcc1";

/** `db().select(...).from(...).where(...).limit(...)` resolving to `rows` */
function chain(rows: unknown[]) {
  const q = { from: () => q, where: () => q, limit: async () => rows };
  return q;
}

describe("isFeatureEnabled", () => {
  beforeEach(() => {
    invalidateFeatureFlagCache();
    withTenant.mockReset();
    select.mockReset();
  });

  it("resolves override → stored default → code default inside the tenant transaction", async () => {
    withTenant.mockImplementation(async (_db: unknown, orgId: string, fn: (tx: unknown) => Promise<boolean>) => {
      expect(orgId).toBe(ORG);
      const overrideRows: unknown[] = [];
      const flagRows = [{ defaultEnabled: false }];
      let call = 0;
      const tx = { select: () => chain(call++ === 0 ? overrideRows : flagRows) };
      return fn(tx);
    });
    expect(await isFeatureEnabled(ORG, "ai.assistant")).toBe(false);
    expect(withTenant).toHaveBeenCalledTimes(1);
    // cached for the window: no second query
    expect(await isFeatureEnabled(ORG, "ai.assistant")).toBe(false);
    expect(withTenant).toHaveBeenCalledTimes(1);
  });

  it("uses the override when present", async () => {
    withTenant.mockImplementation(async (_db: unknown, _orgId: string, fn: (tx: unknown) => Promise<boolean>) => fn({ select: () => chain([{ enabled: false }]) }));
    expect(await isFeatureEnabled(ORG, "revenue_leaks.beta")).toBe(false);
  });

  it("reads the global default without an organization and falls back to the code default when no row exists", async () => {
    select.mockImplementation(() => chain([]));
    expect(await isFeatureEnabled(null, "knowledge.feedback")).toBe(FEATURE_FLAGS["knowledge.feedback"].defaultEnabled);
    expect(withTenant).not.toHaveBeenCalled();
    invalidateFeatureFlagCache();
    select.mockImplementation(() => chain([{ defaultEnabled: false }]));
    expect(await isFeatureEnabled(null, "knowledge.feedback")).toBe(false);
  });

  it("returns the code default on a database error instead of failing the page", async () => {
    withTenant.mockRejectedValue(new Error("connection refused"));
    expect(await isFeatureEnabled(ORG, "ai.assistant")).toBe(true);
    expect(await isFeatureEnabled("not-a-uuid", "ai.assistant")).toBe(true);
  });
});
