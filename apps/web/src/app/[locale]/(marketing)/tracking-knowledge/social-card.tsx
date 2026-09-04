import type { ReactNode } from "react";
import { BrandGlyph } from "@track-site/ui";
import { baseUrl } from "@/lib/seo";

/**
 * Shared layout of the generated 1200×630 social cards (Open Graph / Twitter), rendered with
 * `next/og`'s ImageResponse. Satori rules apply: every container with several children is a flex
 * box, no external fonts (the bundled default sans-serif face is used), no CSS gap.
 * Visual system: ink ground, cobalt accent, off-white text (docs/12-design-system.md).
 */
export const CARD_SIZE = { width: 1200, height: 630 } as const;
export const CARD_CONTENT_TYPE = "image/png";

const INK = "#0a0a0a";
const INK_SOFT = "#17171a";
const COBALT = "#1f4fe0";
const COBALT_DEEP = "#173fbf";
const OFF_WHITE = "#f7f7f5";
const MUTED = "#b8b8bf";

/** Cuts a title for the card so it never overflows three lines at the chosen size. */
export function clampTitle(title: string, max = 140): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:\-–—\s]+$/, "")}…`;
}

function titleSize(title: string): number {
  if (title.length > 110) return 40;
  if (title.length > 75) return 48;
  return 58;
}

/** The Track mark (same geometry as `@track-site/ui` BrandMark) as inline SVG with explicit colours for Satori. */
function Mark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: Math.round(size * 0.25), background: COBALT }}>
      <BrandGlyph size={Math.round(size * 0.62)} color="#ffffff" />
    </div>
  );
}

export interface SocialCardProps {
  /** Small line next to the brand word, e.g. "Tracking Knowledge". */
  eyebrow?: string;
  title: string;
  /** Meta chips under the title (topic, level, reading time …). */
  meta?: string[];
  /** Bottom-left text (date line or tagline). */
  footer?: string;
  children?: ReactNode;
}

export function SocialCard({ eyebrow, title, meta = [], footer }: SocialCardProps) {
  const text = clampTitle(title);
  const host = new URL(baseUrl()).host;
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "56px 64px", background: `linear-gradient(135deg, ${INK} 0%, ${INK_SOFT} 55%, ${COBALT_DEEP} 100%)`, color: OFF_WHITE, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Mark size={52} />
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -0.5, marginLeft: 18 }}>Track</div>
        {eyebrow ? <div style={{ display: "flex", fontSize: 28, color: MUTED, marginLeft: 18 }}>{eyebrow}</div> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", width: 72, height: 6, borderRadius: 3, background: COBALT, marginBottom: 28 }} />
        <div style={{ display: "flex", fontSize: titleSize(text), fontWeight: 700, lineHeight: 1.15, letterSpacing: -1, maxWidth: 1040 }}>{text}</div>
        {meta.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 28 }}>
            {meta.map((m, i) => (
              <div key={i} style={{ display: "flex", fontSize: 24, color: OFF_WHITE, background: "rgba(255,255,255,0.10)", borderRadius: 999, padding: "8px 18px", marginRight: 12, marginBottom: 8 }}>
                {m}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: MUTED }}>
        <div style={{ display: "flex" }}>{footer ?? ""}</div>
        <div style={{ display: "flex" }}>{host}</div>
      </div>
    </div>
  );
}
