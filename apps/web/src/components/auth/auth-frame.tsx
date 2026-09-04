import type { ReactNode } from "react";
import { Brand, Container } from "@track-site/ui";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Link } from "@/i18n/navigation";
import { AUTH_COPY, HEADER_COPY, pick } from "@/lib/marketing-copy";

const LEGAL_LINKS = [
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/security", "security"],
  ["/imprint", "imprint"],
] as const;

/**
 * Compact chrome around every (auth) page: skip link, brand link + language switcher on top, the
 * `<main>` landmark around the page, a short legal line at the bottom — no marketing navigation and
 * no full footer (supplement §4). The (auth) route group renders this frame directly inside the
 * locale root layout, next to the (marketing) group's header/footer layout.
 */
export function AuthFrame({ locale, children }: { locale: string; children: ReactNode }) {
  const c = pick(locale, AUTH_COPY);
  const shell = pick(locale, HEADER_COPY);
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col">
      <a href="#main" className="skip-link">
        {shell.skipToContent}
      </a>
      <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <Container className="flex h-16 shrink-0 items-center justify-between gap-4">
        <Link href="/" aria-label={c.shell.brandHome} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Brand size={32} textClassName="text-lg" />
        </Link>
        <LocaleSwitcher />
      </Container>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
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
