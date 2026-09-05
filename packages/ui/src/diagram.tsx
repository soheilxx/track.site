import { useId, type ReactNode, type SVGProps } from "react";
import { cn } from "./cn.ts";
import type { Tone } from "./primitives/status.tsx";

/**
 * SVG data-flow primitives (supplement §3: signals, events, nodes, routing lines, consent gates,
 * destinations). Compose them inside <Diagram>, which owns the <svg> and the accessible caption.
 * Everything is token-driven through Tailwind fill/stroke/text utilities, so the same diagram
 * renders on light surfaces, in dark mode and inside a dark <ProductStage>.
 *
 * Accessibility: a diagram is decorative (aria-hidden) unless `title` is given; the information it
 * carries must also be in the caption or the surrounding text. Motion (`animated` on FlowEdge,
 * `pulse` on SignalDot) is opt-in and disabled under prefers-reduced-motion by the stylesheet.
 */

export interface DiagramProps extends Omit<SVGProps<SVGSVGElement>, "title"> {
  /** viewBox width/height in user units; the SVG scales to its container. */
  width: number;
  height: number;
  /** Accessible name; makes the graphic `role="img"`. Omit for decorative diagrams. */
  title?: string;
  /** Longer accessible description. */
  description?: string;
  /** Visible caption rendered as <figcaption>. */
  caption?: ReactNode;
  className?: string;
  figureClassName?: string;
  children: ReactNode;
}

export function Diagram({ width, height, title, description, caption, className, figureClassName, children, ...props }: DiagramProps) {
  const id = useId();
  const labelled = !!title;
  return (
    <figure className={cn("m-0 min-w-0", figureClassName)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : "true"}
        aria-labelledby={labelled ? `${id}-title` : undefined}
        aria-describedby={labelled && description ? `${id}-desc` : undefined}
        focusable="false"
        className={cn("block h-auto max-w-full font-sans", className)}
        style={{ aspectRatio: `${width} / ${height}` }}
        {...props}
      >
        {labelled ? <title id={`${id}-title`}>{title}</title> : null}
        {labelled && description ? <desc id={`${id}-desc`}>{description}</desc> : null}
        {children}
      </svg>
      {caption ? <figcaption className="mt-3 text-sm text-ink-3">{caption}</figcaption> : null}
    </figure>
  );
}

export type NodeTone = "neutral" | "primary" | "ai" | "flow" | Tone;

const nodeFill: Record<NodeTone, string> = {
  neutral: "fill-surface stroke-line-2",
  primary: "fill-primary-soft stroke-primary",
  ai: "fill-violet-soft stroke-violet",
  flow: "fill-cyan-soft stroke-cyan",
  ok: "fill-ok-soft stroke-ok",
  warn: "fill-warn-soft stroke-warn",
  bad: "fill-bad-soft stroke-bad",
  info: "fill-info-soft stroke-info",
};
const nodeText: Record<NodeTone, string> = {
  neutral: "fill-ink",
  primary: "fill-primary",
  ai: "fill-violet",
  flow: "fill-cyan-strong",
  ok: "fill-ok",
  warn: "fill-warn",
  bad: "fill-bad",
  info: "fill-info",
};
const strokeTone: Record<NodeTone, string> = {
  neutral: "stroke-line-2",
  primary: "stroke-primary",
  ai: "stroke-violet",
  flow: "stroke-cyan",
  ok: "stroke-ok",
  warn: "stroke-warn",
  bad: "stroke-bad",
  info: "stroke-info",
};
const dotTone: Record<NodeTone, string> = {
  neutral: "fill-ink-3",
  primary: "fill-primary",
  ai: "fill-violet",
  flow: "fill-cyan",
  ok: "fill-ok",
  warn: "fill-warn",
  bad: "fill-bad",
  info: "fill-info",
};

export interface FlowNodeProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  /** Small line under the label (e.g. "browser · server"). */
  sublabel?: string;
  tone?: NodeTone;
  /** Solid primary node (e.g. the Track core). */
  emphasis?: boolean;
  radius?: number;
  className?: string;
}

