import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { Link } from "@/i18n/navigation";
import { IntegrationGlyph } from "./integrations/glyph";

/**
 * Platform strip for the home page: original monogram glyphs (no third-party logo assets in the
 * repository) plus the platform's short name, each linking to its integration page. `limit` keeps
 * the strip short and, as before, leaves the shop platforms to the full overview.
 */
export function IntegrationLogoGrid({ limit }: { limit?: number }) {
  const items = (limit ? INTEGRATIONS.slice(0, limit) : INTEGRATIONS).filter((i) => i.kind !== "source" || !limit);
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i.slug}>
          <Link
            href={`/integrations/${i.slug}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface py-1.5 pr-3.5 pl-1.5 text-small font-medium text-ink transition-[border-color,background-color] duration-[var(--motion-fast)] ease-out hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IntegrationGlyph monogram={i.monogram} category={i.category} size="sm" />
            {i.shortName}
          </Link>
        </li>
      ))}
    </ul>
  );
}
