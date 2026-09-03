import { useTranslations } from "next-intl";
import { Brand, Container } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

const COLUMNS = [
  { key: "product", links: [["/features", "features"], ["/how-it-works", "howItWorks"], ["/integrations", "integrations"], ["/pricing", "pricing"], ["/docs", "docs"]] },
  { key: "integrations", links: [["/integrations/meta", "meta"], ["/integrations/google-analytics", "ga4"], ["/integrations/google-ads", "googleAds"], ["/integrations/shopify", "shopify"], ["/integrations/woocommerce", "woocommerce"], ["/integrations/shopware", "shopware"]] },
  { key: "trust", links: [["/security", "security"], ["/privacy", "privacy"], ["/data-processing", "dataProcessing"], ["/subprocessors", "subprocessors"], ["/terms", "terms"], ["/imprint", "imprint"]] },
  { key: "company", links: [["/tracking-knowledge", "trackingKnowledge"], ["/contact", "contact"], ["/demo", "demo"], ["/support", "support"], ["/status", "status"]] },
] as const;

export function MarketingFooter() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Brand size={32} textClassName="text-lg" />
          <p className="mt-3 max-w-xs text-sm text-ink-3">{t("tagline")}</p>
          <p className="mt-4 text-xs text-ink-3">{t("region")}</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.key} aria-label={t(`columns.${col.key}`)}>
            <h3 className="text-sm font-semibold text-ink">{t(`columns.${col.key}`)}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map(([href, key]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-ink-3 hover:text-ink">
                    {t(`links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-2 py-4 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Track. {t("rights")}</p>
          <p>{t("legalNote")}</p>
        </Container>
      </div>
    </footer>
  );
}
