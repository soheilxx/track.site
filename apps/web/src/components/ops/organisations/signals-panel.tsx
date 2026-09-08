import { getTranslations } from "next-intl/server";
import { Badge, Status } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { formatNumber } from "@/lib/format";
import type { SignalsView } from "@/server/ops/organisations";
import { SEVERITY_TONE, alertKindLabel, severityLabel } from "./labels";

function Counter({ label, value, tone, locale }: { label: string; value: number; tone: "bad" | "warn" | "info" | "neutral"; locale: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2">
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">
        <Status tone={value > 0 ? tone : "neutral"} indicator="dot" className="text-lg">
          {formatNumber(value, locale)}
        </Status>
      </p>
    </div>
  );
}

/** Open data-quality issues and alerts as counts by severity, plus the latest alerts by kind — no evidence, no samples. */
export async function SignalsPanel({ signals, locale }: { signals: SignalsView; locale: string }) {
  const t = await getTranslations("opsOrganisations.detail.signals");
  const tAll = await getTranslations("opsOrganisations");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("issuesTitle")}</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Counter label={t("open")} value={signals.issues.open} tone="warn" locale={locale} />
          <Counter label={t("critical")} value={signals.issues.critical} tone="bad" locale={locale} />
          <Counter label={t("warning")} value={signals.issues.warning} tone="warn" locale={locale} />
          <Counter label={t("info")} value={signals.issues.info} tone="info" locale={locale} />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {signals.issues.open === 0 ? t("noIssues") : null}
          {signals.issues.muted ? ` ${t("muted")}: ${formatNumber(signals.issues.muted, locale)}` : null}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("alertsTitle")}</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Counter label={t("openAlerts")} value={signals.alerts.open} tone="warn" locale={locale} />
          <Counter label={t("critical")} value={signals.alerts.critical} tone="bad" locale={locale} />
          <Counter label={t("warning")} value={signals.alerts.warning} tone="warn" locale={locale} />
          <Counter label={t("info")} value={signals.alerts.info} tone="info" locale={locale} />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {t("rules", { enabled: formatNumber(signals.alerts.rulesEnabled, locale), total: formatNumber(signals.alerts.rules, locale) })} · {t("channels", { count: signals.alerts.channels })}
        </p>
        <h4 className="mt-3 text-xs font-medium tracking-wide text-ink-3 uppercase">{t("recent")}</h4>
        {signals.alerts.recent.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">{t("noAlerts")}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line text-sm">
            {signals.alerts.recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <Badge tone={SEVERITY_TONE[a.severity] ?? "neutral"}>{severityLabel(tAll, a.severity)}</Badge>
                <span className="text-ink">{alertKindLabel(tAll, a.kind)}</span>
                {a.siteName ? <span className="text-ink-3">· {a.siteName}</span> : null}
                <span className="text-xs text-ink-3">{a.resolvedAt ? t("resolved", { date: formatDateTime(a.resolvedAt, locale) ?? "" }) : t("openSince", { date: formatDateTime(a.triggeredAt, locale) ?? "" })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-ink-3 md:col-span-2">{t("countsOnly")}</p>
    </div>
  );
}
