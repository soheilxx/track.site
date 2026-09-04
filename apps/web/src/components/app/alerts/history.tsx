import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ALERT_RULE_KINDS, ALERT_SEVERITIES } from "@track-site/db";
import {
  Badge,
  Button,
  EmptyState,
  Select,
  Status,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  buttonVariants,
  cn,
  type Tone,
} from "@track-site/ui";
import {
  historyQueryString,
  type AlertEventView,
  type AlertHistoryFilters,
  type AlertHistoryPage,
} from "@/server/alerts";
import { formatDateTime, formatRelative } from "./format";
import { ResolveButton } from "./resolve-button";

const SEVERITY_TONE: Record<AlertEventView["severity"], Tone> = {
  info: "info",
  warning: "warn",
  critical: "bad",
};
const DELIVERY_TONE: Record<AlertEventView["delivery"][number]["status"], Tone> = {
  sent: "ok",
  failed: "bad",
  skipped: "neutral",
};
const WORDS = new Set(["expired", "expiring", "disconnected", "drop", "spike"]);

/** Filters are a GET form so the URL carries the state (shareable, back button works, no JS needed). */
async function HistoryFilters({ filters }: { filters: AlertHistoryFilters }) {
  const t = await getTranslations("alerts");
  const selectClass = "min-w-40";
  return (
    <form
      method="get"
      action="/app/settings/alerts"
      className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3"
      aria-label={t("history.filters.label")}
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-3">
          {t("history.filters.severity")}
        </span>
        <Select name="severity" defaultValue={filters.severity} className={selectClass}>
          <option value="all">{t("history.filters.all")}</option>
          {ALERT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {t(`severity.${s}`)}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-3">
          {t("history.filters.state")}
        </span>
        <Select name="state" defaultValue={filters.state} className={selectClass}>
          <option value="all">{t("history.filters.all")}</option>
          <option value="open">{t("history.filters.open")}</option>
          <option value="resolved">{t("history.filters.resolved")}</option>
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-3">
          {t("history.filters.kind")}
        </span>
        <Select name="kind" defaultValue={filters.kind} className={selectClass}>
          <option value="all">{t("history.filters.all")}</option>
          {ALERT_RULE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}.label`)}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary">
          {t("history.filters.apply")}
        </Button>
        <Link
          href="/app/settings/alerts#alert-history-title"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {t("history.filters.reset")}
        </Link>
      </div>
    </form>
  );
}

/** Localized title of an event from its kind and redacted facts; falls back to the worker's English title. */
function localizedTitle(
  t: Awaited<ReturnType<typeof getTranslations<"alerts">>>,
  entry: AlertEventView,
): string {
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(entry.detail)) {
    if (v === null || typeof v === "boolean") continue;
    values[k] = typeof v === "string" && WORDS.has(v) ? t(`history.words.${v}`) : v;
  }
  try {
    return t(`history.titles.${entry.kind}`, values);
  } catch {
    return entry.title;
  }
}

/** Alert history: filters, dense table (stacked on mobile) with expandable facts and delivery per channel, resolve by hand. */
export async function History({
  page,
  filters,
  locale,
  canManage,
  now,
}: {
  page: AlertHistoryPage;
  filters: AlertHistoryFilters;
  locale: string;
  canManage: boolean;
  now: string;
}) {
  const t = await getTranslations("alerts");
  const nowMs = Date.parse(now);
  const filtered = filters.severity !== "all" || filters.state !== "all" || filters.kind !== "all";
  return (
    <section aria-labelledby="alert-history-title" className="space-y-4">
      <div className="min-w-0">
        <h2 id="alert-history-title" className="text-lg font-semibold text-ink">
          {t("history.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("history.intro")}</p>
      </div>
      <HistoryFilters filters={filters} />
      {page.total === 0 ? (
        <EmptyState
          title={filtered ? t("history.emptyFiltered") : t("history.empty")}
          description={filtered ? t("history.emptyFilteredText") : t("history.emptyText")}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2" aria-live="polite">
            {t("history.count", { count: page.total })} ·{" "}
            {t("history.openCount", { count: page.openTotal })}
          </p>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
            <Table caption={t("history.caption")}>
              <THead>
                <Tr>
                  <Th>{t("history.columns.when")}</Th>
                  <Th>{t("history.columns.severity")}</Th>
                  <Th>{t("history.columns.alert")}</Th>
                  <Th>{t("history.columns.site")}</Th>
                  <Th>{t("history.columns.delivery")}</Th>
                  <Th>{t("history.columns.state")}</Th>
                  {canManage ? <Th>{t("history.columns.actions")}</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {page.entries.map((entry) => {
                  const title = localizedTitle(t, entry);
                  const linked = filters.eventId === entry.id;
                  const facts = Object.entries(entry.detail).filter(
                    ([k, v]) =>
                      v !== null && k !== "site_name" && k !== "integration_id" && k !== "site_id",
                  );
                  return (
                    <Tr
                      key={entry.id}
                      className={cn(linked && "bg-primary-soft/40")}
                      data-testid="alert-row"
                      id={`alert-${entry.id}`}
                    >
                      <Td
                        label={t("history.columns.when")}
                        className="whitespace-nowrap text-ink-2"
                      >
                        <time dateTime={entry.triggeredAt}>
                          {formatDateTime(entry.triggeredAt, locale)}
                        </time>
                        <p className="text-xs text-ink-3">
                          {formatRelative(entry.triggeredAt, locale, nowMs)}
                        </p>
                      </Td>
                      <Td label={t("history.columns.severity")}>
                        <Status tone={SEVERITY_TONE[entry.severity]} indicator="icon">
                          {t(`severity.${entry.severity}`)}
                        </Status>
                      </Td>
                      <Td label={t("history.columns.alert")}>
                        {linked ? <Badge tone="info">{t("history.linked")}</Badge> : null}
                        <p className="font-medium text-ink">{title}</p>
                        <p className="text-xs text-ink-3">
                          {t(`kinds.${entry.kind}.label`)} ·{" "}
                          {entry.ruleName
                            ? t("history.rule", { name: entry.ruleName })
                            : t("history.ruleDeleted")}
                        </p>
                        {facts.length ? (
                          <details className="group mt-1">
                            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                              <ChevronDown
                                className="size-3.5 transition-transform duration-[var(--motion-fast)] group-open:rotate-180"
                                aria-hidden="true"
                              />
                              <span className="sr-only">{t("history.showDetails", { title })}</span>
                              <span aria-hidden="true">{t("history.details")}</span>
                            </summary>
                            <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                              {facts.map(([k, v]) => (
                                <div key={k} className="contents">
                                  <dt className="text-ink-3">{factLabel(t, k)}</dt>
                                  <dd className="text-ink">
                                    {typeof v === "string" && WORDS.has(v)
                                      ? t(`history.words.${v}`)
                                      : String(v)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ) : null}
                      </Td>
                      <Td label={t("history.columns.site")}>
                        {entry.siteName ?? (
                          <span className="text-ink-3">{t("common.allSites")}</span>
                        )}
                      </Td>
                      <Td label={t("history.columns.delivery")}>
                        {entry.delivery.length === 0 ? (
                          <span className="text-xs text-ink-3">{t("history.delivery.none")}</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {entry.delivery.map((d) => (
                              <li key={d.channelId} className="text-xs">
                                <Status
                                  tone={DELIVERY_TONE[d.status]}
                                  indicator="icon"
                                  className="text-xs"
                                >
                                  {d.channelName ?? t("history.delivery.channelMissing")}:{" "}
                                  {t(`history.delivery.${d.status}`)}
                                  {d.httpStatus ? ` (HTTP ${d.httpStatus})` : ""}
                                </Status>
                                {d.error ? (
                                  <p className="pl-5 text-ink-3 break-words">{d.error}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-xs text-ink-3">
                          {entry.notifiedAt
                            ? t("history.delivery.notified", {
                                when: formatRelative(entry.notifiedAt, locale, nowMs) ?? "",
                              })
                            : t("history.delivery.notNotified")}
                        </p>
                      </Td>
                      <Td label={t("history.columns.state")}>
                        {entry.resolvedAt ? (
                          <Status tone="neutral">
                            {entry.resolvedBy === "user"
                              ? t("history.state.resolvedUser", {
                                  when: formatRelative(entry.resolvedAt, locale, nowMs) ?? "",
                                })
                              : t("history.state.resolvedAuto", {
                                  when: formatRelative(entry.resolvedAt, locale, nowMs) ?? "",
                                })}
                          </Status>
                        ) : (
                          <Status tone="warn" live>
                            {t("history.state.open")}
                          </Status>
                        )}
                      </Td>
                      {canManage ? (
                        <Td label={t("history.columns.actions")}>
                          {entry.resolvedAt ? null : <ResolveButton eventId={entry.id} />}
                        </Td>
                      ) : null}
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
          {page.pageCount > 1 ? (
            <nav
              aria-label={t("history.pagination.nav")}
              className="flex items-center justify-between gap-2 text-sm"
            >
              {page.page > 1 ? (
                <Link
                  href={`/app/settings/alerts${historyQueryString(filters, page.page - 1)}#alert-history-title`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {t("history.pagination.previous")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ink-3">
                {t("history.pagination.page", { page: page.page })}
              </span>
              {page.page < page.pageCount ? (
                <Link
                  href={`/app/settings/alerts${historyQueryString(filters, page.page + 1)}#alert-history-title`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {t("history.pagination.next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      )}
    </section>
  );
}

const FACT_KEYS = new Set([
  "window_minutes",
  "observed",
  "expected",
  "drop_percent",
  "deviation_percent",
  "threshold_percent",
  "threshold_days",
  "threshold_seconds",
  "baseline_weeks",
  "received",
  "consent_dropped",
  "rate_percent",
  "integration_name",
  "connector_type",
  "status",
  "error_rate_percent",
  "attempts",
  "last_error_class",
  "credential_kind",
  "days_left",
  "expires_at",
  "lag_seconds",
  "queue_ready",
  "direction",
  "state",
]);

function factLabel(t: Awaited<ReturnType<typeof getTranslations<"alerts">>>, key: string): string {
  return FACT_KEYS.has(key) ? t(`history.facts.${key}`) : key.replace(/_/g, " ");
}
