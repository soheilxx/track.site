import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/app/alerts/format";
import { formatDate } from "@/lib/format";
import type { OperatorView } from "@/server/ops/users";
import { roleLabel, roleTone } from "./labels";
import { RevokeSessionsControl } from "./revoke-sessions-control";
import { RoleChangeControl } from "./role-change-control";
import { TwoFactorResetControl } from "./two-factor-reset-control";

/**
 * Accounts with a platform role (dense table, stacked on mobile): role, two-factor and verification, last
 * sign-in and active sessions from the session rows, join date, and the per-row actions (change role, sign
 * out everywhere, reset two-factor). Never tokens, IP addresses or user agents.
 */
export async function OperatorsTable({ operators, now, cacheMinutes, locale }: { operators: OperatorView[]; now: string; cacheMinutes: number; locale: string }) {
  const t = await getTranslations("opsUsers");
  if (operators.length === 0) return <EmptyState title={t("operators.empty")} description={t("operators.emptyText")} />;
  const nowMs = Date.parse(now);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t("operators.count", { count: operators.length })}</p>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("operators.caption")}>
          <THead>
            <Tr>
              <Th>{t("operators.columns.account")}</Th>
              <Th>{t("operators.columns.role")}</Th>
              <Th>{t("operators.columns.security")}</Th>
              <Th>{t("operators.columns.lastSignIn")}</Th>
              <Th>{t("operators.columns.sessions")}</Th>
              <Th>{t("operators.columns.since")}</Th>
              <Th>{t("operators.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {operators.map((op) => (
              <Tr key={op.id} data-testid="ops-operator-row">
                <Td label={t("operators.columns.account")}>
                  <Link href={`/ops/users/${op.id}`} aria-label={t("operators.open", { name: op.name })} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                    {op.name}
                  </Link>
                  <p className="text-xs break-all text-ink-3">{op.email}</p>
                  {op.viewer.isSelf ? <p className="text-xs text-ink-3">{t("operators.self")}</p> : null}
                  {op.memberships ? (
                    <Status tone="warn" indicator="icon" className="mt-1 text-xs">
                      {t("operators.memberOf", { count: op.memberships })}
                    </Status>
                  ) : null}
                </Td>
                <Td label={t("operators.columns.role")}>
                  <Badge tone={roleTone(op.platformRole)}>{roleLabel(t, op.platformRole)}</Badge>
                  {op.pendingRequest ? (
                    <Status tone="info" indicator="dot" chip className="mt-1">
                      {t("operators.pending")}
                    </Status>
                  ) : null}
                </Td>
                <Td label={t("operators.columns.security")}>
                  <div className="space-y-0.5 text-sm">
                    <div>
                      <Status tone={op.twoFactor ? "ok" : "warn"} indicator="icon">
                        {t("operators.twoFactor")}: {op.twoFactor ? t("common.on") : t("common.off")}
                      </Status>
                    </div>
                    <div>
                      <Status tone={op.emailVerified ? "ok" : "warn"} indicator="icon">
                        {t("operators.email")}: {op.emailVerified ? t("common.verified") : t("common.unverified")}
                      </Status>
                    </div>
                    {op.platformRole === "PLATFORM_ADMIN" ? <p className="text-xs text-ink-3">{op.eligible ? t("operators.eligible") : t("operators.notEligible")}</p> : null}
                  </div>
                </Td>
                <Td label={t("operators.columns.lastSignIn")} className="whitespace-nowrap text-ink-2">
                  {op.sessions.lastSignInAt ? (
                    <>
                      <time dateTime={op.sessions.lastSignInAt} title={formatDateTime(op.sessions.lastSignInAt, locale) ?? undefined}>
                        {formatRelative(op.sessions.lastSignInAt, locale, nowMs)}
                      </time>
                      {op.sessions.lastSeenAt ? <p className="text-xs text-ink-3">{t("operators.lastSeen", { date: formatRelative(op.sessions.lastSeenAt, locale, nowMs) ?? "" })}</p> : null}
                    </>
                  ) : (
                    <span className="text-ink-3">{t("operators.noSession")}</span>
                  )}
                </Td>
                <Td label={t("operators.columns.sessions")} className="tabular-nums">
                  {t("operators.activeSessions", { count: op.sessions.active })}
                </Td>
                <Td label={t("operators.columns.since")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={op.createdAt}>{formatDate(op.createdAt, locale, "short")}</time>
                </Td>
                <Td label={t("operators.columns.actions")}>
                  <div className="flex flex-col items-start gap-2">
                    <RoleChangeControl target={{ id: op.id, name: op.name, platformRole: op.platformRole }} mode={op.viewer.changeMode ?? "proposal"} refusal={op.viewer.changeRefusal} size="sm" />
                    <RevokeSessionsControl userId={op.id} name={op.name} isSelf={op.viewer.isSelf} activeSessions={op.sessions.active} cacheMinutes={cacheMinutes} size="sm" />
                    <TwoFactorResetControl userId={op.id} name={op.name} isSelf={op.viewer.isSelf} twoFactor={op.twoFactor} platformRole={op.platformRole} size="sm" />
                  </div>
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
