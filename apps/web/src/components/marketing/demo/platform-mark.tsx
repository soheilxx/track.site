import { cn } from "@track-site/ui";

/**
 * Own-drawn monogram tile for a platform or shop system (supplement §4: licence-clean marks only).
 * Deliberately NOT a rendition of any vendor logo: a neutral tile with one or two letters; the
 * platform name always stands next to it in text.
 */
const MONOGRAMS: Record<string, string> = {
  meta: "M",
  google: "G",
  "google-ads": "G",
  "google-analytics": "GA",
  "google-marketing-platform": "GM",
  tiktok: "T",
  linkedin: "L",
  reddit: "R",
  microsoft: "MS",
  pinterest: "P",
  snapchat: "S",
  x: "X",
  shopify: "Sh",
  woocommerce: "Wo",
  shopware: "Sw",
};

export function monogram(id: string, name: string): string {
  const known = MONOGRAMS[id];
  if (known) return known;
  const letters = name.replace(/[^A-Za-z0-9]/g, "");
  return letters.slice(0, 2) || "?";
}

export function PlatformMark({ id, name, size = "md", className }: { id: string; name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-[var(--radius-control-sm)] border border-line bg-surface font-display font-bold tracking-tight text-ink", size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-11 text-sm" : "size-9 text-xs", className)}>
      {monogram(id, name)}
    </span>
  );
}
