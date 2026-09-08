import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@track-site/ui";
import { opsAuditQueryString, parseOpsAuditFilters, type OpsAuditFilters } from "@/server/ops/audit";

interface Preset {
  key: "all" | "platform" | "breakGlass" | "platformWide" | "roles";
  query: Record<string, string>;
}

/** Quick views: each one is a plain link to a filter combination (nothing hidden, nothing beyond the filters). */
const PRESETS: readonly Preset[] = [
  { key: "all", query: {} },
  { key: "platform", query: { platform: "1" } },
  { key: "breakGlass", query: { scope: "break_glass" } },
  { key: "platformWide", query: { scope: "platform_wide" } },
  { key: "roles", query: { action: "platform.role" } },
];

const sameFilters = (a: OpsAuditFilters, b: OpsAuditFilters) => opsAuditQueryString(a, 1) === opsAuditQueryString(b, 1);

export async function AuditPresets({ filters }: { filters: OpsAuditFilters }) {
  const t = await getTranslations("opsAudit.presets");
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const target = parseOpsAuditFilters(preset.query);
          const active = sameFilters(target, filters);
          const href = `/ops/audit${opsAuditQueryString(target, 1)}`;
          return (
            <li key={preset.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-[var(--radius-chip)] border px-3 text-sm transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
                  active ? "border-primary bg-primary-soft font-medium text-primary" : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {t(preset.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
