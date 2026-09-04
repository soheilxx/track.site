import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Card, EmptyState, Status, Table, TBody, Td, Th, THead, Tr, VisuallyHidden, cn } from "@track-site/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Inbox, InboxFilters, InboxIssue, IssueCategory } from "@/server/data-quality";
import { ISSUE_CATEGORIES } from "@/server/data-quality";
import { SEVERITY_TONE, STATUS_TONE, formatDateTime, formatShare } from "./format";
import { IssueActions } from "./issue-actions";

const STATUSES = ["open", "acknowledged", "resolved", "muted"] as const;

function href(filters: InboxFilters, patch: Partial<InboxFilters>): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.status !== "open") params.set("status", next.status);
  if (next.category !== "all") params.set("category", next.category);
  const q = params.toString();
  return q ? `/app/data-quality?${q}` : "/app/data-quality";
}

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-[background-color,color,border-color] duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
    active ? "border-primary bg-primary-soft text-primary" : "border-line-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
  );

/** Status and category filters as links: every view has a URL that can be bookmarked or shared with the team. */
export async function InboxFilterBar({ filters, inbox, locale }: { filters: InboxFilters; inbox: Inbox; locale: string }) {
  const t = await getTranslations("dataQuality.filters");
  return (
    <div className="space-y-3">
      <nav aria-label={t("statusLabel")} className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const active = filters.status === s;
          return (
            <Link key={s} href={href(filters, { status: s })} aria-current={active ? "true" : undefined} className={chip(active)}>
              {t(`status.${s}`)}
              <span className={cn("text-xs tabular-nums", active ? "text-primary/80" : "text-ink-3")}>{formatNumber(inbox.counts[s], locale)}</span>
            </Link>
          );
        })}
        <Link href={href(filters, { status: "all" })} aria-current={filters.status === "all" ? "true" : undefined} className={chip(filters.status === "all")}>
          {t("all")}
        </Link>
      </nav>
      <nav aria-label={t("categoryLabel")} className="flex flex-wrap gap-2">
        <Link href={href(filters, { category: "all" })} aria-current={filters.category === "all" ? "true" : undefined} className={chip(filters.category === "all")}>
          {t("all")}
        </Link>
        {ISSUE_CATEGORIES.filter((c) => inbox.byCategory[c] > 0 || filters.category === c).map((c) => {
          const active = filters.category === c;
          return (
            <Link key={c} href={href(filters, { category: c })} aria-current={active ? "true" : undefined} className={chip(active)} title={t(`categoryHelp.${c}`)}>
              {t(`category.${c}`)}
              <span className={cn("text-xs tabular-nums", active ? "text-primary/80" : "text-ink-3")}>{formatNumber(inbox.byCategory[c], locale)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function titleParams(issue: InboxIssue, destinationNames: Record<string, string>): Record<string, string> {
  const facts = issue.evidence?.facts ?? {};
  const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const integrationId = issue.kindPrefix === "revenue_leak" ? (issue.kindParts[0] ?? "") : "";
  return {
    event: str(facts.event) || issue.kindParts[0] || "",
    field: str(facts.field) || issue.kindParts[1] || "",
    reason: str(facts.reason) || issue.kindParts[0] || "",
    destination: str(facts.destination) || destinationNames[integrationId] || integrationId,
  };
}

export interface InboxListProps {
  inbox: Inbox;
  filters: InboxFilters;
  site: { id: string; name: string; timezone: string };
  environment: { id: string; kind: "production" | "staging" | "development"; name: string } | null;
  locale: string;
  canManage: boolean;
  aiEnabled: boolean;
}

/** Grouped, impact-ranked issue list with evidence and the workflow actions. */
export async function InboxList({ inbox, filters, site, environment, locale, canManage, aiEnabled }: InboxListProps) {
  const t = await getTranslations("dataQuality");
  if (inbox.issues.length === 0) {
    const nothingAtAll = inbox.counts.open + inbox.counts.acknowledged + inbox.counts.resolved + inbox.counts.muted === 0;
    return (
      <EmptyState
        title={nothingAtAll ? t("empty.noIssuesAtAll") : t("empty.title")}
        description={nothingAtAll ? (inbox.lastScanAt ? t("empty.scanned", { date: formatDateTime(inbox.lastScanAt, locale, site.timezone) }) : t("empty.scanPending")) : t("empty.text")}
        action={
          !nothingAtAll && (filters.status !== "open" || filters.category !== "all") ? (
            <Link href="/app/data-quality" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t("empty.reset")}
            </Link>
          ) : undefined
        }
      />
    );
  }
  const environmentLabel = environment ? `${t(`issue.environment.${environment.kind}`)} · ${environment.name}` : t("issue.noEnvironment");
  return (
    <div className="space-y-8">
      {inbox.groups.map((group) => (
        <section key={group.category} aria-labelledby={`dq-group-${group.category}`} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`dq-group-${group.category}`} className="text-base font-semibold text-ink">
              {t(`filters.category.${group.category}`)} <span className="text-sm font-normal text-ink-3">({formatNumber(group.issues.length, locale)})</span>
            </h2>
            <p className="text-xs text-ink-3">{t(`filters.categoryHelp.${group.category}`)}</p>
          </div>
          <ol className="space-y-3">
            {group.issues.map((issue) => (
              <li key={issue.id}>
                <IssueCard issue={issue} site={site} environment={environment} environmentLabel={environmentLabel} locale={locale} canManage={canManage} aiEnabled={aiEnabled} destinationNames={inbox.fixContext.destinationNames} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

async function IssueCard({ issue, site, environment, environmentLabel, locale, canManage, aiEnabled, destinationNames }: { issue: InboxIssue; site: { id: string; name: string; timezone: string }; environment: InboxListProps["environment"]; environmentLabel: string; locale: string; canManage: boolean; aiEnabled: boolean; destinationNames: Record<string, string> }) {
  const t = await getTranslations("dataQuality");
  const params = titleParams(issue, destinationNames);
  const title = t.has(`kinds.${issue.kindPrefix}`) ? t(`kinds.${issue.kindPrefix}`, params) : issue.summary;
  const evidence = issue.evidence;
  const affected = evidence?.affected ?? null;
  const total = evidence?.total ?? null;
  const dt = (d: Date) => formatDateTime(d, locale, site.timezone);
  return (
    <Card variant="flat" className={cn("p-4 sm:p-5", issue.stale && "border-dashed")}>
      <article aria-labelledby={`dq-issue-${issue.id}`} className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Status tone={SEVERITY_TONE[issue.severity]} chip indicator="both">
                {t(`severity.${issue.severity}`)}
              </Status>
              <Status tone={STATUS_TONE[issue.status]} chip>
                {t(`status.${issue.status}`)}
              </Status>
              <Badge tone="neutral" title={t("issue.impactHelp")}>
                {t("issue.impact", { score: issue.impact })}
                <VisuallyHidden> – {t("issue.impactHelp")}</VisuallyHidden>
              </Badge>
              {issue.environmentKind ? <Badge tone="neutral">{t(`issue.environment.${issue.environmentKind}`)}</Badge> : null}
              {issue.stale ? (
                <Badge tone="warn" title={t("issue.staleHelp", { days: 7 })}>
                  {t("issue.stale")}
                  <VisuallyHidden> – {t("issue.staleHelp", { days: 7 })}</VisuallyHidden>
                </Badge>
              ) : null}
            </div>
            <h3 id={`dq-issue-${issue.id}`} className="text-sm font-semibold text-ink">
              {title}
            </h3>
            <p className="text-sm text-ink-2">{issue.summary}</p>
            <p className="text-xs text-ink-3">
              {affected != null && total != null ? t("issue.affected", { affected: formatNumber(affected, locale), total: formatNumber(total, locale), share: formatShare(total > 0 ? affected / total : 0, locale) }) : affected != null ? t("issue.affectedOnly", { affected: formatNumber(affected, locale) }) : null}
              {evidence?.value ? <> · {t("issue.value", { value: formatCurrency(evidence.value.amount, locale, { currency: evidence.value.currency }) })}</> : null}
              {" · "}
              {t("issue.firstSeen", { date: dt(issue.firstSeenAt) })} · {t("issue.lastSeen", { date: dt(issue.lastSeenAt) })} · {t("issue.occurrences", { n: formatNumber(issue.occurrences, locale) })}
            </p>
            {issue.status === "muted" ? (
              <p className="text-xs text-ink-3">
                {issue.mutedUntil ? t("issue.mutedUntil", { date: dt(issue.mutedUntil) }) : t("issue.mutedIndefinitely")}
                {issue.muteReason ? <> · {t("issue.mutedReason", { reason: issue.muteReason })}</> : null}
              </p>
            ) : null}
            {issue.statusNote ? <p className="text-xs text-ink-3">{t("issue.note", { note: issue.statusNote })}</p> : null}
            {issue.fixDraftAt ? <p className="text-xs text-ink-3">{t("issue.fixDraft", { date: dt(issue.fixDraftAt) })}</p> : null}
          </div>
        </div>
        <details className="group rounded-[var(--radius-control)] border border-line bg-surface-2/60">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <span>{t("issue.evidence")}</span>
            <span aria-hidden="true" className="text-xs text-ink-3 group-open:hidden">
              +
            </span>
            <span aria-hidden="true" className="hidden text-xs text-ink-3 group-open:inline">
              −
            </span>
          </summary>
          <div className="space-y-3 border-t border-line px-3 py-3 text-sm">
            {evidence?.window ? <p className="text-xs text-ink-3">{t("issue.window", { from: dt(new Date(evidence.window.from)), to: dt(new Date(evidence.window.to)) })}</p> : null}
            {evidence?.samples.length ? (
              <Table caption={t("issue.samples")}>
                <THead>
                  <tr>
                    <Th>{t("issue.sample.event")}</Th>
                    <Th>{t("issue.sample.source")}</Th>
                    <Th>{t("issue.sample.time")}</Th>
                    <Th>{t("issue.sample.detail")}</Th>
                  </tr>
                </THead>
                <TBody>
                  {evidence.samples.map((s) => (
                    <Tr key={s.event_id}>
                      <Td label={t("issue.sample.event")}>
                        <Link href={`/app/events/explorer?site=${site.id}&event=${encodeURIComponent(s.event_id)}&window=30d`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">
                          {s.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-ink-3">{s.event_id.slice(0, 10)}…</span>
                      </Td>
                      <Td label={t("issue.sample.source")}>{s.source}</Td>
                      <Td label={t("issue.sample.time")}>{dt(new Date(s.server_ts))}</Td>
                      <Td label={t("issue.sample.detail")}>
                        <span className="font-mono text-xs">{s.detail ?? "—"}</span>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-xs text-ink-3">{t("issue.noSamples")}</p>
            )}
            {evidence && Object.keys(evidence.facts).length ? (
              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(evidence.facts).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1 sm:block sm:border-0">
                    <dt className="font-medium text-ink-3">{k}</dt>
                    <dd className="font-mono text-ink">{v === null ? "—" : String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {issue.fixTool ? <p className="text-xs text-ink-3">{t("issue.fixTool", { tool: issue.fixTool })}</p> : null}
          </div>
        </details>
        <IssueActions
          issue={{ id: issue.id, kind: issue.kind, title, summary: issue.summary, status: issue.status, fixPlan: issue.fixPlan, fixDraftId: issue.fixDraftId, sampleEventId: evidence?.samples[0]?.event_id ?? null, eventName: params.event || null }}
          siteId={site.id}
          siteName={site.name}
          environmentId={environment?.id ?? null}
          environmentLabel={environmentLabel}
          canManage={canManage}
          aiEnabled={aiEnabled}
        />
      </article>
    </Card>
  );
}

export type { IssueCategory };
