"use client";

import { Alert, Button, Status, VisuallyHidden, cn, toneDot } from "@track-site/ui";
import { platformFixture } from "../fixtures";
import { PlatformMark } from "../platform-mark";
import { HEALTH_TONE, MetricTile, ViewTitle, type DemoViewProps } from "../parts";
import { destinationStatus, destinationStatuses } from "../state";
import { plural } from "../text";

/** Destinations: clickable platforms with health, last successful delivery, modes and dedup key. */
export function DestinationsView({ state, copy, dispatch }: DemoViewProps) {
  const statuses = destinationStatuses(state);
  const selected = destinationStatus(state, state.platform);
  const fixture = platformFixture(state.platform);
  const c = copy.destinations;
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,12.5rem)_1fr] md:gap-4">
      <div role="group" aria-label={c.pick} className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {statuses.map((s) => {
          const f = platformFixture(s.id);
          const pressed = s.id === state.platform;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => dispatch({ type: "platform", platform: s.id })}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-small font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                pressed ? "border-primary bg-primary-soft text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <PlatformMark id={s.id} name={f.name} size="sm" />
              <span className="whitespace-nowrap">{f.name}</span>
              <span aria-hidden="true" className={cn("ml-auto size-2 shrink-0 rounded-full", toneDot[HEALTH_TONE[s.tone]])} />
              <VisuallyHidden>{c.health[s.tone]}</VisuallyHidden>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <PlatformMark id={fixture.id} name={fixture.name} />
          <ViewTitle>{fixture.name}</ViewTitle>
          <Status tone={HEALTH_TONE[selected.tone]} chip indicator="icon" className="ml-auto">
            {c.health[selected.tone]}
          </Status>
        </div>
        <dl className="mt-4 grid gap-x-4 gap-y-3 text-small sm:grid-cols-2">
          <Fact label={c.lastDelivery}>{selected.lastDelivery ? `${selected.lastDelivery.name} · ${selected.lastDelivery.time}` : c.none}</Fact>
          <Fact label={c.modes}>{c.browserServer}</Fact>
          <Fact label={c.dedupKey}>
            <span className="font-mono">{fixture.dedupKey}</span>
          </Fact>
          <Fact label={c.clickParam}>
            <span className="font-mono">{fixture.clickParam}</span>
          </Fact>
        </dl>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MetricTile label={c.counts.delivered} value={selected.delivered} />
          <MetricTile label={c.counts.held} value={selected.heldCurrency} />
          <MetricTile label={c.counts.blocked} value={selected.blocked} />
        </div>
        {selected.heldCurrency > 0 ? (
          <Alert tone="warn" className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">{plural(c.heldHint, selected.heldCurrency)}</span>
              <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "view", view: "ai" })}>
                {c.openAi}
              </Button>
            </div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro font-medium tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
