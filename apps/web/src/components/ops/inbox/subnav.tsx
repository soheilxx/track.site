import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";

export type InboxSection = "requests" | "privacy" | "alerts" | "knowledge";

export const INBOX_SECTIONS: ReadonlyArray<{ key: InboxSection; href: string }> = [
  { key: "requests", href: "/ops/inbox" },
  { key: "privacy", href: "/ops/inbox/privacy" },
  { key: "alerts", href: "/ops/inbox/alerts" },
  { key: "knowledge", href: "/ops/inbox/knowledge" },
];

/** Section links of the inbox module (plain links with `aria-current`, no tab semantics: each section is its own page). */
export async function InboxSubnav({ current }: { current: InboxSection }) {
  const t = await getTranslations("opsInbox.sections");
  return (
    <nav aria-label={t("label")} className="-mb-px overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {INBOX_SECTIONS.map((section) => {
          const active = section.key === current;
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
                  active ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t(section.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
