import type { ReactNode } from "react";
import type { FeatureUiCopy } from "@/lib/marketing-copy/features";
import { ChainDiagram, FlowDiagram, type FlowDestination, type FlowPaths, type GateState } from "./flow-diagram";
import { AiSetupView, ClickIdView, ConsentView, DestinationHealthView, EventStreamView, HealthScoreView, LineageView } from "./product-views";

/*
 * Maps a feature slug to its static product view and to its data-flow diagram. Fixtures are
 * consistent across views: TikTok is the vendor with the outage (503 in the lineage, circuit
 * breaker open in destination health, "retrying" in the diagram), marketing consent is the purpose
 * the consent example denies, and the click-id matrix matches packages/policy.
 */

type Dest = FeatureUiCopy["diagram"]["destinations"];

function delivered(label: string): FlowDestination {
  return { label, status: "ok", statusText: "" , edge: "delivered" };
}

export function scenarioFlow(id: "granted" | "withdrawn" | "outage", ui: FeatureUiCopy): { paths: FlowPaths; gate: GateState; destinations: FlowDestination[] } {
  const d = ui.diagram.destinations;
  const t = ui.diagram;
  const ok = (label: string): FlowDestination => ({ ...delivered(label), statusText: t.delivered });
  const blocked = (label: string): FlowDestination => ({ label, status: "bad", statusText: t.blocked, edge: "blocked" });
  switch (id) {
    case "withdrawn":
      return { paths: "hybrid", gate: "denied", destinations: [blocked(d.meta), blocked(d.googleAds), ok(d.ga4), blocked(d.tiktok)] };
    case "outage":
      return { paths: "hybrid", gate: "granted", destinations: [ok(d.meta), ok(d.googleAds), ok(d.ga4), { label: d.tiktok, status: "warn", statusText: t.retrying, edge: "retrying" }] };
    default:
      return { paths: "hybrid", gate: "granted", destinations: [ok(d.meta), ok(d.googleAds), ok(d.ga4), ok(d.tiktok)] };
  }
}

export function modeFlow(paths: FlowPaths, ui: FeatureUiCopy): { paths: FlowPaths; gate: GateState; destinations: FlowDestination[] } {
  const d: Dest = ui.diagram.destinations;
  const ok = (label: string): FlowDestination => ({ ...delivered(label), statusText: ui.diagram.delivered });
  return { paths, gate: "granted", destinations: [ok(d.meta), ok(d.googleAds), ok(d.ga4), ok(d.tiktok)] };
}

/** The product view shown in the detail hero of a feature. */
export function FeatureProductView({ slug, ui, className }: { slug: string; ui: FeatureUiCopy; className?: string }): ReactNode {
  switch (slug) {
    case "ai-setup":
      return <AiSetupView ui={ui} className={className} />;
    case "server-side-tracking":
      return <DestinationHealthView ui={ui} className={className} />;
    case "event-debugger":
      return <LineageView ui={ui} className={className} />;
    case "data-quality":
      return <HealthScoreView ui={ui} className={className} />;
    case "consent":
      return <ConsentView ui={ui} className={className} />;
    case "attribution":
      return <ClickIdView ui={ui} className={className} />;
    default:
      return <EventStreamView ui={ui} className={className} />;
  }
}

/** The (shorter) product view used in the overview rows; the debugger shows the stream there. */
export function FeatureIndexView({ slug, ui, className }: { slug: string; ui: FeatureUiCopy; className?: string }): ReactNode {
  if (slug === "event-debugger") return <EventStreamView ui={ui} className={className} />;
  return <FeatureProductView slug={slug} ui={ui} className={className} />;
}

/** The data-flow diagram of a feature; the surrounding text carries the same information. */
export function FeatureFlowDiagram({ slug, ui, title, caption, className }: { slug: string; ui: FeatureUiCopy; title: string; caption?: ReactNode; className?: string }) {
  const t = ui.diagram;
  const d = t.destinations;
  const ok = (label: string): FlowDestination => ({ ...delivered(label), statusText: t.delivered });
  switch (slug) {
    case "ai-setup": {
      const c = t.chains.setup;
      return (
        <ChainDiagram
          title={title}
          description={c.describe}
          caption={caption}
          className={className}
          items={[
            { label: c.ai, sublabel: c.aiSub, tone: "ai" },
            { label: c.tools, sublabel: c.toolsSub, tone: "flow" },
            { kind: "gate", state: "granted", label: c.approval, sublabel: c.approvalSub },
            { label: c.config, sublabel: c.configSub, emphasis: true },
            { label: c.website, sublabel: c.websiteSub },
          ]}
        />
      );
    }
    case "data-quality": {
      const c = t.chains.health;
      return (
        <ChainDiagram
          title={title}
          description={c.describe}
          caption={caption}
          className={className}
          items={[
            { label: c.events, sublabel: c.eventsSub },
            { label: c.checks, sublabel: c.checksSub, tone: "flow" },
            { label: c.score, sublabel: c.scoreSub, emphasis: true },
            { label: c.issues, sublabel: c.issuesSub, tone: "warn" },
          ]}
        />
      );
    }
    case "attribution": {
      const c = t.chains.attribution;
      return (
        <ChainDiagram
          title={title}
          description={c.describe}
          caption={caption}
          className={className}
          items={[
            { label: c.landing, sublabel: c.landingSub },
            { kind: "gate", state: "granted", label: c.consent, sublabel: c.consentSub },
            { label: c.store, sublabel: c.storeSub, emphasis: true },
            { label: c.purchase, sublabel: c.purchaseSub },
          ]}
          destinations={[
            { label: c.google, status: "ok", statusText: c.googleSub, edge: "delivered" },
            { label: c.meta, status: "ok", statusText: c.metaSub, edge: "delivered" },
          ]}
        />
      );
    }
    case "consent":
      return <FlowDiagram title={title} description={t.describe("hybrid", "denied")} caption={caption} className={className} labels={t} paths="hybrid" gate="denied" destinations={[{ label: d.meta, status: "bad", statusText: t.blocked, edge: "blocked" }, { label: d.googleAds, status: "bad", statusText: t.blocked, edge: "blocked" }, ok(d.ga4), { label: d.tiktok, status: "bad", statusText: t.blocked, edge: "blocked" }]} />;
    case "server-side-tracking":
      return <FlowDiagram title={title} description={t.describe("hybrid", "granted")} caption={caption} className={className} labels={t} paths="hybrid" gate="granted" destinations={[ok(d.meta), ok(d.googleAds), { label: d.tiktok, status: "warn", statusText: t.retrying, edge: "retrying" }, { label: d.linkedin, status: "neutral", statusText: t.paused, edge: "held" }]} />;
    default:
      return <FlowDiagram title={title} description={t.describe("hybrid", "granted")} caption={caption} className={className} labels={t} paths="hybrid" gate="granted" destinations={[ok(d.meta), ok(d.googleAds), ok(d.ga4), { label: d.tiktok, status: "warn", statusText: t.retrying, edge: "retrying" }]} />;
  }
}
