import { getTranslations } from "next-intl/server";
import { StatCard } from "@track-site/ui";
import type { SupportReportView } from "@/server/support/reports";
import { count, decimal, duration, percent } from "./format";

/** Headline figures of the range: created, solved, median first response and resolution, SLA attainment, satisfaction. */
export async function ReportKpis({ view, locale }: { view: SupportReportView; locale: string }) {
  const t = await getTranslations("supportReports.kpis");
  const fr = view.times.firstResponse;
  const res = view.times.resolution;
  const sla = view.sla.firstResponse;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="support-reports-kpis">
      <StatCard
        label={t("created.label")}
        value={count(view.volume.total, locale)}
        hint={t("created.hint", { perDay: decimal(view.volume.perDay, locale) })}
      />
      <StatCard
        label={t("solved.label")}
        value={count(view.volume.solved, locale)}
        hint={t("solved.hint")}
      />
      <StatCard
        label={t("firstResponse.label")}
        value={duration(fr.medianMs, locale)}
        hint={t("firstResponse.hint", {
          measured: count(fr.measured, locale),
          p90: duration(fr.p90Ms, locale),
        })}
      />
      <StatCard
        label={t("resolution.label")}
        value={duration(res.medianMs, locale)}
        hint={t("resolution.hint", {
          measured: count(res.measured, locale),
          p90: duration(res.p90Ms, locale),
        })}
      />
      <StatCard
        label={t("sla.label")}
        value={percent(sla.rate, locale)}
        hint={t("sla.hint", {
          met: count(sla.met, locale),
          counted: count(sla.met + sla.breached, locale),
          resolution: percent(view.sla.resolution.rate, locale),
        })}
      />
      <StatCard
        label={t("csat.label")}
        value={
          view.csat.average === null
            ? "—"
            : t("csat.outOf", { average: decimal(view.csat.average, locale, 1) })
        }
        hint={t("csat.hint", {
          responses: count(view.csat.responses, locale),
          rate: percent(view.csat.responseRate, locale),
        })}
      />
    </div>
  );
}
