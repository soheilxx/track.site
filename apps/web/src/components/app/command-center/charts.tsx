"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/format";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
/** Reduced-motion preference as an external store: `true` on the server and during hydration, live afterwards. */
const useReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => true);
const noop = () => () => {};
/** `false` for the server render and hydration, `true` once the client owns the tree (the chart measures its container). */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** One stacked series; `color` names a token (`primary`, `ok`, `warn`, `bad`, `info`, `violet`, `cyan`). */
export interface ChartSeries {
  key: string;
  label: string;
  color: "primary" | "ok" | "warn" | "bad" | "info" | "violet" | "cyan";
}

export interface ChartRow {
  /** pre-formatted category label (hour or day) */
  label: string;
  [key: string]: string | number;
}

interface TooltipEntry {
  name?: string | number;
  value?: string | number | ReadonlyArray<string | number>;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({ active, payload, label, locale }: { active?: boolean; payload?: ReadonlyArray<TooltipEntry>; label?: string | number; locale: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-control-sm)] border border-line bg-surface px-3 py-2 text-xs text-ink shadow-pop">
      <p className="font-medium">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: entry.color }} />
            <span className="text-ink-2">{entry.name}</span>
            <span className="ml-auto tabular-nums">{typeof entry.value === "number" ? formatNumber(entry.value, locale) : String(entry.value ?? "")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Token-coloured stacked bar chart (recharts). Renders after mount so the server output is a
 * fixed-height placeholder (no hydration mismatch, no layout shift); bar animation follows
 * `prefers-reduced-motion` and stays within the 400 ms chart budget. The accessible alternative
 * (a table with the same rows) is rendered by the server next to the figure.
 */
export function StackedBarChart({ data, series, locale, title, description, height = 220 }: { data: ChartRow[]; series: ChartSeries[]; locale: string; title: string; description: string; height?: number }) {
  const ready = useHydrated();
  const reduced = useReducedMotion();
  if (!ready) return <div style={{ height }} className="w-full animate-pulse rounded-[var(--radius-control)] bg-surface-2 motion-reduce:animate-none" aria-hidden="true" />;
  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} title={title} desc={description}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--color-line-2)" }} tick={{ fill: "var(--color-ink-3)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis allowDecimals={false} width={44} tickLine={false} axisLine={false} tick={{ fill: "var(--color-ink-3)", fontSize: 11 }} tickFormatter={(value: number) => formatNumber(value, locale, { notation: "compact" })} />
          <Tooltip cursor={{ fill: "var(--color-surface-2)" }} content={<ChartTooltip locale={locale} />} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--color-ink-2)" }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="stack" fill={`var(--color-${s.color})`} isAnimationActive={!reduced} animationDuration={400} animationEasing="ease-out" radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
