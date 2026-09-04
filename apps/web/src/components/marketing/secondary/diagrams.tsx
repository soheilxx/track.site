import type { ReactNode } from "react";
import {
  ConsentGate,
  DestinationChip,
  Diagram,
  FlowEdge,
  FlowNode,
  SignalDot,
  type Tone,
} from "@track-site/ui";
import type { SecondaryCopy } from "@/lib/marketing-copy/types";

/*
 * Data-flow diagrams of the secondary pages, composed from the @track-site/ui SVG primitives so
 * they render on light ground, in dark mode and inside a ProductStage. Each diagram has an
 * accessible name and a visible caption; everything it shows is also stated in the page text.
 * Wide diagrams keep a minimum width and scroll inside their own region instead of shrinking the
 * labels below legibility on narrow screens (the page itself never scrolls horizontally). The
 * region is keyboard-focusable so the hidden part is reachable without a pointer (WCAG 2.1.1).
 */

const WIDE = "min-w-[40rem]";

/** Horizontal scroll container for a wide diagram: focusable, named, with a visible focus ring. */
function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label}
      className="overflow-x-auto rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </div>
  );
}

/** Website → Track → Consent/Policy → Destinations (docs). */
export function PipelineDiagram({
  copy,
  title,
  caption,
}: {
  copy: SecondaryCopy["docs"]["flow"];
  title: string;
  caption: string;
}) {
  const n = copy.nodes;
  const chips = ["Meta", "Google Ads", "GA4"];
  return (
    <ScrollRegion label={title}>
      <Diagram
        width={760}
        height={200}
        title={title}
        description={caption}
        caption={caption}
        className={WIDE}
      >
        <FlowNode x={16} y={72} width={132} height={56} label={n.website} sublabel={n.websiteSub} />
        <FlowEdge from={{ x: 148, y: 100 }} to={{ x: 226, y: 100 }} tone="primary" arrow animated />
        <SignalDot x={187} y={100} tone="primary" pulse />
        <FlowNode
          x={226}
          y={72}
          width={170}
          height={56}
          label={n.track}
          sublabel={n.trackSub}
          emphasis
        />
        <FlowEdge from={{ x: 396, y: 100 }} to={{ x: 446, y: 100 }} tone="primary" arrow />
        <text x={470} y={62} textAnchor="middle" className="fill-ink-3 text-[10px] font-medium">
          {n.consent}
        </text>
        <ConsentGate x={470} y={100} size={48} state="granted" />
        <FlowEdge from={{ x: 470, y: 124 }} to={{ x: 470, y: 160 }} tone="bad" dashed arrow />
        <text x={470} y={178} textAnchor="middle" className="fill-bad text-[10px] font-medium">
          {copy.labels.held}
        </text>
        <text x={527} y={40} textAnchor="middle" className="fill-ok text-[10px] font-medium">
          {copy.labels.granted}
        </text>
        {chips.map((label, i) => {
          const y = 44 + i * 40;
          return (
            <g key={label}>
              <FlowEdge
                from={{ x: 494, y: 100 }}
                to={{ x: 560, y: y + 16 }}
                tone="ok"
                shape="curve-h"
                arrow
              />
              <DestinationChip x={560} y={y} width={180} label={label} />
            </g>
          );
        })}
        <text x={650} y={180} textAnchor="middle" className="fill-ink-3 text-[10px] font-medium">
          {n.destinations}
        </text>
      </Diagram>
    </ScrollRegion>
  );
}

export interface StatusNodeState {
  tone: Tone;
  /** Visible state text (the colour never carries it alone). */
  text: string;
}

