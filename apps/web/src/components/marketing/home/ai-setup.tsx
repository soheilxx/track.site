import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Badge, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { HomeSection } from "./section";

/**
 * AI setup as a guided interaction: the explanation on the left, a static (clearly labelled)
 * example conversation with an approval card on the right. The interactive version of this step
 * lives in the hero demo.
 */
export function HomeAiSetup({ copy }: { copy: HomeCopy }) {
  const c = copy.aiSetup;
  return (
    <HomeSection id="ai-setup" labelledBy="ai-setup-title">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <p className="text-small font-semibold tracking-wide text-primary uppercase">{c.eyebrow}</p>
          <h2 id="ai-setup-title" className="mt-3 font-display text-h2 font-semibold text-ink">{c.title}</h2>
          <p className="mt-4 text-lg text-ink-2">{c.text}</p>
          <ul className="mt-6 space-y-3">
            {c.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-body text-ink-2">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-ok" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link href="/features/ai-setup" className="mt-6 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline">
            {c.more} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <figure className="m-0 min-w-0">
          <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-card sm:p-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-violet-soft text-violet" aria-hidden="true">
                <Sparkles className="size-4" />
              </span>
              <span className="text-small font-semibold text-ink">Track AI</span>
              <Badge tone="neutral" className="ml-auto">
                {c.transcriptLabel}
              </Badge>
            </div>
            <ol className="mt-4 space-y-3">
              {c.transcript.map((m, i) => (
                <li key={i} className={cn("flex", m.role === "you" && "justify-end")}>
                  <p className={cn("max-w-[85%] rounded-[var(--radius-card)] px-4 py-3 text-small", m.role === "assistant" ? "rounded-tl-[var(--radius-control-sm)] bg-surface-2 text-ink" : "rounded-tr-[var(--radius-control-sm)] bg-primary-soft text-ink")}>{m.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-[var(--radius-card)] border border-warn/40 bg-warn-soft p-4">
              <p className="text-small font-semibold text-ink">{c.approval.title}</p>
              <pre className="mt-3 overflow-x-auto rounded-[var(--radius-control-sm)] bg-surface p-3 font-mono text-micro leading-relaxed text-ink-2">
                {c.approval.diff.map((line) => (
                  <span key={line} className={cn("block", line.startsWith("+") && "text-ok")}>
                    {line}
                  </span>
                ))}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2" aria-hidden="true">
                <span className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] bg-primary px-4 text-small font-medium text-on-primary">{c.approval.confirm}</span>
                <span className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-line-2 bg-surface px-4 text-small font-medium text-ink">{c.approval.cancel}</span>
              </div>
            </div>
          </div>
          <figcaption className="mt-3 text-small text-ink-3">{c.note}</figcaption>
        </figure>
      </div>
    </HomeSection>
  );
}
