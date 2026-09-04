import { Check } from "lucide-react";
import { DestinationChip, Diagram, FlowEdge, FlowNode, SignalDot } from "@track-site/ui";
import type { PricingCopy } from "@/lib/marketing-copy/types";

/**
 * "What counts as an event?" as a two-column narrative: the rule and the never-billed cases as text,
 * next to a data-flow diagram that shows one accepted event counted once and fanned out to several
 * destinations. The diagram is labelled; everything it says is also in the text and the caption.
 */
export function EventDefinition({ text, notCounted, copy }: { text: string; notCounted: string[]; copy: PricingCopy["events"] }) {
  const n = copy.nodes;
  const trackX = 140;
  const trackW = 124;
  const chipX = 316;
  const chipW = 96;
  const chipH = 30;
  const chipYs = [18, 80, 142];
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
      <div className="max-w-text">
        <p className="text-body text-ink-2">{text}</p>
        <h3 className="mt-8 text-small font-semibold tracking-wide text-ink-3 uppercase">{copy.notCountedTitle}</h3>
        <ul className="mt-3 space-y-2">
          {notCounted.map((r) => (
            <li key={r} className="flex items-start gap-2 text-small text-ink-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
      <Diagram width={420} height={192} title={copy.diagramTitle} description={copy.diagramDescription} caption={copy.diagramCaption} figureClassName="w-full max-w-md lg:max-w-none">
        <FlowNode x={8} y={73} width={92} label={n.website} />
        <FlowEdge from={{ x: 100, y: 95 }} to={{ x: trackX, y: 95 }} tone="primary" arrow />
        <SignalDot x={120} y={95} tone="primary" />
        <FlowNode x={trackX} y={73} width={trackW} label={n.track} sublabel={n.trackSub} emphasis />
        <text x={trackX + trackW / 2} y={136} textAnchor="middle" className="fill-ink-3 text-[10px]">
          {n.fanOut}
        </text>
        {n.destinations.map((d, i) => {
          const y = chipYs[i] ?? 80;
          return (
            <g key={d}>
              <FlowEdge from={{ x: trackX + trackW, y: 95 }} to={{ x: chipX, y: y + chipH / 2 }} shape="curve-h" tone="flow" arrow />
              <DestinationChip x={chipX} y={y} width={chipW} height={chipH} label={d} status="ok" />
            </g>
          );
        })}
      </Diagram>
    </div>
  );
}
