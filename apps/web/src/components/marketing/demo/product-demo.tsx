"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { DemoCopy } from "@/lib/marketing-copy/types";
import { realClock, type DemoClock } from "./clock";
import { DemoFrame } from "./demo-frame";
import { DEMO_INITIAL_REVEAL, DEMO_STREAM_INTERVAL_MS } from "./fixtures";
import type { DemoViewId } from "./model";
import type { DemoPlayback, DemoViewProps } from "./parts";
import { createDemoPlayer } from "./player";
import { createInitialState, demoReducer, latestEvent, type DemoAction } from "./state";
import { fill } from "./text";
import { AiSetupView } from "./views/ai-setup";
import { AttributionView } from "./views/attribution";
import { DestinationsView } from "./views/destinations";
import { LiveEventsView } from "./views/live-events";
import { OverviewView } from "./views/overview";

const VIEWS: Record<DemoViewId, (props: DemoViewProps) => React.JSX.Element> = {
  overview: OverviewView,
  events: LiveEventsView,
  destinations: DestinationsView,
  ai: AiSetupView,
  attribution: AttributionView,
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True while the visitor asks for reduced motion (then the stream never auto-advances). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function subscribePageVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** False while the tab is hidden (the stream pauses). */
function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribePageVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}

/** False while the demo is scrolled out of view (the stream pauses). */
function useInView(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

export interface ProductDemoProps {
  copy: DemoCopy;
  heading: string;
  /** Injectable clock (tests); defaults to the real timers. */
  clock?: DemoClock;
  intervalMs?: number;
}

/**
 * The interactive hero demo (docs/12 §5). Local, deterministic fixtures; no network, no real data,
 * no mutations. Auto-advance runs only while the demo is visible, the tab is active, the visitor
 * has not paused it and does not prefer reduced motion — it stays fully usable without it.
 */
export function ProductDemo({ copy, heading, clock = realClock, intervalMs = DEMO_STREAM_INTERVAL_MS }: ProductDemoProps) {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialState);
  const rootRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const inView = useInView(rootRef);
  const [engaged, setEngaged] = useState(false);
  const [notice, setNotice] = useState({ text: "", n: 0 });

  const autoplay = state.playing && !reducedMotion && pageVisible && inView;
  useEffect(() => {
    if (!autoplay) return;
    const player = createDemoPlayer({ clock, intervalMs, onTick: () => dispatch({ type: "advance" }) });
    player.start();
    return () => player.stop();
  }, [autoplay, clock, intervalMs]);

  const handle = useCallback(
    (action: DemoAction) => {
      dispatch(action);
      if (action.type === "confirm") setNotice((n) => ({ text: copy.announce.setupDone, n: n.n + 1 }));
      else if (action.type === "reset") setNotice((n) => ({ text: copy.announce.reset, n: n.n + 1 }));
    },
    [copy],
  );
  const engage = useCallback(() => setEngaged(true), []);

  const latest = latestEvent(state);
  const announcement = engaged && latest ? fill(copy.announce.event, { name: latest.name, origin: copy.events.origin[latest.origin], outcome: copy.events.outcome[latest.outcome] }) : "";
  const playback: DemoPlayback = { paused: !state.playing, reducedMotion, advanced: state.seq > DEMO_INITIAL_REVEAL };
  const View = VIEWS[state.view];
  return (
    <DemoFrame state={state} copy={copy} heading={heading} dispatch={handle} interactive playback={playback} announcement={announcement} notice={notice} rootRef={rootRef} onEngage={engage}>
      <View state={state} copy={copy} dispatch={handle} interactive playback={playback} />
    </DemoFrame>
  );
}
