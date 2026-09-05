"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@track-site/ui";
import { platformFixture } from "../fixtures";
import { ConsentStatus, OriginBadge, OutcomeStatus, ViewTitle, type DemoViewProps } from "../parts";
import { recentEvents, type DemoEventRecord } from "../state";
import { plural } from "../text";

/** Live Events: the stream with origin, dedup marker, consent state and the block/deliver reason per row. */
export function LiveEventsView({ state, copy, dispatch, interactive, playback }: DemoViewProps) {
  const baseId = useId();
  const rows = recentEvents(state, 8);
  const note = playback.reducedMotion ? copy.controls.reducedMotion : playback.paused ? copy.controls.paused : copy.controls.complete;
  return (
    <div>
      <ViewTitle aside={<p className="text-micro text-ink-3">{note}</p>}>{copy.events.title}</ViewTitle>
      <ol className="mt-2 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {rows.map((e, i) => {
          const open = state.expanded === e.key;
          const detailId = `${baseId}-${e.key}`;
          return (
            <li key={e.key} className={cn(i >= 4 && "hidden @2xl:block", i === 0 && interactive && playback.advanced && "motion-safe:starting:translate-y-1 motion-safe:starting:opacity-0 transition-[opacity,transform] duration-[var(--motion-slow)] ease-flow")}>
              <button type="button" aria-expanded={open} aria-controls={open ? detailId : undefined} onClick={() => dispatch({ type: "expand", key: open ? null : e.key })} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-small transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                <span className="hidden w-16 shrink-0 font-mono text-micro text-ink-3 @xl:inline">{e.time}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{e.name}</span>
                <OriginBadge origin={e.origin} copy={copy} />
                <ConsentStatus consent={e.consent} copy={copy} className="hidden @2xl:inline-flex" />
                <OutcomeStatus outcome={e.outcome} copy={copy} />
                <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-[var(--motion-base)] ease-in-out", open && "rotate-180")} aria-hidden="true" />
                <span className="sr-only">{open ? copy.events.detail.collapse : copy.events.detail.expand}</span>
              </button>
              {open ? <EventDetail id={detailId} event={e} copy={copy} /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EventDetail({ id, event, copy }: { id: string; event: DemoEventRecord; copy: DemoViewProps["copy"] }) {
  const d = copy.events.detail;
  const delivered = event.destinations.map((p) => platformFixture(p).name);
  return (
    <div id={id} className="border-t border-line bg-surface-2/60 px-3 py-3 text-small">
      <p className="font-medium text-ink">{copy.events.reasons[event.reason]}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 @xl:grid-cols-2">
        <Row label={d.dedupLabel}>
          {copy.events.dedup[event.dedup]} <span className="font-mono text-micro text-ink-3">({d.eventId} {event.eventId})</span>
        </Row>
        <Row label={d.consentLabel}>
          <ConsentStatus consent={event.consent} copy={copy} />
        </Row>
        {typeof event.value === "number" ? (
          <Row label={d.value}>
            <span className="tabular-nums">{event.value}</span> {event.currency ? <span className="font-mono">{event.currency}</span> : <span className="font-medium text-warn">· {d.currency} {d.missing}</span>}
          </Row>
        ) : null}
        {event.orderId ? (
          <Row label={d.order}>
            <span className="font-mono">{event.orderId}</span>
          </Row>
        ) : null}
        <Row label={d.destinations}>{delivered.length > 0 ? delivered.join(", ") : copy.events.none}</Row>
        <Row label={d.route}>
          {copy.flow.website} → {copy.flow.track} → {copy.flow.consent} ({copy.events.consent[event.consent]}) → {delivered.length > 0 ? plural(copy.events.routedTo, delivered.length) : copy.events.none}
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-micro font-medium tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}
