"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAssistant } from "./assistant-store";
import type { ChatState } from "./chat-reducer";

/**
 * Motion-relevant UI state of Track AI (supplement §9 "Ereignisgesteuerte Zustandslogik"). Derived
 * deterministically from the chat state that the allow-listed events produce — never from model
 * internals — with the fixed priority error/blocked > approval_required > working > streaming >
 * success > listening > idle, a minimum hold of 400–700 ms per state (hysteresis, so rapid backend
 * events never flicker) and an injectable clock so tests are exact. The Living AI Core consumes
 * `useAssistantUiState()`; the sentences in the panel remain the authoritative status text.
 */
export type AssistantUiState = "idle" | "listening" | "working" | "streaming" | "approval_required" | "success" | "blocked";

export const UI_STATE_PRIORITY: readonly AssistantUiState[] = ["blocked", "approval_required", "working", "streaming", "success", "listening", "idle"];

export interface UiStateInputs {
  error: boolean;
  blocked: boolean;
  approvalRequired: boolean;
  working: boolean;
  streaming: boolean;
  /** timestamp of the last server-verified success (ui.final / verified activity.completed) */
  successAt: number | null;
  listening: boolean;
}

export const DEFAULT_MIN_HOLD_MS = 500;
export const DEFAULT_SUCCESS_HOLD_MS = 900;

export function resolveUiState(inputs: UiStateInputs, now: number, successHoldMs = DEFAULT_SUCCESS_HOLD_MS): AssistantUiState {
  if (inputs.error || inputs.blocked) return "blocked";
  if (inputs.approvalRequired) return "approval_required";
  if (inputs.working) return "working";
  if (inputs.streaming) return "streaming";
  if (inputs.successAt !== null && now - inputs.successAt < successHoldMs) return "success";
  if (inputs.listening) return "listening";
  return "idle";
}

/** Reads the motion-relevant facts from the chat state; every fact traces back to a contract event or a real UI interaction. */
export function inputsFromChat(chat: ChatState): UiStateInputs {
  const running = chat.status !== "idle";
  // a tool run held for a confirmation (`CONFIRMATION_REQUIRED`) is part of the approval flow, not a failure:
  // the approval card is the authoritative status and the state must never show the error edge for it
  const failedRun = chat.activities.some((a) => (a.phase === "blocked" || a.phase === "failed") && a.params.reason !== "CONFIRMATION_REQUIRED");
  const confirmationHold = chat.activities.some((a) => a.phase === "blocked" && a.params.reason === "CONFIRMATION_REQUIRED");
  return {
    error: chat.error !== null,
    // a verified blocked outcome counts only while no approval is pending and it did not stem from a confirmation hold
    blocked: failedRun || (chat.outcome?.kind === "blocked" && chat.approval === null && !confirmationHold),
    approvalRequired: chat.approval !== null,
    // the store enters `working` only from real events (activity.started, job.progress, a resumed turn); `sending` and
    // `reconnecting` are the request itself in flight
    working: chat.status === "sending" || chat.status === "working" || chat.status === "reconnecting",
    streaming: running && chat.status === "streaming",
    // a success is celebrated only once the turn is at rest and nothing in it failed
    successAt: !running && chat.outcome?.kind === "success" && chat.error === null && !failedRun ? chat.outcome.at : null,
    listening: chat.composerFocused || chat.draft.trim().length > 0,
  };
}

export interface UiStateClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: UiStateClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Hysteresis: a state is held for at least `minHoldMs` before the next target applies; rapid target
 * changes replace the scheduled switch, so only the latest target after the hold wins.
 */
export class UiStateDebouncer {
  private state: AssistantUiState = "idle";
  private since: number;
  private target: AssistantUiState = "idle";
  private handle: unknown = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly clock: UiStateClock,
    private readonly minHoldMs = DEFAULT_MIN_HOLD_MS,
  ) {
    this.since = clock.now();
  }

  get current(): AssistantUiState {
    return this.state;
  }

  get currentSince(): number {
    return this.since;
  }

  push(target: AssistantUiState): void {
    // a disposed debouncer (unmounted hook) never changes state again, so a late push cannot notify stale listeners
    if (this.disposed) return;
    this.target = target;
    if (target === this.state) {
      this.cancel();
      return;
    }
    const held = this.clock.now() - this.since;
    if (held >= this.minHoldMs) {
      this.apply(target);
      return;
    }
    this.cancel();
    this.handle = this.clock.setTimeout(() => {
      this.handle = null;
      if (this.target !== this.state) this.apply(this.target);
    }, this.minHoldMs - held);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.listeners.clear();
  }

  private apply(next: AssistantUiState): void {
    this.state = next;
    this.since = this.clock.now();
    for (const l of this.listeners) l();
  }

  private cancel(): void {
    if (this.handle !== null) {
      this.clock.clearTimeout(this.handle);
      this.handle = null;
    }
  }
}

export interface UseAssistantUiStateOptions {
  clock?: UiStateClock;
  minHoldMs?: number;
  successHoldMs?: number;
}

/** Typed hook for the Living AI Core (ambient slot): the current motion state and when it began. */
export function useAssistantUiState(options: UseAssistantUiStateOptions = {}): { state: AssistantUiState; since: number } {
  const { chat } = useAssistant();
  const clock = options.clock ?? systemClock;
  const minHoldMs = options.minHoldMs ?? DEFAULT_MIN_HOLD_MS;
  const successHoldMs = options.successHoldMs ?? DEFAULT_SUCCESS_HOLD_MS;
  const debouncer = useMemo(() => new UiStateDebouncer(clock, minHoldMs), [clock, minHoldMs]);
  const state = useSyncExternalStore(
    (listener) => debouncer.subscribe(listener),
    () => debouncer.current,
    () => "idle" as const,
  );
  // the facts are re-derived whenever the store changes; a push with an unchanged target is a no-op in the debouncer,
  // so per-keystroke store updates never restart or flicker anything
  const inputs = useMemo(() => inputsFromChat(chat), [chat]);

  useEffect(() => {
    const evaluate = () => debouncer.push(resolveUiState(inputs, clock.now(), successHoldMs));
    evaluate();
    // success is transient: re-evaluate once its hold expires so the state settles to listening/idle
    const remaining = inputs.successAt === null ? -1 : inputs.successAt + successHoldMs - clock.now();
    const handle = remaining > 0 ? clock.setTimeout(evaluate, remaining + 1) : null;
    return () => {
      if (handle !== null) clock.clearTimeout(handle);
    };
  }, [inputs, debouncer, clock, successHoldMs]);

  useEffect(() => () => debouncer.dispose(), [debouncer]);

  return { state, since: debouncer.currentSince };
}
