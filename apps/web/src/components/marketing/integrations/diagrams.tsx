import { ConsentGate, DestinationChip, Diagram, FlowEdge, FlowNode, SignalDot } from "@track-site/ui";
import type { IntegrationKind, IntegrationMode } from "@/lib/integrations-catalog";

/**
 * Data-flow diagrams of the integrations area (supplement §3: signals, nodes, routing lines, consent
 * gates, destinations). Both are server components built from the token-driven SVG primitives; the
 * information they carry is repeated in the surrounding text and caption.
 */
const W = 640;
const H = 280;

export interface OverviewDiagramCopy {
  title: string;
  description: string;
  caption: string;
  nodes: { website: string; websiteSub: string; server: string; serverSub: string; track: string; trackSub: string; consent: string; ads: string; analytics: string; own: string };
}

/** Website + server/CRM → Track → consent gate → three destination groups. */
export function IntegrationsOverviewDiagram({ copy }: { copy: OverviewDiagramCopy }) {
  const n = copy.nodes;
  return (
    <Diagram width={W} height={H} title={copy.title} description={copy.description} caption={copy.caption}>
      <FlowNode x={16} y={92} width={124} height={48} label={n.website} sublabel={n.websiteSub} />
      <FlowNode x={16} y={176} width={124} height={48} label={n.server} sublabel={n.serverSub} />
      <FlowEdge from={{ x: 140, y: 116 }} to={{ x: 240, y: 150 }} shape="curve-h" tone="primary" arrow />
      <FlowEdge from={{ x: 140, y: 200 }} to={{ x: 240, y: 166 }} shape="curve-h" tone="primary" arrow />
      <SignalDot x={190} y={130} tone="primary" />
      <SignalDot x={190} y={186} tone="primary" />
      <FlowNode x={240} y={130} width={136} height={56} label={n.track} sublabel={n.trackSub} emphasis />
      <FlowEdge from={{ x: 376, y: 158 }} to={{ x: 412, y: 158 }} tone="primary" arrow />
      <ConsentGate x={436} y={158} size={44} state="granted" label={n.consent} />
      <FlowEdge from={{ x: 458, y: 158 }} to={{ x: 498, y: 64 }} shape="curve-h" tone="flow" arrow />
      <FlowEdge from={{ x: 458, y: 158 }} to={{ x: 498, y: 158 }} tone="flow" arrow />
      <FlowEdge from={{ x: 458, y: 158 }} to={{ x: 498, y: 252 }} shape="curve-h" tone="flow" arrow />
      <DestinationChip x={500} y={48} width={124} label={n.ads} />
      <DestinationChip x={500} y={142} width={124} label={n.analytics} />
      <DestinationChip x={500} y={236} width={124} label={n.own} />
    </Diagram>
  );
}

export interface FlowDiagramCopy {
  title: string;
  description: string;
  caption: string;
  nodes: { website: string; websiteSub: string; server: string; serverSub: string; offline: string; offlineSub: string; shop: string; shopSub: string; track: string; trackSub: string; trackPairing: string; consent: string; destinations: string };
  edges: Record<IntegrationMode, string> & { shop: string };
}

interface Row {
  label: string;
  sublabel: string;
  edge: string;
}

/**
 * Detail-page flow: only the paths the integration supports are drawn (destinations: browser /
 * server / offline into Track → gate → the platform; sources: browser + signed shop webhooks into
 * Track, paired by order id → gate → destinations).
 */
export function IntegrationFlowDiagram({ kind, modes, name, purposeLabel, copy }: { kind: IntegrationKind; modes: IntegrationMode[]; name: string; purposeLabel: string; copy: FlowDiagramCopy }) {
  const n = copy.nodes;
  const rows: Row[] =
    kind === "source"
      ? [
          { label: n.website, sublabel: n.websiteSub, edge: copy.edges.browser },
          { label: n.shop, sublabel: n.shopSub, edge: copy.edges.shop },
        ]
      : modes.map((m) => (m === "browser" ? { label: n.website, sublabel: n.websiteSub, edge: copy.edges.browser } : m === "server" ? { label: n.server, sublabel: n.serverSub, edge: copy.edges.server } : { label: n.offline, sublabel: n.offlineSub, edge: copy.edges.offline }));
  const centreY = H / 2;
  const gap = 76;
  const nodeH = 48;
  return (
    <Diagram width={W} height={H} title={copy.title} description={copy.description} caption={copy.caption}>
      {rows.map((row, i) => {
        const cy = centreY + (i - (rows.length - 1) / 2) * gap;
        return (
          <g key={row.label}>
            <FlowNode x={16} y={cy - nodeH / 2} width={132} height={nodeH} label={row.label} sublabel={row.sublabel} />
            <FlowEdge from={{ x: 148, y: cy }} to={{ x: 248, y: centreY }} shape="curve-h" tone="primary" arrow label={row.edge} />
            <SignalDot x={198} y={(cy + centreY) / 2} tone="primary" />
          </g>
        );
      })}
      <FlowNode x={248} y={centreY - 28} width={136} height={56} label={n.track} sublabel={kind === "source" ? n.trackPairing : n.trackSub} emphasis />
      <FlowEdge from={{ x: 384, y: centreY }} to={{ x: 428, y: centreY }} tone="primary" arrow />
      <ConsentGate x={452} y={centreY} size={44} state="granted" label={`${n.consent}: ${purposeLabel}`} />
      <FlowEdge from={{ x: 474, y: centreY }} to={{ x: 496, y: centreY }} tone="flow" arrow />
      <DestinationChip x={498} y={centreY - 16} width={126} label={kind === "source" ? n.destinations : name} />
    </Diagram>
  );
}
