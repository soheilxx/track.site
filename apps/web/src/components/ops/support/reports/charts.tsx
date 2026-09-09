"use client";

import { useSyncExternalStore } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";
import { REPORT_CHANNELS } from "./constants";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
/** Reduced-motion preference as an external store: `true` on the server and during hydration, live afterwards. */
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
const noop = () => () => {};
/** `false` for the server render and hydration, `true` once the client owns the tree (the chart measures its container). */
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

type Channel = (typeof REPORT_CHANNELS)[number];

export interface VolumePoint {
  /** pre-formatted category label (day or week) */
  label: string;
  email: number;
  form: number;
  dashboard: number;
  api: number;
  agent: number;
  solved: number;
}

/**
 * Fixed hue per channel (identity, never rank): e-mail in the primary hue, the contact form in cyan, the
 * dashboard in violet, the API — the channel operators do not act on — in the de-emphasis grey and the tickets
 * operators opened themselves (`agent`) in amber. The legend and the table twin carry identity as well, so no
 * reading depends on colour alone.
 */
const CHANNEL_FILL: Record<Channel, string> = {
  email: "var(--color-primary)",
  form: "var(--color-cyan)",
  dashboard: "var(--color-violet)",
  api: "var(--color-ink-3)",
  agent: "var(--color-warn)",
};

interface TooltipEntry {
  name?: string | number;
  value?: string | number | ReadonlyArray<string | number>;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-control-sm)] border border-line bg-surface px-3 py-2 text-xs text-ink shadow-pop">
      <p className="font-medium">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-0.5 w-3 rounded-sm"
              style={{ background: entry.color }}
            />
            <span className="font-semibold tabular-nums">
              {typeof entry.value === "number"
                ? formatNumber(entry.value, locale)
                : String(entry.value ?? "")}
            </span>
            <span className="text-ink-2">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Tickets created per bucket, stacked by channel, with the tickets resolved in the same bucket as a line on
 * the same count axis. Renders after mount so the server output is a fixed-height placeholder (no hydration
 * mismatch, no layout shift); animation follows `prefers-reduced-motion` and stays inside the 400 ms budget.
 */
export function VolumeChart({
  data,
  labels,
  locale,
  title,
  description,
  height = 260,
}: {
  data: VolumePoint[];
  labels: Record<Channel, string> & { solved: string };
  locale: string;
  title: string;
  description: string;
  height?: number;
}) {
  const ready = useHydrated();
  const reduced = useReducedMotion();
  if (!ready)
    return (
      <div
        style={{ height }}
        className="w-full animate-pulse rounded-[var(--radius-control)] bg-surface-2 motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barCategoryGap="30%"
          title={title}
          desc={description}
        >
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--color-line-2)" }}
            tick={{ fill: "var(--color-ink-3)", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            width={40}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--color-ink-3)", fontSize: 11 }}
            tickFormatter={(value: number) => formatNumber(value, locale, { notation: "compact" })}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)" }}
            content={<ChartTooltip locale={locale} />}
          />
          <Legend
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: "var(--color-ink-2)" }}
          />
          {REPORT_CHANNELS.map((channel) => (
            <Bar
              key={channel}
              dataKey={channel}
              name={labels[channel]}
              stackId="created"
              fill={CHANNEL_FILL[channel]}
              stroke="var(--color-surface)"
              strokeWidth={1}
              maxBarSize={28}
              isAnimationActive={!reduced}
              animationDuration={400}
              animationEasing="ease-out"
            />
          ))}
          <Line
            type="monotone"
            dataKey="solved"
            name={labels.solved}
            stroke="var(--color-ink)"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: "var(--color-ink)" }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduced}
            animationDuration={400}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
