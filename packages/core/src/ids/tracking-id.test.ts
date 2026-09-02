import { describe, expect, it } from "vitest";
import {
  TRACKING_ID_REGEX,
  TrackingIdExhaustedError,
  createWithUniqueTrackingId,
  generateTrackingId,
  isBlockedTrackingId,
  normalizeTrackingId,
} from "./tracking-id.ts";

describe("tracking id", () => {
  it("generates 6 uppercase alphanumerics", () => {
    for (let i = 0; i < 500; i++) expect(generateTrackingId()).toMatch(TRACKING_ID_REGEX);
  });

  it("normalizes case-insensitively and rejects invalid input", () => {
    expect(normalizeTrackingId(" a7k2q9 ")).toBe("A7K2Q9");
    expect(normalizeTrackingId("a7k2q")).toBeNull();
    expect(normalizeTrackingId("A7K2Q9X")).toBeNull();
    expect(normalizeTrackingId("A7-2Q9")).toBeNull();
    expect(normalizeTrackingId(null)).toBeNull();
  });

  it("blocks reserved values and offensive substrings", () => {
    expect(isBlockedTrackingId("000000")).toBe(true);
    expect(isBlockedTrackingId("test00")).toBe(true);
    expect(isBlockedTrackingId("AFUCKB")).toBe(true);
    expect(isBlockedTrackingId("NAZI12")).toBe(true);
    expect(isBlockedTrackingId("SS88SS")).toBe(true);
    expect(isBlockedTrackingId("A7K2Q9")).toBe(false);
    expect(isBlockedTrackingId("MASSIV")).toBe(true);
    expect(isBlockedTrackingId("SSAB12")).toBe(false);
  });

  it("re-draws when the generator hits a blocked value", () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const seq = ["0", "0", "0", "0", "0", "0", "A", "7", "K", "2", "Q", "9"].map((c) => alphabet.indexOf(c));
    let i = 0;
    const id = generateTrackingId(() => seq[i++] ?? 0);
    expect(id).toBe("A7K2Q9");
  });

  it("retries on unique violations and gives up honestly", async () => {
    const seen: string[] = [];
    let failures = 2;
    const result = await createWithUniqueTrackingId(
      async (id) => {
        seen.push(id);
        if (failures-- > 0) throw new Error("dup");
        return id;
      },
      (e) => e instanceof Error && e.message === "dup",
    );
    expect(seen).toHaveLength(3);
    expect(result).toBe(seen[2]);

    await expect(
      createWithUniqueTrackingId(
        async () => {
          throw new Error("dup");
        },
        (e) => e instanceof Error && e.message === "dup",
        { maxAttempts: 3 },
      ),
    ).rejects.toBeInstanceOf(TrackingIdExhaustedError);
  });

  it("propagates non-unique errors immediately", async () => {
    await expect(
      createWithUniqueTrackingId(
        async () => {
          throw new Error("boom");
        },
        () => false,
      ),
    ).rejects.toThrow("boom");
  });
});
