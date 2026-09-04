"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId } from "react";
import { AI_MOTION_VALUES, type AiMotion } from "@track-site/db/schema";
import { Alert, Button, Radio } from "@track-site/ui";
import type { ActionState } from "@/server/actions/organization";
import { updateAiMotionAction } from "@/server/actions/settings";

const initial: ActionState = { ok: false, error: null };

/**
 * Accessible per-user "AI motion" preference (supplement §9): system default / full / reduced / off.
 * A native radio group inside a fieldset with a legend; the value is persisted through a server action
 * and applied as `data-ai-motion` on the dashboard root, which the Track AI panel reads.
 */
export function AiMotionForm({ value }: { value: AiMotion }) {
  const t = useTranslations("app.settings.aiMotion");
  const router = useRouter();
  const groupId = useId();
  const [state, action, pending] = useActionState(updateAiMotionAction, initial);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="space-y-3" data-testid="ai-motion-form">
      <p className="text-sm text-ink-3">{t("intro")}</p>
      {state.ok ? <Alert tone="ok">{t("saved")}</Alert> : null}
      {state.error ? <Alert tone="bad">{t("error")}</Alert> : null}
      <fieldset disabled={pending} className="min-w-0">
        <legend className="text-sm font-medium text-ink">{t("legend")}</legend>
        <div className="mt-1 divide-y divide-line">
          {AI_MOTION_VALUES.map((option) => (
            <Radio
              key={option}
              id={`${groupId}-${option}`}
              name="aiMotion"
              value={option}
              defaultChecked={value === option}
              label={t(`options.${option}.label`)}
              description={t(`options.${option}.description`)}
            />
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="sm" loading={pending} loadingLabel={t("saving")}>
        {t("save")}
      </Button>
    </form>
  );
}
