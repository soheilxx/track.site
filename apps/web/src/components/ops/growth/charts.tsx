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

export interface SignupPoint {
  /** pre-formatted category label (day or week) */
  label: string;
  organizations: number;
  users: number;
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
            <span aria-hidden="true" className="h-0.5 w-3 rounded-sm" style={{ background: entry.color }} />
            <span className="font-semibold tabular-nums">{typeof entry.value === "number" ? formatNumber(entry.value, locale) : String(entry.value ?? "")}</span>
            <span className="text-ink-2">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Grouped bar chart of sign-ups (organisations in the primary hue, users in cyan — the pair validated for
 * colour-vision deficiency on the light surface; the legend and the table twin carry identity as well).
 * Renders after mount so the server output is a fixed-height placeholder (no hydration mismatch, no layout
 * shift); bar animation follows `prefers-reduced-motion` and stays within the 400 ms chart budget.
 */
export function SignupsChart({
  data,
  labels,
  locale,
  title,
  description,
  height = 220,
}: {
  data: SignupPoint[];
  labels: { organizations: string; users: string };
  locale: string;
  title: string;
  description: string;
  height?: number;
}) {
  const ready = useHydrated();
  const reduced = useReducedMotion();
  if (!ready) return <div style={{ height }} className="w-full animate-pulse rounded-[var(--radius-control)] bg-surface-2 motion-reduce:animate-none" aria-hidden="true" />;
  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%" title={title} desc={description}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--color-line-2)" }} tick={{ fill: "var(--color-ink-3)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis allowDecimals={false} width={40} tickLine={false} axisLine={false} tick={{ fill: "var(--color-ink-3)", fontSize: 11 }} tickFormatter={(value: number) => formatNumber(value, locale, { notation: "compact" })} />
          <Tooltip cursor={{ fill: "var(--color-surface-2)" }} content={<ChartTooltip locale={locale} />} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--color-ink-2)" }} />
          <Bar dataKey="organizations" name={labels.organizations} fill="var(--color-primary)" maxBarSize={24} radius={[3, 3, 0, 0]} isAnimationActive={!reduced} animationDuration={400} animationEasing="ease-out" />
          <Bar dataKey="users" name={labels.users} fill="var(--color-cyan)" maxBarSize={24} radius={[3, 3, 0, 0]} isAnimationActive={!reduced} animationDuration={400} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
