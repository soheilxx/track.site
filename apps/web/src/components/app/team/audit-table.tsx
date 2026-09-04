import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge, EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { AuditDiffRow, AuditEntryView, AuditPage } from "@/server/team";
import { formatDateTime } from "./format";

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

async function ActorCell({ entry }: { entry: AuditEntryView }) {
  const t = await getTranslations("team.audit");
  const { actor } = entry;
  const kind = t(`actorKind.${actor.kind}`);
  if (actor.kind === "user" || actor.kind === "agent") {
    return (
      <>
        <p className="text-ink">{actor.name ?? t("formerMember")}</p>
        <p className="text-xs text-ink-3">
          {actor.kind === "agent" ? `${kind} · ` : null}
          {actor.role ?? null}
          {!actor.name && actor.userId ? <code className="ml-1">{actor.userId.slice(0, 8)}</code> : null}
        </p>
      </>
    );
  }
  return (
    <>
      <p className="text-ink">{kind}</p>
      {actor.detail ? <p className="font-mono text-xs text-ink-3 break-all">{actor.detail}</p> : null}
    </>
  );
}

/** Dense audit table (stacked rows on mobile); every entry opens its redacted diff in a native disclosure. */
export async function AuditTable({ page, locale, filtered }: { page: AuditPage; locale: string; filtered: boolean }) {
  const t = await getTranslations("team.audit");
  if (page.total === 0) {
    return <EmptyState title={filtered ? t("emptyFiltered") : t("empty")} description={filtered ? t("emptyFilteredText") : t("emptyText")} />;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2" aria-live="polite">
        {filtered ? t("countFiltered", { count: formatNumber(page.total, locale) }) : t("count", { count: formatNumber(page.total, locale) })}
      </p>
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
            {page.entries.map((entry) => {
              const detailCount = entry.diff.length + entry.metadata.length;
              return (
                <Tr key={entry.id}>
                  <Td label={t("when")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={entry.createdAt.toISOString()}>{formatDateTime(entry.createdAt, locale)}</time>
                  </Td>
                  <Td label={t("actor")}>
                    <ActorCell entry={entry} />
                  </Td>
                  <Td label={t("action")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{t.has(`categories.${entry.category}`) ? t(`categories.${entry.category}`) : entry.category}</Badge>
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
                          {t("showDetails", { count: detailCount })}
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
      <p className="text-xs text-ink-3">{t("redacted")}</p>
    </div>
  );
}
