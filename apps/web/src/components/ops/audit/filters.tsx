import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, Checkbox, Input, Label, Select, buttonVariants, cn } from "@track-site/ui";
import { OPS_AUDIT_ACTOR_KINDS, OPS_AUDIT_EXPORT_MAX_ROWS, OPS_AUDIT_SCOPES, opsAuditQueryString, type OpsAuditFilters as Filters, type OpsAuditPage } from "@/server/ops/audit";
import { actorKindLabel, scopeLabel } from "./labels";

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * GET form (works without JavaScript): search, actor, action prefix, organisation, target type, scope, date
 * range and the "platform actions only" switch live in the URL. The CSV export is a plain link carrying
 * the same query, so what is exported is exactly what is filtered.
 */
export async function AuditFilters({ filters, page }: { filters: Filters; page: OpsAuditPage }) {
  const t = await getTranslations("opsAudit");
  const exportHref = `/ops/audit/export${opsAuditQueryString(filters, 1)}`;
  const fallback = page.actorFallback;
  return (
    <form method="get" action="/ops/audit" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-ink">{t("filters.legend")}</legend>
        <div className="min-w-0">
          <Label htmlFor="audit-q">{t("filters.search")}</Label>
          <Input id="audit-q" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={64} placeholder={t("filters.searchPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-actor">{t("filters.actor")}</Label>
          <Select id="audit-actor" name="actor" defaultValue={filters.actor ?? ""} className="mt-1.5">
            <option value="">{t("filters.everyone")}</option>
            <optgroup label={t("filters.operators")}>
              {page.operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              {fallback ? <option value={fallback.id}>{fallback.name ?? t("filters.otherUser", { id: fallback.id.slice(0, 8) })}</option> : null}
            </optgroup>
            <optgroup label={t("filters.kinds")}>
              {OPS_AUDIT_ACTOR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {actorKindLabel(t, k)}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-action">{t("filters.action")}</Label>
          <Input id="audit-action" name="action" defaultValue={filters.action ?? ""} maxLength={80} placeholder={t("filters.actionPlaceholder")} aria-describedby="audit-action-hint" className="mt-1.5 font-mono" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <p id="audit-action-hint" className="mt-1 text-xs text-ink-3">
            {t("filters.actionHint")}
          </p>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-organization">{t("filters.organization")}</Label>
          <Input id="audit-organization" name="organization" defaultValue={filters.organization ?? ""} maxLength={64} placeholder={t("filters.organizationPlaceholder")} className="mt-1.5" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-target">{t("filters.target")}</Label>
          <Select id="audit-target" name="target" defaultValue={filters.targetType ?? ""} className="mt-1.5">
            <option value="">{t("filters.all")}</option>
            {page.targetTypes.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            {filters.targetType && !page.targetTypes.includes(filters.targetType) ? <option value={filters.targetType}>{filters.targetType}</option> : null}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-scope">{t("filters.scope")}</Label>
          <Select id="audit-scope" name="scope" defaultValue={filters.scope} className="mt-1.5">
            {OPS_AUDIT_SCOPES.map((s) => (
              <option key={s} value={s}>
                {scopeLabel(t, s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-from">{t("filters.from")}</Label>
          <Input id="audit-from" type="date" name="from" defaultValue={isoDay(filters.from)} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-to">{t("filters.to")}</Label>
          <Input id="audit-to" type="date" name="to" defaultValue={isoDay(filters.to)} className="mt-1.5" />
        </div>
        <div className="min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <Checkbox id="audit-platform" name="platform" value="1" defaultChecked={filters.platformOnly} label={t("filters.platformOnly")} description={t("filters.platformOnlyHint")} />
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary">
          {t("filters.apply")}
        </Button>
        <Link href="/ops/audit" className={buttonVariants({ variant: "ghost" })}>
          {t("filters.reset")}
        </Link>
        <div className="min-w-0 flex-1" />
        {/* button-styled link to the route handler: a download, never nested in a button */}
        <a href={exportHref} className={cn(buttonVariants({ variant: "secondary" }))} data-testid="ops-audit-export">
          <Download className="size-4" aria-hidden="true" />
          {t("filters.export")}
        </a>
      </div>
      <p className="mt-2 text-xs text-ink-3">{t("filters.exportHint", { max: OPS_AUDIT_EXPORT_MAX_ROWS })}</p>
    </form>
  );
}
