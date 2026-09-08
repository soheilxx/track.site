import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ HOST_INGEST: "http://localhost:3100", KILL_SWITCH_GLOBAL: false }) }));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));

import { announcementApplies, localizeAnnouncement, sortAnnouncements } from "@/server/announcements";
import { FEATURE_FLAG_KEYS, FEATURE_FLAGS, isFeatureFlagKey } from "@/server/flags";
import {
  KILL_SWITCH_ENGAGE_WORD,
  KILL_SWITCH_FLAG_KEY,
  KILL_SWITCH_RELEASE_WORD,
  announcementStatus,
  buildAnnouncementTexts,
  buildAudience,
  isReservedFlagKey,
  isValidFlagKey,
  killSwitchWord,
  parseOrganizationIdList,
  parsePlanList,
  parseUtcDateTime,
} from "./controls";

const ORG = "73d2324e-153d-405b-9cfd-54a6e0ecfcc1";

describe("flag keys", () => {
  it("accepts the migration's key pattern and reserves platform.*", () => {
    expect(isValidFlagKey("ai.assistant")).toBe(true);
    expect(isValidFlagKey("revenue_leaks.beta")).toBe(true);
    expect(isValidFlagKey("A.b")).toBe(false);
    expect(isValidFlagKey("x")).toBe(false);
    expect(isValidFlagKey("a".repeat(65))).toBe(false);
    expect(isReservedFlagKey(KILL_SWITCH_FLAG_KEY)).toBe(true);
    expect(isValidFlagKey(KILL_SWITCH_FLAG_KEY)).toBe(true);
    expect(isReservedFlagKey("ai.assistant")).toBe(false);
  });
  it("registers every app flag with a valid, non-reserved key and a boolean default", () => {
    expect(FEATURE_FLAG_KEYS).toEqual(["ai.assistant", "revenue_leaks.beta", "knowledge.feedback"]);
    for (const key of FEATURE_FLAG_KEYS) {
      expect(isValidFlagKey(key)).toBe(true);
      expect(isReservedFlagKey(key)).toBe(false);
      expect(typeof FEATURE_FLAGS[key].defaultEnabled).toBe("boolean");
      expect(isFeatureFlagKey(key)).toBe(true);
    }
    expect(isFeatureFlagKey("platform.kill_switch")).toBe(false);
  });
});

describe("kill switch confirmation", () => {
  it("requires STOP to engage and RESUME to release", () => {
    expect(killSwitchWord(true)).toBe(KILL_SWITCH_ENGAGE_WORD);
    expect(killSwitchWord(false)).toBe(KILL_SWITCH_RELEASE_WORD);
    expect(KILL_SWITCH_ENGAGE_WORD).toBe("STOP");
    expect(KILL_SWITCH_RELEASE_WORD).toBe("RESUME");
  });
});

