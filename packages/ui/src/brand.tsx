import { cn } from "./cn.ts";

/**
 * Original track.site mark: three connected signal points forming a route, plus the wordmark.
 * No third-party assets.
 */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17.5 10 11l4 4 6-8" />
        <circle cx="4" cy="17.5" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="10" cy="11" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="14" cy="15" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="20" cy="7" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      <span className="text-ink">track</span>
      <span className="text-primary">.site</span>
    </span>
  );
}

export function Brand({ className, size = 36, textClassName }: { className?: string; size?: number; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <BrandWordmark className={cn("text-xl", textClassName)} />
    </span>
  );
}
