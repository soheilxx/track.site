"use client";

import { Globe, Server } from "lucide-react";
import type { ReactNode } from "react";
import { ConsentGate, Diagram, FlowEdge, FlowNode, SignalDot, Status, cn, toneDot, type NodeTone, type Tone } from "@track-site/ui";
import type { DemoCopy } from "@/lib/marketing-copy/types";
import type { DemoAction, DemoEventRecord, DemoState, HealthPartValue } from "./state";
import type { DemoConsent, DemoHealthTone, DemoOrigin, DemoOutcome } from "./model";
import { fill } from "./text";

/** Props every view receives. `interactive` is false for the server-rendered placeholder. */
export interface DemoViewProps {
  state: DemoState;
  copy: DemoCopy;
  dispatch: (action: DemoAction) => void;
  interactive: boolean;
  playback: DemoPlayback;
}

export interface DemoPlayback {
  paused: boolean;
  reducedMotion: boolean;
  /** True once the stream has moved past the initial reveal (entrance motion is allowed from then on). */
  advanced: boolean;
}

export const CONSENT_TONE: Record<DemoConsent, Tone> = { granted: "ok", denied: "bad", pending: "warn" };
export const OUTCOME_TONE: Record<DemoOutcome, Tone> = { delivered: "ok", blocked: "bad", held: "warn", duplicate: "neutral" };
export const HEALTH_TONE: Record<DemoHealthTone, Tone> = { ok: "ok", warn: "warn", bad: "bad" };

export function MetricTile({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2", className)}>
      <p className="text-micro leading-tight font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="mt-0.5 font-display text-xl font-semibold text-ink tabular-nums">{value}</p>
    </div>
  );
}

export function OriginBadge({ origin, copy }: { origin: DemoOrigin; copy: DemoCopy }) {
  const Icon = origin === "server" ? Server : Globe;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 text-micro font-medium text-ink-2">
      <Icon className="size-3" aria-hidden="true" />
      {copy.events.origin[origin]}
    </span>
  );
}

export function ConsentStatus({ consent, copy, className }: { consent: DemoConsent; copy: DemoCopy; className?: string }) {
  return (
    <Status tone={CONSENT_TONE[consent]} indicator="icon" className={cn("text-micro", className)}>
      {copy.events.consent[consent]}
    </Status>
  );
}

export function OutcomeStatus({ outcome, copy, className }: { outcome: DemoOutcome; copy: DemoCopy; className?: string }) {
  return (
    <Status tone={OUTCOME_TONE[outcome]} indicator="icon" className={cn("text-micro", className)}>
      {copy.events.outcome[outcome]}
    </Status>
  );
}

/** One compact stream row (Overview). */
export function EventRowCompact({ event, copy, className }: { event: DemoEventRecord; copy: DemoCopy; className?: string }) {
  return (
    <li className={cn("flex items-center gap-2 py-1.5 text-small", className)}>
      <span className="hidden w-16 shrink-0 font-mono text-micro text-ink-3 sm:inline">{event.time}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-ink">{event.name}</span>
      <OriginBadge origin={event.origin} copy={copy} />
      <OutcomeStatus outcome={event.outcome} copy={copy} />
    </li>
  );
}

/** Explainable parts of the Tracking Health Score: label, value and a bar (transform-only motion). */
export function HealthBars({ parts, copy, className }: { parts: readonly HealthPartValue[]; copy: DemoCopy; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {parts.map((p) => (
        <li key={p.id}>
          <div className="flex items-baseline justify-between gap-3 text-small">
            <span className="text-ink-2">{copy.health.parts[p.id].label}</span>
            <span className="font-medium text-ink tabular-nums">{p.value}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className={cn("h-full origin-left rounded-full transition-transform duration-[var(--motion-slow)] ease-flow", toneDot[HEALTH_TONE[p.tone]])} style={{ transform: `scaleX(${p.value / 100})` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HealthExplanation({ parts, copy, className }: { parts: readonly HealthPartValue[]; copy: DemoCopy; className?: string }) {
  return (
    <details className={cn("group text-small", className)}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
        <span aria-hidden="true" className="inline-block transition-transform duration-[var(--motion-base)] group-open:rotate-90">
          ›
        </span>
        {copy.health.explain}
      </summary>
      <ul className="mt-2 space-y-1 text-ink-3">
        {parts.map((p) => (
          <li key={p.id}>
            <span className="font-medium text-ink-2">{copy.health.parts[p.id].label}:</span> {fill(copy.health.parts[p.id].detail, p.vars)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Website → Track → Consent/Policy → Destinations with the latest event's position and consent state. */
export function MiniFlow({ latest, copy, pulse, className }: { latest: DemoEventRecord | null; copy: DemoCopy; pulse: boolean; className?: string }) {
  const consent = latest?.consent ?? "granted";
  const outcome = latest?.outcome ?? "delivered";
  const edgeTone: NodeTone = outcome === "blocked" ? "bad" : outcome === "held" ? "warn" : "primary";
  const dot = outcome === "delivered" ? { x: 296, y: 48, tone: "ok" as const } : outcome === "duplicate" ? { x: 164, y: 16, tone: "neutral" as const } : { x: 224, y: 48, tone: edgeTone };
  return (
    <Diagram width={420} height={100} caption={copy.flow.caption} className={className}>
      <FlowNode x={0} y={26} width={90} label={copy.flow.website} />
      <FlowEdge from={{ x: 90, y: 48 }} to={{ x: 126, y: 48 }} tone="primary" arrow />
      <FlowNode x={126} y={26} width={76} label={copy.flow.track} emphasis />
      <FlowEdge from={{ x: 202, y: 48 }} to={{ x: 238, y: 48 }} tone="primary" />
      <ConsentGate x={258} y={48} state={consent} label={copy.flow.consent} />
      <FlowEdge from={{ x: 278, y: 48 }} to={{ x: 314, y: 48 }} tone={edgeTone} dashed={outcome !== "delivered"} arrow />
      <FlowNode x={314} y={26} width={106} label={copy.flow.destinations} tone="flow" />
      {latest ? <SignalDot key={latest.key} x={dot.x} y={dot.y} tone={dot.tone} pulse={pulse} /> : null}
    </Diagram>
  );
}

export function ViewTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-small font-semibold text-ink">{children}</h3>
      {aside}
    </div>
  );
}
