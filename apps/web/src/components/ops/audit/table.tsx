import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import type { AuditDiffRow } from "@/server/team";
import { opsAuditQueryString, type OpsAuditExplorerEntry, type OpsAuditFilters, type OpsAuditPage } from "@/server/ops/audit";
import { actorKindLabel, categoryLabel, categoryTone, isBreakGlassEntry, type TranslateFn } from "./labels";

/** Redacted, flattened diff as a definition list: dotted path → value (the value is already redacted and truncated). */
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

function actorName(t: TranslateFn, entry: OpsAuditExplorerEntry): string {
  const actor = entry.actor;
  if (actor.kind === "platform") return actor.name ?? t("table.formerOperator");
  if (actor.kind === "user" || actor.kind === "agent") return actor.name ?? t("table.former");
  return actorKindLabel(t, actor.kind);
}

/** The explorer table: one row per entry, details in a native disclosure, organisation links, honest empty states. */
export async function AuditTable({ page, filters, filtered, locale }: { page: OpsAuditPage; filters: OpsAuditFilters; filtered: boolean; locale: string }) {
  const t = await getTranslations("opsAudit");
  if (page.entries.length === 0) {
    return filtered ? (
      <EmptyState
        title={t("empty.filteredTitle")}
        description={t("empty.filteredText")}
        action={
          <Link href="/ops/audit" className={buttonVariants({ variant: "secondary" })}>
            {t("filters.reset")}
          </Link>
        }
      />
    ) : (
      <EmptyState title={t("empty.title")} description={t("empty.text")} />
    );
  }
  const onlyOrgHref = (organizationId: string) => `/ops/audit${opsAuditQueryString({ ...filters, organization: organizationId }, 1)}`;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
      <Table caption={t("table.caption")}>
        <THead>
          <Tr>
            <Th>{t("table.when")}</Th>
            <Th>{t("table.actor")}</Th>
            <Th>{t("table.action")}</Th>
            <Th>{t("table.organization")}</Th>
            <Th>{t("table.target")}</Th>
            <Th>{t("table.details")}</Th>
          </Tr>
        </THead>
        <TBody>
          {page.entries.map((entry) => {
            const detailCount = entry.diff.length + entry.metadata.length;
            const actor = entry.actor;
            const org = entry.organization;
            const breakGlass = isBreakGlassEntry(entry);
            return (
              <Tr key={entry.id}>
                <Td label={t("table.when")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, locale)}</time>
                </Td>
                <Td label={t("table.actor")}>
                  <p className="text-ink">{actorName(t, entry)}</p>
                  <p className="text-xs text-ink-3">
                    {actorKindLabel(t, actor.kind)}
                    {actor.role ? ` · ${actor.role}` : null}
                    {actor.detail ? ` · ${actor.detail}` : null}
                    {!actor.name && actor.userId ? <code className="ml-1">{actor.userId.slice(0, 8)}</code> : null}
                  </p>
                </Td>
                <Td label={t("table.action")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={categoryTone(entry.category)}>{categoryLabel(t, entry.category)}</Badge>
                    {breakGlass ? <Badge tone="warn">{t("table.breakGlass")}</Badge> : null}
                    <code className="text-xs text-ink">{entry.action}</code>
                  </div>
                </Td>
                <Td label={t("table.organization")}>
                  {org ? (
                    <div className="flex flex-col gap-0.5">
                      {org.name ? (
                        <Link href={`/ops/organisations/${org.id}`} className="font-medium text-primary underline-offset-2 hover:underline" aria-label={t("table.openOrganization", { name: org.name })}>
                          {org.name}
                        </Link>
                      ) : (
                        <span className="text-ink-2">{t("table.deletedOrganization")}</span>
                      )}
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                        {org.slug ? <span>{org.slug}</span> : <code className="break-all">{org.id}</code>}
                        {!(page.organization.kind === "organization" && page.organization.id === org.id) ? (
                          <Link href={onlyOrgHref(org.id)} className="text-primary underline-offset-2 hover:underline">
                            {t("table.onlyOrganization")}
                          </Link>
                        ) : null}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ink-3">{t("table.platformWide")}</span>
                  )}
                </Td>
                <Td label={t("table.target")}>
                  <p className="text-ink">{entry.targetType}</p>
                  {entry.targetId ? <code className="text-xs break-all text-ink-3">{entry.targetId}</code> : null}
                </Td>
                <Td label={t("table.details")}>
                  {detailCount || entry.requestId ? (
                    <details className="group">
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] px-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                        {t("table.show", { count: detailCount })}
                        <ChevronDown className="size-4 transition-transform duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-2 space-y-3 rounded-[var(--radius-control)] bg-surface-2 p-3">
                        <DiffList rows={entry.diff} title={t("table.diff")} />
                        {entry.diffTruncated ? <p className="text-xs text-ink-3">{t("table.truncated")}</p> : null}
                        <DiffList rows={entry.metadata} title={t("table.metadata")} />
                        {entry.requestId ? (
                          <p className="text-xs text-ink-3">
                            {t("table.requestId")}: <code>{entry.requestId}</code>
                          </p>
                        ) : null}
                        <p className="text-xs text-ink-3">
                          {t("table.entryId")}: <code>{entry.id}</code>
                        </p>
                      </div>
                    </details>
                  ) : (
                    <span className="text-sm text-ink-3">{t("table.noDetails")}</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
