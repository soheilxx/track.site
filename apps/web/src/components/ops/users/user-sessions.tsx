import { getTranslations } from "next-intl/server";
import { Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/app/alerts/format";
import { DETAIL_SESSIONS_LIMIT, type UserDetail } from "@/server/ops/users";

/** Stored sessions of the account: timestamps, state and the active organisation — never tokens, IP addresses or user agents. */
export async function UserSessions({ sessions, now, locale }: { sessions: UserDetail["sessions"]; now: string; locale: string }) {
  const t = await getTranslations("opsUsers.detail.sessions");
  const nowMs = Date.parse(now);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t("summary", { active: sessions.active, expired: sessions.expired })}</p>
      {sessions.rows.length === 0 ? (
        <p className="text-sm text-ink-3">{t("empty")}</p>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("created")}</Th>
                <Th>{t("lastActive")}</Th>
                <Th>{t("expires")}</Th>
                <Th>{t("state")}</Th>
                <Th>{t("organisation")}</Th>
              </Tr>
            </THead>
            <TBody>
              {sessions.rows.map((s) => (
                <Tr key={s.id}>
                  <Td label={t("created")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={s.createdAt}>{formatDateTime(s.createdAt, locale)}</time>
                  </Td>
                  <Td label={t("lastActive")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={s.updatedAt} title={formatDateTime(s.updatedAt, locale) ?? undefined}>
                      {formatRelative(s.updatedAt, locale, nowMs)}
                    </time>
                  </Td>
                  <Td label={t("expires")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={s.expiresAt}>{formatDateTime(s.expiresAt, locale)}</time>
                  </Td>
                  <Td label={t("state")}>
                    <Status tone={s.state === "active" ? "ok" : "neutral"} indicator="both">
                      {t(`states.${s.state}`)}
                    </Status>
                  </Td>
                  <Td label={t("organisation")}>{s.activeOrganization ? <span className="text-ink">{s.activeOrganization.name}</span> : <span className="text-ink-3">—</span>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-ink-3">
        {sessions.truncated ? `${t("truncated", { count: DETAIL_SESSIONS_LIMIT })} ` : null}
        {t("noSecrets")}
      </p>
    </div>
  );
}
