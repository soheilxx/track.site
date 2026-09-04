import type { ReactNode } from "react";
import { Brand, Container } from "@track-site/ui";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Link } from "@/i18n/navigation";
import { AUTH_COPY, pick } from "@/lib/marketing-copy";

const LEGAL_LINKS = [
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/security", "security"],
  ["/imprint", "imprint"],
] as const;

/**
 * Compact chrome around every (auth) page: brand link + language switcher on top, a short legal
 * line at the bottom — no marketing navigation and no full footer (supplement §4).
 *
 * The (auth) group is nested inside the locale root layout, which renders the marketing header and
 * footer as siblings of <main>. Until they move into a (marketing) route group, this frame hides
 * them with a `:has()` rule scoped to the layout's `body > div > header|footer` structure; the skip
 * link and the <main> landmark stay. Browsers without `:has()` simply keep the marketing chrome.
 */
export function AuthFrame({ locale, children }: { locale: string; children: ReactNode }) {
  const c = pick(locale, AUTH_COPY);
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col [body:has(&)>div>footer]:hidden [body:has(&)>div>header]:hidden">
      <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <Container className="flex h-16 shrink-0 items-center justify-between gap-4">
        <Link href="/" aria-label={c.shell.brandHome} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Brand size={32} textClassName="text-lg" />
        </Link>
        <LocaleSwitcher />
      </Container>
      {children}
      <Container className="flex shrink-0 flex-col gap-2 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={c.shell.legalLabel}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_LINKS.map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="inline-flex min-h-6 items-center rounded-md underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {c.shell.legal[key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>{c.shell.region}</p>
      </Container>
    </div>
  );
}
