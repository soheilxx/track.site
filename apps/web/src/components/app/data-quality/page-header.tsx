import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";

export type DataQualitySection = "inbox" | "leaks";

/**
 * Header shared by the Data Quality pages: title, intro, the active site as context and the section
 * navigation (Inbox | Signal gaps & revenue leaks) as links with `aria-current`.
 */
export async function DataQualityHeader({ section, site }: { section: DataQualitySection; site: { name: string; trackingId: string; primaryDomain: string | null } }) {
  const t = await getTranslations("dataQuality");
  const items: Array<{ key: DataQualitySection; href: string }> = [
    { key: "inbox", href: "/app/data-quality" },
    { key: "leaks", href: "/app/data-quality/revenue-leaks" },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{section === "inbox" ? t("title") : t("leaks.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{section === "inbox" ? t("intro") : t("leaks.intro")}</p>
        <p className="mt-2 text-sm text-ink-2">
          {t("siteContext", { site: site.name })} · <span className="font-mono text-ink-3">{site.trackingId}</span>
          {site.primaryDomain ? <span className="text-ink-3"> · {site.primaryDomain}</span> : null}
        </p>
      </div>
      <nav aria-label={t("nav.label")} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((item) => {
          const active = item.key === section;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                active ? "border-primary text-primary" : "border-transparent text-ink-2 hover:border-line-2 hover:text-ink",
              )}
            >
              {t(`nav.${item.key}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
