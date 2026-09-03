import { describe, expect, it } from "vitest";
import { vendorMirrorId } from "./util.ts";

describe("vendorMirrorId", () => {
  it("derives the shared purchase/refund id from the order id", () => {
    expect(vendorMirrorId("purchase", "A1001", "01J")).toBe("purchase:A1001");
    expect(vendorMirrorId("refund", 1001, "01J")).toBe("refund:1001");
  });
  it("keeps the observation id for everything else", () => {
    expect(vendorMirrorId("purchase", null, "01J")).toBe("01J");
    expect(vendorMirrorId("add_to_cart", "A1001", "01J")).toBe("01J");
  });
});
