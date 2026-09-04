import { ArrowRight } from "lucide-react";
import { PlatformMark } from "@/components/marketing/demo/platform-mark";
import { Link } from "@/i18n/navigation";
import { INTEGRATIONS, type IntegrationCatalogEntry } from "@/lib/integrations-catalog";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { HomeSection } from "./section";

const ADS = ["meta", "google-ads", "tiktok", "linkedin", "reddit", "microsoft", "pinterest", "snapchat"];
const ANALYTICS = ["google-analytics"];
const COMMERCE = ["shopify", "woocommerce", "shopware"];

function pickEntries(slugs: readonly string[]): IntegrationCatalogEntry[] {
  return slugs.map((slug) => INTEGRATIONS.find((i) => i.slug === slug)).filter((i): i is IntegrationCatalogEntry => !!i);
}

/** Supported platforms and shop systems as own-drawn monogram chips (no third-party logo assets), each linking to its integration page. */
export function HomePlatforms({ copy }: { copy: HomeCopy }) {
  const c = copy.platforms;
  const groups: Array<{ id: string; label: string; items: IntegrationCatalogEntry[] }> = [
    { id: "ads", label: c.groups.ads, items: pickEntries(ADS) },
    { id: "analytics", label: c.groups.analytics, items: pickEntries(ANALYTICS) },
    { id: "commerce", label: c.groups.commerce, items: pickEntries(COMMERCE) },
  ];
  return (
    <HomeSection id="platforms" title={c.title} text={c.text} tone="surface">
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr_1fr] lg:gap-6">
        {groups.map((g) => (
          <div key={g.id} className="min-w-0">
            <h3 className="text-small font-semibold tracking-wide text-ink-3 uppercase">{g.label}</h3>
            <ul className={g.id === "ads" ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-4" : "mt-3 grid gap-2"}>
              {g.items.map((i) => (
                <li key={i.slug}>
                  <Link href={`/integrations/${i.slug}`} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 transition-[border-color,background-color] duration-[var(--motion-fast)] ease-out hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    <PlatformMark id={i.slug} name={i.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-small font-semibold text-ink">{i.name}</span>
                      <span className="block text-micro text-ink-3">{[i.browser ? c.modes.browser : null, i.server ? c.modes.server : null, i.offline ? c.modes.offline : null].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link href="/integrations" className="mt-8 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline">
        {c.all} <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </HomeSection>
  );
}
