import { ConsentGate, DestinationChip, Diagram, FlowEdge, FlowNode, ProductStage, SignalDot } from "@track-site/ui";
import type { AuthCopy } from "@/lib/marketing-copy/types";
import { AuthSignals } from "./auth-signals";

/**
 * Optional product preview next to login/signup (supplement §4): a static, server-rendered data-flow
 * diagram `Website → Track → Consent gate → Destinations` with example values, plus the signals.
 * Nothing here is live, animated or interactive; the caption says so. The diagram carries an
 * accessible name and the same information is in the surrounding text.
 */
export function AuthPreview({ copy, id, className }: { copy: AuthCopy; id: string; className?: string }) {
  const p = copy.preview;
  const d = p.diagram;
  const gate = { x: 340, y: 115 };
  const chips = [30, 100, 170] as const;
  return (
    <aside id={id} aria-labelledby={`${id}-title`} className={className}>
      <ProductStage as="div" tone="dark" dots padding="md">
        <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{p.eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-2 font-display text-h3 font-semibold text-ink">
          {p.title}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-ink-2">{p.text}</p>
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-3 sm:p-4">
          <Diagram width={520} height={230} title={d.title} caption={p.caption}>
            <FlowNode x={12} y={93} width={108} label={d.website} sublabel={d.websiteSub} />
            <FlowEdge from={{ x: 120, y: 115 }} to={{ x: 176, y: 115 }} tone="primary" arrow />
            <SignalDot x={146} y={115} />
            <FlowNode x={176} y={93} width={108} label={d.track} sublabel={d.trackSub} emphasis />
            <FlowEdge from={{ x: 284, y: 115 }} to={{ x: 318, y: 115 }} arrow />
            <ConsentGate x={gate.x} y={gate.y} size={44} state="granted" label={`${d.consent}: ${d.consentState}`} />
            {chips.map((y, i) => (
              <FlowEdge key={y} from={{ x: 362, y: gate.y }} to={{ x: 404, y: y + 15 }} shape="curve-h" tone="flow" arrow className={i === 1 ? undefined : "opacity-90"} />
            ))}
            {chips.map((y, i) => (
              <DestinationChip key={y} x={404} y={y} width={104} height={30} label={d.destinations[i] ?? ""} status="ok" />
            ))}
            <circle cx={16} cy={214} r={4} className="fill-ok" />
            <text x={26} y={218} className="fill-ink-3 text-[10px]">
              {d.delivered}
            </text>
          </Diagram>
        </div>
        <AuthSignals items={copy.signals} className="mt-6" />
      </ProductStage>
    </aside>
  );
}
