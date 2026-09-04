import { describe, expect, it } from "vitest";
import {
  parseThresholdInput,
  previewValues,
  thresholdDefaults,
  thresholdFields,
  thresholdFromForm,
} from "./threshold";

describe("parseThresholdInput", () => {
  it("accepts numbers and numeric strings inside the bounds of the kind", () => {
    expect(
      parseThresholdInput("event_drop", {
        dropPercent: "40",
        windowMinutes: 120,
        minBaseline: " 25 ",
      }),
    ).toEqual({ ok: true, threshold: { dropPercent: 40, windowMinutes: 120, minBaseline: 25 } });
    expect(parseThresholdInput("queue_lag", { lagSeconds: "600" })).toEqual({
      ok: true,
      threshold: { lagSeconds: 600 },
    });
  });
  it("reports missing, non-numeric, fractional and out-of-range fields without inventing defaults", () => {
    expect(
      parseThresholdInput("event_drop", {
        dropPercent: "",
        windowMinutes: "abc",
        minBaseline: "12.5",
      }),
    ).toEqual({
      ok: false,
      errors: { dropPercent: "required", windowMinutes: "number", minBaseline: "integer" },
    });
    expect(parseThresholdInput("credential_expiry", { daysBefore: "365" })).toEqual({
      ok: false,
      errors: { daysBefore: "range" },
    });
    expect(
      parseThresholdInput("consent_errors", {
        errorRatePercent: "0",
        windowMinutes: "30",
        minEvents: "10",
      }),
    ).toEqual({ ok: false, errors: { errorRatePercent: "range", windowMinutes: "range" } });
  });
  it("ignores fields that do not belong to the kind and accepts a decimal comma", () => {
    expect(
      parseThresholdInput("credential_expiry", { daysBefore: "14", dropPercent: "999" }),
    ).toEqual({ ok: true, threshold: { daysBefore: 14 } });
    expect(
      parseThresholdInput("vendor_outage", { errorRatePercent: "25,0", minAttempts: "20" }),
    ).toEqual({ ok: true, threshold: { errorRatePercent: 25, minAttempts: 20 } });
  });
});

describe("thresholdFromForm + defaults", () => {
  it("reads the namespaced form fields of the kind only", () => {
    const form = new Map<string, string>([
      ["threshold.deviationPercent", "60"],
      ["threshold.windowMinutes", "180"],
      ["threshold.minBaseline", "10"],
      ["threshold.lagSeconds", "5"],
    ]);
    expect(thresholdFromForm("conversion_anomaly", (name) => form.get(name))).toEqual({
      deviationPercent: "60",
      windowMinutes: "180",
      minBaseline: "10",
    });
  });
  it("offers defaults that satisfy their own bounds for every kind", () => {
    for (const kind of [
      "event_drop",
      "vendor_outage",
      "credential_expiry",
      "consent_errors",
      "queue_lag",
      "conversion_anomaly",
    ] as const) {
      const defaults = thresholdDefaults(kind);
      expect(Object.keys(defaults).sort()).toEqual(
        thresholdFields(kind)
          .map((f) => f.key)
          .sort(),
      );
      expect(parseThresholdInput(kind, defaults)).toEqual({ ok: true, threshold: defaults });
    }
  });
});

describe("previewValues", () => {
  it("fills missing fields with defaults and derives hours and minutes for the sentence", () => {
    expect(previewValues("event_drop", { dropPercent: 30 })).toEqual({
      dropPercent: 30,
      windowMinutes: 60,
      minBaseline: 50,
      windowHours: 1,
    });
    expect(previewValues("queue_lag", { lagSeconds: 900 })).toEqual({
      lagSeconds: 900,
      lagMinutes: 15,
    });
    expect(previewValues("conversion_anomaly", { windowMinutes: 90 })).toMatchObject({
      windowHours: 1.5,
    });
  });
});
