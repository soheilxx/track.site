import { describe, expect, it } from "vitest";
import { UI_STATE_PRIORITY, UiStateDebouncer, inputsFromChat, resolveUiState, type UiStateClock, type UiStateInputs } from "./assistant-ui-state";
import { EMPTY_CHAT, type ChatState } from "./chat-reducer";

const base: UiStateInputs = { error: false, blocked: false, approvalRequired: false, working: false, streaming: false, successAt: null, listening: false };

/** Deterministic clock: timers fire in order when the test advances the time. */
function fakeClock(): UiStateClock & { advance: (to: number) => void } {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
    advance: (to: number) => {
      for (;;) {
        const due = Array.from(timers.entries())
          .filter(([, t]) => t.at <= to)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = to;
    },
  };
}

describe("resolveUiState (priority error/blocked > approval_required > working > streaming > success > listening > idle)", () => {
  it("applies the fixed priority", () => {
    const all: UiStateInputs = { error: true, blocked: true, approvalRequired: true, working: true, streaming: true, successAt: 0, listening: true };
    expect(resolveUiState(all, 0)).toBe("blocked");
    expect(resolveUiState({ ...all, error: false, blocked: false }, 0)).toBe("approval_required");
    expect(resolveUiState({ ...all, error: false, blocked: false, approvalRequired: false }, 0)).toBe("working");
    expect(resolveUiState({ ...all, error: false, blocked: false, approvalRequired: false, working: false }, 0)).toBe("streaming");
    expect(resolveUiState({ ...base, successAt: 100, listening: true }, 500)).toBe("success");
    expect(resolveUiState({ ...base, successAt: 100, listening: true }, 1_000)).toBe("listening");
    expect(resolveUiState(base, 0)).toBe("idle");
    expect(UI_STATE_PRIORITY).toEqual(["blocked", "approval_required", "working", "streaming", "success", "listening", "idle"]);
  });

  it("holds success for the configured window only", () => {
    expect(resolveUiState({ ...base, successAt: 1_000 }, 1_899)).toBe("success");
    expect(resolveUiState({ ...base, successAt: 1_000 }, 1_900)).toBe("idle");
    expect(resolveUiState({ ...base, successAt: 1_000 }, 1_500, 400)).toBe("idle");
  });
});

describe("inputsFromChat (facts trace back to contract events or real UI interactions)", () => {
  const chat = (patch: Partial<ChatState>): ChatState => ({ ...EMPTY_CHAT, ...patch });
  it("derives working, streaming, blocked, approval, success and listening", () => {
    expect(inputsFromChat(chat({ status: "sending" })).working).toBe(true);
    expect(inputsFromChat(chat({ status: "working", activities: [{ runId: "r", activity: "site_check", sentence: "site_check.started", phase: "started", params: {}, at: 0 }] })).working).toBe(true);
    expect(inputsFromChat(chat({ status: "working", stage: "model_request" })).working).toBe(true);
    expect(inputsFromChat(chat({ status: "streaming", stage: "answer_streaming" }))).toMatchObject({ working: false, streaming: true });
    expect(inputsFromChat(chat({ status: "idle", stage: null, activities: [{ runId: "r", activity: "site_check", sentence: "site_check.started", phase: "started", params: {}, at: 0 }] })).working).toBe(false);
    expect(inputsFromChat(chat({ status: "working", activities: [{ runId: "r", activity: "publish", sentence: "generic.blocked", phase: "blocked", params: {}, at: 0 }] })).blocked).toBe(true);
    expect(inputsFromChat(chat({ outcome: { kind: "blocked", at: 1 } })).blocked).toBe(true);
    expect(inputsFromChat(chat({ error: { code: "TIMEOUT", message: "", retryable: true } })).error).toBe(true);
    expect(inputsFromChat(chat({ approval: { approvalId: "a", action: "publish_config_version", summary: { changes: [], recipients: [] }, expiresAt: "x" } })).approvalRequired).toBe(true);
    expect(inputsFromChat(chat({ outcome: { kind: "success", at: 42 } })).successAt).toBe(42);
    expect(inputsFromChat(chat({ composerFocused: true })).listening).toBe(true);
    expect(inputsFromChat(chat({ draft: "  hello" })).listening).toBe(true);
    expect(inputsFromChat(chat({ draft: "   " })).listening).toBe(false);
  });
});

describe("UiStateDebouncer (400–700 ms hysteresis, injectable clock)", () => {
  it("holds every state for the minimum time and applies only the latest target", () => {
    const clock = fakeClock();
    const d = new UiStateDebouncer(clock, 500);
    const seen: string[] = [];
    d.subscribe(() => seen.push(d.current));
    expect(d.current).toBe("idle");
    // rapid backend events within the hold window never flicker: only the last target after the hold applies
    d.push("working");
    clock.advance(100);
    d.push("streaming");
    clock.advance(200);
    d.push("working");
    expect(d.current).toBe("idle");
    clock.advance(499);
    expect(d.current).toBe("idle");
    clock.advance(500);
    expect(d.current).toBe("working");
    expect(d.currentSince).toBe(500);
    expect(seen).toEqual(["working"]);
    // once the hold elapsed a new target applies immediately
    clock.advance(1_200);
    d.push("blocked");
    expect(d.current).toBe("blocked");
    expect(d.currentSince).toBe(1_200);
    // pushing the current state cancels a pending switch
    d.push("idle");
    d.push("blocked");
    clock.advance(2_000);
    expect(d.current).toBe("blocked");
    expect(seen).toEqual(["working", "blocked"]);
    d.dispose();
    d.push("idle");
    clock.advance(3_000);
    expect(d.current).toBe("blocked");
  });

  it("is deterministic for the same event timeline", () => {
    const timeline: Array<[number, Parameters<UiStateDebouncer["push"]>[0]]> = [
      [0, "working"],
      [50, "streaming"],
      [120, "working"],
      [900, "success"],
      [950, "idle"],
      [2_000, "listening"],
    ];
    const runOnce = () => {
      const clock = fakeClock();
      const d = new UiStateDebouncer(clock, 500);
      const trace: Array<[number, string]> = [];
      d.subscribe(() => trace.push([clock.now(), d.current]));
      for (const [at, target] of timeline) {
        clock.advance(at);
        d.push(target);
      }
      clock.advance(3_000);
      return trace;
    };
    expect(runOnce()).toEqual(runOnce());
    expect(runOnce()).toEqual([
      [500, "working"],
      [1_000, "idle"],
      [2_000, "listening"],
    ]);
  });
});
