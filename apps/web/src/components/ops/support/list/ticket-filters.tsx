import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SUPPORT_TICKET_CHANNELS, SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES } from "@track-site/db";
import { Button, Checkbox, Input, Label, Select, buttonVariants } from "@track-site/ui";
import { checkPlatform, withPlatform } from "@/server/ops/platform";
import { TEAM_QUERY_PARAM, listTeamOptions, type TeamFilter, type TeamOption } from "@/server/support/teams";
import type { PlanOption, SupportOperator, TeamFilterAware } from "@/server/support/tickets";
import { viewHref, type TicketFilters as Filters, type TicketSort, type ViewFilters } from "@/server/support/views";
import { DATE_FIELDS, DATE_RANGE_MAX_DAYS, SLA_FILTERS, TICKET_SEARCH_MAX, TICKET_SORTS } from "./constants";

/**
 * Team filter (docs/18 §"Agent-created tickets and teams"): `views.ts` carries `team` in the filter model
 * (`?team=<slug | id | none | any>`, the additive hook of `tickets.ts` applies it). Options come from the page
 * (`teams`) or, failing that, from the gate cached for this request; a loader failure leaves the select with
 * the neutral options instead of breaking the queue.
 */
async function teamFilterOptions(provided: TeamOption[] | undefined): Promise<TeamOption[]> {
  if (provided) return provided;
  try {
    const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.read");
    if (!access.ok) return [];
    return await withPlatform(access.ctx, (tx) => listTeamOptions(tx, { includeArchived: true }));
  } catch {
    return [];
  }
}

/**
 * GET form (works without JavaScript): every filter lives in the URL on top of the selected view (hidden
 * `view` field). A list the view sets (e.g. the four open statuses) is kept with the "as in the view" option,
 * `any` lifts it, a single value narrows it; multi-value lists are edited in the view editor. Empty date
 * inputs mean "as in the view" too, so a view with a date range gets a checkbox (`dates=any`) that lifts the
 * range — the operator then sees every date or enters a range of their own.
 */
