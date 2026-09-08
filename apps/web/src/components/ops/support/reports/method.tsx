import { getTranslations } from "next-intl/server";
import { MIN_P90_SAMPLE, REPORT_MAX_TICKETS } from "@/server/support/reports";

const ITEMS = [
  "cohort",
  "backlog",
  "times",
  "p90",
  "sla",
  "agents",
  "csat",
  "organisations",
  "export",
  "privacy",
] as const;

/** How every number on the page is measured, what is a point-in-time figure, and what is deliberately withheld. */
export async function MethodNotes() {
  const t = await getTranslations("supportReports.method");
  return (
    <section
      aria-labelledby="support-reports-method-title"
      className="space-y-3"
      data-testid="support-reports-method"
    >
      <h2 id="support-reports-method-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
        {ITEMS.map((item) => (
          <li key={item}>{t(`items.${item}`, { min: MIN_P90_SAMPLE, max: REPORT_MAX_TICKETS })}</li>
        ))}
      </ul>
    </section>
  );
}
