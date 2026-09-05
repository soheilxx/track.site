import { describe, expect, it } from "vitest";
import { devFixturesEnabled, fixtureMessages } from "./fixtures";

describe("dev fixture", () => {
  it("is dead in production (either variable) and alive in development and test", () => {
    expect(devFixturesEnabled({ NODE_ENV: "production", APP_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFixturesEnabled({ NODE_ENV: "development", APP_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFixturesEnabled({ NODE_ENV: "production", APP_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFixturesEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(devFixturesEnabled({ NODE_ENV: "test", APP_ENV: "test" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("opens for a production build under test only with the explicit opt-in, never with APP_ENV=production", () => {
    expect(devFixturesEnabled({ NODE_ENV: "production", APP_ENV: "development", AI_DEV_FIXTURES: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(devFixturesEnabled({ NODE_ENV: "production", AI_DEV_FIXTURES: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(devFixturesEnabled({ NODE_ENV: "production", APP_ENV: "development", AI_DEV_FIXTURES: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFixturesEnabled({ NODE_ENV: "production", APP_ENV: "production", AI_DEV_FIXTURES: "1" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFixturesEnabled({ NODE_ENV: "development", APP_ENV: "production", AI_DEV_FIXTURES: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("generates a deterministic alternating transcript with unique ids and no ui payloads", () => {
    const a = fixtureMessages(250);
    const b = fixtureMessages(250);
    expect(a).toEqual(b);
    expect(a).toHaveLength(250);
    expect(new Set(a.map((m) => m.id)).size).toBe(250);
    expect(a[0]!.role).toBe("user");
    expect(a[1]!.role).toBe("assistant");
    expect(a.every((m) => m.ui === null && m.content.length > 0)).toBe(true);
    expect(a[249]!.createdAt > a[0]!.createdAt).toBe(true);
  });
});
