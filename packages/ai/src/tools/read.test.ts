import { describe, expect, it } from "vitest";
import { FAILED_DELIVERY_STATUSES, inspectSite, resolveInspectPath, showDeliveryErrors } from "./read.ts";

describe("resolveInspectPath", () => {
  it("defaults to the home page and prefixes a missing slash", () => {
    expect(resolveInspectPath(null, "shop.test")).toBe("/");
    expect(resolveInspectPath("  ", "shop.test")).toBe("/");
    expect(resolveInspectPath("checkout", "shop.test")).toBe("/checkout");
    expect(resolveInspectPath("/checkout?step=2", "shop.test")).toBe("/checkout?step=2");
  });
  it("accepts full URLs on the site's own host and rejects other hosts instead of falling back to /", () => {
    expect(resolveInspectPath("https://shop.test/checkout?x=1", "shop.test")).toBe("/checkout?x=1");
    expect(() => resolveInspectPath("https://evil.example/checkout", "shop.test")).toThrow(/must be on the site's primary domain shop\.test/);
    expect(() => resolveInspectPath("//evil.example/x", "shop.test")).toThrow(/different host/);
    expect(() => resolveInspectPath("https://", "shop.test")).toThrow(/not a valid URL/);
    expect(() => resolveInspectPath("check out", "shop.test")).toThrow(/not allowed/);
  });
  it("documents the parameter for the model", () => {
    const props = inspectSite.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(String(props.path!.description)).toContain("null = home page");
    expect(inspectSite.description).not.toContain("Fetches the public home page of");
  });
});

describe("show_delivery_errors", () => {
  it("filters failures in SQL (pending and success excluded) and documents the parameters", () => {
    expect([...FAILED_DELIVERY_STATUSES]).toEqual(["retry", "failed", "dead", "skipped"]);
    expect(FAILED_DELIVERY_STATUSES).not.toContain("success");
    expect(showDeliveryErrors.description).toContain("successes are excluded before the limit");
    const props = showDeliveryErrors.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(String(props.integration_id!.description)).toContain("null = all destinations");
    expect(showDeliveryErrors.validate({ integration_id: null, limit: null }).ok).toBe(true);
    expect(showDeliveryErrors.validate({ integration_id: "meta", limit: 5 }).ok).toBe(false);
  });
});
