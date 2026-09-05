"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconButton } from "@track-site/ui";
import type { ActionState } from "@/server/actions/organization";
import { updateAiMotionAction } from "@/server/actions/settings";
import { setAiMotionAttribute, useAiMotionPreference } from "./preference";
import type { CoreMotion } from "./types";

const initial: ActionState = { ok: false, error: null };

/**
 * Directly reachable pause / turn-on control for the continuous ambient motion (supplement §9
 * "Kontrolle, Barrierefreiheit"). One toggle button in the panel header: pausing stores `off`,
 * turning on stores `system` (the fine-grained choice lives in Settings → AI motion). The value is
 * applied optimistically to `<html data-ai-motion>` — the core reacts at once — and persisted per
 * user through the existing settings action; a failed save reverts and is announced. The state is
 * carried by the accessible name (pause / turn on) and the icon — not by `aria-pressed`, whose
 * pattern requires a constant label (WAI-ARIA APG button pattern).
 */
export function AiMotionControl() {
  const t = useTranslations("shell.assistant.motion");
  const router = useRouter();
  const current = useAiMotionPreference();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const paused = current === "off";
  const next: CoreMotion = paused ? "system" : "off";

  const onClick = () => {
    const previous = current;
    setAiMotionAttribute(next);
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("aiMotion", next);
      let result: ActionState;
      try {
        result = await updateAiMotionAction(initial, formData);
      } catch {
        result = { ok: false, error: "generic" };
      }
      if (!result.ok) {
        setAiMotionAttribute(previous);
        setMessage(t("error"));
        return;
      }
      setMessage(next === "off" ? t("paused") : t("resumed"));
      router.refresh();
    });
  };

  return (
    <>
      <IconButton label={paused ? t("resume") : t("pause")} onClick={onClick} loading={pending} loadingLabel={t("saving")} data-testid="assistant-motion-toggle">
        {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
      </IconButton>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}