export async function TicketFilters({ filters, base, operators, selfId, plans, teams }: { filters: Filters & TeamFilterAware; base: { filters: ViewFilters; sort: TicketSort }; operators: SupportOperator[]; selfId: string; plans: PlanOption[]; teams?: TeamOption[] }) {
  const t = await getTranslations("supportTickets.queue");
  const tv = await getTranslations("support");
  const tt = await getTranslations("supportTeams");
  const teamOptions = await teamFilterOptions(teams);
  // the select names teams by slug; a filter by id selects the same team
  const teamRaw: TeamFilter = filters.team ?? "any";
  const teamFilter: TeamFilter = teamOptions.find((team) => team.id === teamRaw)?.slug ?? teamRaw;
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v) => b.includes(v));
  const viewRange = base.filters.lastDays != null || base.filters.from != null || base.filters.to != null;
  const rangeLifted = viewRange && filters.lastDays == null && filters.from == null && filters.to == null;
  const viewRangeLabel = (): string => {
    const { lastDays, from, to } = base.filters;
    if (lastDays != null) return t("filters.viewRangeLastDays", { count: lastDays });
    if (from && to) return t("filters.viewRangeBetween", { from, to });
    if (from) return t("filters.viewRangeFrom", { from });
    return t("filters.viewRangeTo", { to: to ?? "" });
  };
  // one value → that value; no value → "any" when the view sets a list, else the neutral option; several → "as in the view"
  const listValue = (value: string[], baseValue: string[]): string => (value.length === 1 ? value[0]! : value.length === 0 && !same(baseValue, []) ? "any" : "");
  const listOptions = (baseValue: string[], values: readonly string[], label: (v: string) => string) => (
    <>
      <option value="">{baseValue.length ? t("filters.asInView", { count: baseValue.length }) : t("filters.any")}</option>
      {baseValue.length ? <option value="any">{t("filters.any")}</option> : null}
      {values.map((v) => (
        <option key={v} value={v}>
          {label(v)}
        </option>
      ))}
    </>
  );
  return (
    <form method="get" action="/ops/support" className="rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="support-filters">
      {filters.view ? <input type="hidden" name="view" value={filters.view} /> : null}
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-ink">{t("filters.legend")}</legend>
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="tq-q">{t("filters.search")}</Label>
          <Input id="tq-q" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={TICKET_SEARCH_MAX} placeholder={t("filters.searchPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-status">{t("filters.status")}</Label>
          <Select id="tq-status" name="status" defaultValue={listValue(filters.status, base.filters.status)} className="mt-1.5">
            {listOptions(base.filters.status, SUPPORT_TICKET_STATUSES, (v) => tv(`status.${v}`))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-priority">{t("filters.priority")}</Label>
          <Select id="tq-priority" name="priority" defaultValue={listValue(filters.priority, base.filters.priority)} className="mt-1.5">
            {listOptions(base.filters.priority, SUPPORT_TICKET_PRIORITIES, (v) => tv(`priority.${v}`))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-channel">{t("filters.channel")}</Label>
          <Select id="tq-channel" name="channel" defaultValue={listValue(filters.channel, base.filters.channel)} className="mt-1.5">
            {listOptions(base.filters.channel, SUPPORT_TICKET_CHANNELS, (v) => tv(`channel.${v}`))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-assignee">{t("filters.assignee")}</Label>
          <Select id="tq-assignee" name="assignee" defaultValue={filters.assignee === "any" ? "any" : filters.assignee} className="mt-1.5">
            <option value="any">{t("filters.everyone")}</option>
            <option value="unassigned">{t("filters.unassigned")}</option>
            <option value="me">{t("filters.me")}</option>
            {operators
              .filter((o) => o.id !== selfId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-team">{tt("queue.teamFilter")}</Label>
          <Select id="tq-team" name={TEAM_QUERY_PARAM} defaultValue={teamFilter} className="mt-1.5" data-testid="support-team-filter">
            <option value="any">{tt("queue.teamAny")}</option>
            <option value="none">{tt("queue.teamNone")}</option>
            {teamOptions.map((team) => (
              <option key={team.id} value={team.slug}>
                {team.name}
              </option>
            ))}
            {teamFilter !== "any" && teamFilter !== "none" && !teamOptions.some((team) => team.slug === teamFilter) ? <option value={teamFilter}>{teamFilter}</option> : null}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-org">{t("filters.organisation")}</Label>
          <Input id="tq-org" type="text" name="org" defaultValue={filters.organization ?? ""} maxLength={64} placeholder={t("filters.organisationPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-plan">{t("filters.plan")}</Label>
          <Select id="tq-plan" name="plan" defaultValue={filters.plan ?? "any"} className="mt-1.5">
            <option value="any">{t("filters.any")}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-tags">{t("filters.tags")}</Label>
          <Input id="tq-tags" type="text" name="tags" defaultValue={filters.tags.join(", ")} maxLength={200} placeholder={t("filters.tagsPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-sla">{t("filters.sla")}</Label>
          <Select id="tq-sla" name="sla" defaultValue={filters.sla} className="mt-1.5">
            {SLA_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(`slaFilters.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-datefield">{t("filters.dateField")}</Label>
          <Select id="tq-datefield" name="dateField" defaultValue={filters.dateField} className="mt-1.5">
            {DATE_FIELDS.map((f) => (
              <option key={f} value={f}>
                {t(`dateFields.${f}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-from">{t("filters.from")}</Label>
          <Input id="tq-from" type="date" name="from" defaultValue={filters.from ?? ""} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-to">{t("filters.to")}</Label>
          <Input id="tq-to" type="date" name="to" defaultValue={filters.to ?? ""} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="tq-lastdays">{t("filters.lastDays")}</Label>
          <Input id="tq-lastdays" type="number" name="lastDays" inputMode="numeric" min={1} max={DATE_RANGE_MAX_DAYS} defaultValue={filters.lastDays ?? ""} placeholder={t("filters.lastDaysPlaceholder")} className="mt-1.5" />
        </div>
        {viewRange ? (
          <div className="min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <Checkbox name="dates" value="any" defaultChecked={rangeLifted} label={t("filters.clearDates")} description={`${viewRangeLabel()} ${t("filters.clearDatesHint")}`} data-testid="support-clear-dates" />
          </div>
        ) : null}
        <div className="min-w-0">
          <Label htmlFor="tq-sort">{t("filters.sort")}</Label>
          <Select id="tq-sort" name="sort" defaultValue={filters.sort} className="mt-1.5">
            {TICKET_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary">
          {t("filters.apply")}
        </Button>
        <Link href={filters.view ? viewHref(filters.view) : "/ops/support"} className={buttonVariants({ variant: "ghost" })}>
          {t("filters.reset")}
        </Link>
      </div>
      <p className="mt-2 text-xs text-ink-3">{t("filters.hint")}</p>
    </form>
  );
}
