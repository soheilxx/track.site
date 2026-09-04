import { Check, ChevronDown, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ORG_ROLES } from "@track-site/core";
import { TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { RoleMatrixRow } from "@/server/team";
import { areaLabel, permissionLabel, roleLabel } from "./labels";

/** The six roles with descriptions and the full roles × permissions matrix (collapsed by default). */
export async function RolesMatrix({ rows }: { rows: RoleMatrixRow[] }) {
  const t = await getTranslations("team");
  return (
    <section aria-labelledby="team-roles-title" className="space-y-4">
      <div>
        <h2 id="team-roles-title" className="text-lg font-semibold text-ink">
          {t("roles.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("roles.intro")}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORG_ROLES.map((role) => (
          <div key={role} className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3">
            <dt className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-ink">
              {roleLabel(t, role)}
              <code className="text-xs font-normal text-ink-3">{role}</code>
            </dt>
            <dd className="mt-1 text-sm text-ink-2">{t(`roles.descriptions.${role}`)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-3">{t("roles.customRolesHint")}</p>
      <details className="group rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {t("roles.matrixSummary")}
          <ChevronDown className="size-4 shrink-0 transition-transform duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-line px-2 py-2">
          <Table caption={t("roles.matrixCaption")}>
            <THead>
              <Tr>
                <Th>{t("roles.permission")}</Th>
                {ORG_ROLES.map((role) => (
                  <Th key={role} className="text-center">
                    {roleLabel(t, role)}
                  </Th>
                ))}
              </Tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <Tr key={row.permission}>
                  <Td label={t("roles.permission")}>
                    <span className="text-ink">{permissionLabel(t, row.permission)}</span>
                    <span className="block text-xs text-ink-3">
                      {areaLabel(t, row.area)} · <code>{row.permission}</code>
                    </span>
                  </Td>
                  {ORG_ROLES.map((role) => (
                    <Td key={role} label={roleLabel(t, role)} className="md:text-center">
                      {row.roles[role] ? (
                        <>
                          <Check className="inline size-4 text-ok" aria-hidden="true" />
                          <span className="sr-only">{t("roles.granted")}</span>
                        </>
                      ) : (
                        <>
                          <Minus className="inline size-4 text-ink-3" aria-hidden="true" />
                          <span className="sr-only">{t("roles.notGranted")}</span>
                        </>
                      )}
                    </Td>
                  ))}
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </details>
    </section>
  );
}
