"use client";

import { useLocale, useTranslations } from "next-intl";
import { Status, cn, type Tone } from "@track-site/ui";
import type { StepTone, TimelineStep } from "@/server/events-lineage";
import { formatTime } from "./format";

export const STEP_TONE: Record<StepTone, Tone> = { ok: "ok", warn: "warn", bad: "bad", info: "info", neutral: "neutral" };

/** Plain-language reason for a machine code; falls back to the code itself (never hidden). */
export function useReasonLabel() {
  const t = useTranslations("events.reasons");
  return (code: string | null | undefined): string | null => {
    if (!code) return null;
    return t.has(code) ? t(code) : code;
  };
}

const DETAIL_KEYS: Array<{ key: string; kind: "list" | "text" | "bool" }> = [
  { key: "purposes_granted", kind: "list" },
  { key: "purpose_required", kind: "text" },
  { key: "stripped_fields", kind: "list" },
  { key: "pii_redacted", kind: "list" },
  { key: "consent_source", kind: "text" },
  { key: "region", kind: "text" },
  { key: "gpc", kind: "bool" },
  { key: "policy_version", kind: "text" },
  { key: "config_version", kind: "text" },
  { key: "test_mode", kind: "bool" },
  { key: "billable", kind: "bool" },
  { key: "planned", kind: "bool" },
  { key: "adopted_browser_context", kind: "bool" },
  { key: "connector_type", kind: "text" },
  { key: "vendor_event", kind: "text" },
  { key: "mode", kind: "text" },
  { key: "http_status", kind: "text" },
  { key: "duration_ms", kind: "text" },
  { key: "error_class", kind: "text" },
  { key: "attempt", kind: "text" },
  { key: "next_retry_at", kind: "text" },
  { key: "key", kind: "text" },
  { key: "prior_source", kind: "text" },
  { key: "findings", kind: "list" },
  { key: "warnings", kind: "list" },
  { key: "destination_status", kind: "text" },
];

function DetailChips({ detail }: { detail: Record<string, unknown> }) {
  const t = useTranslations("events.detailKeys");
  const tc = useTranslations("events.common");
  const items: Array<{ key: string; value: string }> = [];
  for (const { key, kind } of DETAIL_KEYS) {
    const v = detail[key];
    if (v === undefined || v === null) continue;
    if (kind === "list") {
      if (!Array.isArray(v) || v.length === 0) continue;
      items.push({ key, value: v.map(String).join(", ") });
    } else if (kind === "bool") items.push({ key, value: v ? tc("yes") : tc("no") });
    else items.push({ key, value: String(v) });
  }
  const notRouted = Array.isArray(detail.not_routed) ? (detail.not_routed as Array<{ integration_id: string; reason: string }>) : [];
  if (items.length === 0 && notRouted.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
      {items.map((i) => (
        <div key={i.key} className="inline-flex gap-1">
          <dt>{t.has(i.key) ? t(i.key) : i.key}:</dt>
          <dd className="font-mono text-ink-2">{i.value}</dd>
        </div>
      ))}
      {notRouted.length ? (
        <div className="inline-flex gap-1">
          <dt>{t("not_routed")}:</dt>
          <dd className="text-ink-2">{notRouted.length}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export interface LineageTimelineProps {
  steps: TimelineStep[];
  integrations: Record<string, { name: string; type: string }>;
  /** compact rows (test lab) or full detail chips (explorer) */
  dense?: boolean;
  className?: string;
}

/** Ordered pipeline stages of one event: captured → accepted → normalized → policy → deduplicated → routed → delivered / rejected. */
export function LineageTimeline({ steps, integrations, dense = false, className }: LineageTimelineProps) {
  const t = useTranslations("events");
  const locale = useLocale();
  const reason = useReasonLabel();
  if (steps.length === 0) return <p className="text-sm text-ink-3">{t("explorer.detail.noTimeline")}</p>;
  return (
    <ol className={cn("relative space-y-3 border-l border-line pl-5", className)}>
      {steps.map((s, i) => {
        const tone = STEP_TONE[s.tone];
        const name = s.integrationId ? (integrations[s.integrationId]?.name ?? s.integrationId) : null;
        return (
          <li key={`${s.stage}-${s.integrationId ?? ""}-${i}`} className="relative">
            <span aria-hidden="true" className={cn("absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full ring-2 ring-surface", { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", neutral: "bg-ink-3" }[tone])} />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-ink">{t(`stages.${s.stage}`)}</span>
              <Status tone={tone} chip indicator="icon">
                {t(`outcomes.${s.outcome}`)}
              </Status>
              {name ? <span className="text-xs text-ink-2">{name}</span> : null}
              <span className="ml-auto text-xs tabular-nums text-ink-3">{s.at ? formatTime(s.at, locale, true) : t("explorer.detail.noTime")}</span>
            </div>
            {s.reason ? <p className={cn("mt-0.5 text-sm", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink-2")}>{reason(s.reason)}</p> : null}
            {s.derived ? <p className="mt-0.5 text-xs text-ink-3">{t("explorer.detail.derivedHint")}</p> : null}
            {!dense ? <DetailChips detail={s.detail} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
