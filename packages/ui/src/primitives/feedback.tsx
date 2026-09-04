import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";
import { ToneIcon, type Tone } from "./status.tsx";

/** Inline message inside a form or card. `bad` is announced assertively, the rest politely. */
export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "ok" | "warn" | "bad"; title?: string; children?: ReactNode; className?: string }) {
  const tones = { info: "border-info/30 bg-info-soft", ok: "border-ok/30 bg-ok-soft", warn: "border-warn/30 bg-warn-soft", bad: "border-bad/30 bg-bad-soft" };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm text-ink", tones[tone], className)}>
      <ToneIcon tone={tone} className={cn("mt-0.5", { info: "text-info", ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone])} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-1", "text-ink-2")}>{children}</div> : null}
      </div>
    </div>
  );
}

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  /** Action slot: a button or link styled with buttonVariants. */
  action?: ReactNode;
  /** Dismiss control (pass an <IconButton>); the parent owns the visibility state. */
  dismiss?: ReactNode;
  icon?: ReactNode;
}

/** Full-width page or section banner (announcements, usage warnings, environment notices). */
export function Banner({ tone = "neutral", title, children, action, dismiss, icon, className, ...props }: BannerProps) {
  const tones: Record<Tone, string> = { ok: "border-ok/30 bg-ok-soft", warn: "border-warn/30 bg-warn-soft", bad: "border-bad/30 bg-bad-soft", info: "border-info/30 bg-info-soft", neutral: "border-line bg-surface-2" };
  const iconTone: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", neutral: "text-ink-3" };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex flex-col gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm text-ink sm:flex-row sm:items-center", tones[tone], className)} {...props}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn("mt-0.5 shrink-0", iconTone[tone])}>{icon ?? <ToneIcon tone={tone} />}</span>
        <div className="min-w-0">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn(title && "mt-0.5", "text-ink-2")}>{children}</div> : null}
        </div>
      </div>
      {action || dismiss ? (
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          {action}
          {dismiss}
        </div>
      ) : null}
    </div>
  );
}

/** Honest empty state with the next step as its action. */
export function EmptyState({ title, description, action, icon, className }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-2 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 text-ink-3">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-3">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Failure state with a retry or support action; announced as an alert. */
export function ErrorState({ title, description, action, icon, className }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-bad/30 bg-bad-soft px-6 py-10 text-center", className)}>
      <div className="mb-3 text-bad">{icon ?? <ToneIcon tone="bad" className="size-6" />}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-2">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** `text` (one line), `block` (rectangle), `circle` (avatar). */
  shape?: "text" | "block" | "circle";
}

/** Loading placeholder; decorative (aria-hidden). Announce loading on the container with aria-busy. */
export function Skeleton({ shape = "block", className, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("animate-pulse bg-surface-2 motion-reduce:animate-none", shape === "text" && "h-4 w-full rounded-md", shape === "block" && "h-24 w-full rounded-[var(--radius-control)]", shape === "circle" && "size-10 rounded-full", className)} {...props} />;
}
