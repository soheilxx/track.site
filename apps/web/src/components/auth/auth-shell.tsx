import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Container, cn } from "@track-site/ui";
import { AUTH_COPY, pick } from "@/lib/marketing-copy";
import { AuthPreview } from "./auth-preview";
import { AuthSignals } from "./auth-signals";

const TITLE_ID = "auth-title";
const PREVIEW_ID = "auth-preview";

export interface AuthShellProps {
  locale: string;
  title: string;
  subtitle?: string;
  /** Setup step (1 account, 2 e-mail, 3 website) shown above the panel on signup and verification. */
  step?: 1 | 2 | 3;
  /** Show the static product preview + signals next to the form (login, signup). */
  preview?: boolean;
  /** Line under the panel, e.g. "No account yet? Start free". */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Focused auth shell (supplement §4): one clear form panel, optionally a product preview beside it
 * on large screens. Pages that only complete a flow (reset, verify, two-factor, invitation) render
 * the panel alone. The `<h1>` is the page title; the panel is a labelled region so the form is the
 * first thing screen readers land on after the skip link.
 */
export function AuthShell({ locale, title, subtitle, step, preview = false, footer, children }: AuthShellProps) {
  const c = pick(locale, AUTH_COPY);
  return (
    <Container className="flex flex-1 flex-col justify-center py-8 sm:py-10 lg:py-14">
      <div className={cn(preview ? "grid items-start gap-10 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-16 xl:gap-24" : "mx-auto w-full max-w-[27rem]")}>
        <section aria-labelledby={TITLE_ID} className="w-full">
          {step ? <AuthSteps steps={c.steps} current={step} label={c.shell.stepsLabel} /> : null}
          <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 shadow-card sm:p-8">
            <h1 id={TITLE_ID} className="font-display text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {title}
            </h1>
            {subtitle ? <p className="mt-2 text-sm text-ink-2">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <p className="mt-5 text-center text-sm text-ink-3">{footer}</p> : null}
          {preview ? <AuthSignals items={c.signals} layout="row" className="mt-10 lg:hidden" /> : null}
        </section>
        {preview ? <AuthPreview copy={c} id={PREVIEW_ID} className="hidden lg:block lg:sticky lg:top-8" /> : null}
      </div>
    </Container>
  );
}

/** Three-step indicator: number chips, the current step marked with aria-current, done steps with a check. */
function AuthSteps({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <ol aria-label={label} className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
      {steps.map((text, index) => {
        const n = index + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={text} aria-current={active ? "step" : undefined} className={cn("flex items-center gap-2", active && "font-medium text-ink")}>
            <span aria-hidden="true" className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", active ? "bg-primary text-on-primary" : done ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-3")}>
              {done ? <Check className="size-3" strokeWidth={3} /> : n}
            </span>
            {text}
          </li>
        );
      })}
    </ol>
  );
}
