import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { DETAIL_AUDIT_LIMIT, type UserAuditEntryView } from "@/server/ops/users";
import { actorKindLabel } from "./labels";

/** Audit entries whose target is this account (role changes, session revocations) with redacted metadata in a native disclosure. */
export async function UserAudit({ entries, locale }: { entries: UserAuditEntryView[]; locale: string }) {
  const t = await getTranslations("opsUsers.detail.audit");
  const tAll = await getTranslations("opsUsers");
  if (entries.length === 0) return <p className="text-sm text-ink-3">{t("empty")}</p>;
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("caption")}>
          <THead>
            <Tr>
              <Th>{t("when")}</Th>
              <Th>{t("actor")}</Th>
              <Th>{t("action")}</Th>
              <Th>{t("details")}</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((e) => (
              <Tr key={e.id}>
                <Td label={t("when")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={e.createdAt}>{formatDateTime(e.createdAt, locale)}</time>
                </Td>
                <Td label={t("actor")}>
                  <p className="text-ink">{e.actor.name ?? e.actor.detail ?? tAll("common.former")}</p>
                  <p className="text-xs text-ink-3">{actorKindLabel(tAll, e.actor.kind)}</p>
                </Td>
                <Td label={t("action")}>
                  <Badge tone={e.action.startsWith("platform.") ? "info" : "neutral"}>
                    <code className="text-xs">{e.action}</code>
                  </Badge>
                </Td>
                <Td label={t("details")}>
                  {e.metadata.length ? (
                    <details className="group">
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] px-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                        {t("show", { count: e.metadata.length })}
                        <ChevronDown className="size-4 transition-transform duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <dl className="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 rounded-[var(--radius-control)] bg-surface-2 p-3 text-xs">
                        {e.metadata.map((row, i) => (
                          <div key={`${row.path}-${i}`} className="contents">
                            <dt className="truncate font-mono text-ink-3" title={row.path}>
                              {row.path}
                            </dt>
                            <dd className="font-mono break-all text-ink">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : (
                    <span className="text-sm text-ink-3">{t("noDetails")}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-ink-3">{t("limit", { count: DETAIL_AUDIT_LIMIT })}</p>
    </div>
  );
}
