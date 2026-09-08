import { describe, expect, it } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { formatDateTime as controlsDateTime } from "./controls/format";
import { dateTime as growthDateTime } from "./growth/format";
import { dateTime as revenueDateTime } from "./revenue/format";

/**
 * Regression guard for the console's UTC-labelled timestamps: `timeZoneName` must not be combined with
 * `dateStyle` / `timeStyle` — `Intl.DateTimeFormat` throws "Invalid option", which rendered the Overview,
 * Growth, Revenue and Announcements pages as 500s (found by e2e/ops.spec.ts).
 */
describe("ops date-time helpers", () => {
  const instant = new Date("2026-09-08T15:14:00Z");

  for (const locale of ALL_LOCALES) {
    it(`format the instant in UTC with the zone for ${locale}`, () => {
      for (const value of [
        growthDateTime(instant, locale),
        revenueDateTime(instant, locale),
        controlsDateTime(instant.toISOString(), locale, "UTC"),
      ]) {
        expect(value).toMatch(/2026/);
        expect(value).toMatch(/15[:.]14/);
        expect(value).toMatch(/UTC|GMT|TU/);
      }
      expect(controlsDateTime(instant.toISOString(), locale)).toMatch(/2026/);
    });
  }

  it("returns null for missing or invalid announcement boundaries", () => {
    expect(controlsDateTime(null, "en", "UTC")).toBeNull();
    expect(controlsDateTime("not a date", "en")).toBeNull();
  });
});
