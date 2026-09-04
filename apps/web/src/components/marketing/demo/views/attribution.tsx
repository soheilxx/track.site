"use client";

import { Status, TBody, Table, Td, Th, THead, Tr, cn } from "@track-site/ui";
import { platformFixture } from "../fixtures";
import { PlatformMark } from "../platform-mark";
import { ConsentStatus, ViewTitle, type DemoViewProps } from "../parts";
import { attributionRows } from "../state";

/** Attribution: which click ids the sample sessions carried, consent, and forwarding — observed facts only. */
export function AttributionView({ state, copy }: DemoViewProps) {
  const rows = attributionRows(state);
  const c = copy.attribution;
  return (
    <div>
      <ViewTitle>{c.title}</ViewTitle>
      <p className="mt-1 text-small text-ink-2">{c.intro}</p>
      <Table caption={c.title} wrapperClassName="mt-3 rounded-[var(--radius-card)] border border-line bg-surface">
        <THead>
          <tr>
            <Th>{c.columns.platform}</Th>
            <Th>{c.columns.clickId}</Th>
            <Th>{c.columns.captured}</Th>
            <Th>{c.columns.consent}</Th>
            <Th>{c.columns.forwarded}</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => {
            const f = platformFixture(r.id);
            const selected = r.id === state.platform;
            return (
              <Tr key={r.id} className={cn(selected && "bg-primary-soft/40")} aria-current={selected ? "true" : undefined}>
                <Td label={c.columns.platform}>
                  <span className="inline-flex items-center gap-2 font-medium">
                    <PlatformMark id={f.id} name={f.name} size="sm" />
                    {f.name}
                  </span>
                </Td>
                <Td label={c.columns.clickId}>
                  <code className="font-mono text-micro">{f.clickParam}</code>
                </Td>
                <Td label={c.columns.captured}>
                  <Status tone={r.captured ? "ok" : "neutral"} indicator="icon" className="text-micro">
                    {c.captured[r.captured ? "yes" : "no"]}
                  </Status>
                </Td>
                <Td label={c.columns.consent}>{r.consent ? <ConsentStatus consent={r.consent} copy={copy} /> : <span className="text-ink-3">{c.consentNa}</span>}</Td>
                <Td label={c.columns.forwarded}>
                  {r.captured ? (
                    <Status tone={r.forwarded ? "ok" : "warn"} indicator="icon" className="text-micro">
                      {c.forwarded[r.forwarded ? "yes" : "no"]}
                    </Status>
                  ) : (
                    <span className="text-ink-3">{c.forwarded.na}</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      <p className="mt-3 text-micro text-ink-3">{c.note}</p>
    </div>
  );
}