/** Rounded node: Website, Track, Consent/Policy, Destination … */
export function FlowNode({ x, y, width = 120, height = 44, label, sublabel, tone = "neutral", emphasis = false, radius = 10, className }: FlowNodeProps) {
  const textY = sublabel ? y + height / 2 - 4 : y + height / 2 + 1;
  return (
    <g className={className} data-flow-node={label}>
      <rect x={x} y={y} width={width} height={height} rx={radius} className={cn("stroke-[1.5]", emphasis ? "fill-primary stroke-primary" : nodeFill[tone])} />
      <text x={x + width / 2} y={textY} textAnchor="middle" dominantBaseline="middle" className={cn("text-[13px] font-semibold", emphasis ? "fill-on-primary" : nodeText[tone])}>
        {label}
      </text>
      {sublabel ? (
        <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" dominantBaseline="middle" className={cn("text-[10px]", emphasis ? "fill-on-primary/90" : "fill-ink-3")}>
          {sublabel}
        </text>
      ) : null}
    </g>
  );
}

export interface FlowEdgeProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  tone?: NodeTone;
  /** Straight line, or a smooth horizontal/vertical S-curve. */
  shape?: "line" | "curve-h" | "curve-v";
  /** Dashed edge with a travelling dash (opt-in; stopped under reduced motion). */
  animated?: boolean;
  dashed?: boolean;
  /** Arrow head at the end. */
  arrow?: boolean;
  /** Text placed at the midpoint (e.g. "consent: granted"). */
  label?: string;
  strokeWidth?: number;
  className?: string;
}

