"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@track-site/ui";
import { AssistantAmbient } from "@/components/app/shell/living-ai-core/assistant-ambient";
import { AssistantSetupBinding, useAssistant } from "./assistant-store";
import { WizardPanel } from "./wizard";

const STEPS = ["site", "business_type", "platform", "installation", "consent", "destinations", "event_plan", "test", "review", "publish", "health"];

/**
 * Setup page. The chat itself lives in the persistent Track AI panel of the shell (supplement §9)
 * and is bound to this site while the page is open; the page shows the rule-based step form with
 * the same typed tools, checks and drafts — the transparent expert path and the fallback when the
 * AI provider is unavailable. While the workspace is mounted the assistant's activities move it
 * (`use-workspace-moves.ts`): a site scan reveals the site step, integrations the destinations
 * step, the change proposal the diff. On a first run (no published configuration) Track AI starts
 * large and central in the `SetupStage` and docks back into the panel after the verified publish.
 */
export function SetupChat({ siteId, aiEnabled, locale, initialStep, firstRun = false }: { siteId: string; aiEnabled: boolean; locale: string; initialStep: string; /** the site has no published configuration yet (server-side fact); the per-site setup page leaves it off */ firstRun?: boolean }) {
  const t = useTranslations("chat");
  const ts = useTranslations("shell.pages.aiSetup");
  const assistant = useAssistant();
  const progress = Math.max(0, Math.round((STEPS.indexOf(initialStep) / (STEPS.length - 1)) * 100));
  // completed activities of the assistant re-read the setup state so the detected structure shows in the workspace
  const completed = assistant.siteId === siteId ? assistant.chat.activities.filter((a) => a.phase === "completed").length : 0;
  const openAssistant = () => {
    assistant.setOpen(true);
    requestAnimationFrame(() => assistant.focusComposer());
  };
  return (
    <>
      <AssistantSetupBinding siteId={siteId} firstRun={firstRun} />
      {firstRun ? <SetupStage siteId={siteId} onOpen={openAssistant} /> : null}
      <section aria-label={t("title")} className="card flex min-h-0 flex-col outline-none data-[revealed]:ring-2 data-[revealed]:ring-primary data-[revealed]:ring-offset-2 data-[revealed]:ring-offset-ground" data-testid="setup-workspace" data-focus-target="setup-workspace" tabIndex={-1}>
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
            <Button size="sm" variant="secondary" onClick={openAssistant} leadingIcon={<Sparkles className="size-4" aria-hidden="true" />}>
              {ts("openAssistant")}
            </Button>
          </div>
        </header>
        <WizardPanel siteId={siteId} locale={locale} aiEnabled={aiEnabled} refreshToken={completed} />
      </section>
    </>
  );
}

/**
 * First-run stage: the large, central Track AI presence of the onboarding (supplement §9 "Im
 * ersten Onboarding darf Track AI groß und zentral beginnen"). Its Living AI Core renders in
 * `onboarding` mode behind the intro and the starters, bound to the same state source as the
 * panel. Exactly one core animates at a time (one continuous ambient motion that condenses into
 * the panel): while the stage is live the panel's core renders static (`AssistantHost`); after
 * the verified publish (`chat.firstRun` cleared by the reducer) the stage's core stands still and
 * its layer fades and shrinks towards the panel — transform and opacity only, the stage keeps its
 * size, so nothing on the page shifts — while the panel's core takes over, and the copy says that
 * Track AI continues in the panel.
 */
function SetupStage({ siteId, onOpen }: { siteId: string; onOpen: () => void }) {
  const t = useTranslations("chat");
  const ts = useTranslations("shell.pages.aiSetup.stage");
  const { chat, send, setOpen } = useAssistant();
  // live once the store knows the site (binding applied) until the first run ended with the verified publish; docked afterwards
  const live = chat.guided && chat.firstRun;
  const docked = chat.guided && !chat.firstRun;
  // the answer arrives in the panel: a minimised docked panel, the drawer or the sheet is opened first
  const start = (message: string) => {
    setOpen(true);
    void send(message);
  };
  return (
    <section aria-labelledby="setup-stage-title" className="relative isolate flex min-h-[24rem] flex-col items-center justify-center overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface px-6 py-10 text-center sm:px-10" data-testid="setup-onboarding-stage" data-docked={docked ? "true" : "false"} data-site={siteId}>
      <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 -z-10 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none", docked && "translate-x-8 scale-95 opacity-0")} data-slot="stage-ambient">
        <AssistantAmbient mode="onboarding" active={live} />
      </div>
      <p className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] border border-violet-soft-2 bg-surface px-3 py-1 text-xs font-medium text-violet">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {ts("eyebrow")}
      </p>
      <h2 id="setup-stage-title" className="mt-4 max-w-xl text-2xl font-semibold text-ink">
        {docked ? ts("dockedTitle") : t("emptyTitle")}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-2">{docked ? ts("dockedText") : t("emptyText")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {docked ? null : (t.raw("starters") as string[]).map((s) => (
          <Button key={s} size="sm" variant="secondary" onClick={() => start(s)} disabled={chat.status !== "idle"} data-testid="setup-stage-starter">
            {s}
          </Button>
        ))}
        <Button size="sm" onClick={onOpen} leadingIcon={<Sparkles className="size-4" aria-hidden="true" />}>
          {ts("open")}
        </Button>
      </div>
    </section>
  );
}