/** Collector → queue → worker → destinations with the control plane database, toned by live health (status page). */
export function StatusFlowDiagram({
  title,
  caption,
  labels,
  states,
}: {
  title: string;
  caption: string;
  labels: {
    collector: string;
    queue: string;
    worker: string;
    database: string;
    destinations: string;
  };
  states: {
    collector: StatusNodeState;
    queue: StatusNodeState;
    worker: StatusNodeState;
    db: StatusNodeState;
  };
}) {
  return (
    <ScrollRegion label={title}>
      <Diagram
        width={760}
        height={200}
        title={title}
        description={caption}
        caption={caption}
        className={WIDE}
      >
        <FlowNode
          x={16}
          y={40}
          width={160}
          height={56}
          label={labels.collector}
          sublabel={states.collector.text}
          tone={states.collector.tone}
        />
        <FlowEdge from={{ x: 176, y: 68 }} to={{ x: 236, y: 68 }} tone="primary" arrow />
        <FlowNode
          x={236}
          y={40}
          width={150}
          height={56}
          label={labels.queue}
          sublabel={states.queue.text}
          tone={states.queue.tone}
        />
        <FlowEdge from={{ x: 386, y: 68 }} to={{ x: 446, y: 68 }} tone="primary" arrow />
        <FlowNode
          x={446}
          y={40}
          width={150}
          height={56}
          label={labels.worker}
          sublabel={states.worker.text}
          tone={states.worker.tone}
        />
        <FlowEdge from={{ x: 596, y: 68 }} to={{ x: 656, y: 68 }} tone="primary" arrow />
        <FlowNode x={656} y={40} width={90} height={56} label={labels.destinations} />
        <FlowEdge from={{ x: 311, y: 140 }} to={{ x: 311, y: 96 }} dashed />
        <FlowEdge from={{ x: 521, y: 140 }} to={{ x: 521, y: 96 }} dashed />
        <FlowNode
          x={236}
          y={140}
          width={360}
          height={48}
          label={labels.database}
          sublabel={states.db.text}
          tone={states.db.tone}
        />
      </Diagram>
    </ScrollRegion>
  );
}

/** Controls along the event path: signed config, collector, queue, policy, worker with vault, kill switch (security page). */
export function SecurityFlowDiagram({
  copy,
  title,
  caption,
}: {
  copy: SecondaryCopy["security"]["flow"];
  title: string;
  caption: string;
}) {
  const n = copy.nodes;
  return (
    <ScrollRegion label={title}>
      <Diagram
        width={840}
        height={300}
        title={title}
        description={caption}
        caption={caption}
        className="min-w-[46rem]"
      >
        <FlowNode
          x={16}
          y={16}
          width={150}
          height={52}
          label={n.config}
          sublabel={n.configSub}
          tone="primary"
        />
        <FlowEdge from={{ x: 91, y: 68 }} to={{ x: 71, y: 124 }} tone="primary" arrow />
        <FlowNode x={16} y={124} width={110} height={56} label={n.website} />
        <FlowEdge from={{ x: 126, y: 152 }} to={{ x: 166, y: 152 }} tone="primary" arrow animated />
        <FlowNode
          x={166}
          y={124}
          width={150}
          height={56}
          label={n.collector}
          sublabel={n.collectorSub}
        />
        <FlowEdge from={{ x: 316, y: 152 }} to={{ x: 356, y: 152 }} tone="primary" arrow />
        <FlowNode x={356} y={124} width={100} height={56} label={n.queue} sublabel={n.queueSub} />
        <FlowEdge from={{ x: 456, y: 152 }} to={{ x: 482, y: 152 }} tone="primary" arrow />
        <text x={506} y={112} textAnchor="middle" className="fill-ink-3 text-[10px] font-medium">
          {n.policy}
        </text>
        <ConsentGate x={506} y={152} size={48} state="granted" />
        <FlowEdge from={{ x: 530, y: 152 }} to={{ x: 560, y: 152 }} tone="ok" arrow />
        <FlowNode x={560} y={124} width={140} height={56} label={n.worker} sublabel={n.workerSub} />
        <FlowEdge from={{ x: 700, y: 152 }} to={{ x: 740, y: 152 }} tone="ok" arrow />
        <FlowNode x={740} y={124} width={90} height={56} label={n.destination} />
        <FlowNode x={560} y={16} width={140} height={52} label={n.kill} tone="bad" />
        <FlowEdge from={{ x: 630, y: 68 }} to={{ x: 630, y: 124 }} tone="bad" dashed arrow />
        <FlowEdge
          from={{ x: 560, y: 42 }}
          to={{ x: 241, y: 124 }}
          tone="bad"
          shape="curve-h"
          dashed
          arrow
        />
        <FlowNode x={560} y={230} width={140} height={48} label={n.vault} sublabel={n.vaultSub} />
        <FlowEdge from={{ x: 630, y: 230 }} to={{ x: 630, y: 180 }} dashed />
      </Diagram>
    </ScrollRegion>
  );
}
