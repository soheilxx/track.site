import type { ReactNode } from "react";
import { ConsentGate, DestinationChip, Diagram, FlowEdge, FlowNode, cn, type NodeTone, type Tone } from "@track-site/ui";
import type { FeatureUiCopy } from "@/lib/marketing-copy/features";

/*
 * Data-flow diagrams for the feature and how-it-works pages, composed from the SVG primitives in
 * @track-site/ui. Every diagram is rendered twice — a wide left-to-right layout (md and up) and a
 * narrow top-to-bottom layout (below md) — so labels stay legible at 320 px instead of scaling a
 * 720 px drawing down. Only one is in the accessibility tree at a time (the other is display:none).
 * The state of gates and edges is carried by colour, dash pattern AND text (status under each chip,
 * state under the gate) and the whole picture is described in prose via `description`.
 * No looping motion: docs/12 §2 reserves ambient movement for the Living AI Core.
 */

export type FlowPaths = "browser" | "server" | "hybrid";
export type GateState = "granted" | "denied" | "pending";

export interface FlowDestination {
  label: string;
  /** Health dot on the chip. */
  status: Tone;
  /** Text under the chip (delivered / blocked / retrying / paused). */
  statusText: string;
  /** Edge rendering: delivered is solid, everything else dashed in the matching tone. */
  edge?: "delivered" | "blocked" | "retrying" | "held";
}

type DiagramLabels = FeatureUiCopy["diagram"];

interface BaseProps {
  title: string;
  description?: string;
  caption?: ReactNode;
  className?: string;
}

const CHIP_W = 136;
const CHIP_H = 32;
const CHIP_STEP = 56;

function edgeTone(d: FlowDestination): NodeTone {
  switch (d.edge) {
    case "blocked":
      return "bad";
    case "retrying":
      return "warn";
    case "held":
      return "neutral";
    default:
      return "primary";
  }
}

const gateTextClass: Record<GateState, string> = { granted: "fill-ok", denied: "fill-bad", pending: "fill-warn" };

function gateText(labels: DiagramLabels, gate: GateState): string {
  return gate === "granted" ? labels.gateGranted : gate === "denied" ? labels.gateDenied : labels.gatePending;
}

function ResponsiveDiagram({ title, description, caption, className, wide, narrow }: BaseProps & { wide: { width: number; height: number; children: ReactNode }; narrow: { width: number; height: number; children: ReactNode } }) {
  return (
    <div className={cn("w-full min-w-0", className)}>
      <Diagram width={wide.width} height={wide.height} title={title} description={description} caption={caption} figureClassName="hidden md:block">
        {wide.children}
      </Diagram>
      <Diagram width={narrow.width} height={narrow.height} title={title} description={description} caption={caption} figureClassName="md:hidden">
        {narrow.children}
      </Diagram>
    </div>
  );
}

/* ------------------------------------------------------------------ Website → Track → gate → destinations */

export interface FlowDiagramProps extends BaseProps {
  labels: DiagramLabels;
  /** Which origins send events; unused origins are drawn dimmed and marked "not used". */
  paths?: FlowPaths;
  gate?: GateState;
  /** Up to four destinations. */
  destinations: FlowDestination[];
}

