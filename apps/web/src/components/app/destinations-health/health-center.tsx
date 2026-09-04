"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Badge, Banner, EmptyState, FilterChips, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants, cn, type Tone } from "@track-site/ui";
import type { AttentionLevel, CredentialExpiryState, DestinationHealthOverview, DestinationHealthRow, HealthStatus, IntegrationStatus, IssueKey } from "@/server/destination-health";
import { formatCount, formatDateTime, formatDuration, formatIsoDate, formatPercent, formatRelative } from "./format";
import { RowActions } from "./row-actions";

type Filter = "all" | "attention" | "paused" | "healthy";

const STATUS_TONE: Record<IntegrationStatus, Tone> = { connected: "ok", paused: "warn", error: "bad", not_connected: "neutral", draft: "neutral" };
const HEALTH_TONE: Record<HealthStatus, Tone> = { healthy: "ok", degraded: "warn", unhealthy: "bad", not_connected: "neutral", unknown: "neutral" };
const LEVEL_TONE: Record<AttentionLevel, Tone> = { critical: "bad", warning: "warn", info: "info", none: "ok" };
const CREDENTIAL_TONE: Record<CredentialExpiryState, Tone> = { expired: "bad", expiring: "warn", ok: "ok", no_expiry: "neutral", none: "neutral", inactive: "neutral" };

export interface HealthCenterProps {
  overview: DestinationHealthOverview;
  scope: "site" | "all";
  activeSite: { id: string; name: string } | null;
  siteCount: number;
  canManage: boolean;
  locale: string;
}

/**
 * Destination Health Center (supplement §8 module 6). Priority first: the freshness of the worker's
 * queue measurement, the destinations that need action, then the dense table (stacked on mobile)
 * with expandable per-destination details — credentials and OAuth, API version, rate limits, queue
 * backlog and recent failures with plain-language reasons. Every number is a measurement; missing
 * measurements say so.
 */
