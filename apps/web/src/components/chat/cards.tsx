"use client";

import { Check, ChevronDown, Circle, X } from "lucide-react";
import { useState } from "react";
import type { UiCard } from "@track-site/ai";
import { Badge, Button, Card, cn } from "@track-site/ui";

const TONE: Record<string, string> = { neutral: "border-line", ok: "border-ok/40 bg-ok-soft", warn: "border-warn/40 bg-warn-soft", bad: "border-bad/40 bg-bad-soft" };

export function UiCardView({ card, onChoice }: { card: UiCard; onChoice?: (field: string, values: string[], label: string) => void }) {
  switch (card.type) {
    case "info":
      return (
        <Card className={cn("p-4", TONE[card.tone])}>
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{card.body}</p>
        </Card>
      );
    case "checklist":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <ul className="mt-2 space-y-1.5">
            {card.items.map((i) => (
              <li key={i.label} className="flex items-start gap-2 text-sm">
                {i.done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
                <span className={i.done ? "text-ink-3 line-through" : "text-ink"}>
                  {i.label}
                  {i.detail ? <span className="block text-xs text-ink-3 no-underline">{i.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      );
    case "snippet":
      return <SnippetCard title={card.title} code={card.code} note={card.note} />;
    case "choice":
      return <ChoiceCard card={card} onChoice={onChoice} />;
    case "event_plan":
      return (
        <Card className="overflow-hidden">
          <p className="px-4 py-3 text-sm font-semibold text-ink">{card.title}</p>
          <ul className="divide-y divide-line border-t border-line">
            {card.events.map((e) => (
              <li key={e.name} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-ink">{e.name}</span>
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  {e.critical ? <Badge tone="warn">critical</Badge> : null}
                  <span>{e.capture}</span>
                  {e.source ? <span>· {e.source}</span> : null}
                  <Badge tone={e.enabled ? "ok" : "neutral"}>{e.enabled ? "on" : "off"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      );
    case "mapping_table":
      return (
        <Card className="overflow-hidden">
          <p className="px-4 py-3 text-sm font-semibold text-ink">
            {card.title} <span className="text-ink-3">· {card.destination}</span>
          </p>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Vendor event</th>
                  <th className="px-4 py-2">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {card.rows.map((r) => (
                  <tr key={r.event} className="border-t border-line">
                    <td className="px-4 py-2 font-mono text-xs">{r.event}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.vendor_event}</td>
                    <td className="px-4 py-2">{r.enabled ? <Check className="h-4 w-4 text-ok" aria-label="enabled" /> : <X className="h-4 w-4 text-ink-3" aria-label="disabled" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      );
    case "test_status":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {card.items.map((i) => (
              <li key={i.label} className="flex items-start gap-2">
                <StatusDot status={i.status} />
                <span>
                  {i.label}
                  {i.detail ? <span className="block text-xs text-ink-3">{i.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      );
    case "delivery_timeline":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <ol className="mt-3 flex flex-wrap gap-2">
            {card.steps.map((s) => (
              <li key={s.stage} className={cn("rounded-full border px-2.5 py-1 text-xs", s.status === "done" ? "border-ok/40 bg-ok-soft text-ok" : s.status === "current" ? "border-primary/40 bg-primary-soft text-primary" : s.status === "blocked" ? "border-bad/40 bg-bad-soft text-bad" : "border-line text-ink-3")} title={s.detail ?? undefined}>
                {s.stage}
              </li>
            ))}
          </ol>
        </Card>
      );
    case "diff":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">
            {card.title} <span className="text-ink-3">· v{card.version_from ?? 0} → v{card.version_to}</span>
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
            {card.changes.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className={cn("font-mono text-xs", c.op === "add" ? "text-ok" : c.op === "remove" ? "text-bad" : "text-warn")}>{c.op === "add" ? "+" : c.op === "remove" ? "−" : "~"}</span>
                <span className="text-ink-2">{c.summary}</span>
              </li>
            ))}
          </ul>
          {card.recipients.length ? (
            <div className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
              {card.recipients.map((r) => (
                <p key={r.name}>
                  <span className="font-medium text-ink">{r.name}</span> ({r.type}, {r.purpose}): {r.events.join(", ") || "no events"}
                </p>
              ))}
            </div>
          ) : null}
        </Card>
      );
    case "status":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {card.metrics.map((m) => (
              <div key={m.label} className="rounded-lg bg-surface-2 p-2">
                <dt className="text-[11px] uppercase tracking-wide text-ink-3">{m.label}</dt>
                <dd className={cn("text-base font-semibold", m.tone === "ok" ? "text-ok" : m.tone === "warn" ? "text-warn" : m.tone === "bad" ? "text-bad" : "text-ink")}>{m.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      );
    case "credential_request":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <p className="mt-1 text-sm text-ink-2">{card.help}</p>
        </Card>
      );
    default:
      return null;
  }
}

function StatusDot({ status }: { status: "pending" | "ok" | "failed" | "skipped" }) {
  const cls = status === "ok" ? "bg-ok" : status === "failed" ? "bg-bad" : status === "skipped" ? "bg-line-2" : "bg-warn";
  return <span className={cn("mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full", cls)} aria-label={status} />;
}

function SnippetCard({ title, code, note }: { title: string; code: string; note: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink">
        <code>{code}</code>
      </pre>
      <div className="mt-2 flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        {note ? <span className="text-xs text-ink-3">{note}</span> : null}
      </div>
    </Card>
  );
}

function ChoiceCard({ card, onChoice }: { card: Extract<UiCard, { type: "choice" }>; onChoice?: (field: string, values: string[], label: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">{card.title}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {card.options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              className={cn("rounded-xl border p-3 text-left transition-colors hover:border-primary/50", active ? "border-primary bg-primary-soft" : "border-line bg-surface")}
              onClick={() => {
                if (card.multiple) setSelected((s) => (s.includes(o.value) ? s.filter((x) => x !== o.value) : [...s, o.value]));
                else onChoice?.(card.field, [o.value], o.label);
              }}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {o.label}
                {o.recommended ? <Badge tone="primary">recommended</Badge> : null}
              </span>
              {o.description ? <span className="mt-1 block text-xs text-ink-3">{o.description}</span> : null}
            </button>
          );
        })}
      </div>
      {card.multiple ? (
        <Button size="sm" className="mt-3" disabled={selected.length === 0} onClick={() => onChoice?.(card.field, selected, selected.map((v) => card.options.find((o) => o.value === v)?.label ?? v).join(", "))}>
          Continue <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
        </Button>
      ) : null}
    </Card>
  );
}
