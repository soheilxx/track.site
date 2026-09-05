import { Sparkles } from "lucide-react";
import { Button, Status, cn } from "@track-site/ui";
import { EventRowCompact, HEALTH_TONE, HealthBars, HealthExplanation, MetricTile, MiniFlow, ViewTitle, type DemoViewProps } from "../parts";
import { aiRecommendation, demoMetrics, healthParts, healthScore, latestEvent, recentEvents } from "../state";
import { plural } from "../text";

/** Overview: metrics, the explainable health score, the flow of the latest event, recent events and the one AI hint. */
export function OverviewView({ state, copy, dispatch, interactive, playback }: DemoViewProps) {
  const metrics = demoMetrics(state);
  const parts = healthParts(state);
  const { score, tone } = healthScore(parts);
  const rec = aiRecommendation(state);
  const latest = latestEvent(state);
  const recent = recentEvents(state, 5);
  return (
    // Container-query variants (`@2xl` = the demo frame is at least 42 rem wide): the layout follows the frame's width,
    // not the viewport's — see demo-frame.tsx. The metric strip spans the whole frame: inside the ~20 rem left column
    // four tiles were ~3 rem wide and the localized labels ("Geaccepteerd", "Bloqueados por consentimiento") were painted
    // under the next tile at every width. Below the strip: the health score | flow, stream and the AI hint.
    <div className="grid gap-4 @2xl:gap-5">
      <div className="grid grid-cols-3 gap-2 @2xl:grid-cols-4">
        <MetricTile label={copy.metrics.accepted} value={metrics.accepted} />
        <MetricTile label={copy.metrics.delivered} value={metrics.delivered} />
        <MetricTile label={copy.metrics.duplicates} value={metrics.duplicates} />
        <MetricTile label={copy.metrics.blocked} value={metrics.blocked} className="hidden @2xl:block" />
      </div>
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] @2xl:gap-5">
        <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 @xl:p-4">
          <ViewTitle
            aside={
              <Status tone={HEALTH_TONE[tone]} chip indicator="icon" live>
                {copy.destinations.health[tone]}
              </Status>
            }
          >
            {copy.health.title}
          </ViewTitle>
          <p className="mt-1 font-display text-3xl font-semibold text-ink tabular-nums">
            {score}
            <span className="ml-1 text-small font-normal text-ink-3">{copy.health.outOf}</span>
          </p>
          <HealthBars parts={parts} copy={copy} className="mt-3 hidden @2xl:block" />
          <HealthExplanation parts={parts} copy={copy} className="mt-3 hidden @2xl:block" />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <MiniFlow latest={latest} copy={copy} pulse={interactive && playback.advanced} className="hidden @2xl:block" />
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2">
            <ViewTitle>{copy.events.latest}</ViewTitle>
            <ol className="mt-1 divide-y divide-line">
              {recent.map((e, i) => (
                <EventRowCompact key={e.key} event={e} copy={copy} className={cn(i >= 3 && "hidden @2xl:flex")} />
              ))}
            </ol>
          </div>
          {/* `min-w-[10rem]` on the text: when text + button do not fit on one line the button wraps below the text instead of the text being squeezed under the button */}
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-violet-soft-2 bg-violet-soft px-3 py-2">
            <Sparkles className="size-4 shrink-0 text-violet" aria-hidden="true" />
            <p className="min-w-[10rem] flex-1 text-small text-ink">{rec.count > 0 ? plural(copy.ai.overviewHint, rec.count) : copy.ai.overviewDone}</p>
            <Button size="sm" variant="secondary" onClick={dispatch ? () => dispatch({ type: "view", view: "ai" }) : undefined}>
              {copy.ai.open}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
