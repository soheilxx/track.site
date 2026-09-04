"use client";

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { Badge, BrandGlyph, IconButton, Status, Tab, TabList, TabPanel, Tabs } from "@track-site/ui";
import type { DemoCopy } from "@/lib/marketing-copy/types";
import { DEMO_SITE } from "./fixtures";
import { DEMO_VIEWS, isDemoView } from "./model";
import type { DemoPlayback } from "./parts";
import type { DemoAction, DemoState } from "./state";
import { fill } from "./text";

export interface DemoFrameProps {
  state: DemoState;
  copy: DemoCopy;
  /** Accessible name of the demo region (from the page copy). */
  heading: string;
  dispatch: (action: DemoAction) => void;
  interactive: boolean;
  playback: DemoPlayback;
  /** Polite live-region text for new events (empty until the visitor engages with the demo). */
  announcement: string;
  /** One-off status text (setup confirmed, reset); keyed so repeats are announced again. */
  notice: { text: string; n: number };
  rootRef?: Ref<HTMLElement>;
  onEngage?: () => void;
  children: ReactNode;
}

/**
 * Chrome of the demo: dark product stage, sample-data label, controls, the five view tabs and the
 * live regions. Identical markup for the static placeholder and the interactive component so the
 * swap after hydration causes no visible change.
 */
export function DemoFrame({ state, copy, heading, dispatch, interactive, playback, announcement, notice, rootRef, onEngage, children }: DemoFrameProps) {
  const headingId = useId();
  return (
    <section ref={rootRef} aria-labelledby={headingId} data-demo={interactive ? "interactive" : "static"} onFocusCapture={onEngage} onPointerDownCapture={onEngage} className="surface-stage relative isolate overflow-hidden rounded-[var(--radius-panel)] border border-stage-line shadow-stage">
      <h2 id={headingId} className="sr-only">
        {heading}
      </h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2 sm:px-4">
        <span className="inline-flex items-center gap-2 text-small font-semibold text-ink">
          <BrandGlyph size={16} className="text-primary" />
          {copy.label}
        </span>
        <Badge tone="violet">
          <span className="sm:hidden">{copy.sampleShort}</span>
          <span className="hidden sm:inline">{copy.sample}</span>
        </Badge>
        <span className="hidden font-mono text-micro text-ink-3 lg:inline">{DEMO_SITE}</span>
        <div className="ml-auto flex items-center gap-1">
          <Status tone="ok" className="mr-1 hidden text-micro sm:inline-flex">
            {fill(copy.configLive, { version: state.configVersion })}
          </Status>
          {playback.reducedMotion ? null : (
            <IconButton label={state.playing ? copy.controls.pause : copy.controls.play} onClick={() => dispatch({ type: "play", playing: !state.playing })}>
              {state.playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            </IconButton>
          )}
          <IconButton label={copy.controls.next} onClick={() => dispatch({ type: "advance" })}>
            <SkipForward className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={copy.controls.reset} onClick={() => dispatch({ type: "reset" })}>
            <RotateCcw className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <Tabs
        value={state.view}
        onValueChange={(next) => {
          if (isDemoView(next)) dispatch({ type: "view", view: next });
        }}
        className="p-3 sm:p-4"
      >
        <TabList aria-label={copy.viewsLabel} variant="pill" className="max-w-full">
          {DEMO_VIEWS.map((view) => (
            <Tab key={view} value={view}>
              {copy.views[view]}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={state.view} className="mt-3 min-h-[24rem] md:min-h-[26rem]">
          {children}
        </TabPanel>
      </Tabs>
      <p className="border-t border-line px-3 py-2 text-micro text-ink-3 md:hidden">{copy.mobileHint}</p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="sr-only" role="status" aria-atomic="true">
        <span key={notice.n}>{notice.text}</span>
      </div>
    </section>
  );
}
