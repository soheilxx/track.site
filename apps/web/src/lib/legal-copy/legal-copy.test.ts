import { describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES } from "@/i18n/routing";
import { copyParity } from "@/lib/marketing-copy/parity";
import { LEGAL, LEGAL_DOC_IDS, SUBPROCESSORS } from "./index";

describe("legal copy", () => {
  it("has a key for every programme locale and a value for every active locale", () => {
    for (const locale of ALL_LOCALES) expect(locale in LEGAL).toBe(true);
    for (const locale of ACTIVE_LOCALES) expect(LEGAL[locale], `LEGAL.${locale}`).not.toBeNull();
  });

  it("keeps the same document set and section structure in every translated locale", () => {
    for (const entry of copyParity(LEGAL)) {
      if (!entry.present) continue;
      expect(entry.missing, `LEGAL.${entry.locale} lacks`).toEqual([]);
      expect(entry.extra, `LEGAL.${entry.locale} extra`).toEqual([]);
    }
    for (const id of LEGAL_DOC_IDS) expect(LEGAL.en[id].updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps the subprocessor facts language-neutral", () => {
    expect(SUBPROCESSORS.length).toBeGreaterThan(0);
    for (const s of SUBPROCESSORS) expect(s.name.length).toBeGreaterThan(0);
  });
});
