import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button, Label, Select } from "@track-site/ui";
import type { ReportRange } from "@/server/support/reports";
import { REPORT_EXPORT_KINDS } from "./constants";

/**
 * CSV export of one report section for the current range: a GET form to `/ops/support/reports/export`
 * (the route re-checks the permission, audits the export and answers with an attachment, so the page stays).
 */
export async function ExportForm({ range }: { range: ReportRange }) {
  const t = await getTranslations("supportReports.export");
  return (
    <form
      method="get"
      action="/ops/support/reports/export"
      className="flex flex-wrap items-end gap-2"
      data-testid="support-reports-export"
    >
      <input type="hidden" name="from" value={range.from} />
      <input type="hidden" name="to" value={range.to} />
      <input type="hidden" name="bucket" value={range.bucket} />
      <div className="min-w-0">
        <Label htmlFor="rr-kind" className="sr-only">
          {t("kind")}
        </Label>
        <Select id="rr-kind" name="kind" defaultValue="summary">
          {REPORT_EXPORT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="submit"
        variant="secondary"
        leadingIcon={<Download className="size-4" aria-hidden="true" />}
      >
        {t("button")}
      </Button>
    </form>
  );
}
