import { describe, expect, it } from "vitest";
import { switchTarget } from "./localized-paths";

describe("language switcher targets", () => {
  it("stays on the same page when no localized paths are registered", () => {
    expect(switchTarget(null, "/pricing", "de")).toBe("/pricing");
    expect(switchTarget(null, "/tracking-knowledge/shared-slug", "en")).toBe("/tracking-knowledge/shared-slug");
  });

  it("follows the registered translation of an article with diverging slugs", () => {
    const localized = { paths: { en: "/tracking-knowledge/server-side-tracking-explained", de: "/tracking-knowledge/server-side-tracking-erklaert" }, fallback: "/tracking-knowledge" };
    expect(switchTarget(localized, "/tracking-knowledge/server-side-tracking-explained", "de")).toBe("/tracking-knowledge/server-side-tracking-erklaert");
    expect(switchTarget(localized, "/tracking-knowledge/server-side-tracking-erklaert", "en")).toBe("/tracking-knowledge/server-side-tracking-explained");
  });

  it("falls back to the index for a locale without a published version instead of a 404", () => {
    const localized = { paths: { en: "/tracking-knowledge/only-english" }, fallback: "/tracking-knowledge" };
    expect(switchTarget(localized, "/tracking-knowledge/only-english", "fr")).toBe("/tracking-knowledge");
  });
});