/** Routing line between two points. */
export function FlowEdge({ from, to, tone = "neutral", shape = "line", animated = false, dashed = false, arrow = false, label, strokeWidth = 1.5, className }: FlowEdgeProps) {
  const d =
    shape === "curve-h"
      ? `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`
      : shape === "curve-v"
        ? `M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y}`
        : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = arrow ? arrowHead(to, angle, 6) : null;
  return (
    <g className={className} data-flow-edge="">
      <path d={d} fill="none" strokeWidth={strokeWidth} strokeLinecap="round" className={cn(strokeTone[tone], animated ? "flow-edge-animated" : dashed ? "[stroke-dasharray:6_6]" : undefined)} />
      {head ? <path d={head} className={cn(dotTone[tone], "stroke-none")} /> : null}
      {label ? (
        <text x={mid.x} y={mid.y - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">
          {label}
        </text>
      ) : null}
    </g>
  );
}

function arrowHead(tip: { x: number; y: number }, angle: number, size: number): string {
  const left = { x: tip.x - size * Math.cos(angle - Math.PI / 6), y: tip.y - size * Math.sin(angle - Math.PI / 6) };
  const right = { x: tip.x - size * Math.cos(angle + Math.PI / 6), y: tip.y - size * Math.sin(angle + Math.PI / 6) };
  return `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
}

export interface ConsentGateProps {
  x: number;
  y: number;
  size?: number;
  /** granted → open (ok), denied → closed (bad), pending → unknown (warn). */
  state: "granted" | "denied" | "pending";
  label?: string;
  className?: string;
}

/** Diamond-shaped policy gate; the state is shown by colour AND by the glyph inside (✓ / × / ?). */
export function ConsentGate({ x, y, size = 40, state, label, className }: ConsentGateProps) {
  const half = size / 2;
  const tone: NodeTone = state === "granted" ? "ok" : state === "denied" ? "bad" : "warn";
  const glyph = state === "granted" ? "✓" : state === "denied" ? "×" : "?";
  return (
    <g className={className} data-consent-gate={state}>
      <path d={`M ${x} ${y - half} L ${x + half} ${y} L ${x} ${y + half} L ${x - half} ${y} Z`} className={cn("stroke-[1.5]", nodeFill[tone])} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" className={cn("text-[15px] font-bold", nodeText[tone])}>
        {glyph}
      </text>
      {label ? (
        <text x={x} y={y + half + 14} textAnchor="middle" className="fill-ink-3 text-[10px] font-medium">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export interface DestinationChipProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  /** Delivery health; shown as the dot colour plus the text you pass in `statusText`. */
  status?: Tone;
  statusText?: string;
  /** Icon slot rendered at the left edge (an <svg> path group or <image>), 16×16 user units. */
  icon?: ReactNode;
  className?: string;
}

/** Destination (Meta, Google, …) as a chip with a health dot. */
export function DestinationChip({ x, y, width = 128, height = 32, label, status = "neutral", statusText, icon, className }: DestinationChipProps) {
  const padX = 10;
  const iconOffset = icon ? 22 : 0;
  return (
    <g className={className} data-destination={label}>
      <rect x={x} y={y} width={width} height={height} rx={height / 2} className="fill-surface stroke-line-2 stroke-[1.5]" />
      {icon ? <g transform={`translate(${x + padX} ${y + height / 2 - 8})`}>{icon}</g> : null}
      <text x={x + padX + iconOffset} y={y + height / 2 + 1} dominantBaseline="middle" className="fill-ink text-[12px] font-semibold">
        {label}
      </text>
      <circle cx={x + width - padX - 3} cy={y + height / 2} r={4} className={dotTone[status]} />
      {statusText ? (
        <text x={x + width / 2} y={y + height + 12} textAnchor="middle" className="fill-ink-3 text-[10px]">
          {statusText}
        </text>
      ) : null}
    </g>
  );
}

export interface SignalDotProps {
  x: number;
  y: number;
  r?: number;
  tone?: NodeTone;
  /** One-off soft pulse ring (opt-in; disabled under reduced motion). */
  pulse?: boolean;
  className?: string;
}

/** An event travelling along an edge. */
export function SignalDot({ x, y, r = 4, tone = "primary", pulse = false, className }: SignalDotProps) {
  return (
    <g className={className} data-signal="">
      {pulse ? <circle cx={x} cy={y} r={r * 2.2} className={cn(dotTone[tone], "opacity-20 motion-safe:animate-pulse-once")} style={{ transformOrigin: `${x}px ${y}px` }} /> : null}
      <circle cx={x} cy={y} r={r} className={dotTone[tone]} />
    </g>
  );
}

export type DiagramBreakpoint = "sm" | "md" | "lg";

const breakpointClass: Record<DiagramBreakpoint, { wide: string; narrow: string }> = {
  sm: { wide: "hidden sm:block", narrow: "sm:hidden" },
  md: { wide: "hidden md:block", narrow: "md:hidden" },
  lg: { wide: "hidden lg:block", narrow: "lg:hidden" },
};

export interface ResponsiveDiagramLayout {
  /** viewBox of this layout in user units. */
  width: number;
  height: number;
  children: ReactNode;
  /** Extra classes on this layout's <figure> (e.g. a max width for the compact variant). */
  className?: string;
}

export interface ResponsiveDiagramProps {
  /** Accessible name shared by both layouts; omit for decorative diagrams. */
  title?: string;
  description?: string;
  caption?: ReactNode;
  className?: string;
  /** Viewport from which the wide layout is shown; below it the narrow layout renders. */
  breakpoint?: DiagramBreakpoint;
  /** Wide (left-to-right) drawing for larger viewports. */
  wide: ResponsiveDiagramLayout;
  /** Compact (top-to-bottom) drawing for small viewports, so labels stay legible at 320 px. */
  narrow: ResponsiveDiagramLayout;
}

/**
 * One diagram drawn twice — a wide and a narrow layout — instead of scaling a 720-unit drawing down
 * to 5 px labels. Only one layout is in the accessibility tree at a time (the other is display:none);
 * both carry the same title, description and caption.
 */
export function ResponsiveDiagram({ title, description, caption, className, breakpoint = "md", wide, narrow }: ResponsiveDiagramProps) {
  const visibility = breakpointClass[breakpoint];
  return (
    <div className={cn("w-full min-w-0", className)}>
      <Diagram width={wide.width} height={wide.height} title={title} description={description} caption={caption} figureClassName={cn(visibility.wide, wide.className)}>
        {wide.children}
      </Diagram>
      <Diagram width={narrow.width} height={narrow.height} title={title} description={description} caption={caption} figureClassName={cn(visibility.narrow, narrow.className)}>
        {narrow.children}
      </Diagram>
    </div>
  );
}
