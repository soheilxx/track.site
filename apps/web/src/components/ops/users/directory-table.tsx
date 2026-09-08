import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/app/alerts/format";
import { formatDate, formatNumber } from "@/lib/format";
import type { UserDirectoryPage } from "@/server/ops/users";
import { roleLabel, roleTone } from "./labels";

const MEMBERSHIPS_SHOWN = 3;

/** Read-only directory (dense table, stacked on mobile): account, organisations and roles, security state, last sign-in, created. */
export async function DirectoryTable({ page, locale, filtered }: { page: UserDirectoryPage; locale: string; filtered: boolean }) {
  const t = await getTranslations("opsUsers");
  if (page.total === 0) {
    return <EmptyState title={filtered ? t("directory.emptyFiltered") : t("directory.empty")} description={filtered ? t("directory.emptyFilteredText") : t("directory.emptyText")} />;
  }
  const now = Date.parse(page.generatedAt);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2" aria-live="polite">
        {filtered ? t("directory.countFiltered", { count: page.total }) : t("directory.count", { count: page.total })}
        {page.operators ? <span className="text-ink-3"> · {t("directory.operatorsCount", { count: formatNumber(page.operators, locale) })}</span> : null}
      </p>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("directory.caption")}>
          <THead>
            <Tr>
              <Th>{t("directory.columns.account")}</Th>
              <Th>{t("directory.columns.memberships")}</Th>
              <Th>{t("directory.columns.security")}</Th>
              <Th>{t("directory.columns.lastSignIn")}</Th>
              <Th>{t("directory.columns.created")}</Th>
            </Tr>
          </THead>
          <TBody>
            {page.rows.map((row) => (
              <Tr key={row.id} data-testid="ops-directory-row">
                <Td label={t("directory.columns.account")}>
                  <Link href={`/ops/users/${row.id}`} aria-label={t("directory.open", { name: row.name })} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                    {row.name}
                  </Link>
                  <p className="text-xs break-all text-ink-3">{row.email}</p>
                  {row.platformRole !== "NONE" ? (
                    <Badge tone={roleTone(row.platformRole)} className="mt-1">
                      {roleLabel(t, row.platformRole)}
                    </Badge>
                  ) : null}
                </Td>
                <Td label={t("directory.columns.memberships")}>
                  {row.memberships.length === 0 ? (
                    <span className="text-sm text-ink-3">{t("directory.noMemberships")}</span>
                  ) : (
                    <ul className="space-y-0.5 text-sm">
                      {row.memberships.slice(0, MEMBERSHIPS_SHOWN).map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-ink">{m.name}</span>
                          <Badge tone={m.role === "OWNER" ? "primary" : "neutral"}>{m.role}</Badge>
                        </li>
                      ))}
                      {row.memberships.length > MEMBERSHIPS_SHOWN ? <li className="text-xs text-ink-3">{t("directory.moreMemberships", { count: row.memberships.length - MEMBERSHIPS_SHOWN })}</li> : null}
                    </ul>
                  )}
                </Td>
                <Td label={t("directory.columns.security")}>
                  <div className="space-y-0.5 text-sm">
                    <div>
                      <Status tone={row.twoFactor ? "ok" : "warn"} indicator="icon">
                        {t("operators.twoFactor")}: {row.twoFactor ? t("common.on") : t("common.off")}
                      </Status>
                    </div>
                    <div>
                      <Status tone={row.emailVerified ? "ok" : "warn"} indicator="icon">
                        {t("operators.email")}: {row.emailVerified ? t("common.verified") : t("common.unverified")}
                      </Status>
                    </div>
                  </div>
                </Td>
                <Td label={t("directory.columns.lastSignIn")} className="whitespace-nowrap text-ink-2">
                  {row.sessions.lastSignInAt ? (
                    <>
                      <time dateTime={row.sessions.lastSignInAt} title={formatDateTime(row.sessions.lastSignInAt, locale) ?? undefined}>
                        {formatRelative(row.sessions.lastSignInAt, locale, now)}
                      </time>
                      <p className="text-xs text-ink-3">{t("operators.activeSessions", { count: row.sessions.active })}</p>
                    </>
                  ) : (
                    <span className="text-ink-3">{t("operators.noSession")}</span>
                  )}
                </Td>
                <Td label={t("directory.columns.created")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={row.createdAt}>{formatDate(row.createdAt, locale, "short")}</time>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-ink-3">
        {t("common.metadata")} {t("directory.methods")}
      </p>
    </div>
  );
}
