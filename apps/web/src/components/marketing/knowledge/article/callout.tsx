import { Info, ShieldCheck, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

/**
 * Callout boxes of the article template (supplement §6: note, warning, privacy, practice). Rendered
 * as `<aside role="note">` named by the title so screen readers announce the kind of box; the kind is
 * carried by icon and title, never by colour alone. Semantic colours only where the box is a state
 * (warning, privacy as an information state); note and practice use surface and primary tones.
 */
export type CalloutTone = "note" | "warning" | "privacy" | "practice";

const STYLES: Record<CalloutTone, { box: string; icon: string; Icon: LucideIcon }> = {
  note: { box: "border-line bg-surface-2", icon: "text-ink-2", Icon: Info },
  warning: { box: "border-warn/30 bg-warn-soft", icon: "text-warn", Icon: TriangleAlert },
  privacy: { box: "border-info/30 bg-info-soft", icon: "text-info", Icon: ShieldCheck },
  practice: { box: "border-primary/30 bg-primary-soft", icon: "text-primary", Icon: Wrench },
};

export function Callout({ tone, title, children }: { tone: CalloutTone; title: string; children?: ReactNode }) {
  const { box, icon, Icon } = STYLES[tone];
  return (
    <aside role="note" aria-label={title} data-callout={tone} className={cn("my-6 rounded-[var(--radius-control)] border px-4 py-3 text-small leading-relaxed text-ink-2", box)}>
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Icon className={cn("size-4 shrink-0", icon)} aria-hidden="true" />
        {title}
      </p>
      <div className="mt-1.5 [&>*+*]:mt-2">{children}</div>
    </aside>
  );
}
