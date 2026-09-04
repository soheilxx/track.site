"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import type { BillingInterval } from "@track-site/catalog";
import { cn } from "@track-site/ui";

/**
 * Billing interval shared by the toggle, the plan cards and the finder/calculator. Monthly is the
 * default (supplement §5). Server-rendered sections between the consumers stay server components:
 * the provider only passes `children` through.
 */
interface IntervalContextValue {
  interval: BillingInterval;
  setBillingInterval: (next: BillingInterval) => void;
}

const IntervalContext = createContext<IntervalContextValue | null>(null);

export function IntervalProvider({ children, initial = "monthly" }: { children: ReactNode; initial?: BillingInterval }) {
  const [interval, setBillingInterval] = useState<BillingInterval>(initial);
  const value = useMemo(() => ({ interval, setBillingInterval }), [interval]);
  return <IntervalContext.Provider value={value}>{children}</IntervalContext.Provider>;
}

export function useBillingInterval(): IntervalContextValue {
  const ctx = useContext(IntervalContext);
  if (!ctx) throw new Error("useBillingInterval must be used inside <IntervalProvider>");
  return ctx;
}

export interface IntervalToggleCopy {
  legend: string;
  monthly: string;
  yearly: string;
  monthlyHint: string;
  yearlyHint: string;
  announceMonthly: string;
  announceYearly: string;
}

/**
 * Segmented control built from native radios: keyboard navigation and the checked state come from
 * the browser, the visible focus ring sits on the label. Screen readers get the hint text and a
 * polite announcement when the interval changes.
 */
export function IntervalToggle({ copy, className }: { copy: IntervalToggleCopy; className?: string }) {
  const { interval, setBillingInterval } = useBillingInterval();
  const name = useId();
  const hintId = `${name}-hint`;
  const options: Array<{ value: BillingInterval; label: string }> = [
    { value: "monthly", label: copy.monthly },
    { value: "yearly", label: copy.yearly },
  ];
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4", className)}>
      <fieldset className="inline-flex w-fit rounded-[var(--radius-control)] bg-surface-2 p-1" aria-describedby={hintId} data-interval={interval}>
        <legend className="sr-only">{copy.legend}</legend>
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input type="radio" name={name} value={o.value} checked={interval === o.value} onChange={() => setBillingInterval(o.value)} className="peer sr-only" />
            <span className="inline-flex min-h-10 cursor-pointer items-center rounded-[var(--radius-control-sm)] px-4 text-sm font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-[var(--motion-base)] ease-in-out select-none peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary hover:text-ink pointer-coarse:min-h-11">
              {o.label}
            </span>
          </label>
        ))}
      </fieldset>
      <p id={hintId} className="text-small text-ink-3">
        {interval === "monthly" ? copy.monthlyHint : copy.yearlyHint}
      </p>
      <p aria-live="polite" className="sr-only">
        {interval === "monthly" ? copy.announceMonthly : copy.announceYearly}
      </p>
    </div>
  );
}
