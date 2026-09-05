import { getLocale } from "next-intl/server";
import { Brand, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/marketing-copy/pick";
import { FOOTER_COPY } from "@/lib/marketing-copy/shared";
import { BRAND_NAME } from "@/lib/seo";
import { LocaleSwitcher } from "./locale-switcher";

/**
 * Marketing footer (server component). Brand mark + wordmark, the tagline and the verifiable region
 * note (no postal address is published here), five link columns — product, integrations, knowledge,
 * company, legal — each a `<nav>` named by its heading, and a bottom bar with the copyright line, the
 * legal note and the inline language switcher (same page in the other language).
 * `variant="compact"` (auth shell) keeps the brand block, the legal column and the bottom bar.
 */
export async function MarketingFooter({ locale: localeProp, variant = "full" }: { locale?: string; variant?: "full" | "compact" }) {
  const locale = localeProp ?? (await getLocale());
  const copy = pick(locale, FOOTER_COPY);
  const year = new Date().getFullYear();
  const full = variant === "full";
  const columns = full ? copy.columns : copy.columns.filter((column) => column.key === "legal");
  return (
    <footer className="border-t border-line bg-surface">
      <div className={cn("container-page grid gap-x-8 gap-y-10 py-12 md:py-16", full ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]" : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <div className={cn(full && "sm:col-span-2 md:col-span-3 lg:col-span-1")}>
          <Brand size={32} textClassName="text-lg" />
          <p className="mt-4 max-w-xs text-small text-ink-2">{copy.tagline}</p>
          <p className="mt-3 max-w-xs text-micro text-ink-3">{copy.region}</p>
        </div>
        {columns.map((column) => {
          const headingId = `footer-${column.key ?? column.title}`;
          return (
            <nav key={headingId} aria-labelledby={headingId} className="min-w-0">
              <p id={headingId} className="text-small font-semibold text-ink">
                {column.title}
              </p>
              {/* long single-word labels (nl "Verwerkersovereenkomst") hyphenate or break inside the ~8 rem column at `lg` instead of scrolling the page */}
              <ul className="mt-4 space-y-1 [overflow-wrap:anywhere] hyphens-auto">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="inline-flex min-h-8 max-w-full items-center rounded-sm text-small text-ink-3 underline-offset-4 transition-colors duration-[var(--motion-fast)] ease-out hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          );
        })}
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
          <div className="text-micro text-ink-3">
            <p>
              © {year} {BRAND_NAME}. {copy.rights}
            </p>
            <p className="mt-1">{copy.legalNote}</p>
          </div>
          <LocaleSwitcher variant="inline" label={copy.language} />
        </div>
      </div>
    </footer>
  );
}
