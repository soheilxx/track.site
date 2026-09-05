"use client";

import { useEffect, useState, type RefObject } from "react";
import { resolveCoreState, type CoreSignals } from "./state-machine";
import type { CoreState } from "./types";

/**
 * Derives the Living AI Core state from real, auditable UI/backend facts of the assistant store
 * (`ChatState` in `components/chat/chat-reducer.ts`, produced only by the allow-listed contract
 * events) — never from model internals, token counts or invented progress:
 *  - `blocked`           an error of the turn (`error` event, failed request, lost stream), a typed
 *                        tool run of the turn that ended in `activity.failed` / `activity.blocked`
 *                        (a block that only asks for a confirmation is an approval, see below), or a
 *                        verified blocked outcome of the final answer while no approval is pending;
 *  - `approval_required` a pending approval card (`approval.required`);
 *  - `working`           the request is in flight (`sending`), typed tools or job stages run
 *                        (`working`: `activity.started`, `job.progress`) or the same turn is being
 *                        resumed after a dropped connection (`reconnecting`);
 *  - `streaming`         released assistant output is being transferred (`assistant.message`);
 *  - `success`           the verified outcome of the turn or of a confirmed action is a success
 *                        (`ui.final` without error) and the turn is at rest (`idle`), held for the
 *                        wave duration from the outcome's timestamp; never over an error or a failed
 *                        tool run;
 *  - `listening`         focus in the composer or a deliberately started draft (no per-keystroke change).
 * Competing facts resolve by the fixed priority in `resolveCoreState`.
 */

/** Chat statuses of the assistant store (`ChatStatus` in `components/chat/types.ts`), mirrored so the core stays structurally decoupled. */
export type CoreChatStatus = "idle" | "sending" | "working" | "streaming" | "reconnecting";

/** Latest phase of an activity bound to a real tool run (`ActivityView.phase`). */
export type CoreActivityPhase = "started" | "completed" | "blocked" | "failed";

export interface CoreActivityLike {
  phase: CoreActivityPhase;
  /** safe parameters of the sentence; `reason` is a server-side reason code */
  params?: { reason?: string };
}

/** Last verified outcome of a turn or confirmation (`ChatState.outcome`); `at` is the store's wall-clock timestamp. */
export type CoreOutcome = { kind: "success" | "blocked"; at: number } | null;

export interface CoreChatLike {
  status: CoreChatStatus;
  approval: unknown | null;
  error: unknown | null;
  draft: string;
  /** composer focus reported by the store (a deliberate interaction, not a keystroke) */
  composerFocused: boolean;
  /** activities of the current/last turn, latest phase per run id */
  activities: readonly CoreActivityLike[];
  outcome: CoreOutcome;
}

/** How long the one-shot success is held (≥ the 600–900 ms wave). */
export const SUCCESS_HOLD_MS = 900;

/** A tool result that only asks for a confirmation is an approval, not a failure — the approval card is the authoritative status. */
const CONFIRMATION_REASON = "CONFIRMATION_REQUIRED";

export function isTurnActive(status: CoreChatStatus): boolean {
  return status !== "idle";
}

/** Statuses in which typed tools, job stages or the request itself are running (no released output yet). */
export function isWorkingStatus(status: CoreChatStatus): boolean {
  return status === "sending" || status === "working" || status === "reconnecting";
}

/** A typed tool run of the turn ended in `activity.failed` / `activity.blocked` (confirmation requests excluded). */
export function hasFailedToolRun(chat: CoreChatLike): boolean {
  return chat.activities.some((a) => (a.phase === "failed" || a.phase === "blocked") && a.params?.reason !== CONFIRMATION_REASON);
}

/** A tool run of the turn was held for a confirmation (`activity.blocked` with `CONFIRMATION_REQUIRED`). */
export function hasConfirmationBlock(chat: CoreChatLike): boolean {
  return chat.activities.some((a) => a.phase === "blocked" && a.params?.reason === CONFIRMATION_REASON);
}

/**
 * Blocked = a chat error, a failed tool run, or a verified blocked outcome of the final answer. A
 * blocked outcome that stems from a confirmation request (a pending approval or a confirmation block
 * of the turn) is not an error: the approval state has to show the amber outline, never the red edge.
 */
export function isBlocked(chat: CoreChatLike): boolean {
  if (chat.error != null || hasFailedToolRun(chat)) return true;
  return chat.outcome?.kind === "blocked" && chat.approval == null && !hasConfirmationBlock(chat);
}

/** Timestamp of the verified success the core may celebrate: turn at rest, success outcome, no error, no failed tool run; otherwise null. */
export function verifiedSuccessAt(chat: CoreChatLike): number | null {
  if (chat.status !== "idle" || chat.outcome?.kind !== "success") return null;
  if (chat.error != null || hasFailedToolRun(chat)) return null;
  return chat.outcome.at;
}

/** Whether the verified success is still inside its hold at `now` (same clock as `outcome.at`). */
export function isSuccessActive(chat: CoreChatLike, now: number, holdMs = SUCCESS_HOLD_MS): boolean {
  const at = verifiedSuccessAt(chat);
  if (at === null) return false;
  const age = now - at;
  return age >= 0 && age < holdMs;
}

export function deriveCoreSignals(chat: CoreChatLike, composerFocused: boolean, successActive: boolean): CoreSignals {
  return {
    blocked: isBlocked(chat),
    approvalRequired: chat.approval != null,
    working: isWorkingStatus(chat.status),
    streaming: chat.status === "streaming",
    success: successActive,
    listening: composerFocused || chat.composerFocused || chat.draft.trim().length > 0,
  };
}

export interface UseCoreStateOptions {
  /** Wall clock compared with `outcome.at` (defaults to `Date.now`); injectable for deterministic tests. */
  now?: () => number;
  /** Hold of the one-shot success; defaults to `SUCCESS_HOLD_MS`. */
  successHoldMs?: number;
}

interface SuccessWave {
  /** `outcome.at` of the verified success being held */
  at: number;
  active: boolean;
}

export function useCoreState(chat: CoreChatLike, composerRef: RefObject<HTMLElement | null>, options: UseCoreStateOptions = {}): CoreState {
  const now = options.now ?? Date.now;
  const holdMs = options.successHoldMs ?? SUCCESS_HOLD_MS;
  const [focused, setFocused] = useState(false);
  const [wave, setWave] = useState<SuccessWave | null>(null);

  // a *new* verified outcome starts the one-shot wave (React's "adjust state on prop change" pattern);
  // the outcome timestamp identifies it, so the same success never waves twice, an expired one never
  // restarts, and a stale outcome of another site (after a site switch) never waves at all
  const successAt = verifiedSuccessAt(chat);
  if (successAt !== null && (wave === null || wave.at !== successAt) && isSuccessActive(chat, now(), holdMs)) {
    setWave({ at: successAt, active: true });
  }

  useEffect(() => {
    if (!wave?.active) return;
    const at = wave.at;
    const timer = setTimeout(
      () => setWave((current) => (current && current.at === at ? { at, active: false } : current)),
      Math.max(0, at + holdMs - now()),
    );
    return () => clearTimeout(timer);
  }, [wave, holdMs, now]);

  useEffect(() => {
    const isComposer = (target: EventTarget | null) => composerRef.current !== null && composerRef.current === target;
    const onFocusIn = (event: FocusEvent) => {
      if (isComposer(event.target)) setFocused(true);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (isComposer(event.target)) setFocused(false);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [composerRef]);

  const successActive = wave !== null && wave.active && wave.at === successAt;
  return resolveCoreState(deriveCoreSignals(chat, focused, successActive));
}
