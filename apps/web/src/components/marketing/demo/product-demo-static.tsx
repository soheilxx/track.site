"use client";

import type { DemoCopy } from "@/lib/marketing-copy/types";
import { DemoFrame } from "./demo-frame";
import type { DemoPlayback } from "./parts";
import { createInitialState } from "./state";
import { OverviewView } from "./views/overview";

const INITIAL_STATE = createInitialState();
const STATIC_PLAYBACK: DemoPlayback = { paused: false, reducedMotion: false, advanced: false };
const NO_NOTICE = { text: "", n: 0 };
const noop = () => {};

/**
 * Server-renderable placeholder: the exact Overview state the interactive demo starts from. It is
 * the `loading` component of the lazy import, so the hero shows the product before any demo
 * JavaScript arrives and the swap after hydration changes nothing visible.
 */
export function ProductDemoStatic({ copy, heading }: { copy: DemoCopy; heading: string }) {
  return (
    <DemoFrame state={INITIAL_STATE} copy={copy} heading={heading} dispatch={noop} interactive={false} playback={STATIC_PLAYBACK} announcement="" notice={NO_NOTICE}>
      <OverviewView state={INITIAL_STATE} copy={copy} dispatch={noop} interactive={false} playback={STATIC_PLAYBACK} />
    </DemoFrame>
  );
}
