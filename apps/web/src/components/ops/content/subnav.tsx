import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";

export type ContentSection = "board" | "feedback" | "paths" | "freshness" | "integrations";

export const CONTENT_SECTIONS: ReadonlyArray<{ key: ContentSection; href: string }> = [
  { key: "board", href: "/ops/content" },
  { key: "feedback", href: "/ops/content/feedback" },
  { key: "paths", href: "/ops/content/paths" },
  { key: "freshness", href: "/ops/content/freshness" },
  { key: "integrations", href: "/ops/content/integrations" },
];

/** Section links of the content module (plain links with `aria-current`, no tab semantics: each section is its own page). */
export async function ContentSubnav({ current }: { current: ContentSection }) {
  const t = await getTranslations("opsContent.sections");
  return (
    <nav aria-label={t("label")} className="-mb-px overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {CONTENT_SECTIONS.map((section) => {
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