function FlowWide({ labels, paths, gate, destinations }: Required<Pick<FlowDiagramProps, "labels" | "paths" | "gate" | "destinations">>) {
  const useBrowser = paths !== "server";
  const useServer = paths !== "browser";
  const dim = "opacity-40";
  return (
    <>
      <FlowNode x={8} y={122} width={112} height={44} label={labels.website} />
      <FlowEdge from={{ x: 120, y: 138 }} to={{ x: 168, y: 90 }} shape="curve-h" dashed={!useBrowser} className={cn(!useBrowser && dim)} />
      <FlowEdge from={{ x: 120, y: 150 }} to={{ x: 168, y: 198 }} shape="curve-h" dashed={!useServer} className={cn(!useServer && dim)} />
      <FlowNode x={168} y={68} width={116} height={44} label={labels.browser} sublabel={useBrowser ? undefined : labels.notUsed} tone="flow" className={cn(!useBrowser && dim)} />
      <FlowNode x={168} y={176} width={116} height={44} label={labels.server} sublabel={useServer ? undefined : labels.notUsed} tone="flow" className={cn(!useServer && dim)} />
      {paths === "hybrid" ? (
        <>
          <FlowEdge from={{ x: 226, y: 112 }} to={{ x: 226, y: 176 }} tone="flow" dashed />
          <text x={236} y={147} className="fill-cyan-strong text-[10px] font-medium">
            {labels.dedup}
          </text>
        </>
      ) : null}
      <FlowEdge from={{ x: 284, y: 90 }} to={{ x: 336, y: 138 }} shape="curve-h" arrow tone={useBrowser ? "primary" : "neutral"} dashed={!useBrowser} className={cn(!useBrowser && dim)} />
      <FlowEdge from={{ x: 284, y: 198 }} to={{ x: 336, y: 150 }} shape="curve-h" arrow tone={useServer ? "primary" : "neutral"} dashed={!useServer} className={cn(!useServer && dim)} />
      <FlowNode x={336} y={122} width={112} height={44} label={labels.track} emphasis />
      <FlowEdge from={{ x: 448, y: 144 }} to={{ x: 482, y: 144 }} arrow tone="primary" />
      <ConsentGate x={504} y={144} size={44} state={gate} label={labels.gate} />
      <text x={504} y={196} textAnchor="middle" className={cn("text-[10px] font-medium", gateTextClass[gate])}>
        {gateText(labels, gate)}
      </text>
      {destinations.slice(0, 4).map((d, i) => {
        const y = 40 + i * 60;
        return (
          <g key={d.label}>
            <FlowEdge from={{ x: 526, y: 144 }} to={{ x: 576, y: y + CHIP_H / 2 }} shape="curve-h" arrow tone={edgeTone(d)} dashed={!!d.edge && d.edge !== "delivered"} />
            <DestinationChip x={576} y={y} width={CHIP_W} height={CHIP_H} label={d.label} status={d.status} statusText={d.statusText} />
          </g>
        );
      })}
    </>
  );
}

function FlowNarrow({ labels, paths, gate, destinations }: Required<Pick<FlowDiagramProps, "labels" | "paths" | "gate" | "destinations">>) {
  const useBrowser = paths !== "server";
  const useServer = paths !== "browser";
  const dim = "opacity-40";
  const chips = destinations.slice(0, 4);
  const y0 = 372;
  const railBottom = y0 + (chips.length - 1) * CHIP_STEP + CHIP_H / 2;
  return (
    <>
      <FlowNode x={104} y={8} width={112} height={44} label={labels.website} />
      <FlowEdge from={{ x: 160, y: 52 }} to={{ x: 80, y: 100 }} shape="curve-v" dashed={!useBrowser} className={cn(!useBrowser && dim)} />
      <FlowEdge from={{ x: 160, y: 52 }} to={{ x: 240, y: 100 }} shape="curve-v" dashed={!useServer} className={cn(!useServer && dim)} />
      {paths === "hybrid" ? (
        <>
          <text x={160} y={90} textAnchor="middle" className="fill-cyan-strong text-[10px] font-medium">
            {labels.dedup}
          </text>
          <FlowEdge from={{ x: 144, y: 122 }} to={{ x: 176, y: 122 }} tone="flow" dashed />
        </>
      ) : null}
      <FlowNode x={16} y={100} width={128} height={44} label={labels.browser} sublabel={useBrowser ? undefined : labels.notUsed} tone="flow" className={cn(!useBrowser && dim)} />
      <FlowNode x={176} y={100} width={128} height={44} label={labels.server} sublabel={useServer ? undefined : labels.notUsed} tone="flow" className={cn(!useServer && dim)} />
      <FlowEdge from={{ x: 80, y: 144 }} to={{ x: 160, y: 200 }} shape="curve-v" arrow tone={useBrowser ? "primary" : "neutral"} dashed={!useBrowser} className={cn(!useBrowser && dim)} />
      <FlowEdge from={{ x: 240, y: 144 }} to={{ x: 160, y: 200 }} shape="curve-v" arrow tone={useServer ? "primary" : "neutral"} dashed={!useServer} className={cn(!useServer && dim)} />
      <FlowNode x={104} y={200} width={112} height={44} label={labels.track} emphasis />
      <FlowEdge from={{ x: 160, y: 244 }} to={{ x: 160, y: 282 }} arrow tone="primary" />
      <ConsentGate x={160} y={304} size={44} state={gate} label={labels.gate} />
      <text x={160} y={354} textAnchor="middle" className={cn("text-[10px] font-medium", gateTextClass[gate])}>
        {gateText(labels, gate)}
      </text>
      {chips.length ? (
        <>
          <FlowEdge from={{ x: 138, y: 304 }} to={{ x: 64, y: y0 + CHIP_H / 2 }} shape="curve-h" tone="primary" />
          <FlowEdge from={{ x: 64, y: y0 + CHIP_H / 2 }} to={{ x: 64, y: railBottom }} tone="primary" />
        </>
      ) : null}
      {chips.map((d, i) => {
        const y = y0 + i * CHIP_STEP;
        return (
          <g key={d.label}>
            <FlowEdge from={{ x: 64, y: y + CHIP_H / 2 }} to={{ x: 96, y: y + CHIP_H / 2 }} arrow tone={edgeTone(d)} dashed={!!d.edge && d.edge !== "delivered"} />
            <DestinationChip x={96} y={y} width={CHIP_W} height={CHIP_H} label={d.label} status={d.status} statusText={d.statusText} />
          </g>
        );
      })}
    </>
  );
}

