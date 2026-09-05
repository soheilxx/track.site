"use client";

import { useAssistant } from "@/components/chat/assistant-store";
import { LivingAICore } from "./living-ai-core";
import { useAiMotionPreference } from "./preference";
import type { CoreMode } from "./types";
import { useCoreState } from "./use-core-state";

/**
 * Default content of the assistant panel's ambient slot: binds the Living AI Core to the assistant
 * store (chat status, approval, error, draft, composer focus) and to the per-user motion preference
 * on `<html data-ai-motion>`. Must render inside `<AssistantProvider>`; a host that needs another
 * state source passes its own `<LivingAICore …/>` as the panel's `ambient` prop instead.
 */
export function AssistantAmbient({ mode = "docked" }: { mode?: CoreMode }) {
  const { chat, composerRef } = useAssistant();
  const state = useCoreState(chat, composerRef);
  const motion = useAiMotionPreference();
  return <LivingAICore state={state} motion={motion} mode={mode} />;
}
