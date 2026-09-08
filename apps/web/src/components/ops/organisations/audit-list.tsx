import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import type { AuditDiffRow } from "@/server/team";
import { DETAIL_AUDIT_LIMIT, type OpsAuditEntryView } from "@/server/ops/organisations";
import { actorKindLabel } from "./labels";

function DiffList({ rows, title }: { rows: AuditDiffRow[]; title: string }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{title}</p>
      <dl className="mt-1 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-xs">
        {rows.map((r, i) => (
          <div key={`${r.path}-${i}`} className="contents">
            <dt className="truncate font-mono text-ink-3" title={r.path}>
              {r.path}
            </dt>
            <dd className="font-mono break-all text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The newest audit entries of the organisation (every actor kind) with redacted diffs in a native disclosure. */
export async function AuditList({ entries, organizationId, locale }: { entries: OpsAuditEntryView[]; organizationId: string; locale: string }) {
  const t = await getTranslations("opsOrganisations.detail.audit");
  const tAll = await getTranslations("opsOrganisations");
  const tCommon = await getTranslations("opsOrganisations.common");
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
              <Th>{t("target")}</Th>
              <Th>{t("details")}</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((entry) => {
              const detailCount = entry.diff.length + entry.metadata.length;
              const actor = entry.actor;
              return (
                <Tr key={entry.id}>
                  <Td label={t("when")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, locale)}</time>
                  </Td>
                  <Td label={t("actor")}>
                    <p className="text-ink">{actor.kind === "user" || actor.kind === "agent" || actor.kind === "platform" ? (actor.name ?? t("former")) : actorKindLabel(tAll, actor.kind)}</p>
                    <p className="text-xs text-ink-3">
                      {actorKindLabel(tAll, actor.kind)}
                      {actor.role ? ` · ${actor.role}` : null}
                      {actor.detail ? ` · ${actor.detail}` : null}
                      {!actor.name && actor.userId ? <code className="ml-1">{actor.userId.slice(0, 8)}</code> : null}
                    </p>
                  </Td>
                  <Td label={t("action")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={entry.action.startsWith("platform.") ? "info" : "neutral"}>{entry.category}</Badge>
                      <code className="text-xs text-ink">{entry.action}</code>
                    </div>
                  </Td>
                  <Td label={t("target")}>
                    <p className="text-ink">{entry.targetType}</p>
                    {entry.targetId ? <code className="text-xs text-ink-3 break-all">{entry.targetId}</code> : null}
                  </Td>
                  <Td label={t("details")}>
                    {detailCount || entry.requestId ? (
                      <details className="group">
                        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] px-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                          {t("show", { count: detailCount })}
                          <ChevronDown className="size-4 transition-transform duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <div className="mt-2 space-y-3 rounded-[var(--radius-control)] bg-surface-2 p-3">
                          <DiffList rows={entry.diff} title={t("diff")} />
                          {entry.diffTruncated ? <p className="text-xs text-ink-3">{t("truncated")}</p> : null}
                          <DiffList rows={entry.metadata} title={t("metadata")} />
                          {entry.requestId ? (
                            <p className="text-xs text-ink-3">
                              {t("requestId")}: <code>{entry.requestId}</code>
                            </p>
                          ) : null}
                        </div>
                      </details>
                    ) : (
                      <span className="text-sm text-ink-3">{t("noDetails")}</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">
          {t("limit", { count: DETAIL_AUDIT_LIMIT })} {tCommon("redacted")}
        </p>
        <Link href={`/ops/audit?organization=${organizationId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("openAll")}
        </Link>
      </div>
    </div>
  );
}