/** Website → Track → Consent/Policy → Destinations with selectable origins and gate state. */
export function FlowDiagram({ labels, paths = "hybrid", gate = "granted", destinations, ...base }: FlowDiagramProps) {
  const chips = destinations.slice(0, 4);
  const narrowHeight = 372 + (chips.length ? (chips.length - 1) * CHIP_STEP + CHIP_H + 24 : 0) + 8;
  return (
    <ResponsiveDiagram
      {...base}
      wide={{ width: 720, height: 288, children: <FlowWide labels={labels} paths={paths} gate={gate} destinations={chips} /> }}
      narrow={{ width: 320, height: narrowHeight, children: <FlowNarrow labels={labels} paths={paths} gate={gate} destinations={chips} /> }}
    />
  );
}

/* ------------------------------------------------------------------------------- generic chain */

export type ChainItem = { kind?: "node"; label: string; sublabel?: string; tone?: NodeTone; emphasis?: boolean } | { kind: "gate"; state: GateState; label: string; sublabel?: string };

export interface ChainDiagramProps extends BaseProps {
  items: ChainItem[];
  /** Optional fan-out after the last item. */
  destinations?: FlowDestination[];
}

const NODE_H = 48;
const GATE = 44;

function ChainWide({ items, destinations }: { items: ChainItem[]; destinations: FlowDestination[] }) {
  const W = 720;
  const pad = 8;
  const slots = items.length + (destinations.length ? 1 : 0);
  const slotW = (W - 2 * pad) / slots;
  const nodeW = Math.min(140, Math.floor(slotW - 24));
  const chipBlock = destinations.length ? destinations.length * CHIP_STEP - (CHIP_STEP - CHIP_H) : 0;
  const H = Math.max(176, chipBlock + 64);
  const cy = H / 2;
  const anchors: Array<{ left: number; right: number }> = [];
  const drawn = items.map((item, i) => {
    const slotX = pad + i * slotW;
    if (item.kind === "gate") {
      const cx = slotX + slotW / 2;
      anchors.push({ left: cx - GATE / 2, right: cx + GATE / 2 });
      return (
        <g key={`${item.label}-${i}`}>
          <ConsentGate x={cx} y={cy} size={GATE} state={item.state} label={item.label} />
          {item.sublabel ? (
            <text x={cx} y={cy + GATE / 2 + 28} textAnchor="middle" className={cn("text-[10px] font-medium", gateTextClass[item.state])}>
              {item.sublabel}
            </text>
          ) : null}
        </g>
      );
    }
    const x = slotX + (slotW - nodeW) / 2;
    anchors.push({ left: x, right: x + nodeW });
    return <FlowNode key={`${item.label}-${i}`} x={x} y={cy - NODE_H / 2} width={nodeW} height={NODE_H} label={item.label} sublabel={item.sublabel} tone={item.tone} emphasis={item.emphasis} />;
  });
  const edges = anchors.slice(1).map((a, i) => {
    const prev = anchors[i];
    return prev ? <FlowEdge key={`edge-${i}`} from={{ x: prev.right, y: cy }} to={{ x: a.left, y: cy }} arrow tone="primary" /> : null;
  });
  const last = anchors[anchors.length - 1];
  const chipX = pad + (slots - 1) * slotW + (slotW - CHIP_W) / 2;
  const chipY0 = cy - chipBlock / 2;
  return (
    <>
      {edges}
      {drawn}
      {last
        ? destinations.map((d, i) => {
            const y = chipY0 + i * CHIP_STEP;
            return (
              <g key={d.label}>
                <FlowEdge from={{ x: last.right, y: cy }} to={{ x: chipX, y: y + CHIP_H / 2 }} shape="curve-h" arrow tone={edgeTone(d)} dashed={!!d.edge && d.edge !== "delivered"} />
                <DestinationChip x={chipX} y={y} width={CHIP_W} height={CHIP_H} label={d.label} status={d.status} statusText={d.statusText} />
              </g>
            );
          })
        : null}
    </>
  );
}

