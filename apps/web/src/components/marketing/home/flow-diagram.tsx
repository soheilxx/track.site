import { ConsentGate, DestinationChip, FlowEdge, FlowNode, ResponsiveDiagram } from "@track-site/ui";
import { DEMO_PLATFORMS_FIXTURE } from "@/components/marketing/demo/fixtures";
import type { HomeCopy } from "@/lib/marketing-copy/types";

/*
 * "Website → Track → Consent / policy → Destinations" for the home page, composed from the SVG
 * primitives in @track-site/ui. Like the feature-page diagrams it is rendered twice: a wide
 * left-to-right layout from `sm` upwards and a compact top-to-bottom layout below `sm`. Inside the
 * product stage a 320 px viewport leaves ~256 px for the figure; the compact variant's viewBox is
 * 260 units wide, so its 13/12/10 px SVG labels render at roughly 1:1 instead of being scaled down
 * to 5–6 px (supplement §4/§10: no unreadable or cut-off text on mobile). Only one variant is in
 * the accessibility tree at a time (the other is display:none); both carry the same title/caption.
 * No looping motion (docs/12 §2).
 */

type FlowNodes = HomeCopy["flow"]["nodes"];

const CHIP_H = 30;

/** Wide layout (sm and up): one horizontal axis, destinations fanned out on the right. */
export const FLOW_WIDE = { width: 600, height: 210 } as const;

function FlowWide({ nodes }: { nodes: FlowNodes }) {
  const chipW = 118;
  const chipX = 470;
  const gap = 10;
  const chips = DEMO_PLATFORMS_FIXTURE.map((p, i) => ({ ...p, y: 12 + i * (CHIP_H + gap) }));
  const midY = 12 + (chips.length * (CHIP_H + gap) - gap) / 2;
  return (
    <>
      <FlowNode x={0} y={midY - 22} width={110} label={nodes.website} sublabel="tracker.js" />
      <FlowEdge from={{ x: 110, y: midY }} to={{ x: 150, y: midY }} tone="primary" arrow />
      <FlowNode x={150} y={midY - 24} width={96} height={48} label={nodes.track} sublabel="EU" emphasis />
      <FlowEdge from={{ x: 246, y: midY }} to={{ x: 286, y: midY }} tone="primary" />
      <ConsentGate x={308} y={midY} size={44} state="granted" label={nodes.consent} />
      {chips.map((p) => (
        <FlowEdge key={`edge-${p.id}`} from={{ x: 330, y: midY }} to={{ x: chipX, y: p.y + CHIP_H / 2 }} shape="curve-h" tone="flow" arrow />
      ))}
      {chips.map((p) => (
        <DestinationChip key={p.id} x={chipX} y={p.y} width={chipW} height={CHIP_H} label={p.name} />
      ))}
    </>
  );
}

/* Compact layout (below sm): Website, Track and the gate stacked on a centre line; the destinations
 * hang off a rail on the left, one per row, so no label is scaled below its nominal size. */
const NARROW_W = 260;
const NARROW_CX = NARROW_W / 2;
const GATE_SIZE = 44;
const GATE_Y = 186;
const RAIL_X = 40;
const NARROW_CHIP_X = 72;
const NARROW_CHIP_W = 168;
const NARROW_CHIP_STEP = 40;
const NARROW_CHIP_Y0 = 244;

export const FLOW_NARROW = { width: NARROW_W, height: NARROW_CHIP_Y0 + (DEMO_PLATFORMS_FIXTURE.length - 1) * NARROW_CHIP_STEP + CHIP_H + 8 } as const;

function FlowNarrow({ nodes }: { nodes: FlowNodes }) {
  const cx = NARROW_CX;
  const chips = DEMO_PLATFORMS_FIXTURE.map((p, i) => ({ ...p, y: NARROW_CHIP_Y0 + i * NARROW_CHIP_STEP }));
  const first = chips[0];
  const last = chips[chips.length - 1];
  return (
    <>
      <FlowNode x={cx - 100} y={8} width={200} label={nodes.website} sublabel="tracker.js" />
      <FlowEdge from={{ x: cx, y: 52 }} to={{ x: cx, y: 84 }} tone="primary" arrow />
      <FlowNode x={cx - 72} y={84} width={144} height={48} label={nodes.track} sublabel="EU" emphasis />
      <FlowEdge from={{ x: cx, y: 132 }} to={{ x: cx, y: GATE_Y - GATE_SIZE / 2 }} tone="primary" />
      <ConsentGate x={cx} y={GATE_Y} size={GATE_SIZE} state="granted" label={nodes.consent} />
      {first && last ? (
        <>
          <FlowEdge from={{ x: cx - GATE_SIZE / 2, y: GATE_Y }} to={{ x: RAIL_X, y: first.y + CHIP_H / 2 }} shape="curve-h" tone="flow" />
          <FlowEdge from={{ x: RAIL_X, y: first.y + CHIP_H / 2 }} to={{ x: RAIL_X, y: last.y + CHIP_H / 2 }} tone="flow" />
        </>
      ) : null}
      {chips.map((p) => (
        <g key={p.id}>
          <FlowEdge from={{ x: RAIL_X, y: p.y + CHIP_H / 2 }} to={{ x: NARROW_CHIP_X, y: p.y + CHIP_H / 2 }} tone="flow" arrow />
          <DestinationChip x={NARROW_CHIP_X} y={p.y} width={NARROW_CHIP_W} height={CHIP_H} label={p.name} />
        </g>
      ))}
    </>
  );
}

/** Data-flow figure of the "How it works" section: wide from `sm`, compact vertical below. */
export function FlowDiagram({ copy }: { copy: HomeCopy }) {
  const { nodes, caption } = copy.flow;
  return (
    <ResponsiveDiagram
      breakpoint="sm"
      title={caption}
      caption={caption}
      wide={{ width: FLOW_WIDE.width, height: FLOW_WIDE.height, children: <FlowWide nodes={nodes} /> }}
      narrow={{ width: FLOW_NARROW.width, height: FLOW_NARROW.height, className: "mx-auto w-full max-w-[20rem]", children: <FlowNarrow nodes={nodes} /> }}
    />
  );
}