describe("announcement status", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  it("derives scheduled, active, ended and revoked", () => {
    expect(announcementStatus({ startsAt: "2026-09-09T00:00:00Z", endsAt: null, revokedAt: null }, now)).toBe("scheduled");
    expect(announcementStatus({ startsAt: "2026-09-08T00:00:00Z", endsAt: null, revokedAt: null }, now)).toBe("active");
    expect(announcementStatus({ startsAt: "2026-09-08T00:00:00Z", endsAt: "2026-09-08T13:00:00Z", revokedAt: null }, now)).toBe("active");
    expect(announcementStatus({ startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-09-08T12:00:00Z", revokedAt: null }, now)).toBe("ended");
    expect(announcementStatus({ startsAt: "2026-09-08T00:00:00Z", endsAt: null, revokedAt: new Date("2026-09-08T11:00:00Z") }, now)).toBe("revoked");
  });
});

describe("announcement input", () => {
  it("parses organization ids from free text, dropping duplicates and reporting invalid ones", () => {
    const parsed = parseOrganizationIdList(`${ORG}\n${ORG.toUpperCase()}, nope;  11111111-1111-4111-8111-111111111111`);
    expect(parsed.ids).toEqual([ORG, "11111111-1111-4111-8111-111111111111"]);
    expect(parsed.invalid).toEqual(["nope"]);
    expect(parseOrganizationIdList("")).toEqual({ ids: [], invalid: [] });
  });
  it("keeps only catalogue plan ids in catalogue order", () => {
    expect(parsePlanList(["pro", "bogus", "starter"])).toEqual(["starter", "pro"]);
  });
  it("requires an English title and stores only locales that have a title", () => {
    const values: Record<string, string> = { title_en: " Maintenance ", body_en: "Tonight 22:00 UTC", body_de: "Heute Abend" };
    const { texts, errors } = buildAnnouncementTexts((name) => values[name] ?? "");
    expect(texts).toEqual({ en: { title: "Maintenance", body: "Tonight 22:00 UTC" } });
    expect(errors).toEqual({ title_de: "required" });
    expect(buildAnnouncementTexts(() => "").errors).toEqual({ title_en: "required" });
    expect(buildAnnouncementTexts((n) => (n === "title_en" ? "x".repeat(161) : "")).errors).toEqual({ title_en: "long" });
  });
  it("builds an empty audience for everyone", () => {
    expect(buildAudience([], [])).toEqual({});
    expect(buildAudience(["pro"], [ORG])).toEqual({ plans: ["pro"], organizationIds: [ORG] });
  });
  it("reads datetime-local values as UTC", () => {
    expect(parseUtcDateTime("")).toBeNull();
    expect(parseUtcDateTime("2026-09-08T14:30")?.toISOString()).toBe("2026-09-08T14:30:00.000Z");
    expect(parseUtcDateTime("yesterday")).toBeUndefined();
  });
});

describe("announcement reader rules", () => {
  it("localizes with fallback to English, then any locale", () => {
    const texts = { en: { title: "Hello", body: "Body" }, de: { title: "Hallo", body: "Text" } };
    expect(localizeAnnouncement(texts, "de")).toEqual({ title: "Hallo", body: "Text" });
    expect(localizeAnnouncement(texts, "fr")).toEqual({ title: "Hello", body: "Body" });
    expect(localizeAnnouncement({ nl: { title: "Hoi", body: "" } }, "en")).toEqual({ title: "Hoi", body: "" });
    expect(localizeAnnouncement({}, "en")).toBeNull();
    expect(localizeAnnouncement(null, "en")).toBeNull();
  });
  it("applies audiences: everyone when empty, otherwise by organization id or plan", () => {
    expect(announcementApplies({}, { organizationId: ORG, planId: null })).toBe(true);
    expect(announcementApplies({ plans: ["pro"] }, { organizationId: ORG, planId: "pro" })).toBe(true);
    expect(announcementApplies({ plans: ["pro"] }, { organizationId: ORG, planId: "starter" })).toBe(false);
    expect(announcementApplies({ plans: ["pro"] }, { organizationId: ORG, planId: null })).toBe(false);
    expect(announcementApplies({ organizationIds: [ORG.toUpperCase()] }, { organizationId: ORG, planId: null })).toBe(true);
    expect(announcementApplies({ organizationIds: ["11111111-1111-4111-8111-111111111111"], plans: ["pro"] }, { organizationId: ORG, planId: "growth" })).toBe(false);
  });
  it("orders by severity, then newest first", () => {
    const sorted = sortAnnouncements([
      { id: "a", severity: "info" as const, startsAt: "2026-09-08T10:00:00Z" },
      { id: "b", severity: "bad" as const, startsAt: "2026-09-01T10:00:00Z" },
      { id: "c", severity: "info" as const, startsAt: "2026-09-09T10:00:00Z" },
      { id: "d", severity: "warn" as const, startsAt: "2026-09-02T10:00:00Z" },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "d", "c", "a"]);
  });
});
