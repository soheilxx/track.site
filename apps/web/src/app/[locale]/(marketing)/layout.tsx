import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";
import { pick } from "@/lib/marketing-copy/pick";
import { HEADER_COPY } from "@/lib/marketing-copy/shared";

/**
 * Marketing chrome around every public page (route group, no URL segment): skip link → header
 * (sticky, mega navigation + mobile drawer) → `<main id="main">` → footer. The auth pages live in
 * the sibling `(auth)` group with their own compact frame, so nothing here has to be hidden there.
 */
export default async function MarketingLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const shell = pick(locale, HEADER_COPY);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        {shell.skipToContent}
      </a>
      <MarketingHeader copy={shell} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
