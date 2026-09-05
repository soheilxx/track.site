import { describe, expect, it } from "vitest";
import { resolveCoreState } from "./state-machine";
import { deriveCoreSignals, hasFailedToolRun, isBlocked, isSuccessActive, isTurnActive, isWorkingStatus, SUCCESS_HOLD_MS, verifiedSuccessAt, type CoreActivityLike, type CoreChatLike, type CoreChatStatus } from "./use-core-state";

const chat = (over: Partial<CoreChatLike> = {}): CoreChatLike => ({ status: "idle", approval: null, error: null, draft: "", composerFocused: false, activities: [], outcome: null, ...over });

const started: CoreActivityLike = { phase: "started", params: {} };
const completed: CoreActivityLike = { phase: "completed", params: {} };
const failed: CoreActivityLike = { phase: "failed", params: { reason: "PROVIDER_ERROR" } };
const blockedMissing: CoreActivityLike = { phase: "blocked", params: { reason: "INVALID_STATE" } };
const confirmation: CoreActivityLike = { phase: "blocked", params: { reason: "CONFIRMATION_REQUIRED" } };
const approval = { approvalId: "a1", action: "publish_config_version" };
const error = { code: "TIMEOUT", message: "", retryable: true };

const state = (c: CoreChatLike, focused = false, success = false) => resolveCoreState(deriveCoreSignals(c, focused, success));

describe("deriveCoreSignals (store vocabulary → core states)", () => {
  it("maps every chat status of the store", () => {
    const expected: Record<CoreChatStatus, string> = { idle: "idle", sending: "working", working: "working", streaming: "streaming", reconnecting: "working" };
    for (const [status, core] of Object.entries(expected) as [CoreChatStatus, string][]) expect(state(chat({ status }))).toBe(core);
    expect(isWorkingStatus("sending")).toBe(true);
    expect(isWorkingStatus("working")).toBe(true);
    expect(isWorkingStatus("reconnecting")).toBe(true);
    expect(isWorkingStatus("streaming")).toBe(false);
    expect(isWorkingStatus("idle")).toBe(false);
  });

  it("maps the remaining real facts", () => {
    expect(state(chat({ error }))).toBe("blocked");
    expect(state(chat({ approval }))).toBe("approval_required");
    expect(state(chat(), true)).toBe("listening");
    expect(state(chat({ composerFocused: true }))).toBe("listening");
    expect(state(chat({ draft: "connect meta" }))).toBe("listening");
    expect(state(chat(), false, true)).toBe("success");
  });

  it("treats a failed or blocked tool run as blocked — while the turn runs and afterwards, never as success", () => {
    const failedRun = chat({ activities: [completed, failed] });
    expect(hasFailedToolRun(failedRun)).toBe(true);
    expect(hasFailedToolRun(chat({ activities: [completed, started] }))).toBe(false);
    expect(hasFailedToolRun(chat({ activities: [blockedMissing] }))).toBe(true);
    expect(state(chat({ status: "working", activities: [started, failed] }))).toBe("blocked");
    expect(state(failedRun)).toBe("blocked");
    expect(state(failedRun, false, true)).toBe("blocked");
    expect(verifiedSuccessAt(chat({ activities: [failed], outcome: { kind: "success", at: 1_000 } }))).toBeNull();
  });

  it("treats a verified blocked outcome of the final answer as blocked", () => {
    expect(isBlocked(chat({ outcome: { kind: "blocked", at: 1_000 } }))).toBe(true);
    expect(state(chat({ outcome: { kind: "blocked", at: 1_000 } }))).toBe("blocked");
    expect(isBlocked(chat({ outcome: { kind: "success", at: 1_000 } }))).toBe(false);
  });

  it("shows a confirmation request as approval_required, never as blocked", () => {
    // the agent reports a confirmation-gated tool result as `activity.blocked` (CONFIRMATION_REQUIRED) plus `approval.required`;
    // the reducer marks the outcome blocked — the core must show the amber outline of the approval, not the red edge
    const pending = chat({ status: "working", approval, activities: [confirmation], outcome: { kind: "blocked", at: 1_000 } });
    expect(hasFailedToolRun(pending)).toBe(false);
    expect(isBlocked(pending)).toBe(false);
    expect(state(pending)).toBe("approval_required");
    // an agent-level approval without a tool block, on top of an earlier blocked outcome, still shows the approval
    expect(state(chat({ approval, outcome: { kind: "blocked", at: 1_000 } }))).toBe("approval_required");
    // a declined confirmation leaves the turn at rest instead of pretending an error
    expect(state(chat({ activities: [confirmation], outcome: { kind: "blocked", at: 1_000 } }))).toBe("idle");
    // a real failure next to a confirmation is still blocked
    expect(state(chat({ approval, activities: [confirmation, failed] }))).toBe("blocked");
  });

  it("does not treat whitespace as a started input", () => {
    expect(state(chat({ draft: "   " }))).toBe("idle");
  });

  it("resolves competing facts by priority", () => {
    expect(state(chat({ status: "streaming", approval }))).toBe("approval_required");
    expect(state(chat({ status: "working", error }))).toBe("blocked");
    expect(state(chat({ status: "reconnecting", error }))).toBe("blocked");
    expect(state(chat({ status: "sending" }), true)).toBe("working");
    expect(state(chat({ status: "streaming" }), true, true)).toBe("streaming");
    expect(state(chat(), true, true)).toBe("success");
  });
});

describe("verified success with an injected clock", () => {
  const success = (over: Partial<CoreChatLike> = {}) => chat({ outcome: { kind: "success", at: 10_000 }, ...over });

  it("holds the success for the wave duration from the outcome's timestamp, only at rest", () => {
    expect(SUCCESS_HOLD_MS).toBeGreaterThanOrEqual(600);
    expect(verifiedSuccessAt(success())).toBe(10_000);
    expect(isSuccessActive(success(), 10_000)).toBe(true);
    expect(isSuccessActive(success(), 10_000 + SUCCESS_HOLD_MS - 1)).toBe(true);
    expect(isSuccessActive(success(), 10_000 + SUCCESS_HOLD_MS)).toBe(false);
    expect(isSuccessActive(success(), 10_000 + 200, 200)).toBe(false);
    // `ui.final` arrived but the server has not sent `done` yet: streaming/working keep priority, the hold starts once idle
    expect(verifiedSuccessAt(success({ status: "streaming" }))).toBeNull();
    expect(verifiedSuccessAt(success({ status: "working" }))).toBeNull();
  });

  it("never celebrates over an error, a failed tool run or a blocked outcome", () => {
    expect(verifiedSuccessAt(success({ error }))).toBeNull();
    expect(verifiedSuccessAt(success({ activities: [failed] }))).toBeNull();
    expect(verifiedSuccessAt(chat({ outcome: { kind: "blocked", at: 10_000 } }))).toBeNull();
    expect(verifiedSuccessAt(chat())).toBeNull();
    // a confirmation block of the turn followed by a verified final answer is a success
    expect(verifiedSuccessAt(success({ activities: [confirmation, completed] }))).toBe(10_000);
  });

  it("knows which statuses belong to an active turn", () => {
    for (const status of ["sending", "working", "streaming", "reconnecting"] as const) expect(isTurnActive(status)).toBe(true);
    expect(isTurnActive("idle")).toBe(false);
  });
});
