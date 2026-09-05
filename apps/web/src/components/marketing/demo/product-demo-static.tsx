import type { DemoCopy } from "@/lib/marketing-copy/types";
import { DemoFrame } from "./demo-frame";
import type { DemoPlayback } from "./parts";
import { createInitialState } from "./state";
import { OverviewView } from "./views/overview";

const INITIAL_STATE = createInitialState();
const STATIC_PLAYBACK: DemoPlayback = { paused: false, reducedMotion: false, advanced: false };
const NO_NOTICE = { text: "", n: 0 };

/**
 * Server-rendered placeholder: the exact Overview state the interactive demo starts from, without
 * handlers (no `dispatch`, no `onEngage`), so it is a plain server component — none of the demo's
 * code reaches the hydration bundle. The island swaps in the interactive demo, which renders the
 * same frame and view, so the swap changes nothing visible.
 */
export function ProductDemoStatic({ copy, heading }: { copy: DemoCopy; heading: string }) {
  return (
    <DemoFrame state={INITIAL_STATE} copy={copy} heading={heading} interactive={false} playback={STATIC_PLAYBACK} announcement="" notice={NO_NOTICE}>
      <OverviewView state={INITIAL_STATE} copy={copy} interactive={false} playback={STATIC_PLAYBACK} />
    </DemoFrame>
  );
}
