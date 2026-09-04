import { CircleAlert, CircleCheck, Info, Minus, TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

/** Semantic tones for states (docs/12 §1): never decorative. */
export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

export const toneText: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", neutral: "text-ink-3" };
export const toneSoftBg: Record<Tone, string> = { ok: "bg-ok-soft", warn: "bg-warn-soft", bad: "bg-bad-soft", info: "bg-info-soft", neutral: "bg-surface-2" };
export const toneDot: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", neutral: "bg-ink-3" };

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  switch (tone) {
    case "ok":
      return <CircleCheck className={cls} aria-hidden="true" />;
    case "warn":
      return <TriangleAlert className={cls} aria-hidden="true" />;
    case "bad":
      return <CircleAlert className={cls} aria-hidden="true" />;
    case "info":
      return <Info className={cls} aria-hidden="true" />;
    default:
      return <Minus className={cls} aria-hidden="true" />;
  }
}

export interface StatusProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Text is mandatory: colour alone never carries the state. */
  children: ReactNode;
  /** `dot` (default), `icon`, or `both`. */
  indicator?: "dot" | "icon" | "both";
  /** Filled chip instead of inline text. */
  chip?: boolean;
  /** Announce changes (`role="status"`, polite). */
  live?: boolean;
}

/** Dot + icon + text status. Pair it with `live` for values that change while the page is open. */
export function Status({ tone = "neutral", children, indicator = "dot", chip = false, live = false, className, ...props }: StatusProps) {
  return (
    <span role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} className={cn("inline-flex items-center gap-1.5 text-sm font-medium", toneText[tone], chip && cn("rounded-[var(--radius-chip)] px-2.5 py-0.5 text-xs", toneSoftBg[tone]), className)} {...props}>
      {indicator !== "icon" ? <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", toneDot[tone])} /> : null}
      {indicator !== "dot" ? <ToneIcon tone={tone} /> : null}
      <span>{children}</span>
    </span>
  );
}
