import { describe, expect, it } from "vitest";
import { DEVELOPER_INSTRUCTIONS, contextBlock } from "./prompts.ts";
import { initialSetupState } from "./state-machine.ts";

describe("contextBlock", () => {
  it("lists integration ids so the model can fill integration_id, and the draft id", () => {
    const state = initialSetupState({ domain: "shop.test", locale: "de" });
    state.context.draftId = "6f7c2a0e-1b2c-4d5e-8f90-123456789abc";
    const block = contextBlock({
      state,
      locale: "de",
      siteName: "Shop",
      trackingId: "ts_abc",
      domain: "shop.test",
      role: "OWNER",
      integrations: [{ id: "0b8a1d2c-3e4f-4a5b-9c6d-7e8f90a1b2c3", type: "meta", name: "Meta Pixel", status: "draft" }],
      draftLint: { errors: 1, warnings: 0 },
      lastEvents: { browserAt: null, serverAt: null },
    });
    expect(block).toContain("Meta Pixel [meta, draft, id=0b8a1d2c-3e4f-4a5b-9c6d-7e8f90a1b2c3]");
    expect(block).toContain("use id= as integration_id");
    expect(block).toContain("draft=6f7c2a0e-1b2c-4d5e-8f90-123456789abc");
    expect(block).toContain("integrations (use id= as integration_id): none".slice(0, 12));
  });
  it("tells the model where ids and event names come from and that approvals happen outside the chat", () => {
    expect(DEVELOPER_INSTRUCTIONS).toMatch(/integration_id values are the "id=" UUIDs/);
    expect(DEVELOPER_INSTRUCTIONS).toContain("snake_case");
    expect(DEVELOPER_INSTRUCTIONS).toContain("Rollback, pausing or activating a destination, credential rotation and disconnecting a destination are not available in this chat");
    expect(DEVELOPER_INSTRUCTIONS).not.toContain("rotate_credential");
    expect(DEVELOPER_INSTRUCTIONS).not.toContain("rollback_config_version");
  });
});
