"use client";

import { useAssistantUiState } from "@/components/chat/assistant-ui-state";
import { LivingAICore } from "./living-ai-core";
import { useAiMotionPreference } from "./preference";
import type { CoreMode, CoreState } from "./types";

/**
 * Default content of the assistant panel's ambient slot: binds the Living AI Core to the panel's
 * one motion state source, `useAssistantUiState()` (`components/chat/assistant-ui-state.ts`) — the
 * same hook whose value the host writes to `data-ai-state` on the panel container — and to the
 * per-user motion preference on `<html data-ai-motion>`. The source derives the state from the
 * assistant store's real facts (status, approval, error, tool runs, verified outcome, draft,
 * composer focus) with the fixed priority, a 500 ms minimum hold per state and the 900 ms success
 * hold; the core adds no hold of its own, so `data-ai-state` and the core's `data-state` never
 * diverge. Must render inside `<AssistantProvider>`; a host that needs another state source passes
 * its own `<LivingAICore …/>` as the panel's `ambient` prop instead.
 *
 * `active={false}` renders the core on the static tier whatever the preference says (no frame
 * loop, no observers, no WebGL context): the shell shows exactly one continuous ambient motion
 * (supplement §9), so while the first-run stage animates its onboarding core the panel's core
 * stands still, and at the dock the roles swap.
 */
export function AssistantAmbient({ mode = "docked", active = true }: { mode?: CoreMode; active?: boolean }) {
  // the source's vocabulary is the core's (typed assignment, so a diverging union fails typecheck here)
  const state: CoreState = useAssistantUiState().state;
  const preference = useAiMotionPreference();
  return <LivingAICore state={state} motion={active ? preference : "off"} mode={mode} />;
}
