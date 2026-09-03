import type { CSSProperties } from "react";
import { cn } from "./cn.ts";

/**
 * Track brand (supplement §2). The visible product name is exactly "Track"; `track.site` is only the
 * domain. The mark is an original "route" glyph: one solid source node whose signal rises to a bus
 * and is delivered to a destination node at each end — one event in, every platform out — and the
 * silhouette is the letter T. Three nodes and two strokes keep it legible at 16 px. No third-party
 * or derived assets; the static files under `apps/web/public/brand/` and `apps/web/src/app/icon.svg`
 * are rendered from the same geometry.
 */
export const BRAND_NAME = "Track";

/** Brand colours as hex so non-CSS renderers (Satori social cards, raster export) draw the same mark. */
export const BRAND_COLORS = {
  cobalt: "#1f4fe0",
  cobaltDeep: "#173fbf",
  ink: "#0a0a0a",
  offWhite: "#f7f7f5",
  white: "#ffffff",
} as const;

export const BRAND_GLYPH_VIEWBOX = "0 0 32 32";

/** Geometry of the route glyph in the 32×32 glyph space. */
export const BRAND_GLYPH = {
  bar: "M7 9.5H25",
  stem: "M16 9.5V23",
  nodes: [
    [7, 9.5],
    [25, 9.5],
    [16, 23],
  ] as ReadonlyArray<readonly [number, number]>,
  strokeWidth: 3.2,
  nodeRadius: 3.4,
} as const;

export type BrandTone = "light" | "dark";

/**
 * Bare glyph in `color` (defaults to `currentColor`). Decorative: the accessible name comes from the
 * wordmark or from the link/button around it. Uses no class names by default so it also renders in
 * `next/og` (Satori) when an explicit `color` is given.
 */
export function BrandGlyph({ size = 20, color = "currentColor", className, style }: { size?: number; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox={BRAND_GLYPH_VIEWBOX} width={size} height={size} aria-hidden="true" focusable="false" className={className} style={style}>
      <path d={BRAND_GLYPH.bar} fill="none" stroke={color} strokeWidth={BRAND_GLYPH.strokeWidth} strokeLinecap="round" />
      <path d={BRAND_GLYPH.stem} fill="none" stroke={color} strokeWidth={BRAND_GLYPH.strokeWidth} strokeLinecap="round" />
      {BRAND_GLYPH.nodes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={BRAND_GLYPH.nodeRadius} fill={color} />
      ))}
    </svg>
  );
}

/**
 * Compact mark: rounded cobalt tile with the white glyph (light surfaces). On dark surfaces
 * (`tone="dark"`) the tile inverts to off-white with a cobalt glyph.
 */
export function BrandMark({ className, size = 36, tone = "light" }: { className?: string; size?: number; tone?: BrandTone }) {
  const dark = tone === "dark";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center shadow-sm", dark ? "bg-[#f7f7f5] text-[#1f4fe0]" : "bg-primary text-on-primary", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.25) }}
    >
      <BrandGlyph size={Math.round(size * 0.62)} />
    </span>
  );
}

/** App icon: full-bleed cobalt square (platforms apply their own corner mask), glyph inside the safe zone. */
export function BrandAppIcon({ size = 64, className, radius }: { size?: number; className?: string; radius?: number }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden bg-[#1f4fe0] text-white", className)} style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.22) }}>
      <BrandGlyph size={Math.round(size * 0.6)} />
    </span>
  );
}

/** The wordmark: the word "Track" in the display face. It is real text, so it is also the accessible name. */
export function BrandWordmark({ className, tone = "light" }: { className?: string; tone?: BrandTone }) {
  return <span className={cn("font-display font-bold tracking-tight", tone === "dark" ? "text-white" : "text-ink", className)}>{BRAND_NAME}</span>;
}

/** Header lockup: mark + wordmark. */
export function Brand({ className, size = 36, textClassName, tone = "light" }: { className?: string; size?: number; textClassName?: string; tone?: BrandTone }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} tone={tone} />
      <BrandWordmark className={cn("text-xl", textClassName)} tone={tone} />
    </span>
  );
}

/**
 * Social-card lockup (1200×630 cards, dark ground). Inline styles only, no class names or web fonts,
 * so it renders identically in the DOM and in `next/og` (Satori: every multi-child box is flex).
 */
export function BrandSocialLockup({ size = 52, tone = "dark", gap = 18 }: { size?: number; tone?: BrandTone; gap?: number }) {
  const dark = tone === "dark";
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: Math.round(size * 0.25), background: dark ? BRAND_COLORS.offWhite : BRAND_COLORS.cobalt }}>
        <BrandGlyph size={Math.round(size * 0.62)} color={dark ? BRAND_COLORS.cobalt : BRAND_COLORS.white} />
      </div>
      <div style={{ display: "flex", fontSize: Math.round(size * 0.65), fontWeight: 700, letterSpacing: -0.5, marginLeft: gap, color: dark ? BRAND_COLORS.offWhite : BRAND_COLORS.ink }}>{BRAND_NAME}</div>
    </div>
  );
}
