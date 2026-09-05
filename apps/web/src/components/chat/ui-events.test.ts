import { describe, expect, it, vi } from "vitest";
import type * as Ai from "@track-site/ai";
import { UI_EVENT_TYPES, parseUiEvent } from "./ui-events";

/** The client guard must accept exactly the server contract (`packages/ai/src/ui-events.ts`) and nothing else. */
const server = await vi.importActual<Pick<typeof Ai, "UI_EVENT_TYPES" | "createUiEventFilter">>("../../../../../packages/ai/src/ui-events.ts");

const ui = { message: "Done", intent: "configuration", stage: "destinations", current_step: "destinations", progress_percent: 40, status: "ok", cards: [{ type: "status", title: "Health", metrics: [{ label: "events", value: "12", tone: "ok" }] }], input_component: { type: "none" }, quick_actions: [{ id: "a", label: "Next", message: "Continue", kind: "primary" }], completed_steps: ["site"], missing_fields: [], warnings: [], requires_confirmation: false, confirmation_summary: null, tool_result_summary: null, next_best_action: null };

describe("client ui event guard", () => {
  it("accepts the same event types as the server contract", () => {
    expect([...UI_EVENT_TYPES]).toEqual([...server.UI_EVENT_TYPES]);
  });

  it("round-trips every server-emitted event unchanged through the wire", () => {
    const filter = server.createUiEventFilter({ turnId: "t" });
    const wire = [
      { type: "assistant.progress", phase: "thinking", detail: null },
      { type: "tool.started", callId: "call_1", name: "inspect_site", args: {} },
      { type: "tool.completed", callId: "call_1", name: "inspect_site", ok: false, code: "INVALID_STATE", summary: "", durationMs: 1, missing: ["domain"], stage: null },
      { type: "tool.completed", callId: "call_2", name: "send_destination_test_event", ok: true, code: "OK", summary: "", durationMs: 1, missing: [], stage: "delivered" },
      { type: "ui.approval", approvalId: "call_3", action: "publish_config_version", summary: { changes: [{ summary: "add pixel", op: "add" }], recipients: ["meta"] }, expiresAt: "2026-09-04T10:00:00.000Z" },
      { type: "ui.credential", component: { component: "secure_credential", integration_id: "i1", connector_type: "meta", credential_kind: "access_token", label: "Meta token", help: "h", oauth_provider: null } },
      { type: "dlp.notice", message: "x", suggested: null },
      { type: "ui.final", ui, usage: { input: 1, output: 1, cached: 0 }, model: "m" },
      { type: "error", code: "TIMEOUT", message: "slow", retryable: true },
      { type: "done" },
    ].flatMap((e) => filter.map(e));
    expect(wire.length).toBeGreaterThan(10);
    for (const event of wire) expect(parseUiEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });

  it("rejects unknown, internal or malformed frames", () => {
    for (const raw of [null, "x", 42, {}, { type: "reasoning", turnId: "t", text: "…" }, { type: "tool.started", turnId: "t", callId: "c", name: "n", args: {} }, { type: "assistant.progress", turnId: "t", phase: "thinking" }, { type: "activity.started", runId: "r" }, { type: "activity.started", turnId: "t", runId: "r", activity: "x", sentence: "y" }, { type: "ui.final", turnId: "t", ui: { message: "no cards" } }, { type: "approval.required", turnId: "t", approvalId: "a" }, { type: "error", turnId: "t" }, { type: "done" }]) expect(parseUiEvent(raw)).toBeNull();
    expect(parseUiEvent({ type: "done", turnId: "t", extra: "dropped" })).toEqual({ type: "done", turnId: "t" });
    expect(parseUiEvent({ type: "activity.blocked", turnId: "t", runId: "r", activity: "publish", sentence: "generic.blocked_missing", params: { missing: ["a", 1, "b"], reason: "INVALID_STATE", free_text: "nope" } })).toEqual({ type: "activity.blocked", turnId: "t", runId: "r", activity: "publish", sentence: "generic.blocked_missing", params: { missing: ["a", "b"], reason: "INVALID_STATE" } });
  });
});
