"use client";

import { Search, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Radio, Select, Textarea, buttonVariants } from "@track-site/ui";
import { SUPPORT_CATEGORIES } from "@/components/app/support/constants";
import { createAgentTicketAction, searchRequestersAction, type NewTicketActionState } from "@/server/ops/actions/support-new";
import type { RequesterMember, RequesterOrganisation } from "@/server/support/agent-tickets";
import type { MacroView } from "@/server/support/macros";
import type { TeamOption } from "@/server/support/teams";
import { applyPlaceholders } from "../ticket/placeholders";
import { errorLabel, fieldErrorLabel } from "../teams/labels";
import { AGENT_TICKET_BODY_MAX, AGENT_TICKET_SUBJECT_MAX, REQUESTER_NAME_MAX, REQUESTER_SEARCH_DEBOUNCE_MS, REQUESTER_SEARCH_MAX, REQUESTER_SEARCH_MIN, type RequesterMode } from "./constants";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
/** keeps the ticket-number placeholder out of `applyPlaceholders` (the number exists only after the insert) */
const TICKET_NUMBER_SENTINEL = "\u0000ticket-number\u0000";
const INITIAL: NewTicketActionState = { ok: false, error: null };

export interface NewTicketFormProps {
  agent: { id: string; name: string; locale: string };
  locales: readonly string[];
  localeNames: Record<string, string>;
  teams: TeamOption[];
  defaultTeamId: string | null;
  macros: MacroView[];
  canAssign: boolean;
}

type SearchState = { status: "idle" } | { status: "loading" } | { status: "error" } | { status: "done"; organisations: RequesterOrganisation[]; members: RequesterMember[] };

/**
 * "New ticket" form of the console (docs/18 §"Agent-created tickets and teams"): requester picker (search of
 * organisations and members through a server action, or a free address with a name), subject and message
 * with the macro picker (placeholders substituted on insert, the ticket number on save), the send / note
 * choice, team, priority, category, tags, language and "assign to me". Uncontrolled where possible; the
 * server action validates and answers per field. On success the form navigates to the new ticket.
 */
