import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { Link } from "@/i18n/navigation";

/** Text wordmarks (no third-party logo assets) linking to each integration page. */
export function IntegrationLogoGrid({ limit }: { limit?: number }) {
  const items = (limit ? INTEGRATIONS.slice(0, limit) : INTEGRATIONS).filter((i) => i.group !== "commerce" || !limit);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((i) => (
        <li key={i.slug}>
          <Link href={`/integrations/${i.slug}`} className="flex h-full flex-col rounded-[var(--radius-control)] border border-line bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
            <span className="font-display text-base font-semibold text-ink">{i.name}</span>
            <span className="mt-1 text-xs text-ink-3">
              {[i.browser ? "Browser" : null, i.server ? "Server" : null, i.offline ? "Offline" : null].filter(Boolean).join(" · ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
