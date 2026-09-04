"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@track-site/ui";
import { AssistantSiteBinding, useAssistant } from "./assistant-store";
import { WizardPanel } from "./wizard";

const STEPS = ["site", "business_type", "platform", "installation", "consent", "destinations", "event_plan", "test", "review", "publish", "health"];

/**
 * Setup page (first-run large mode). The chat itself lives in the persistent Track AI panel of the
 * shell (supplement §9) and is bound to this site while the page is open; the page shows the
 * rule-based step form with the same typed tools, checks and drafts — the transparent expert path
 * and the fallback when the AI provider is unavailable.
 */
export function SetupChat({ siteId, aiEnabled, locale, initialStep }: { siteId: string; aiEnabled: boolean; locale: string; initialStep: string }) {
  const t = useTranslations("chat");
  const ts = useTranslations("shell.pages.aiSetup");
  const assistant = useAssistant();
  const progress = Math.max(0, Math.round((STEPS.indexOf(initialStep) / (STEPS.length - 1)) * 100));
  return (
    <>
      <AssistantSiteBinding siteId={siteId} />
      <section aria-label={t("title")} className="card flex min-h-0 flex-col" data-testid="setup-workspace">
        <header className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control-sm)] bg-violet-soft text-violet" aria-hidden="true">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{t("title")}</p>
              <p className="text-xs text-ink-3">
                {ts("step", { step: initialStep })} · {ts("progress", { pct: progress })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-surface-2 sm:block" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={ts("progress", { pct: progress })}>
              <div className="h-full w-full rounded-full bg-primary" style={{ transform: `translateX(${progress - 100}%)` }} />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                assistant.setOpen(true);
                requestAnimationFrame(() => assistant.focusComposer());
              }}
              leadingIcon={<Sparkles className="size-4" aria-hidden="true" />}
            >
              {ts("openAssistant")}
            </Button>
          </div>
        </header>
        <WizardPanel siteId={siteId} locale={locale} aiEnabled={aiEnabled} />
      </section>
    </>
  );
}
