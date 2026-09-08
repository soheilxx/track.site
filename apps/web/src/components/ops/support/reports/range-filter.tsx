import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, Input, Label, Select, buttonVariants, cn } from "@track-site/ui";
import {
  REPORT_PRESET_DAYS,
  REPORT_RANGE_MAX_DAYS,
  reportQuery,
  type ReportRange,
} from "@/server/support/reports";
import { REPORT_BUCKETS } from "./constants";

/**
 * Date range of the report as a GET form (works without JavaScript): quick ranges as links, a custom
 * `from` / `to` window and the bucket. One row above everything it scopes; every figure below follows it.
 */
export async function RangeFilter({ range, today }: { range: ReportRange; today: string }) {
  const t = await getTranslations("supportReports.range");
  return (
    <form
      method="get"
      action="/ops/support/reports"
      className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
      data-testid="support-reports-range"
    >
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink">{t("legend")}</legend>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div role="group" aria-label={t("presets")} className="flex flex-wrap gap-2">
            {REPORT_PRESET_DAYS.map((days) => {
              const active = range.preset === days;
              return (
                <Link
                  key={days}
                  href={`/ops/support/reports${reportQuery(range, { days })}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
                    active
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink",
                  )}
                >
                  {t("preset", { days })}
                </Link>
              );
            })}
          </div>
          <div className="min-w-0">
            <Label htmlFor="rr-from">{t("from")}</Label>
            <Input
              id="rr-from"
              type="date"
              name="from"
              defaultValue={range.from}
              max={today}
              required
              className="mt-1.5"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="rr-to">{t("to")}</Label>
            <Input
              id="rr-to"
              type="date"
              name="to"
              defaultValue={range.to}
              max={today}
              required
              className="mt-1.5"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="rr-bucket">{t("bucket")}</Label>
            <Select id="rr-bucket" name="bucket" defaultValue={range.bucket} className="mt-1.5">
              {REPORT_BUCKETS.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {t(`buckets.${bucket}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary">
              {t("apply")}
            </Button>
            <Link href="/ops/support/reports" className={buttonVariants({ variant: "ghost" })}>
              {t("reset")}
            </Link>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-3">{t("hint", { max: REPORT_RANGE_MAX_DAYS })}</p>
      </fieldset>
    </form>
  );
}
