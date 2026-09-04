import { describe, expect, it } from "vitest";
import { COPY_LOCALES, type LocalizedCopy } from "@/lib/marketing-copy";
import { FEATURES, FEATURES_PAGE_COPY, FEATURE_DETAIL_COPY, FEATURE_UI_COPY } from "@/lib/marketing-copy/features";
import { HOW_IT_WORKS } from "@/lib/marketing-copy/how-it-works";
import { FEATURE_PAGES } from "@/lib/routes";

/** Structural signature: key paths, array lengths and value kinds (same approach as pick.test.ts). */
function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    const first = value[0];
    return [`${path}[${value.length}]`, ...(first !== undefined ? shape(first, `${path}[]`) : [])];
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path}:${typeof value}`];
}

function text(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === "function" ? undefined : v));
}

describe("feature and how-it-works copy", () => {
  it("keeps the six feature slugs in sync with FEATURE_PAGES in every locale", () => {
    for (const locale of COPY_LOCALES) expect(FEATURES[locale].map((f) => f.slug)).toEqual([...FEATURE_PAGES]);
  });

  it("has the same shape in every locale for the new copy modules", () => {
    const modules: Record<string, LocalizedCopy<unknown>> = { FEATURES, FEATURES_PAGE_COPY, FEATURE_DETAIL_COPY, FEATURE_UI_COPY, HOW_IT_WORKS };
    for (const [name, copy] of Object.entries(modules)) {
      const reference = shape(copy.en);
      for (const locale of COPY_LOCALES) expect(shape(copy[locale]), `${name}.${locale}`).toEqual(reference);
    }
  });

  it("shows three to four customer milestones and no step-count claims", () => {
    for (const locale of COPY_LOCALES) {
      expect(HOW_IT_WORKS[locale].steps.length).toBeGreaterThanOrEqual(3);
      expect(HOW_IT_WORKS[locale].steps.length).toBeLessThanOrEqual(4);
      const all = `${text(HOW_IT_WORKS[locale])} ${text(FEATURES[locale])} ${text(FEATURES_PAGE_COPY[locale])}`;
      expect(all).not.toMatch(/\b(?:\d+|nine|neun|nineteen|neunzehn)\s+(?:setup\s+)?(?:steps?|schritte?n?)\b/i);
    }
  });

  it("keeps the example health score consistent with its weighted components", () => {
    for (const locale of COPY_LOCALES) {
      const { health } = FEATURE_UI_COPY[locale];
      const total = health.components.reduce((acc, c) => acc + c.score * c.weight, 0);
      const weight = health.components.reduce((acc, c) => acc + c.weight, 0);
      expect(weight).toBe(100);
      expect(Math.round(total / weight)).toBe(health.score);
    }
  });

  it("uses unique, expected ids for the interactive tabs", () => {
    for (const locale of COPY_LOCALES) {
      expect(FEATURES_PAGE_COPY[locale].scenarios.items.map((s) => s.id)).toEqual(["granted", "withdrawn", "outage"]);
      expect(HOW_IT_WORKS[locale].flows.items.map((f) => f.id)).toEqual(["browser", "server", "hybrid"]);
    }
  });

  it("never names the product track.site in visible copy", () => {
    for (const locale of COPY_LOCALES) {
      const visible = `${text(FEATURES[locale])} ${text(FEATURES_PAGE_COPY[locale])} ${text(FEATURE_DETAIL_COPY[locale])} ${text(HOW_IT_WORKS[locale])}`.replace(/https?:\/\/[^\s"'`<>)]*track\.site[^\s"'`<>)]*/gi, "");
      expect(visible).not.toMatch(/track\.site/i);
    }
  });
});