function chainNarrowHeight(items: ChainItem[], destinations: FlowDestination[]): number {
  const step = 88;
  const lastBottom = 8 + (items.length - 1) * step + NODE_H;
  if (!destinations.length) return lastBottom + 8;
  const y0 = lastBottom + 40;
  return y0 + (destinations.length - 1) * CHIP_STEP + CHIP_H + 24;
}

function ChainNarrow({ items, destinations }: { items: ChainItem[]; destinations: FlowDestination[] }) {
  const step = 88;
  const cx = 160;
  const drawn = items.map((item, i) => {
    const y = 8 + i * step;
    if (item.kind === "gate") {
      const cy = y + NODE_H / 2;
      return (
        <g key={`${item.label}-${i}`}>
          <ConsentGate x={cx} y={cy} size={GATE} state={item.state} />
          <text x={cx + GATE / 2 + 8} y={item.sublabel ? cy - 4 : cy + 1} dominantBaseline="middle" className="fill-ink text-[11px] font-semibold">
            {item.label}
          </text>
          {item.sublabel ? (
            <text x={cx + GATE / 2 + 8} y={cy + 10} dominantBaseline="middle" className={cn("text-[10px] font-medium", gateTextClass[item.state])}>
              {item.sublabel}
            </text>
          ) : null}
        </g>
      );
    }
    return <FlowNode key={`${item.label}-${i}`} x={cx - 80} y={y} width={160} height={NODE_H} label={item.label} sublabel={item.sublabel} tone={item.tone} emphasis={item.emphasis} />;
  });
  const edges = items.slice(1).map((item, i) => {
    const prev = items[i];
    const fromY = 8 + i * step + (prev?.kind === "gate" ? NODE_H / 2 + GATE / 2 : NODE_H);
    const toY = 8 + (i + 1) * step + (item.kind === "gate" ? NODE_H / 2 - GATE / 2 : 0);
    return <FlowEdge key={`edge-${i}`} from={{ x: cx, y: fromY }} to={{ x: cx, y: toY }} arrow tone="primary" />;
  });
  const lastIndex = items.length - 1;
  const lastItem = items[lastIndex];
  const lastBottom = 8 + lastIndex * step + (lastItem?.kind === "gate" ? NODE_H / 2 + GATE / 2 : NODE_H);
  const y0 = lastBottom + 40;
  const railBottom = y0 + (destinations.length - 1) * CHIP_STEP + CHIP_H / 2;
  return (
    <>
      {edges}
      {drawn}
      {destinations.length ? (
        <>
          <FlowEdge from={{ x: cx, y: lastBottom }} to={{ x: 64, y: y0 + CHIP_H / 2 }} shape="curve-v" tone="primary" />
          <FlowEdge from={{ x: 64, y: y0 + CHIP_H / 2 }} to={{ x: 64, y: railBottom }} tone="primary" />
        </>
      ) : null}
      {destinations.map((d, i) => {
        const y = y0 + i * CHIP_STEP;
        return (
          <g key={d.label}>
            <FlowEdge from={{ x: 64, y: y + CHIP_H / 2 }} to={{ x: 96, y: y + CHIP_H / 2 }} arrow tone={edgeTone(d)} dashed={!!d.edge && d.edge !== "delivered"} />
            <DestinationChip x={96} y={y} width={CHIP_W} height={CHIP_H} label={d.label} status={d.status} statusText={d.statusText} />
          </g>
        );
      })}
    </>
  );
}

/** Left-to-right chain of nodes and gates (e.g. Track AI → typed tools → approval → signed config). */
export function ChainDiagram({ items, destinations = [], ...base }: ChainDiagramProps) {
  const chipBlock = destinations.length ? destinations.length * CHIP_STEP - (CHIP_STEP - CHIP_H) : 0;
  return (
    <ResponsiveDiagram
      {...base}
      wide={{ width: 720, height: Math.max(176, chipBlock + 64), children: <ChainWide items={items} destinations={destinations} /> }}
      narrow={{ width: 320, height: chainNarrowHeight(items, destinations), children: <ChainNarrow items={items} destinations={destinations} /> }}
    />
  );
}
