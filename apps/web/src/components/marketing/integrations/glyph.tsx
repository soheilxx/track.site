import { cn } from "@track-site/ui";
import type { IntegrationCategory } from "@/lib/integrations-catalog";

/**
 * Original, licence-free platform glyph: a monogram tile with a small category mark. No third-party
 * logos are copied into the repository (supplement §4 asks for licence-compliant icons; vendor marks
 * can replace these tiles once the owner has the brand licences). Decorative — the name is always
 * rendered as text next to it.
 */
const SIZES = { sm: 28, md: 40, lg: 56 } as const;

const MARKS: Record<IntegrationCategory, string> = {
  // three ascending bars (reach)
  ads: "M1 7.5h1.6V5H1zM4 7.5h1.6V3H4zM7 7.5h1.6V1H7z",
  // line chart
  analytics: "M1 7 3.4 4.2 5.2 5.8 8.6 1.5",
  // shopping bag
  commerce: "M2 3h6l.6 5H1.4zM3.3 3V2.4a1.7 1.7 0 0 1 3.4 0V3",
  // two chain links
  affiliate: "M3.6 6.4 2.7 7.3a1.6 1.6 0 0 1-2.3-2.3l1.5-1.5a1.6 1.6 0 0 1 2.3 0M5.4 2.6l.9-.9a1.6 1.6 0 0 1 2.3 2.3L7.1 5.5a1.6 1.6 0 0 1-2.3 0",
  // braces
  custom: "M3.2 1C2.2 1 2 1.6 2 2.4v1.4c0 .5-.3.7-1 .7.7 0 1 .2 1 .7v1.4C2 7.4 2.2 8 3.2 8M6.4 1c1 0 1.2.6 1.2 1.4v1.4c0 .5.3.7 1 .7-.7 0-1 .2-1 .7v1.4C7.6 7.4 7.4 8 6.4 8",
};

export function IntegrationGlyph({ monogram, category, size = "md", className }: { monogram: string; category: IntegrationCategory; size?: keyof typeof SIZES; className?: string }) {
  const px = SIZES[size];
  const filled = category === "ads" || category === "commerce";
  return (
    <svg
      viewBox="0 0 40 40"
      width={px}
      height={px}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 font-display", className)}
      style={{ width: px, height: px }}
    >
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="10" className="fill-surface-2 stroke-line" strokeWidth="1.5" />
      <text x="19" y="21.5" textAnchor="middle" dominantBaseline="middle" className="fill-ink font-semibold" style={{ fontSize: monogram.length > 1 ? 15 : 17, letterSpacing: "-0.02em" }}>
        {monogram}
      </text>
      <g transform="translate(27.5 27.5)">
        <path d={MARKS[category]} className={filled ? "fill-primary stroke-primary" : "fill-none stroke-primary"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
