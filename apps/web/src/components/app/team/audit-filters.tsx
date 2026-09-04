import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, Input, Label, Select, buttonVariants } from "@track-site/ui";
import { AUDIT_ACTOR_KINDS, AUDIT_CATEGORIES, type AuditFilters as Filters } from "@/server/team";
import { categoryLabel } from "./labels";

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * GET form (works without JavaScript): category, actor, target type, search and date range live in
 * the URL. Plain labels and controls — no render props cross the server/client boundary.
 */
export async function AuditFilters({ filters, actors, targetTypes }: { filters: Filters; actors: Array<{ userId: string; name: string }>; targetTypes: string[] }) {
  const t = await getTranslations("team");
  return (
    <form method="get" action="/app/team/audit" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <legend className="mb-3 text-sm font-semibold text-ink">{t("audit.filters.legend")}</legend>
        <div className="min-w-0">
          <Label htmlFor="audit-category">{t("audit.filters.category")}</Label>
          <Select id="audit-category" name="category" defaultValue={filters.category} className="mt-1.5">
            <option value="all">{t("audit.filters.all")}</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(t, c)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-actor">{t("audit.filters.actor")}</Label>
          <Select id="audit-actor" name="actor" defaultValue={filters.actor ?? ""} className="mt-1.5">
            <option value="">{t("audit.filters.everyone")}</option>
            {actors.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}
              </option>
            ))}
            {AUDIT_ACTOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`audit.filters.${k}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-target">{t("audit.filters.target")}</Label>
          <Select id="audit-target" name="target" defaultValue={filters.targetType ?? ""} className="mt-1.5">
            <option value="">{t("audit.filters.all")}</option>
            {targetTypes.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-q">{t("audit.filters.search")}</Label>
          <Input id="audit-q" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={64} placeholder={t("audit.filters.searchPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-from">{t("audit.filters.from")}</Label>
          <Input id="audit-from" type="date" name="from" defaultValue={isoDay(filters.from)} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="audit-to">{t("audit.filters.to")}</Label>
          <Input id="audit-to" type="date" name="to" defaultValue={isoDay(filters.to)} className="mt-1.5" />
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant="secondary">
          {t("audit.filters.apply")}
        </Button>
        <Link href="/app/team/audit" className={buttonVariants({ variant: "ghost" })}>
          {t("audit.filters.reset")}
        </Link>
      </div>
    </form>
  );
}
