import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";
import { PORTAL_VIEWS, type PortalView } from "./constants";

/** The three list views as links (state in the URL, works without JavaScript); counts for open and solved. */
export async function ViewChips({ view, counts }: { view: PortalView; counts: { open: number; solved: number } }) {
  const t = await getTranslations("supportPortal.list.views");
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-2 px-1">
        {PORTAL_VIEWS.map((v) => {
          const active = v === view;
          const count = v === "open" ? counts.open : v === "solved" ? counts.solved : null;
          return (
            <li key={v}>
              <Link
                href={v === "open" ? "/app/support" : `/app/support?view=${v}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-chip)] border px-3.5 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  active ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink",
                )}
              >
                {t(v)}
                {/* the count inherits the chip's colour at full opacity: at `text-xs` a faded figure fails the 4.5:1 contrast floor */}
                {count !== null ? <span className="tabular-nums text-xs">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
