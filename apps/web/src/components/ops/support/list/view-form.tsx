"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useId } from "react";
import { Alert, Button, Checkbox, FieldError, Input, Label, Radio, Select, buttonVariants } from "@track-site/ui";
import { saveSupportViewAction, type ViewActionState } from "@/server/ops/actions/support-tickets";
import type { TeamOption } from "@/server/support/teams";
import type { PlanOption, SupportOperator } from "@/server/support/tickets";
import type { SavedView, TicketSort, ViewFilters } from "@/server/support/views";
import { DATE_FIELDS, DATE_RANGE_MAX_DAYS, SLA_FILTERS, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_SORTS, TICKET_STATUSES, VIEW_NAME_MAX } from "./constants";
import { errorLabel } from "./labels";

const INITIAL: ViewActionState = { ok: false, error: null };

/**
 * Editor of a saved view (create and edit): name, scope (shared views are an admin choice), the full filter
 * set with checkbox groups for the lists, and the sort. Submitting saves through the server action and
 * redirects to the queue of the view; validation errors are shown per field.
 */
export function ViewForm({ view, initial, sort, plans, operators, teams = [], selfId, isAdmin }: { view: SavedView | null; initial: ViewFilters; sort: TicketSort; plans: PlanOption[]; operators: SupportOperator[]; teams?: TeamOption[]; selfId: string; isAdmin: boolean }) {
  const t = useTranslations("supportTickets.viewForm");
  const tq = useTranslations("supportTickets.queue");
  const te = useTranslations("supportTickets");
  const tv = useTranslations("support");
  const tt = useTranslations("supportTeams.queue");
  // a stored team the options do not carry (an id, or a team the loader could not list) keeps its value
  const teamValue = initial.team ?? "any";
  const teamKnown = teamValue === "any" || teamValue === "none" || teams.some((team) => team.slug === teamValue || team.id === teamValue);
  const id = useId();
  const [state, action, pending] = useActionState(saveSupportViewAction, INITIAL);
  const fieldError = (name: string) => (state.fieldErrors?.[name] ? te("errors.invalid") : null);
  const group = (name: "status" | "priority" | "channel", values: readonly string[], label: (v: string) => string, legend: string) => (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
        {values.map((v) => (
          <Checkbox key={v} name={name} value={v} defaultChecked={(initial[name] as string[]).includes(v)} label={label(v)} />
        ))}
      </div>
      <p className="text-xs text-ink-3">{t("groupHint")}</p>
    </fieldset>
  );

  return (
    <form action={action} className="space-y-6" data-testid="support-view-form">
      {view ? <input type="hidden" name="id" value={view.id} /> : null}
      {state.error && state.error !== "invalid" ? <Alert tone="bad">{errorLabel(te, state.error)}</Alert> : null}
      {state.error === "invalid" ? <Alert tone="bad">{te("errors.invalid")}</Alert> : null}
      <div className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor={`${id}-name`}>{t("name")}</Label>
          <Input id={`${id}-name`} name="name" required maxLength={VIEW_NAME_MAX} defaultValue={view?.name ?? ""} className="mt-1.5" state={fieldError("name") ? "error" : undefined} aria-describedby={fieldError("name") ? `${id}-name-error` : undefined} />
          <FieldError id={`${id}-name-error`}>{fieldError("name")}</FieldError>
        </div>
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium text-ink">{t("scope")}</legend>
          <div className="mt-1 flex flex-wrap gap-x-6">
            <Radio name="scope" value="personal" defaultChecked={(view?.scope ?? "personal") === "personal"} label={t("scopePersonal")} />
            <Radio name="scope" value="shared" defaultChecked={view?.scope === "shared"} disabled={!isAdmin} label={t("scopeShared")} description={isAdmin ? undefined : t("scopeAdminOnly")} />
          </div>
        </fieldset>
      </div>

      <div className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">{t("filters")}</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {group("status", TICKET_STATUSES, (v) => tv(`status.${v}`), tq("filters.status"))}
          {group("priority", TICKET_PRIORITIES, (v) => tv(`priority.${v}`), tq("filters.priority"))}
          {group("channel", TICKET_CHANNELS, (v) => tv(`channel.${v}`), tq("filters.channel"))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <Label htmlFor={`${id}-assignee`}>{tq("filters.assignee")}</Label>
            <Select id={`${id}-assignee`} name="assignee" defaultValue={initial.assignee} className="mt-1.5">
              <option value="any">{tq("filters.everyone")}</option>
              <option value="unassigned">{tq("filters.unassigned")}</option>
              <option value="me">{tq("filters.me")}</option>
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
            <Label htmlFor={`${id}-org`}>{tq("filters.organisation")}</Label>
            <Input id={`${id}-org`} name="org" defaultValue={initial.organization ?? ""} maxLength={64} placeholder={tq("filters.organisationPlaceholder")} className="mt-1.5" state={fieldError("filters") ? "error" : undefined} />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-plan`}>{tq("filters.plan")}</Label>
            <Select id={`${id}-plan`} name="plan" defaultValue={initial.plan ?? ""} className="mt-1.5">
              <option value="">{tq("filters.any")}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-tags`}>{tq("filters.tags")}</Label>
            <Input id={`${id}-tags`} name="tags" defaultValue={initial.tags.join(", ")} maxLength={400} placeholder={tq("filters.tagsPlaceholder")} className="mt-1.5" />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-team`}>{tt("teamFilter")}</Label>
            <Select id={`${id}-team`} name="team" defaultValue={teamValue} className="mt-1.5" data-testid="support-view-team">
              <option value="any">{tt("teamAny")}</option>
              <option value="none">{tt("teamNone")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id === teamValue ? team.id : team.slug}>
                  {team.name}
                </option>
              ))}
              {teamKnown ? null : <option value={teamValue}>{teamValue}</option>}
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-sla`}>{tq("filters.sla")}</Label>
            <Select id={`${id}-sla`} name="sla" defaultValue={initial.sla} className="mt-1.5">
              {SLA_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {tq(`slaFilters.${s}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-datefield`}>{tq("filters.dateField")}</Label>
            <Select id={`${id}-datefield`} name="dateField" defaultValue={initial.dateField} className="mt-1.5">
              {DATE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {tq(`dateFields.${f}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-from`}>{tq("filters.from")}</Label>
            <Input id={`${id}-from`} type="date" name="from" defaultValue={initial.from ?? ""} className="mt-1.5" />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-to`}>{tq("filters.to")}</Label>
            <Input id={`${id}-to`} type="date" name="to" defaultValue={initial.to ?? ""} className="mt-1.5" />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-lastdays`}>{tq("filters.lastDays")}</Label>
            <Input id={`${id}-lastdays`} type="number" name="lastDays" inputMode="numeric" min={1} max={DATE_RANGE_MAX_DAYS} defaultValue={initial.lastDays ?? ""} placeholder={tq("filters.lastDaysPlaceholder")} className="mt-1.5" />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-sort`}>{t("sort")}</Label>
            <Select id={`${id}-sort`} name="sort" defaultValue={sort} className="mt-1.5">
              {TICKET_SORTS.map((s) => (
                <option key={s} value={s}>
                  {tq(`sorts.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <FieldError id={`${id}-filters-error`}>{fieldError("filters")}</FieldError>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} loadingLabel={te("common.working")} data-testid="support-view-save">
          {view ? t("saveChanges") : t("create")}
        </Button>
        <Link href="/ops/support/views" className={buttonVariants({ variant: "ghost" })}>
          {te("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
