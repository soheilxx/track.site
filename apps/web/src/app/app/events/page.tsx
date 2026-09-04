import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, EmptyState, Status, TBody, Table, Td, Th, THead, Tr, buttonVariants } from "@track-site/ui";
import { formatCount, formatDateTime, formatRelative } from "@/components/app/events/format";
import { loadEventsOverview } from "@/server/events";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Events overview: the last 24 h of the active environment (from the worker's hourly aggregates), the
 * last browser/server event, dead letters, lineage availability, links to the coverage matrix, the
 * explorer and the test lab, and the 7-day table per event. No number without a measurement.
 */
export default async function EventsOverviewPage() {
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("events");
  const locale = await getLocale();
  const workspace = await activeSite(ctx);
  if (!workspace.site) return null;
  if (!workspace.environment) return <EmptyState title={t("module.noEnvironment")} />;
  const site = workspace.site;
  const overview = await loadEventsOverview(ctx, site, workspace.environment);
  const now = new Date(overview.generatedAt).getTime();
  const numbers = overview.day
    ? ([
        ["received", overview.day.received, "neutral"],
        ["accepted", overview.day.accepted, "ok"],
        ["dropped", overview.day.dropped, overview.day.dropped ? "warn" : "neutral"],
        ["deduplicated", overview.day.deduplicated, "neutral"],
        ["delivered", overview.day.delivered, overview.day.delivered ? "ok" : "neutral"],
        ["failed", overview.day.failed, overview.day.failed ? "bad" : "neutral"],
      ] as const)
    : [];
  const modules = [
    { href: "/app/events/matrix", key: "coverage" },
    { href: "/app/events/explorer", key: "explorer" },
    { href: "/app/events/test-lab", key: "testLab" },
  ] as const;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("overview.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("overview.intro")}</p>
      </div>

      <section aria-labelledby="ov-numbers" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ov-numbers" className="text-sm font-semibold text-ink">
            {t("overview.day.title")}
          </h2>
          <span className="text-xs text-ink-3">{t("overview.day.window")}</span>
        </div>
        {overview.day ? (
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {numbers.map(([key, value, tone]) => (
              <div key={key}>
                <dt className="text-xs text-ink-3">{t(`overview.day.${key}`)}</dt>
                <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink"}`}>{formatCount(value, locale)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink-3">{t("overview.noDay")}</p>
        )}
        {overview.day && Object.keys(overview.day.droppedReasons).length ? (
          <p className="mt-3 text-xs text-ink-3">
            {t("overview.droppedReasons")}:{" "}
            {Object.entries(overview.day.droppedReasons)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${t.has(`reasons.${k}`) ? t(`reasons.${k}`) : k} (${formatCount(v, locale)})`)
              .join(" · ")}
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="ov-sources" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="ov-sources" className="text-sm font-semibold text-ink">
            {t("overview.sources.title")}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{t("overview.lastBrowser")}</dt>
              <dd>
                <Status tone={overview.lastBrowserAt ? (now - new Date(overview.lastBrowserAt).getTime() < 86_400_000 ? "ok" : "warn") : "neutral"} indicator="dot">
                  {overview.lastBrowserAt ? `${formatRelative(overview.lastBrowserAt, locale, now)} · ${formatDateTime(overview.lastBrowserAt, locale)}` : t("common.never")}
                </Status>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{t("overview.lastServer")}</dt>
              <dd>
                <Status tone={overview.lastServerAt ? (now - new Date(overview.lastServerAt).getTime() < 86_400_000 ? "ok" : "warn") : "neutral"} indicator="dot">
                  {overview.lastServerAt ? `${formatRelative(overview.lastServerAt, locale, now)} · ${formatDateTime(overview.lastServerAt, locale)}` : t("common.never")}
                </Status>
              </dd>
            </div>
          </dl>
          {!overview.lastBrowserAt && !overview.lastServerAt ? (
            <p className="mt-3 text-sm text-ink-3">
              {t("overview.noEventsYet")}{" "}
              <Link href={`/app/sites/${site.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {t("overview.install")}
              </Link>
            </p>
          ) : null}
        </section>
        <section aria-labelledby="ov-pipeline" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="ov-pipeline" className="text-sm font-semibold text-ink">
            {t("overview.pipeline.title")}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{t("overview.deadLetters")}</dt>
              <dd>
                <Status tone={overview.deadLetters ? "bad" : "ok"} indicator="dot">
                  {formatCount(overview.deadLetters, locale)}
                </Status>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{t("overview.lineage")}</dt>
              <dd>
                <Status tone={overview.lineageAvailable ? "ok" : "warn"} indicator="dot">
                  {overview.lineageAvailable ? t("overview.lineageOn") : t("overview.lineageOff")}
                </Status>
              </dd>
            </div>
          </dl>
          {overview.deadLetters ? <p className="mt-3 text-xs text-ink-3">{t("overview.deadLettersHint")}</p> : null}
        </section>
      </div>

      {!overview.lineageAvailable ? (
        <Alert tone="info" title={t("overview.lineageOff")}>
          {t("overview.lineageOffText")}
        </Alert>
      ) : null}

      <section aria-labelledby="ov-modules">
        <h2 id="ov-modules" className="text-sm font-semibold text-ink">
          {t("overview.modules.title")}
        </h2>
        <ul className="mt-3 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {modules.map((m) => (
            <li key={m.href} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">{t(`overview.modules.${m.key}.title`)}</p>
                <p className="text-sm text-ink-3">{t(`overview.modules.${m.key}.text`)}</p>
              </div>
              <Link href={m.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {t("common.open")}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ov-byevent" className="rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="ov-byevent" className="text-sm font-semibold text-ink">
            {t("overview.byEvent")}
          </h2>
          <span className="text-xs text-ink-3">{t("overview.byEventWindow")}</span>
        </div>
        {overview.byEvent.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-ink">{t("overview.empty")}</p>
            <p className="mt-1 text-sm text-ink-3">{t("overview.emptyText")}</p>
          </div>
        ) : (
          <Table caption={t("overview.byEvent")}>
            <THead>
              <tr>
                <Th>{t("overview.columns.event")}</Th>
                <Th>{t("overview.columns.sources")}</Th>
                <Th className="text-right">{t("overview.columns.received")}</Th>
                <Th className="text-right">{t("overview.columns.accepted")}</Th>
                <Th className="text-right">{t("overview.columns.dropped")}</Th>
                <Th className="text-right">{t("overview.columns.delivered")}</Th>
                <Th className="text-right">{t("overview.columns.failed")}</Th>
                <Th>{t("overview.columns.lastSeen")}</Th>
              </tr>
            </THead>
            <TBody>
              {overview.byEvent.map((r) => (
                <Tr key={r.name}>
                  <Td label={t("overview.columns.event")}>
                    <Link href={`/app/events/explorer?name=${encodeURIComponent(r.name)}&window=7d`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                  </Td>
                  <Td label={t("overview.columns.sources")} className="text-xs text-ink-3">
                    {r.sources.map((s) => (t.has(`sources.${s}`) ? t(`sources.${s}`) : s)).join(", ")}
                  </Td>
                  <Td label={t("overview.columns.received")} numeric>
                    {formatCount(r.received, locale)}
                  </Td>
                  <Td label={t("overview.columns.accepted")} numeric>
                    {formatCount(r.accepted, locale)}
                  </Td>
                  <Td label={t("overview.columns.dropped")} numeric className={r.dropped ? "text-warn" : undefined}>
                    {formatCount(r.dropped, locale)}
                  </Td>
                  <Td label={t("overview.columns.delivered")} numeric>
                    {formatCount(r.delivered, locale)}
                  </Td>
                  <Td label={t("overview.columns.failed")} numeric className={r.failed ? "text-bad" : undefined}>
                    {formatCount(r.failed, locale)}
                  </Td>
                  <Td label={t("overview.columns.lastSeen")} className="text-xs tabular-nums text-ink-3">
                    {r.lastAt ? formatDateTime(r.lastAt, locale) : t("common.unknown")}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
