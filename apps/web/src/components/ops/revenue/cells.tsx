import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cn } from "@track-site/ui";
import { stripeDashboardUrl, type StripeMode, type StripeObjectKind } from "@/server/ops/revenue";

/** Organisation name (linked to the Organisations detail when `id` is given) + slug — metadata only — with the suspension state when the tenant kill switch is set. */
export async function OrgCell({ id, name, slug, suspendedAt }: { id?: string; name: string; slug: string; suspendedAt?: Date | null }) {
  const t = await getTranslations("opsRevenue.org");
  return (
    <div className="min-w-0">
      <p className="font-medium text-ink">
        {id ? (
          <Link href={`/ops/organisations/${id}`} className="rounded-[var(--radius-control-sm)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {name}
          </Link>
        ) : (
          name
        )}
        {suspendedAt ? (
          <Badge tone="warn" className="ml-2 align-middle">
            {t("suspended")}
          </Badge>
        ) : null}
      </p>
      <p className="font-mono text-xs text-ink-3">{slug}</p>
    </div>
  );
}

/**
 * Deep link into the Stripe dashboard (new tab, announced as such). Renders a muted "no Stripe id" when
 * the ledger holds none — the link is never nested in another interactive element.
 */
export async function StripeLink({ kind, id, mode, className }: { kind: StripeObjectKind; id: string | null | undefined; mode: StripeMode | null; className?: string }) {
  const t = await getTranslations("opsRevenue.stripe");
  const href = stripeDashboardUrl(kind, id, mode);
  const label = t(kind === "customers" ? "customer" : kind === "subscriptions" ? "subscription" : "invoice");
  if (!href) return <span className={cn("text-xs text-ink-3", className)}>{t("noId")}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control-sm)] text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11", className)}
    >
      {label}
      <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only"> ({t("opensNewTab")})</span>
    </a>
  );
}

/** Both Stripe links of a subscription row, stacked. */
export function StripeLinks({ customerId, subscriptionId, mode }: { customerId: string | null; subscriptionId: string | null; mode: StripeMode | null }) {
  return (
    <div className="flex flex-col items-start">
      <StripeLink kind="customers" id={customerId} mode={mode} />
      <StripeLink kind="subscriptions" id={subscriptionId} mode={mode} />
    </div>
  );
}

/** Section of the page: one h2, a one-line intro, optional aside (stats), then the content. */
export function Section({ id, title, intro, aside, children }: { id: string; title: string; intro?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          {intro ? <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Frame of a dense table inside a section. */
export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">{children}</div>;
}

/** Small labelled figure used in section asides ("Last 30 days · 2 · €108 MRR"). */
export function Figure({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const tones = { neutral: "text-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad" };
  return (
    <div className="min-w-28 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2">
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tones[tone])}>{value}</p>
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
