import { describe, expect, it } from "vitest";
import type { AssistantUiResponse, UiEvent } from "@track-site/ai";
import { EMPTY_CHAT, applyUiEvent, applyUiEvents, startTurn, type ChatState } from "./chat-reducer";

const ui: AssistantUiResponse = { message: "Done", intent: "configuration", stage: "destinations", current_step: "destinations", progress_percent: 40, status: "ok", cards: [{ type: "info", title: "i", body: "b", tone: "neutral" }], input_component: { type: "none" }, quick_actions: [], completed_steps: ["site"], missing_fields: [], warnings: [], requires_confirmation: false, confirmation_summary: null, tool_result_summary: null, next_best_action: null };

const run = (events: UiEvent[], from: ChatState = startTurn(EMPTY_CHAT, { turnId: "t1", text: "hi", now: 1_000 })) => events.reduce((s, e, i) => applyUiEvent(s, e, 1_000 + (i + 1) * 100), from);

describe("chat reducer (allow-listed events → chat state)", () => {
  it("starts a turn with a clean transient state and the user's message", () => {
    const s = startTurn({ ...EMPTY_CHAT, approval: { approvalId: "a", action: "publish_config_version", summary: { changes: [], recipients: [] }, expiresAt: "x" }, error: { code: "TIMEOUT", message: "", retryable: true }, draft: "hi", outcome: { kind: "blocked", at: 1 } }, { turnId: "t1", text: "hi", now: 1_000 });
    expect(s).toMatchObject({ status: "sending", turnId: "t1", lastSeq: 0, activities: [], approval: null, error: null, outcome: null, draft: "", pending: null });
    expect(s.messages).toEqual([{ id: "local-t1", role: "user", content: "hi", ui: null, createdAt: new Date(1_000).toISOString() }]);
  });

  it("keeps one activity per run id with its latest phase and marks blocked/failed outcomes", () => {
    const s = run([
      { type: "activity.started", turnId: "t1", runId: "call_1", activity: "site_check", sentence: "site_check.started", params: {} },
      { type: "activity.started", turnId: "t1", runId: "call_2", activity: "snippet_verification", sentence: "snippet_verification.started", params: {} },
      { type: "activity.completed", turnId: "t1", runId: "call_1", activity: "site_check", sentence: "site_check.completed", params: {} },
      { type: "activity.blocked", turnId: "t1", runId: "call_2", activity: "snippet_verification", sentence: "generic.blocked_missing", params: { missing: ["snippet_verified"], reason: "INVALID_STATE" } },
    ]);
    expect(s.status).toBe("working");
    expect(s.activities.map((a) => [a.runId, a.phase])).toEqual([
      ["call_1", "completed"],
      ["call_2", "blocked"],
    ]);
    expect(s.activities[1]!.params).toEqual({ missing: ["snippet_verified"], reason: "INVALID_STATE" });
    expect(s.outcome).toEqual({ kind: "blocked", at: 1_400 });
    // a real failure counts as blocked for the motion state as well
    expect(run([{ type: "activity.failed", turnId: "t1", runId: "c", activity: "generic", sentence: "generic.failed", params: { reason: "PROVIDER_ERROR" } }]).outcome?.kind).toBe("blocked");
  });

  it("tracks real job stages and released assistant output before the final answer", () => {
    let s = run([{ type: "job.progress", turnId: "t1", jobId: "t1", stage: "model_request", percent: null }]);
    expect(s).toMatchObject({ status: "working", stage: "model_request" });
    s = applyUiEvent(s, { type: "assistant.message", turnId: "t1", text: "Saved." }, 2_000);
    expect(s).toMatchObject({ status: "streaming", pending: { turnId: "t1", text: "Saved.", cards: [] } });
    // a job stage while streaming keeps the streaming status
    s = applyUiEvent(s, { type: "job.progress", turnId: "t1", jobId: "t1", stage: "answer_streaming", percent: null }, 2_050);
    expect(s.status).toBe("streaming");
    s = applyUiEvent(s, { type: "ui.card", turnId: "t1", card: ui.cards[0]! }, 2_100);
    expect(s.pending?.cards).toEqual(ui.cards);
    // a card for another turn is ignored
    s = applyUiEvent(s, { type: "ui.card", turnId: "other", card: ui.cards[0]! }, 2_150);
    expect(s.pending?.cards).toHaveLength(1);
    s = applyUiEvent(s, { type: "ui.final", turnId: "t1", ui }, 3_000);
    expect(s.pending).toBeNull();
    expect(s.stage).toBeNull();
    expect(s.outcome).toEqual({ kind: "success", at: 3_000 });
    expect(s.messages.at(-1)).toMatchObject({ id: "a-t1", role: "assistant", content: "Done", ui });
    s = applyUiEvent(s, { type: "done", turnId: "t1" }, 3_100);
    expect(s).toMatchObject({ status: "idle", turnId: null, notice: null });
    // the activities of the finished turn stay visible until the next send
    expect(s.messages).toHaveLength(2);
  });

  it("maps credential cards and approvals to their dedicated slots", () => {
    const s = run([
      { type: "ui.card", turnId: "t1", card: { type: "credential_request", title: "Meta token", integration_id: "i1", connector_type: "meta", credential_kind: "access_token", label: "Meta token", help: "h", oauth_provider: null } },
      { type: "approval.required", turnId: "t1", approvalId: "call_9", action: "publish_config_version", summary: { changes: [{ summary: "add pixel", op: "add" }], recipients: [{ name: "Meta", type: "meta", purpose: "marketing", events: ["purchase"] }] }, expiresAt: "2026-09-04T10:00:00.000Z", sentence: "confirmation.required" },
    ]);
    expect(s.credential).toEqual({ component: "secure_credential", integration_id: "i1", connector_type: "meta", credential_kind: "access_token", label: "Meta token", help: "h", oauth_provider: null });
    expect(s.approval).toEqual({ approvalId: "call_9", action: "publish_config_version", summary: { changes: [{ summary: "add pixel", op: "add" }], recipients: [{ name: "Meta", type: "meta", purpose: "marketing", events: ["purchase"] }] }, expiresAt: "2026-09-04T10:00:00.000Z" });
    const oauth = applyUiEvent(EMPTY_CHAT, { type: "ui.card", turnId: "t1", card: { type: "credential_request", title: "x", integration_id: "i1", connector_type: "google_ads", credential_kind: "oauth_refresh_token", label: "x", help: "", oauth_provider: "google" } }, 1);
    expect(oauth.credential?.component).toBe("oauth");
  });

  it("records errors and a final answer with error status as blocked", () => {
    const s = run([{ type: "error", turnId: "t1", code: "TIMEOUT", message: "slow", retryable: true }]);
    expect(s.error).toEqual({ code: "TIMEOUT", message: "slow", retryable: true });
    expect(s.outcome?.kind).toBe("blocked");
    expect(run([{ type: "ui.final", turnId: "t1", ui: { ...ui, status: "error" } }]).outcome?.kind).toBe("blocked");
  });

  it("applies confirm-route event batches without ending the running turn", () => {
    const running = run([{ type: "activity.started", turnId: "t1", runId: "call_1", activity: "site_check", sentence: "site_check.started", params: {} }]);
    const s = applyUiEvents(
      running,
      [
        { type: "activity.started", turnId: "confirm:x", runId: "confirm_x", activity: "publish", sentence: "publish.started", params: {} },
        { type: "activity.completed", turnId: "confirm:x", runId: "confirm_x", activity: "publish", sentence: "publish.completed", params: {} },
        { type: "done", turnId: "confirm:x" },
      ],
      5_000,
    );
    expect(s.status).toBe("working");
    expect(s.activities.map((a) => [a.runId, a.phase])).toEqual([
      ["call_1", "started"],
      ["confirm_x", "completed"],
    ]);
  });
});
