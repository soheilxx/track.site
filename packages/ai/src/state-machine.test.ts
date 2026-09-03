import { describe, expect, it } from "vitest";
import { DEVELOPER_INSTRUCTIONS } from "./prompts.ts";
import { ALWAYS_TOOLS, CONFIRM_TOOLS, READ_ONLY_TOOLS, SETUP_STEPS, STEP_TOOLS, allowedToolNames, applyStepUpdate, initialSetupState, missingFields, nextStep, skipStep } from "./state-machine.ts";

const base = () => initialSetupState({ domain: "shop.test", locale: "de" });

describe("tool exposure per step", () => {
  it("exposes the tools the prompt's global commands name in every step for write roles", () => {
    const globalCommandTools = ["run_diagnostics", "compare_config_versions", "get_setup_state", "request_secure_credential_input"];
    for (const step of SETUP_STEPS) {
      const names = allowedToolNames({ ...base(), currentStep: step }, "DEVELOPER");
      for (const t of globalCommandTools) expect(names, `${t} in ${step}`).toContain(t);
      expect(names, `get_destination_status in ${step}`).toContain("get_destination_status");
    }
    for (const t of ["run_diagnostics", "compare_config_versions", "request_secure_credential_input"]) expect(DEVELOPER_INSTRUCTIONS).toContain(t);
  });
  it("keeps compare_config_versions for analysts (read-only) but hides the credential card from them", () => {
    const names = allowedToolNames({ ...base(), currentStep: "health" }, "ANALYST");
    expect(names).toContain("compare_config_versions");
    expect(names).toContain("get_destination_status");
    expect(names).not.toContain("request_secure_credential_input");
    expect(READ_ONLY_TOOLS).toContain("compare_config_versions");
  });
  it("never exposes confirm tools without an approval issuer to the model", () => {
    const never = ["activate_or_pause_destination", "rotate_credential", "disconnect_integration", "rollback_config_version"];
    for (const step of SETUP_STEPS) {
      const names = allowedToolNames({ ...base(), currentStep: step }, "OWNER");
      for (const t of never) expect(names, `${t} in ${step}`).not.toContain(t);
    }
    for (const t of never) expect(CONFIRM_TOOLS).toContain(t);
    for (const t of never) expect(ALWAYS_TOOLS).not.toContain(t);
    expect(DEVELOPER_INSTRUCTIONS).not.toContain("activate_or_pause_destination");
    expect(DEVELOPER_INSTRUCTIONS).toContain("Never claim such an action was performed");
  });
  it("offers save_public_pixel_id_draft and request_secure_credential_input wherever create_integration_draft is offered", () => {
    for (const step of SETUP_STEPS) {
      if (!STEP_TOOLS[step].includes("create_integration_draft")) continue;
      const names = allowedToolNames({ ...base(), currentStep: step }, "ADMIN");
      expect(names, step).toContain("save_public_pixel_id_draft");
      expect(names, step).toContain("request_secure_credential_input");
    }
    expect(STEP_TOOLS.destinations).toContain("validate_draft");
    expect(STEP_TOOLS.event_plan).toContain("validate_draft");
  });
});

describe("step progression", () => {
  it("does not jump back to an earlier open step when a later step completes", () => {
    let s = base();
    s = applyStepUpdate(s, "business_type", { fields: { business_type: "ecommerce" } });
    s = applyStepUpdate(s, "platform", { fields: { platform: "shopify" } });
    s = skipStep(s, "installation");
    s = applyStepUpdate(s, "consent", { fields: { cmp: "tcf", policy_version: "draft" } });
    expect(s.currentStep).toBe("destinations");
    // a destination exists but is not configured yet
    s = applyStepUpdate(s, "destinations", { fields: { destination_ids: ["d1"], destination_configured: false } });
    expect(s.steps.destinations?.status).toBe("in_progress");
    expect(missingFields(s)).toEqual(["destination_configured"]);
    // the user moves on and the event plan completes: stay behind, do not fall back to destinations
    s = { ...s, currentStep: "event_plan" };
    s = applyStepUpdate(s, "event_plan", { fields: { events: ["page_view"] } });
    expect(s.currentStep).toBe("test");
    s = applyStepUpdate(s, "test", { fields: { test_passed: true }, complete: true });
    expect(s.currentStep).toBe("review");
    // once the destination is complete the step closes without touching the current step
    s = applyStepUpdate(s, "destinations", { fields: { destination_configured: true } });
    expect(s.steps.destinations?.status).toBe("completed");
    expect(s.currentStep).toBe("review");
  });
  it("wraps around to the first open step once everything behind the completed step is done", () => {
    let s = base();
    for (const step of SETUP_STEPS) if (step !== "site" && step !== "platform" && step !== "health") s = skipStep(s, step);
    s = { ...s, currentStep: "health" };
    s = applyStepUpdate(s, "health", { complete: true });
    expect(s.currentStep).toBe("platform");
    expect(nextStep(s, "health")).toBe("platform");
    expect(nextStep(s)).toBe("platform");
  });
  it("blocks the platform step instead of completing it when the platform is unknown", () => {
    let s = base();
    s = applyStepUpdate(s, "business_type", { fields: { business_type: "saas" } });
    s = applyStepUpdate(s, "platform", { blockers: ["platform not confirmed"], confidence: 0 });
    expect(s.steps.platform?.status).toBe("blocked");
    expect(s.currentStep).toBe("platform");
    s = applyStepUpdate(s, "platform", { fields: { platform: "custom" }, blockers: [] });
    expect(s.steps.platform?.status).toBe("completed");
    expect(s.currentStep).toBe("installation");
  });
});
