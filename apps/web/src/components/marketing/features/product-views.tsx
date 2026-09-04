import type { ReactNode } from "react";
import { Lock, Sparkles, User } from "lucide-react";
import { Badge, CodeBlock, Status, TBody, Table, Td, Th, THead, Tr, cn } from "@track-site/ui";
import type { FeatureUiCopy } from "@/lib/marketing-copy/features";
import type { HowItWorksPageCopy } from "@/lib/marketing-copy/how-it-works";

/*
 * Static product views composed from the design-system primitives (supplement §4: real UI states
 * instead of screenshots). Every view renders one deliberately marked example state from
 * FEATURE_UI_COPY — no network, no live data, nothing that could be mistaken for a customer's
 * account. Server components; CodeBlock is the only client island (copy button).
 * Inside a dark <ProductStage> the token re-scoping turns every view dark automatically.
 */

export function ViewFrame({ title, caption, example, exampleHint, children, className }: { title: string; caption?: string; example: string; exampleHint: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-ink shadow-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
        <Badge tone="neutral">
          {example}
          <span className="sr-only">: {exampleHint}</span>
        </Badge>
      </div>
      <div className="px-4 py-4">{children}</div>
      {caption ? <p className="border-t border-line px-4 py-3 text-micro text-ink-3">{caption}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- event stream */

export function EventStreamView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { stream } = ui;
  return (
    <ViewFrame title={stream.title} caption={stream.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <Table caption={stream.caption}>
        <THead>
          <tr>
            <Th>{stream.columns.event}</Th>
            <Th>{stream.columns.origin}</Th>
            <Th>{stream.columns.consent}</Th>
            <Th>{stream.columns.decision}</Th>
            <Th>{stream.columns.destination}</Th>
          </tr>
        </THead>
        <TBody>
          {stream.rows.map((row, i) => (
            <Tr key={`${row.event}-${i}`}>
              <Td label={stream.columns.event}>
                <code className="font-mono text-[13px] text-ink">{row.event}</code>
              </Td>
              <Td label={stream.columns.origin}>
                <Badge tone="neutral">{row.origin}</Badge>
              </Td>
              <Td label={stream.columns.consent}>
                <Status tone={row.consentTone}>{row.consent}</Status>
              </Td>
              <Td label={stream.columns.decision}>
                <Status tone={row.decisionTone} indicator="both">
                  {row.decision}
                </Status>
              </Td>
              <Td label={stream.columns.destination} className="text-ink-2">
                {row.destination}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </ViewFrame>
  );
}

/* ------------------------------------------------------------------------------- lineage */

export function LineageView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { lineage } = ui;
  return (
    <ViewFrame title={lineage.title} caption={lineage.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {lineage.facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-micro font-medium tracking-wide text-ink-3 uppercase">{fact.label}</dt>
            <dd className="mt-0.5 break-words text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{lineage.attempts.title}</p>
        <Table caption={lineage.attempts.title} className="mt-2">
          <THead>
            <tr>
              <Th>{lineage.attempts.columns.destination}</Th>
              <Th>{lineage.attempts.columns.status}</Th>
              <Th>{lineage.attempts.columns.result}</Th>
            </tr>
          </THead>
          <TBody>
            {lineage.attempts.rows.map((row) => (
              <Tr key={row.destination}>
                <Td label={lineage.attempts.columns.destination} className="font-medium">
                  {row.destination}
                </Td>
                <Td label={lineage.attempts.columns.status}>
                  <Status tone={row.tone} indicator="both">
                    <span className="font-mono tabular-nums">{row.status}</span>
                  </Status>
                </Td>
                <Td label={lineage.attempts.columns.result} className="text-ink-2">
                  {row.result}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <CodeBlock className="mt-5" code={lineage.payload.code} language="json" title={lineage.payload.title} copyLabel={lineage.payload.copy} copiedLabel={lineage.payload.copied} />
    </ViewFrame>
  );
}

/* ---------------------------------------------------------------------------- health score */

export function HealthScoreView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { health } = ui;
  return (
    <ViewFrame title={health.title} caption={health.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-10">
        <div>
          <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{health.scoreLabel}</p>
          <p className="mt-1 font-display text-5xl font-semibold text-ink tabular-nums">
            {health.score}
            <span className="text-lg font-normal text-ink-3"> / 100</span>
          </p>
        </div>
        <div>
          <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{health.componentsLabel}</p>
          <ul className="mt-2 space-y-3">
            {health.components.map((c) => (
              <li key={c.key} className="text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className="text-ink-3 tabular-nums">
                    <span className="font-semibold text-ink">{c.score}</span> · {health.weight(c.weight)}
                  </span>
                </div>
                <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className={cn("h-full rounded-full", c.score < 75 ? "bg-warn" : "bg-primary")} style={{ width: `${c.score}%` }} />
                </div>
                <p className="mt-1 text-micro text-ink-3">{c.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{health.issuesLabel}</p>
        <ul className="mt-2 divide-y divide-line">
          {health.issues.map((issue) => (
            <li key={issue.title} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <Status tone={issue.tone} indicator="both">
                  <span className="font-mono">{issue.title}</span>
                </Status>
                <p className="mt-1 text-ink-2">{issue.detail}</p>
              </div>
              <span className="shrink-0 text-primary">{issue.fix}</span>
            </li>
          ))}
        </ul>
      </div>
    </ViewFrame>
  );
}

/* --------------------------------------------------------------------------------- consent */

export function ConsentView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { consent } = ui;
  return (
    <ViewFrame title={consent.title} caption={consent.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{consent.purposesLabel}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {consent.purposes.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-3">
                <span className="text-ink">{p.label}</span>
                <Status tone={p.granted ? "ok" : "bad"} indicator="both">
                  {p.granted ? consent.granted : consent.denied}
                </Status>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{consent.flagsLabel}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {consent.flags.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3">
                <code className="font-mono text-[13px] text-ink">{f.key}</code>
                <Status tone={f.value === "granted" ? "ok" : "bad"} indicator="both">
                  {f.value}
                </Status>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-micro font-medium tracking-wide text-ink-3 uppercase">{consent.reasonsLabel}</p>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {consent.reasons.map((r) => (
            <div key={r.code} className="min-w-0">
              <dt>
                <code className="font-mono text-[13px] text-ink">{r.code}</code>
              </dt>
              <dd className="text-ink-2">{r.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </ViewFrame>
  );
}

/* -------------------------------------------------------------------------------- click ids */

export function ClickIdView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { attribution } = ui;
  return (
    <ViewFrame title={attribution.title} caption={attribution.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <Table caption={attribution.caption}>
        <THead>
          <tr>
            <Th>{attribution.columns.id}</Th>
            <Th>{attribution.columns.captured}</Th>
            <Th>{attribution.columns.forwarded}</Th>
            <Th>{attribution.columns.retention}</Th>
          </tr>
        </THead>
        <TBody>
          {attribution.rows.map((row) => (
            <Tr key={row.id}>
              <Td label={attribution.columns.id}>
                <code className="font-mono text-[13px] text-ink">{row.id}</code>
              </Td>
              <Td label={attribution.columns.captured} className="text-ink-2">
                {row.captured}
              </Td>
              <Td label={attribution.columns.forwarded} className="font-medium">
                {row.forwarded}
              </Td>
              <Td label={attribution.columns.retention} className="text-ink-2 tabular-nums">
                {row.retention}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <p className="mt-3 text-micro text-ink-3">{attribution.note}</p>
    </ViewFrame>
  );
}

/* ----------------------------------------------------------------------------- guided setup */

export function AiSetupView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { setup } = ui;
  return (
    <ViewFrame title={setup.title} caption={setup.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <ol className="space-y-3">
        {setup.messages.map((m, i) => {
          const assistant = m.from === "assistant";
          return (
            <li key={i} className={cn("flex gap-3", !assistant && "flex-row-reverse")}>
              <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", assistant ? "bg-violet-soft text-violet" : "bg-surface-2 text-ink-2")}>
                {assistant ? <Sparkles className="size-4" /> : <User className="size-4" />}
              </span>
              <div className={cn("max-w-[85%] min-w-0 rounded-[var(--radius-control)] px-3 py-2 text-sm", assistant ? "bg-violet-soft text-ink" : "bg-surface-2 text-ink")}>
                <p className="text-micro font-medium text-ink-3">{assistant ? setup.assistant : setup.you}</p>
                <p className="mt-0.5">{m.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-control)] border border-line bg-surface p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Lock className="size-4 text-ink-3" aria-hidden="true" />
            {setup.vault.title}
          </p>
          <p className="mt-1 text-ink-2">{setup.vault.text}</p>
          <Status tone="ok" indicator="both" className="mt-2">
            {setup.vault.state}
          </Status>
        </div>
        <div className="rounded-[var(--radius-control)] border border-line bg-surface p-3 text-sm">
          <p className="font-semibold text-ink">{setup.test.title}</p>
          <p className="mt-1 text-ink-2">{setup.test.text}</p>
          <Status tone="ok" indicator="both" className="mt-2">
            {setup.test.state}
          </Status>
        </div>
      </div>
      <div className="mt-3 rounded-[var(--radius-control)] border border-violet/40 bg-violet-soft/60 p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-ink">{setup.approval.title}</p>
            <p className="mt-1 text-ink-2">{setup.approval.text}</p>
          </div>
          <Status tone="warn" indicator="both">
            {setup.approval.state}
          </Status>
        </div>
        <ul className="mt-3 space-y-1 font-mono text-[12px]">
          {setup.approval.diff.map((line) => (
            <li key={line} className={cn(line.startsWith("+") ? "text-ok" : line.startsWith("~") ? "text-warn" : "text-ink-2")}>
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Badge tone="primary">{setup.approval.action}</Badge>
        </div>
      </div>
    </ViewFrame>
  );
}

/* ------------------------------------------------------------------------ destination health */

export function DestinationHealthView({ ui, className }: { ui: FeatureUiCopy; className?: string }) {
  const { destinations } = ui;
  return (
    <ViewFrame title={destinations.title} caption={destinations.caption} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <Table caption={destinations.caption}>
        <THead>
          <tr>
            <Th>{destinations.columns.destination}</Th>
            <Th>{destinations.columns.mode}</Th>
            <Th>{destinations.columns.health}</Th>
            <Th>{destinations.columns.last}</Th>
            <Th>{destinations.columns.queue}</Th>
          </tr>
        </THead>
        <TBody>
          {destinations.rows.map((row) => (
            <Tr key={row.destination}>
              <Td label={destinations.columns.destination} className="font-medium">
                {row.destination}
              </Td>
              <Td label={destinations.columns.mode}>
                <Badge tone="neutral">{row.mode}</Badge>
              </Td>
              <Td label={destinations.columns.health}>
                <Status tone={row.tone} indicator="both">
                  {row.health}
                </Status>
              </Td>
              <Td label={destinations.columns.last} className="text-ink-2 tabular-nums">
                {row.last}
              </Td>
              <Td label={destinations.columns.queue} className="text-ink-2 tabular-nums">
                {row.queue}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </ViewFrame>
  );
}

/* ------------------------------------------------------------------------ published version */

export function PublishedVersionView({ published, ui, className }: { published: HowItWorksPageCopy["published"]; ui: FeatureUiCopy; className?: string }) {
  return (
    <ViewFrame title={published.title} example={ui.example} exampleHint={ui.exampleHint} className={className}>
      <Status tone="ok" indicator="both" chip>
        {published.state}
      </Status>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {published.facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-micro font-medium tracking-wide text-ink-3 uppercase">{fact.label}</dt>
            <dd className="mt-0.5 text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </ViewFrame>
  );
}
