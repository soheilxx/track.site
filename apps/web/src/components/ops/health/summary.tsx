import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Status, type Tone } from "@track-site/ui";
import type { PlatformHealthView } from "@/server/ops/health";
import { fmtBytes, fmtCount, fmtDuration, fmtPercent, fmtRelative } from "./format";
import { COLLECTOR_TONE, JOB_TONE, OVERALL_TONE, worstTone } from "./tones";

interface Tile {
  key: string;
  label: string;
  tone: Tone;
  state: string;
  hint: ReactNode;
}

/** Headline state with its reasons and one tile per source; every tile names its state in words. */
export async function Summary({ view, locale, nowMs }: { view: PlatformHealthView; locale: string; nowMs: number }) {
  const t = await getTranslations("opsHealth");
  const dash = "—";

  const jobs = view.worker.jobs.filter((j) => j.intervalMs !== null);
  const failing = jobs.filter((j) => j.state === "failing").length;
  const stale = jobs.filter((j) => j.state === "stale").length;
  const workerHint =
    view.worker.state === "never"
      ? t("worker.empty")
      : [stale ? t("tiles.jobsStale", { count: stale }) : null, failing ? t("tiles.jobsFailing", { count: failing }) : null, t("tiles.jobsOk", { count: jobs.filter((j) => j.state === "ok").length })]
          .filter(Boolean)
          .join(" · ");

  const q = view.queues;
  const queueTone: Tone = !q.measured ? "neutral" : q.totals.dead > 0 || (q.totals.maxLagMs ?? 0) >= 15 * 60_000 ? "warn" : "ok";
  const d = view.deliveries.totals.last24h;
  const deliveryTone: Tone = view.deliveries.rows.some((r) => r.warn) ? "warn" : d.total === 0 ? "neutral" : "ok";
  const s = view.stripe;
  const stripeTone: Tone = !s.configured ? "neutral" : s.summary.failed24h > 0 || !s.webhookSecretConfigured ? "warn" : "ok";
  const v = view.vendors;
  const aiTone: Tone = v.ai.ai === "ok" ? "ok" : v.ai.ai === "not_configured" ? "neutral" : "warn";
  const billingTone: Tone = v.billing.billing === "ok" ? "ok" : v.billing.billing === "not_configured" ? "neutral" : "warn";
  const mailTone: Tone = v.mail.mail !== "resend" || !v.mail.mailDomain ? "neutral" : v.mail.mailDomain.status === "verified" ? "ok" : v.mail.mailDomain.status === "sending_only_key" ? "neutral" : "warn";
  const vendorTone = worstTone([aiTone, billingTone, mailTone]);
  const db = view.database;
  const dbTone: Tone = db.state === "ok" && v.dbProbe ? "ok" : "bad";

  const tiles: Tile[] = [
    {
      key: "collector",
      label: t("tiles.collector"),
      tone: COLLECTOR_TONE[view.collector.state],
      state: t(`states.${view.collector.state}`),
      hint: `${view.collector.host}${view.collector.latencyMs !== null ? ` · ${fmtDuration(view.collector.latencyMs, locale)}` : ""}`,
    },
    {
      key: "worker",
      label: t("tiles.worker"),
      tone: JOB_TONE[view.worker.state],
      state: t(`states.${view.worker.state}`),
      hint: view.worker.latestRunAt ? `${fmtRelative(view.worker.latestRunAt, locale, nowMs)} · ${workerHint}` : workerHint,
    },
    {
      key: "queues",
      label: t("tiles.queues"),
      tone: queueTone,
      state: q.measured ? `${t("tiles.ready", { count: fmtCount(q.totals.ready, locale) })} · ${t("tiles.dead", { count: fmtCount(q.totals.dead, locale) })}` : t("tiles.notMeasured"),
      hint: `${t("queues.driver")}: ${q.driver}${q.measured && q.totals.maxLagMs !== null ? ` · ${t("queues.columns.lag")} ${fmtDuration(q.totals.maxLagMs, locale)}` : ""}`,
    },
    {
      key: "deliveries",
      label: t("tiles.deliveries"),
      tone: deliveryTone,
      state: d.total === 0 ? t("tiles.noAttempts") : `${t("tiles.attempts", { count: fmtCount(d.total, locale) })} · ${t("tiles.errorRate", { rate: fmtPercent(d.errorRate, locale) ?? dash })}`,
      hint: `${fmtCount(view.deliveries.rows.length, locale)} ${t("deliveries.columns.connector").toLowerCase()} · ${t("deliveries.window7d")}: ${fmtCount(view.deliveries.totals.last7d.total, locale)}`,
    },
    {
      key: "stripe",
      label: t("tiles.stripe"),
      tone: stripeTone,
      state: s.configured ? t("tiles.failedOf", { failed: fmtCount(s.summary.failed24h, locale), received: fmtCount(s.summary.received24h, locale) }) : t("states.notConfigured"),
      hint: s.summary.lastReceivedAt ? `${t("stripe.lastReceived")}: ${fmtRelative(s.summary.lastReceivedAt, locale, nowMs)}` : t("stripe.empty"),
    },
    {
      key: "vendors",
      label: t("tiles.vendors"),
      tone: vendorTone,
      state: [t(`vendors.ai.states.${v.ai.ai}`), t(`vendors.billing.states.${v.billing.billing}`)].join(" · "),
      hint: `${t("vendors.mail.label")}: ${t(`vendors.mail.transport.${v.mail.mail}`)}${v.mail.mailDomain ? ` · ${mailDomainLabel(t, v.mail.mailDomain.status)}` : ""}`,
    },
    {
      key: "database",
      label: t("tiles.database"),
      tone: dbTone,
      state: db.state === "ok" && v.dbProbe ? t("states.ok") : t("states.unavailable"),
      hint: db.state === "ok" ? [db.version, fmtBytes(db.sizeBytes, locale), db.connections !== null ? `${fmtCount(db.connections, locale)} ${t("database.connections").toLowerCase()}` : null].filter(Boolean).join(" · ") : t("database.unavailable"),
    },
  ];

  return (
    <section aria-labelledby="ops-health-overall-title" className="space-y-4" data-testid="ops-health-summary">
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="ops-health-overall-title" className="text-sm font-medium text-ink-3">
          {t("overall.label")}
        </h2>
        <Status tone={OVERALL_TONE[view.overall.state]} indicator="both" live className="text-base" data-testid="ops-health-overall">
          {t(`overall.${view.overall.state}`)}
        </Status>
      </div>
      {view.overall.reasons.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2" data-testid="ops-health-reasons">
          {view.overall.reasons.map((reason) => (
            <li key={reason}>{t(`overall.reasons.${reason}`)}</li>
          ))}
        </ul>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid={`ops-health-tile-${tile.key}`}>
            <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{tile.label}</p>
            <Status tone={tile.tone} indicator="both" className="mt-2 break-words">
              {tile.state}
            </Status>
            <p className="mt-1 break-words text-xs text-ink-3 tabular-nums">{tile.hint}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Known Resend domain states get a label; anything else is shown as the raw code. */
export function mailDomainLabel(t: Awaited<ReturnType<typeof getTranslations<"opsHealth">>>, status: string): string {
  return t.has(`vendors.mail.domainStates.${status}`) ? t(`vendors.mail.domainStates.${status}`) : status;
}