export function HealthCenter({ overview, scope, activeSite, siteCount, canManage, locale }: HealthCenterProps) {
  const t = useTranslations("destinationsHealth");
  const now = Date.parse(overview.generatedAt);
  const [filter, setFilter] = useState<Filter>("all");
  const rows = overview.rows;

  const counts = useMemo(
    () => ({
      all: rows.length,
      attention: rows.filter((r) => r.attention.level === "critical" || r.attention.level === "warning").length,
      paused: rows.filter((r) => r.status === "paused").length,
      healthy: rows.filter((r) => r.status === "connected" && r.attention.level === "none").length,
    }),
    [rows],
  );
  const visible = useMemo(() => {
    switch (filter) {
      case "attention":
        return rows.filter((r) => r.attention.level === "critical" || r.attention.level === "warning");
      case "paused":
        return rows.filter((r) => r.status === "paused");
      case "healthy":
        return rows.filter((r) => r.status === "connected" && r.attention.level === "none");
      default:
        return rows;
    }
  }, [rows, filter]);
  const needsAttention = rows.filter((r) => r.attention.level === "critical" || r.attention.level === "warning");

  if (rows.length === 0) {
    return (
      <EmptyState
        title={scope === "site" && activeSite ? t("empty", { site: activeSite.name }) : t("emptyAll")}
        description={t("emptyText")}
        action={
          <>
            {activeSite ? (
              <Link href={`/app/sites/${activeSite.id}/destinations/new`} className={buttonVariants({ size: "sm" })}>
                {t("add")}
              </Link>
            ) : null}
            {scope === "site" && siteCount > 1 ? (
              <Link href="/app/destinations?scope=all" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {t("showAllSites")}
              </Link>
            ) : null}
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {overview.snapshots.missing > 0 ? (
        <Banner tone="info" title={t("freshness.missingTitle")}>
          {t("freshness.missingText", { count: overview.snapshots.missing })}
        </Banner>
      ) : overview.snapshots.stale > 0 ? (
        <Banner tone="warn" title={t("freshness.staleTitle")}>
          {t("freshness.staleText", { when: formatRelative(overview.snapshots.latestComputedAt, locale, now) ?? t("time.unknown") })}
        </Banner>
      ) : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-5">
        <SummaryCell label={t("summary.total")} value={formatCount(overview.summary.total, locale)} />
        <SummaryCell label={t("summary.critical")} value={formatCount(overview.summary.critical, locale)} tone={overview.summary.critical > 0 ? "bad" : "neutral"} />
        <SummaryCell label={t("summary.warning")} value={formatCount(overview.summary.warning, locale)} tone={overview.summary.warning > 0 ? "warn" : "neutral"} />
        <SummaryCell label={t("summary.healthy")} value={formatCount(overview.summary.healthy, locale)} hint={t("summary.healthyHint")} tone={overview.summary.healthy > 0 ? "ok" : "neutral"} />
        <SummaryCell label={t("summary.paused")} value={formatCount(overview.summary.paused, locale)} tone={overview.summary.paused > 0 ? "warn" : "neutral"} />
      </dl>

      <section aria-labelledby="dh-attention" className="space-y-3">
        <h2 id="dh-attention" className="text-base font-semibold text-ink">
          {t("attention.title")}
        </h2>
        {needsAttention.length === 0 ? (
          <Status tone="ok" indicator="icon">
            {t("attention.none")}
          </Status>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {needsAttention.slice(0, 6).map((row) => (
              <li key={row.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{row.name}</span>
                    <span className="text-xs text-ink-3">{row.displayName}</span>
                    {scope === "all" ? <span className="text-xs text-ink-3">· {row.siteName}</span> : null}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {row.attention.issues.slice(0, 3).map((issue) => (
                      <li key={issue}>
                        <Status tone={LEVEL_TONE[issueLevel(issue)]} indicator="icon" className="text-sm font-normal text-ink-2">
                          {issueText(issue, row, t, locale, now)}
                        </Status>
                      </li>
                    ))}
                  </ul>
                </div>
                <RowActions row={row} canManage={canManage} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dh-table" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="dh-table" className="text-base font-semibold text-ink">
            {t("columns.destination")}
          </h2>
          <FilterChips<Filter>
            label={t("filter.label")}
            multiple={false}
            value={filter === "all" ? [] : [filter]}
            onValueChange={(v) => setFilter(v[0] ?? "all")}
            allLabel={t("filter.all")}
            options={[
              { value: "attention", label: t("filter.attention"), count: counts.attention },
              { value: "paused", label: t("filter.paused"), count: counts.paused },
              { value: "healthy", label: t("filter.healthy"), count: counts.healthy },
            ]}
          />
        </div>
        {!canManage ? <p className="text-sm text-ink-3">{t("actions.readOnly")}</p> : null}
        <div className="rounded-[var(--radius-card)] border border-line bg-surface md:overflow-hidden">
          <Table caption={t("table.caption")}>
            <THead>
              <tr>
                <Th>{t("columns.destination")}</Th>
                {scope === "all" ? <Th>{t("scope.siteColumn")}</Th> : null}
                <Th>{t("columns.status")}</Th>
                <Th>{t("columns.health")}</Th>
                <Th>{t("columns.credentials")}</Th>
                <Th>{t("columns.deliveries", { hours: overview.rows[0]?.deliveries.windowHours ?? 24 })}</Th>
                <Th>{t("columns.queue")}</Th>
                <Th>{t("columns.lastSuccess")}</Th>
                <Th className="text-right">{t("columns.actions")}</Th>
              </tr>
            </THead>
            <TBody>
              {visible.map((row) => (
                <DestinationRow key={row.id} row={row} scope={scope} canManage={canManage} locale={locale} now={now} columns={scope === "all" ? 9 : 8} />
              ))}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function SummaryCell({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: Tone }) {
  const tones: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", neutral: "text-ink" };
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", tones[tone])}>{value}</dd>
      {hint ? <dd className="text-xs text-ink-3">{hint}</dd> : null}
    </div>
  );
}

function DestinationRow({ row, scope, canManage, locale, now, columns }: { row: DestinationHealthRow; scope: "site" | "all"; canManage: boolean; locale: string; now: number; columns: number }) {
  const t = useTranslations("destinationsHealth");
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const credentialText = credentialSummaryText(row, t, locale, now);
  const attempted = row.deliveries.success + row.deliveries.failed + row.deliveries.retry;
  return (
    <>
      <Tr>
        <Td label={t("columns.destination")}>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{row.name}</span>
              {row.testMode ? <Badge tone="warn">{t("table.testMode")}</Badge> : null}
            </p>
            <p className="text-xs text-ink-3">
              {row.displayName} · {t("table.apiVersion", { version: row.api.version })}
            </p>
            <button type="button" aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-control-sm)] text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
              <ChevronDown className={cn("size-3.5 transition-transform duration-[var(--motion-fast)] ease-out", open && "rotate-180")} aria-hidden="true" />
              {t("table.details")}
              <span className="sr-only">{open ? t("table.hideDetails", { name: row.name }) : t("table.showDetails", { name: row.name })}</span>
            </button>
          </div>
        </Td>
        {scope === "all" ? (
          <Td label={t("scope.siteColumn")} className="text-ink-2">
            {row.siteName}
          </Td>
        ) : null}
        <Td label={t("columns.status")}>
          <Status tone={STATUS_TONE[row.status]} chip>
            {t(`status.${row.status}`)}
          </Status>
        </Td>
        <Td label={t("columns.health")}>
          <Status tone={HEALTH_TONE[row.health.status]} indicator="icon">
            {t(`health.${row.health.status}`)}
          </Status>
          <p className="text-xs text-ink-3">{row.health.checkedAt ? t("health.checkedAt", { when: formatRelative(row.health.checkedAt, locale, now) ?? t("time.unknown") }) : t("health.neverChecked")}</p>
        </Td>
        <Td label={t("columns.credentials")}>
          <Status tone={row.credentialSummary.missingKinds.length && row.status !== "draft" ? "warn" : CREDENTIAL_TONE[row.credentialSummary.state]} indicator="icon" className="font-normal text-ink-2">
            {credentialText}
          </Status>
          {row.credentialSummary.missingKinds.length ? <p className="text-xs text-warn">{t("credentials.missing", { kinds: row.credentialSummary.missingKinds.join(", ") })}</p> : null}
        </Td>
        <Td label={t("columns.deliveries", { hours: row.deliveries.windowHours })}>
          {attempted === 0 && row.deliveries.skipped === 0 ? (
            <span className="text-ink-3">{t("deliveries.none", { hours: row.deliveries.windowHours })}</span>
          ) : (
            <>
              <p className="text-ink-2">{t("deliveries.summary", { success: formatCount(row.deliveries.success, locale), failed: formatCount(row.deliveries.failed, locale), retry: formatCount(row.deliveries.retry, locale) })}</p>
              {row.deliveries.errorRate !== null ? <p className={cn("text-xs", row.deliveries.errorRate >= 0.2 ? "text-bad" : "text-ink-3")}>{t("deliveries.errorRate", { rate: formatPercent(row.deliveries.errorRate, locale) })}</p> : null}
              {row.deliveries.skipped > 0 ? <p className="text-xs text-ink-3">{t("deliveries.skipped", { count: formatCount(row.deliveries.skipped, locale) })}</p> : null}
              {row.rateLimit.count > 0 ? <p className="text-xs text-warn">{t("rateLimit.count", { count: formatCount(row.rateLimit.count, locale), hours: row.deliveries.windowHours })}</p> : null}
            </>
          )}
        </Td>
        <Td label={t("columns.queue")}>
          <QueueCell row={row} locale={locale} now={now} />
        </Td>
        <Td label={t("columns.lastSuccess")}>
          {row.lastSuccessAt ? (
            <>
              <p className="text-ink-2">{formatRelative(row.lastSuccessAt, locale, now)}</p>
              <p className="text-xs text-ink-3">{formatDateTime(row.lastSuccessAt, locale)}</p>
            </>
          ) : (
            <span className="text-ink-3">{t("lastSuccess.never")}</span>
          )}
        </Td>
        <Td label={t("columns.actions")} className="md:text-right">
          <RowActions row={row} canManage={canManage} />
        </Td>
      </Tr>
      {open ? (
        <tr id={detailsId}>
          <td colSpan={columns} className="border-t border-line bg-surface-2/60 px-3 py-4">
            <RowDetails row={row} locale={locale} now={now} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function QueueCell({ row, locale, now }: { row: DestinationHealthRow; locale: string; now: number }) {
  const t = useTranslations("destinationsHealth");
  const q = row.queue;
  if (q.freshness === "missing") {
    return (
      <>
        <p className="text-ink-3">{t("queue.notMeasured")}</p>
        <p className="text-xs text-ink-3">{t("queue.notMeasuredHint")}</p>
      </>
    );
  }
  const waiting = (q.ready ?? 0) + (q.scheduled ?? 0) + (q.inFlight ?? 0);
  return (
    <>
      {waiting === 0 ? (
        <Status tone="ok" indicator="icon" className="font-normal text-ink-2">
          {t("queue.empty")}
        </Status>
      ) : (
        <p className="text-ink-2">{[q.ready ? t("queue.ready", { count: formatCount(q.ready, locale) }) : null, q.scheduled ? t("queue.scheduled", { count: formatCount(q.scheduled, locale) }) : null, q.inFlight ? t("queue.inFlight", { count: formatCount(q.inFlight, locale) }) : null].filter(Boolean).join(" · ")}</p>
      )}
      {q.lagMs !== null && waiting > 0 ? <p className={cn("text-xs", q.lagMs >= 15 * 60_000 ? "text-warn" : "text-ink-3")}>{t("queue.lag", { duration: formatDuration(q.lagMs, locale) })}</p> : null}
      {row.deadLetters > 0 ? <p className="text-xs text-bad">{t("queue.dead", { count: formatCount(row.deadLetters, locale) })}</p> : null}
      <p className={cn("text-xs", q.freshness === "stale" ? "text-warn" : "text-ink-3")}>{q.freshness === "stale" ? t("queue.stale", { when: formatRelative(q.computedAt, locale, now) ?? t("time.unknown") }) : t("queue.measuredAt", { when: formatRelative(q.computedAt, locale, now) ?? t("time.unknown") })}</p>
    </>
  );
}

function RowDetails({ row, locale, now }: { row: DestinationHealthRow; locale: string; now: number }) {
  const t = useTranslations("destinationsHealth");
  return (
    <div className="grid gap-6 text-sm lg:grid-cols-3">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("credentials.title")}</h3>
        {row.credentials.length === 0 ? (
          <p className="text-ink-3">{t("credentials.none")}</p>
        ) : (
          <ul className="space-y-2">
            {row.credentials.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-control-sm)] border border-line bg-surface px-3 py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className="font-mono text-xs text-ink-3">{c.kind}</span>
                  <Badge tone={c.status === "active" ? "ok" : c.status === "revoked" || c.status === "expired" ? "bad" : "neutral"}>{t(`credentials.status.${["active", "rotated", "revoked", "expired"].includes(c.status) ? c.status : "active"}`)}</Badge>
                </p>
                <p className="text-xs text-ink-3">
                  {c.last4 ? `${t("credentials.last4", { last4: c.last4 })} · ` : null}
                  {c.status === "active" ? expiryText(c.expiry.state, c.expiresAt, t, locale, now) : t("credentials.inactive")}
                  {" · "}
                  {c.lastValidatedAt ? t("credentials.lastValidated", { when: formatRelative(c.lastValidatedAt, locale, now) ?? t("time.unknown") }) : t("credentials.neverValidated")}
                </p>
              </li>
            ))}
          </ul>
        )}
        {row.oauth ? (
          <div className="rounded-[var(--radius-control-sm)] border border-line bg-surface px-3 py-2">
            <h4 className="text-xs font-semibold text-ink">{t("oauth.title")}</h4>
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-3">{t("oauth.provider")}</dt>
              <dd className="font-mono">{row.oauth.provider}</dd>
              <dt className="text-ink-3">{t("oauth.account")}</dt>
              <dd>{row.oauth.accountName ?? row.oauth.accountId ?? t("oauth.accountUnknown")}</dd>
              <dt className="text-ink-3">{t("oauth.requestedScopes")}</dt>
              <dd className="break-all">{row.oauth.requestedScopes.length ? row.oauth.requestedScopes.join(", ") : "–"}</dd>
              <dt className="text-ink-3">{t("oauth.grantedScopes")}</dt>
              <dd className="break-all">{row.oauth.grantedScopes ? row.oauth.grantedScopes.join(", ") : t("oauth.grantedUnknown")}</dd>
            </dl>
            <p className="mt-1 text-xs text-ink-3">{row.oauth.accessExpiresAt ? t("oauth.accessExpires", { when: formatRelative(row.oauth.accessExpiresAt, locale, now) ?? t("time.unknown") }) : t("oauth.accessExpiresUnknown")}</p>
            <p className="text-xs text-ink-3">{t("oauth.refreshHint")}</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("api.title")}</h3>
          <p className="text-ink-2">{t("api.version", { version: row.api.version })}</p>
          <p className="text-xs text-ink-3">{t("api.verified", { date: formatIsoDate(row.api.verifiedAt, locale) })}</p>
          <p className={cn("text-xs", row.api.sunsetDays !== null && row.api.sunsetDays <= 60 ? "text-warn" : "text-ink-3")}>
            {row.api.sunsetWatch && row.api.sunsetDays !== null ? (row.api.sunsetDays < 0 ? t("api.sunsetPassed", { date: formatIsoDate(row.api.sunsetWatch, locale) }) : t("api.sunset", { date: formatIsoDate(row.api.sunsetWatch, locale), days: row.api.sunsetDays })) : t("api.noSunset")}
          </p>
          {row.api.docsUrl ? (
            <a href={row.api.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline">
              {t("api.docs")} <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("rateLimit.title")}</h3>
          {row.rateLimit.count === 0 ? (
            <p className="text-ink-3">{t("rateLimit.none", { hours: row.deliveries.windowHours })}</p>
          ) : (
            <>
              <p className="text-warn">{t("rateLimit.count", { count: formatCount(row.rateLimit.count, locale), hours: row.deliveries.windowHours })}</p>
              {row.rateLimit.lastWaitMs !== null ? <p className="text-xs text-ink-3">{t("rateLimit.lastWait", { wait: formatDuration(row.rateLimit.lastWaitMs, locale) })}</p> : null}
              {row.rateLimit.lastAt ? <p className="text-xs text-ink-3">{t("rateLimit.lastAt", { when: formatDateTime(row.rateLimit.lastAt, locale) ?? t("time.unknown") })}</p> : null}
            </>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("queue.title")}</h3>
          <QueueCell row={row} locale={locale} now={now} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("failures.title")}</h3>
        {row.recentFailures.length === 0 ? (
          <p className="text-ink-3">{t("failures.none")}</p>
        ) : (
          <ol className="space-y-2">
            {row.recentFailures.map((f) => (
              <li key={f.id} className="rounded-[var(--radius-control-sm)] border border-line bg-surface px-3 py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink">{f.eventName}</span>
                  <Badge tone={f.status === "retry" ? "warn" : "bad"}>{f.status === "retry" ? t("failures.willRetry") : t(`reasons.${f.reason}`)}</Badge>
                </p>
                <p className="text-xs text-ink-2">{t(`reasons.${f.reason}`)}</p>
                <p className="text-xs text-ink-3">
                  {formatDateTime(f.at, locale)} · {t("failures.attempt", { n: f.attempt })}
                  {f.httpStatus !== null ? ` · ${t("failures.http", { status: f.httpStatus })}` : null}
                  {f.errorCode ? ` · ${f.errorCode}` : null}
                </p>
                {f.message ? (
                  <p className="mt-1 text-xs break-words text-ink-3">
                    <span className="sr-only">{t("failures.redacted")}: </span>
                    {f.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

function expiryText(state: CredentialExpiryState, expiresAt: string | null, t: Translator, locale: string, now: number): string {
  const when = formatRelative(expiresAt, locale, now) ?? t("time.unknown");
  switch (state) {
    case "expired":
      return t("credentials.expired", { when });
    case "expiring":
      return t("credentials.expiring", { when });
    case "ok":
      return t("credentials.ok", { when });
    case "no_expiry":
      return t("credentials.no_expiry");
    case "inactive":
      return t("credentials.inactive");
    default:
      return t("credentials.none");
  }
}

function credentialSummaryText(row: DestinationHealthRow, t: Translator, locale: string, now: number): string {
  return expiryText(row.credentialSummary.state, row.credentialSummary.expiresAt, t, locale, now);
}

const ISSUE_LEVEL: Record<IssueKey, AttentionLevel> = {
  credential_expired: "critical",
  auth_failures: "critical",
  status_error: "critical",
  health_unhealthy: "critical",
  credential_missing: "warning",
  credential_expiring: "warning",
  health_degraded: "warning",
  rate_limited: "warning",
  high_error_rate: "warning",
  queue_lag: "warning",
  dead_letters: "warning",
  api_sunset: "warning",
  not_connected: "warning",
  paused: "info",
  draft: "info",
  no_delivery_yet: "info",
};
const issueLevel = (issue: IssueKey): AttentionLevel => ISSUE_LEVEL[issue];

function issueText(issue: IssueKey, row: DestinationHealthRow, t: Translator, locale: string, now: number): string {
  const unknown = t("time.unknown");
  switch (issue) {
    case "auth_failures":
      return t("issues.auth_failures", { count: formatCount(row.deliveries.authFailed, locale) });
    case "credential_missing":
      return t("issues.credential_missing", { kinds: row.credentialSummary.missingKinds.join(", ") });
    case "credential_expiring":
      return t("issues.credential_expiring", { when: formatRelative(row.credentialSummary.expiresAt, locale, now) ?? unknown });
    case "rate_limited":
      return t("issues.rate_limited", { count: formatCount(row.rateLimit.count, locale) });
    case "high_error_rate":
      return t("issues.high_error_rate", { rate: row.deliveries.errorRate !== null ? formatPercent(row.deliveries.errorRate, locale) : unknown });
    case "queue_lag":
      return t("issues.queue_lag", { duration: row.queue.lagMs !== null ? formatDuration(row.queue.lagMs, locale) : unknown });
    case "dead_letters":
      return t("issues.dead_letters", { count: formatCount(row.deadLetters, locale) });
    case "api_sunset":
      return t("issues.api_sunset", { version: row.api.version, days: row.api.sunsetDays ?? 0 });
    case "paused":
      return t("issues.paused", { when: formatRelative(row.pausedAt, locale, now) ?? unknown });
    default:
      return t(`issues.${issue}`);
  }
}