export function NewTicketForm({ agent, locales, localeNames, teams, defaultTeamId, macros, canAssign }: NewTicketFormProps) {
  const t = useTranslations("supportTeams");
  const tn = useTranslations("supportTeams.new");
  const tv = useTranslations("support");
  const tc = useTranslations("supportPortal.categories");
  const router = useRouter();
  const ids = useId();
  const [state, action, pending] = useActionState(createAgentTicketAction, INITIAL);
  const [mode, setMode] = useState<RequesterMode>("member");
  const [selected, setSelected] = useState<RequesterMember | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [searching, startSearch] = useTransition();
  const [freeEmail, setFreeEmail] = useState("");
  const [freeName, setFreeName] = useState("");
  const [body, setBody] = useState("");
  const [macroId, setMacroId] = useState("");
  const [usedMacro, setUsedMacro] = useState<MacroView | null>(null);
  const [locale, setLocale] = useState(agent.locale);
  const [sendToCustomer, setSendToCustomer] = useState(true);
  const bodyId = `${ids}-body`;
  const err = (name: string) => fieldErrorLabel(t, state.fieldErrors?.[name]);

  // the search runs debounced while typing; results are display data only (names, addresses, organisations).
  // A query below the minimum shows nothing (`searchActive`) instead of resetting state inside the effect.
  const searchActive = mode === "member" && !selected && query.trim().length >= REQUESTER_SEARCH_MIN;
  useEffect(() => {
    if (!searchActive) return;
    const q = query.trim();
    const handle = window.setTimeout(() => {
      startSearch(async () => {
        setSearch({ status: "loading" });
        const result = await searchRequestersAction(q);
        if (!result.ok) {
          setSearch({ status: "error" });
          return;
        }
        setSearch({ status: "done", organisations: result.results.organisations, members: result.results.members });
      });
    }, REQUESTER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, searchActive]);

  useEffect(() => {
    if (state.ok && state.ticketId) router.push(`/ops/support/${state.ticketId}`);
  }, [state.ok, state.ticketId, router]);

  const pickMember = (m: RequesterMember) => {
    setSelected(m);
    setLocale(locales.includes(m.locale) ? m.locale : agent.locale);
    setSearch({ status: "idle" });
  };

  const selectedMacro = macros.find((m) => m.id === macroId) ?? null;
  const insertMacro = () => {
    if (!selectedMacro) return;
    const requesterName = mode === "member" ? (selected?.name ?? null) : freeName || null;
    const requesterEmail = mode === "member" ? (selected?.email ?? "") : freeEmail;
    // the ticket number does not exist yet: `{ticket_number}` / `{{ticket.number}}` stay as written and the
    // server fills them right after the insert (`fillTicketNumber`); everything else is substituted here
    const text = applyPlaceholders(selectedMacro.bodyText.replace(/\{\{\s*ticket\.number\s*\}\}/gi, TICKET_NUMBER_SENTINEL).replace(/\{ticket_number\}/gi, TICKET_NUMBER_SENTINEL), {
      ticketNumber: 0,
      requesterName,
      requesterEmail,
      agentName: agent.name,
      organisationName: mode === "member" ? (selected?.organization.name ?? null) : null,
    }).replaceAll(TICKET_NUMBER_SENTINEL, "{ticket_number}");
    setBody((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n\n${text}` : text));
    setUsedMacro(selectedMacro);
    document.getElementById(bodyId)?.focus();
  };

  const success = state.ok && state.number != null;

  return (
    <form action={action} className="space-y-6" data-testid="support-new-ticket-form">
      {success ? (
        <Alert tone={state.mailFailed ? "warn" : "ok"}>
          {state.mailFailed ? tn("createdMailFailed", { number: state.number! }) : state.sent ? tn("createdSent", { number: state.number! }) : tn("created", { number: state.number! })}{" "}
          <Link href={`/ops/support/${state.ticketId}`} className="font-medium underline underline-offset-2">
            {tn("openTicket", { number: state.number! })}
          </Link>
        </Alert>
      ) : null}
      {!state.ok && state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>{tn("requesterTitle")}</CardTitle>
          <CardDescription>{tn("requesterText")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-ink">{tn("requesterTitle")}</legend>
            <div className="mt-1 flex flex-wrap gap-x-6">
              <Radio name="requesterMode" value="member" checked={mode === "member"} onChange={() => setMode("member")} label={tn("modeMember")} />
              <Radio name="requesterMode" value="email" checked={mode === "email"} onChange={() => setMode("email")} label={tn("modeEmail")} />
            </div>
          </fieldset>
          {mode === "member" ? (
            selected ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 py-3" data-testid="support-new-requester-selected">
                <input type="hidden" name="requesterUserId" value={selected.userId} />
                <input type="hidden" name="requesterOrganizationId" value={selected.organization.id} />
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-ink-3">{tn("selected")}</p>
                  <p className="font-medium text-ink">{selected.name}</p>
                  <p className="break-all text-ink-2">{selected.email}</p>
                  <p className="text-xs text-ink-3">
                    {selected.organization.name} · {selected.role}
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(null)}>
                  {tn("change")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label={tn("search")} hint={tn("searchHint", { min: REQUESTER_SEARCH_MIN })} error={err("requester")}>
                  {(control) => (
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                      <Input {...control} type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={REQUESTER_SEARCH_MAX} placeholder={tn("searchPlaceholder")} autoComplete="off" className="pl-9" data-testid="support-new-requester-search" />
                    </div>
                  )}
                </Field>
                <div aria-live="polite" className="space-y-3" hidden={!searchActive}>
                  {searchActive && (search.status === "loading" || searching) ? <p className="text-sm text-ink-3">{tn("searching")}</p> : null}
                  {searchActive && search.status === "error" ? <Alert tone="bad">{tn("searchError")}</Alert> : null}
                  {searchActive && search.status === "done" && !search.organisations.length && !search.members.length ? <p className="text-sm text-ink-3">{tn("searchEmpty")}</p> : null}
                  {searchActive && search.status === "done" && search.organisations.length ? (
                    <div>
                      <p className="text-xs font-semibold text-ink-3 uppercase">{tn("organisations")}</p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {search.organisations.map((o) => (
                          <li key={o.id}>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setQuery(o.name)} aria-label={tn("pickOrganisation", { name: o.name })}>
                              {o.name}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {searchActive && search.status === "done" && search.members.length ? (
                    <div>
                      <p className="text-xs font-semibold text-ink-3 uppercase">{tn("members")}</p>
                      <ul className="mt-1 divide-y divide-line rounded-[var(--radius-control)] border border-line">
                        {search.members.map((m) => (
                          <li key={`${m.organization.id}-${m.userId}`}>
                            <button
                              type="button"
                              onClick={() => pickMember(m)}
                              aria-label={tn("pickMember", { name: m.name, email: m.email, organisation: m.organization.name })}
                              className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                              data-testid="support-new-requester-option"
                            >
                              <span className="min-w-0">
                                <span className="block font-medium text-ink">{m.name}</span>
                                <span className="block break-all text-ink-2">{m.email}</span>
                              </span>
                              <span className="text-xs text-ink-3">
                                {m.organization.name} · {m.role}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tn("email")} hint={tn("emailHint")} required error={err("requesterEmail")}>
                {(control) => <Input {...control} type="email" name="requesterEmail" value={freeEmail} onChange={(e) => setFreeEmail(e.target.value)} maxLength={254} autoComplete="off" data-testid="support-new-requester-email" />}
              </Field>
              <Field label={tn("name")} hint={tn("nameHint")} error={err("requesterName")}>
                {(control) => <Input {...control} name="requesterName" value={freeName} onChange={(e) => setFreeName(e.target.value)} maxLength={REQUESTER_NAME_MAX} autoComplete="off" />}
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tn("messageTitle")}</CardTitle>
          <CardDescription>{tn("messageText")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={tn("subject")} required error={err("subject")}>
            {(control) => <Input {...control} name="subject" maxLength={AGENT_TICKET_SUBJECT_MAX} autoComplete="off" data-testid="support-new-subject" />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label={tn("macro")} hint={macros.length ? undefined : tn("macroNone")}>
              {(control) => (
                <Select {...control} value={macroId} onChange={(e) => setMacroId(e.target.value)} disabled={!macros.length} data-testid="support-new-macro">
                  <option value="">{tn("macroPlaceholder")}</option>
                  {macros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.category ? `${m.category} · ` : ""}
                      {m.name}
                      {m.scope === "personal" ? ` (${tv("macroScope.personal")})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="button" variant="secondary" disabled={!selectedMacro} onClick={insertMacro} data-testid="support-new-macro-insert">
              {tn("macroInsert")}
            </Button>
          </div>
          {usedMacro ? <p className="text-xs text-ink-3">{tn("macroInserted", { name: usedMacro.name })}</p> : null}
          <input type="hidden" name="macroId" value={usedMacro?.id ?? ""} />
          <Field id={bodyId} label={tn("body")} hint={tn("bodyHint", { max: AGENT_TICKET_BODY_MAX })} required error={err("body")}>
            {(control) => <Textarea {...control} name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={AGENT_TICKET_BODY_MAX} rows={10} data-testid="support-new-body" />}
          </Field>
          <p className="text-xs text-ink-3">{tn("characters", { count: body.length, max: AGENT_TICKET_BODY_MAX })}</p>
          <Checkbox name="sendToCustomer" checked={sendToCustomer} onChange={(e) => setSendToCustomer(e.target.checked)} label={tn("sendToCustomer")} description={sendToCustomer ? tn("sendToCustomerText") : tn("keepAsNote")} data-testid="support-new-send" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tn("propertiesTitle")}</CardTitle>
          <CardDescription>{tn("propertiesText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={tn("team")} hint={tn("teamHint")} error={err("teamId")}>
            {(control) => (
              <Select {...control} name="teamId" defaultValue={defaultTeamId ?? ""} data-testid="support-new-team">
                <option value="">{tn("teamNone")}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={tn("priority")} error={err("priority")}>
            {(control) => (
              <Select {...control} name="priority" defaultValue="normal">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {tv(`priority.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={tn("category")} error={err("category")}>
            {(control) => (
              <Select {...control} name="category" defaultValue="">
                <option value="">{tn("categoryNone")}</option>
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tc(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={tn("tags")} hint={tn("tagsHint")} error={err("tags")}>
            {(control) => <Input {...control} name="tags" maxLength={400} placeholder="billing, vip" autoComplete="off" />}
          </Field>
          <Field label={tn("locale")} hint={tn("localeHint")} error={err("locale")}>
            {(control) => (
              <Select {...control} name="locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {localeNames[l] ?? l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            {canAssign ? <Checkbox name="assignToMe" defaultChecked label={tn("assignToMe")} description={tn("assignToMeText")} data-testid="support-new-assign" /> : null}
          </div>
          <Alert tone="info" title={tn("slaTitle")} className="sm:col-span-2">
            {tn("slaText")}
          </Alert>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} loadingLabel={t("common.working")} leadingIcon={<Send className="size-4" aria-hidden="true" />} data-testid="support-new-submit" id={`${ids}-submit`}>
          {tn("create")}
        </Button>
        <Link href="/ops/support" className={buttonVariants({ variant: "ghost" })}>
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
