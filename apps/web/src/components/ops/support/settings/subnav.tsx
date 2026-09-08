import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";

export type SettingsSection = "overview" | "general" | "sla";

/** Overview and the general form belong to this slice; the SLA policies section is the SLA slice's route. */
export const SETTINGS_SECTIONS: ReadonlyArray<{ key: SettingsSection; href: string }> = [
  { key: "overview", href: "/ops/support/settings" },
  { key: "general", href: "/ops/support/settings/general" },
  { key: "sla", href: "/ops/support/settings/sla" },
];

/** Section links of the support settings (plain links with `aria-current`; each section is its own page). */
export async function SettingsSubnav({ current }: { current: SettingsSection }) {
  const t = await getTranslations("supportMacros.settings.sections");
  return (
    <nav aria-label={t("label")} className="-mb-px overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {SETTINGS_SECTIONS.map((section) => {
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
