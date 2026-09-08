import { getTimeZone, getTranslations } from "next-intl/server";
import { Badge, EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { BreakGlassEntry } from "@/server/ops/break-glass";
import { STATE_TONE, formatDateTime } from "./labels";

/** Closed, expired and revoked entries (dense, stacked below 48 rem); the complete trail lives in the audit log. */
export async function BreakGlassHistory({ entries, locale, truncated }: { entries: BreakGlassEntry[]; locale: string; truncated: boolean }) {
  const [t, timeZone] = await Promise.all([getTranslations("opsBreakGlass"), getTimeZone()]);
  if (entries.length === 0) return <EmptyState title={t("history.empty")} description={t("history.emptyText")} />;
  return (
    <div className="space-y-2">
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("history.caption")}>
          <THead>
            <Tr>
              <Th>{t("history.when")}</Th>
              <Th>{t("history.state")}</Th>
              <Th>{t("history.operator")}</Th>
              <Th>{t("history.organization")}</Th>
              <Th>{t("history.details")}</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((entry) => (
              <Tr key={entry.id}>
                <Td label={t("history.when")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, locale, timeZone)}</time>
                </Td>
                <Td label={t("history.state")}>
                  <Badge tone={STATE_TONE[entry.state]}>{t(`states.${entry.state}`)}</Badge>
                </Td>
                <Td label={t("history.operator")}>
                  <p className="text-ink">{entry.requester.name}</p>
                  <p className="text-xs text-ink-3">{entry.requester.email}</p>
                </Td>
                <Td label={t("history.organization")}>
                  <p className="text-ink">{entry.organization.name}</p>
                  <p className="text-xs text-ink-3">{entry.organization.slug}</p>
                </Td>
                <Td label={t("history.details")} className="max-w-md">
                  <p className="text-xs text-ink-2">
                    {t("history.window", { minutes: entry.minutes })}
                    {entry.ticketRef ? ` · ${t("queue.ticket")}: ${entry.ticketRef}` : ""}
                  </p>
                  {entry.approvedAt ? (
                    <p className="text-xs text-ink-3">
                      {t("history.approved", { when: formatDateTime(entry.approvedAt, locale, timeZone) })}
                      {entry.selfApproved ? ` · ${t("active.selfApproved")}` : entry.approver ? ` · ${entry.approver.name}` : ""}
                    </p>
                  ) : null}
                  {entry.revokedAt ? <p className="text-xs text-ink-3">{t("history.revoked", { when: formatDateTime(entry.revokedAt, locale, timeZone) })}</p> : null}
                  <p className="mt-1 max-w-md text-xs whitespace-pre-wrap text-ink-3">{entry.reason}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    <code className="break-all">{entry.id}</code>
                  </p>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      {truncated ? <p className="text-xs text-ink-3">{t("history.truncated")}</p> : null}
    </div>
  );
}
