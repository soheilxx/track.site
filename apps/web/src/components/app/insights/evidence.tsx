import { CircleHelp, Eye, Sigma } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge, cn } from "@track-site/ui";

export type Evidence = "observed" | "modelled" | "unknown";

const ICONS = { observed: Eye, modelled: Sigma, unknown: CircleHelp } as const;

/**
 * Evidence class of a figure or section — the module never mixes them: observed facts (counted from
 * stored records), modelled hints (a stated heuristic, clearly labelled) and the unknown. The badge
 * carries icon + text, never colour alone; it is not a state, so no semantic tone.
 */
export function EvidenceBadge({ kind, className }: { kind: Evidence; className?: string }) {
  const t = useTranslations("insights.evidence");
  const Icon = ICONS[kind];
  return (
    <Badge
      tone={kind === "modelled" ? "violet" : "neutral"}
      className={cn("gap-1.5", className)}
      title={t(`${kind}Help`)}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {t(kind)}
    </Badge>
  );
}

/** Section frame: heading with the evidence badge, an optional lead and the content. */
export function InsightsSection({
  id,
  title,
  kind,
  lead,
  children,
  className,
}: {
  id: string;
  title: string;
  kind: Evidence;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${id}-title`} className="text-base font-semibold text-ink">
          {title}
        </h2>
        <EvidenceBadge kind={kind} />
      </div>
      {lead ? <p className="max-w-3xl text-sm text-ink-3">{lead}</p> : null}
      {children}
    </section>
  );
}
