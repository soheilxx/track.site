"use client";

import type { ReactNode } from "react";
import { cn } from "@track-site/ui";
import { AssistantAmbient } from "./living-ai-core/assistant-ambient";
import { AiMotionControl } from "./living-ai-core/motion-control";

/**
 * Track AI panel frame with fixed geometry (supplement §9): header and composer are always visible,
 * only the body scrolls (the body slot owns its scroll container). Slots:
 *  - `ambient`  — the Living AI Core layer (docs/15-living-ai-core.md): painted behind the header and
 *                 the panel edges, `aria-hidden`, `pointer-events: none`, absolutely positioned and
 *                 isolated so it never changes layout, scroll position, focus or hit areas. Defaults
 *                 to `<AssistantAmbient/>`, which binds the core to the assistant store (needs
 *                 `<AssistantProvider>`); pass your own `<LivingAICore …/>` or `false` for none;
 *  - `activity` — localized activity sentences bound to real job states (activity.*, job.progress);
 *  - `actions`  — header controls (mode toggle, minimise/close); the accessible pause / turn-on
 *                 control for the ambient motion (`motionControl`) is appended by default;
 *  - `context`  — the visible site/environment context line that confirms every switch.
 */
export interface AssistantPanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  ambient?: ReactNode;
  /** Header control that pauses / turns on the ambient motion; defaults to `<AiMotionControl/>`, pass `null` to omit. */
  motionControl?: ReactNode;
  activity?: ReactNode;
  /** Scrollable body (must set its own `overflow-y-auto`). */
  children: ReactNode;
  composer?: ReactNode;
  titleId?: string;
  className?: string;
}

export function AssistantPanel({ title, subtitle, context, actions, ambient, motionControl, activity, children, composer, titleId, className }: AssistantPanelProps) {
  const control = motionControl === undefined ? <AiMotionControl /> : motionControl;
  return (
    <div className={cn("relative isolate flex h-full min-h-0 w-full flex-col bg-surface text-ink", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" data-slot="ambient">
        {ambient ?? <AssistantAmbient />}
      </div>
      <header className="shrink-0 border-b border-line px-4 py-3" data-slot="header">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p> : null}
          </div>
          {actions || control ? (
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              {control}
            </div>
          ) : null}
        </div>
        {context ? <div className="mt-2 text-xs text-ink-2">{context}</div> : null}
      </header>
      {activity ? (
        <div className="shrink-0 border-b border-line px-4 py-2 text-xs text-ink-2" data-slot="activity" aria-live="polite">
          {activity}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1" data-slot="body">
        {children}
      </div>
      {composer ? (
        <div className="shrink-0 border-t border-line" data-slot="composer">
          {composer}
        </div>
      ) : null}
    </div>
  );
}
