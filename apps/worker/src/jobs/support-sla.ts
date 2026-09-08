import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  createDb,
  supportEvents,
  supportSlaPolicies,
  supportTickets,
  user,
  withWorker,
  type Db,
  type SlaEscalation,
  type SlaPriorityTargets,
  type SupportBusinessHours,
  type SupportTicketPriority,
} from "@track-site/db";
import type { WorkerContext } from "../context.ts";
import { sendAlertMail } from "./alerts-mail.ts";

/**
 * Support SLA job (docs/18-support-desk.md §"SLA engine"). Every minute, from real timestamps only:
 *
 *   - warnings: a running clock (first response / resolution) whose remaining business minutes have
 *     dropped to the policy's warning share (`escalation.warning_percent`, default 80 % elapsed) gets one
 *     `sla_warning` event and the assignee an e-mail — once per clock run (a reopen or a changed target
 *     starts a new run, a pause does not; `warnedClocks`), never for an unassigned ticket's mailbox (the
 *     queue shows the state), never while the ticket is paused (`pending`);
 *   - breaches: past the due date the flag `breached_first_response` / `breached_resolution` flips, an
 *     `sla_breach` event is written and the assignee, the policy's named recipients and — when the policy
 *     escalates — every PLATFORM_ADMIN is e-mailed;
 *   - auto-close: `solved` tickets whose `resolved_at` is older than the policy's `auto_close_days`
 *     (default 7, null = never; the default policy covers tickets without one) become `closed` with a
 *     system `status` event.
 *
 * Idempotent and safe on several workers: the ticket row is locked (`FOR UPDATE`) and the state re-read
 * before an event is written, so two workers never double-flag or double-warn. Event payloads carry ids
 * and field values only — never message bodies. The business-minute arithmetic mirrors
 * `apps/web/src/server/support/sla.ts` (apps never import each other); both test files share fixtures.
 */
export const SUPPORT_SLA_INTERVAL_MS = 60_000;
/** Tickets examined per run (the oldest updates first); a desk beyond that is looked at in the next minute. */
export const SUPPORT_SLA_BATCH_LIMIT = 2000;
const SLA_WARNING_PERCENT_DEFAULT = 80;
const SLA_AUTO_CLOSE_DAYS_DEFAULT = 7;
const SLA_AUTO_CLOSE_DAYS_MAX = 365;
const SLA_TIMEZONE_DEFAULT = "Europe/Berlin";
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DAY_MINUTES = 1440;
const MAX_WALK_DAYS = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SLA_CLOCKS = ["first_response", "resolution"] as const;
export type SlaClock = (typeof SLA_CLOCKS)[number];

// ---------------------------------------------------------------------------------------------------
// Business minutes (mirror of apps/web/src/server/support/sla.ts — keep both in step)
// ---------------------------------------------------------------------------------------------------

type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_BY_INDEX: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface BusinessWindow {
  start: number;
  end: number;
}

interface NormalizedHours {
  timezone: string;
  days: Record<Weekday, readonly BusinessWindow[]>;
  alwaysOpen: boolean;
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

function localTime(date: Date, timeZone: string): LocalDate & { minute: number; second: number } {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), minute: get("hour") * 60 + get("minute"), second: get("second") };
}

function offsetMs(date: Date, timeZone: string): number {
  const l = localTime(date, timeZone);
  return Date.UTC(l.year, l.month - 1, l.day, 0, l.minute, l.second) - (date.getTime() - date.getUTCMilliseconds());
}

function localDateOf(date: Date, timeZone: string): LocalDate {
  const l = localTime(date, timeZone);
  return { year: l.year, month: l.month, day: l.day };
}

function localToInstant(date: LocalDate, minutesOfDay: number, timeZone: string): number {
  const guess = Date.UTC(date.year, date.month - 1, date.day) + minutesOfDay * MINUTE_MS;
  const first = offsetMs(new Date(guess), timeZone);
  let result = guess - first;
  const second = offsetMs(new Date(result), timeZone);
  if (second !== first) result = guess - second;
  return result;
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

const weekdayOf = (date: LocalDate): Weekday => WEEKDAY_BY_INDEX[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]!;
const compareDates = (a: LocalDate, b: LocalDate): number => a.year - b.year || a.month - b.month || a.day - b.day;

/** Validates, sorts and merges the stored windows (same rules as the web engine). */
export function normalizeBusinessHours(hours: SupportBusinessHours | null | undefined): NormalizedHours {
  const timezone = hours?.timezone && isValidTimeZone(hours.timezone) ? hours.timezone : SLA_TIMEZONE_DEFAULT;
  const days = {} as Record<Weekday, readonly BusinessWindow[]>;
  let alwaysOpen = true;
  for (const day of WEEKDAYS) {
    const raw = hours?.days?.[day] ?? [];
    const windows = raw
      .filter((w): w is [number, number] => Array.isArray(w) && w.length === 2 && Number.isFinite(w[0]) && Number.isFinite(w[1]))
      .map(([start, end]) => ({ start: Math.max(0, Math.min(DAY_MINUTES, Math.floor(start))), end: Math.max(0, Math.min(DAY_MINUTES, Math.ceil(end))) }))
      .filter((w) => w.start < w.end)
      .sort((a, b) => a.start - b.start);
    const merged: BusinessWindow[] = [];
    for (const w of windows) {
      const last = merged[merged.length - 1];
      if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
      else merged.push({ ...w });
    }
    if (merged.length) alwaysOpen = false;
    days[day] = merged;
  }
  return { timezone, days, alwaysOpen };
}

/** Business minutes inside [from, to] (fractional; 0 when `to` is not after `from`). */
export function businessMinutesBetween(from: Date, to: Date, hours: SupportBusinessHours | NormalizedHours): number {
  const h = "alwaysOpen" in hours ? hours : normalizeBusinessHours(hours);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!(toMs > fromMs)) return 0;
  if (h.alwaysOpen) return (toMs - fromMs) / MINUTE_MS;
  let total = 0;
  let date = localDateOf(from, h.timezone);
  const last = localDateOf(to, h.timezone);
  for (let i = 0; i < MAX_WALK_DAYS && compareDates(date, last) <= 0; i++) {
    for (const w of h.days[weekdayOf(date)]) {
      total += Math.max(0, Math.min(localToInstant(date, w.end, h.timezone), toMs) - Math.max(localToInstant(date, w.start, h.timezone), fromMs));
    }
    date = shiftDate(date, 1);
  }
  return total / MINUTE_MS;
}

// ---------------------------------------------------------------------------------------------------
// Policy settings and pure evaluation
// ---------------------------------------------------------------------------------------------------

export interface SlaEscalationSettings {
  warningPercent: number;
  notifyUserIds: string[];
  escalateToAdmins: boolean;
  autoCloseDays: number | null;
}

/** Escalation JSON with defaults (mirror of the web engine's `escalationSettings`). */
export function escalationSettings(raw: SlaEscalation | null | undefined): SlaEscalationSettings {
  const r = (raw ?? {}) as SlaEscalation & { escalate_to_admins?: unknown; auto_close_days?: unknown };
  const percent = Number(r.warning_percent);
  const warningPercent = Number.isFinite(percent) && percent >= 1 && percent <= 99 ? Math.round(percent) : SLA_WARNING_PERCENT_DEFAULT;
  const notifyUserIds = Array.isArray(r.notify_user_ids) ? Array.from(new Set(r.notify_user_ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)))) : [];
  const escalateToAdmins = typeof r.escalate_to_admins === "boolean" ? r.escalate_to_admins : true;
  let autoCloseDays: number | null;
  if (r.auto_close_days === null) autoCloseDays = null;
  else if (r.auto_close_days === undefined) autoCloseDays = SLA_AUTO_CLOSE_DAYS_DEFAULT;
  else {
    const days = Number(r.auto_close_days);
    autoCloseDays = Number.isFinite(days) && days > 0 ? Math.min(SLA_AUTO_CLOSE_DAYS_MAX, Math.round(days)) : null;
  }
  return { warningPercent, notifyUserIds, escalateToAdmins, autoCloseDays };
}

export interface ClockPolicy {
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
  escalation: SlaEscalation | null;
}

export interface ClockTicket {
  priority: SupportTicketPriority;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  breachedFirstResponse: boolean;
  breachedResolution: boolean;
  pausedAt: Date | null;
  /** every reopen bumps it (ticket, portal and inbound slices alike) — the clock run's generation */
  reopenCount: number;
}

/** The payload fields of an `sla_warning` event the run scoping reads (null when absent or malformed). */
export interface WarningEventRef {
  clock: string | null;
  /** `target_minutes` the warning was measured against */
  targetMinutes: number | null;
  /** `reopen_count` at the time of the warning; null = written before the field existed (generation 0) */
  reopenCount: number | null;
}

/** `WarningEventRef` from a stored payload — foreign values (the payload is jsonb) never throw. */
export function warningRef(payload: Record<string, unknown> | null | undefined): WarningEventRef {
  const p = payload ?? {};
  const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { clock: typeof p.clock === "string" ? p.clock : null, targetMinutes: int(p.target_minutes), reopenCount: int(p.reopen_count) };
}

export interface ClockFinding {
  clock: SlaClock;
  kind: "warning" | "breach";
  dueAt: Date;
  /** the priority's target in business minutes; null when the policy has no entry (a breach still counts) */
  targetMinutes: number | null;
  /** business minutes until the due date (negative once overdue) */
  remainingMinutes: number;
  warningPercent: number;
}

function targetMinutes(policy: Pick<ClockPolicy, "priorities">, priority: SupportTicketPriority, clock: SlaClock): number | null {
  const entry = policy.priorities?.[priority];
  const value = clock === "first_response" ? entry?.first_response_minutes : entry?.resolution_minutes;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The clocks already warned in their current run. A warning belongs to the run when it was written in the
 * same reopen generation (`reopen_count`) against the same target: a reopen restarts the clock and a
 * priority change (or an edited target) measures it against a new deadline — both may warn again — while a
 * pause only moves the due date (same generation, same target), so a resumed ticket is never warned twice.
 */
export function warnedClocks(events: readonly WarningEventRef[], ticket: Pick<ClockTicket, "priority" | "reopenCount">, policy: Pick<ClockPolicy, "priorities">): Set<SlaClock> {
  const out = new Set<SlaClock>();
  for (const event of events) {
    if (event.clock !== "first_response" && event.clock !== "resolution") continue;
    if ((event.reopenCount ?? 0) !== ticket.reopenCount) continue;
    if (event.targetMinutes !== targetMinutes(policy, ticket.priority, event.clock)) continue;
    out.add(event.clock);
  }
  return out;
}

/**
 * Findings for the running clocks of one ticket: a breach once `now` reaches the due date; otherwise a
 * warning when the remaining business minutes are at most the unwarned share of the target
 * (`(100 − warning_percent) %`), unless a warning for that clock exists already. Paused, stopped and
 * already flagged clocks produce nothing.
 */
export function evaluateClocks(ticket: ClockTicket, policy: ClockPolicy, warned: ReadonlySet<SlaClock>, now: Date): ClockFinding[] {
  if (ticket.pausedAt) return [];
  const { warningPercent } = escalationSettings(policy.escalation);
  const hours = normalizeBusinessHours(policy.businessHours);
  const out: ClockFinding[] = [];
  for (const clock of SLA_CLOCKS) {
    const dueAt = clock === "first_response" ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
    const stoppedAt = clock === "first_response" ? ticket.firstRespondedAt : ticket.resolvedAt;
    const flagged = clock === "first_response" ? ticket.breachedFirstResponse : ticket.breachedResolution;
    if (!dueAt || stoppedAt || flagged) continue;
    const target = targetMinutes(policy, ticket.priority, clock);
    if (now.getTime() >= dueAt.getTime()) {
      out.push({ clock, kind: "breach", dueAt, targetMinutes: target, remainingMinutes: 0 - businessMinutesBetween(dueAt, now, hours) || 0, warningPercent });
      continue;
    }
    if (warned.has(clock) || target === null) continue;
    const remaining = businessMinutesBetween(now, dueAt, hours);
    if (remaining <= ((100 - warningPercent) / 100) * target) out.push({ clock, kind: "warning", dueAt, targetMinutes: target, remainingMinutes: remaining, warningPercent });
  }
  return out;
}

/** True when a solved ticket has waited `days` full days since its resolution (null days = never). */
export function autoCloseDue(resolvedAt: Date | null, days: number | null, now: Date): boolean {
  if (!resolvedAt || days === null || days <= 0) return false;
  return resolvedAt.getTime() + days * DAY_MS <= now.getTime();
}

/** `HOST_APP` (…/app) → the console's ticket page on the same origin. */
export function opsTicketUrl(hostApp: string, ticketId: string): string {
  let origin = hostApp.replace(/\/+$/, "");
  try {
    origin = new URL(hostApp).origin;
  } catch {
    // keep the trimmed value
  }
  return `${origin}/ops/support/${encodeURIComponent(ticketId)}`;
}

// ---------------------------------------------------------------------------------------------------
// Notification text (six locales)
// ---------------------------------------------------------------------------------------------------

export const SLA_TEXT_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;
export type SlaTextLocale = (typeof SLA_TEXT_LOCALES)[number];

interface SlaMailCopy {
  subject: Record<ClockFinding["kind"], string>;
  intro: Record<ClockFinding["kind"], string>;
  clock: Record<SlaClock, string>;
  priority: Record<SupportTicketPriority, string>;
  labels: { ticket: string; subject: string; priority: string; clock: string; due: string; remaining: string; overdue: string; assignee: string; unassigned: string; open: string };
  minutes: string;
  footer: string;
}

const INTL_TAGS: Record<SlaTextLocale, string> = { en: "en-IE", de: "de-DE", fr: "fr-FR", es: "es-ES", it: "it-IT", nl: "nl-NL" };

const COPY: Record<SlaTextLocale, SlaMailCopy> = {
  en: {
    subject: { warning: "[Track support] SLA warning: ticket #{number} — {clock}", breach: "[Track support] SLA breached: ticket #{number} — {clock}" },
    intro: { warning: "The {clock} target of ticket #{number} is about to run out ({remaining} business minutes left).", breach: "The {clock} target of ticket #{number} has been missed." },
    clock: { first_response: "first response", resolution: "resolution" },
    priority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
    labels: { ticket: "Ticket", subject: "Subject", priority: "Priority", clock: "Clock", due: "Due", remaining: "Remaining", overdue: "Overdue by", assignee: "Assignee", unassigned: "nobody yet", open: "Open the ticket" },
    minutes: "{count} business minutes",
    footer: "You receive this message because you work in Track Operations. SLA states are computed from real timestamps and the policy's business hours.",
  },
  de: {
    subject: { warning: "[Track-Support] SLA-Warnung: Ticket #{number} — {clock}", breach: "[Track-Support] SLA verletzt: Ticket #{number} — {clock}" },
    intro: { warning: "Das Ziel „{clock}“ von Ticket #{number} läuft bald ab ({remaining} Geschäftsminuten verbleiben).", breach: "Das Ziel „{clock}“ von Ticket #{number} wurde verfehlt." },
    clock: { first_response: "erste Antwort", resolution: "Lösung" },
    priority: { low: "Niedrig", normal: "Normal", high: "Hoch", urgent: "Dringend" },
    labels: { ticket: "Ticket", subject: "Betreff", priority: "Priorität", clock: "Uhr", due: "Fällig", remaining: "Verbleibend", overdue: "Überfällig seit", assignee: "Zuständig", unassigned: "noch niemand", open: "Ticket öffnen" },
    minutes: "{count} Geschäftsminuten",
    footer: "Sie erhalten diese Nachricht, weil Sie in Track Operations arbeiten. SLA-Zustände werden aus echten Zeitstempeln und den Geschäftszeiten der Richtlinie berechnet.",
  },
  fr: {
    subject: { warning: "[Support Track] Alerte SLA : ticket n° {number} — {clock}", breach: "[Support Track] SLA dépassé : ticket n° {number} — {clock}" },
    intro: { warning: "L’objectif « {clock} » du ticket n° {number} arrive à échéance ({remaining} minutes ouvrées restantes).", breach: "L’objectif « {clock} » du ticket n° {number} n’a pas été tenu." },
    clock: { first_response: "première réponse", resolution: "résolution" },
    priority: { low: "Basse", normal: "Normale", high: "Haute", urgent: "Urgente" },
    labels: { ticket: "Ticket", subject: "Objet", priority: "Priorité", clock: "Horloge", due: "Échéance", remaining: "Restant", overdue: "En retard de", assignee: "Responsable", unassigned: "personne pour l’instant", open: "Ouvrir le ticket" },
    minutes: "{count} minutes ouvrées",
    footer: "Vous recevez ce message parce que vous travaillez dans Track Operations. Les états SLA sont calculés à partir d’horodatages réels et des heures ouvrées de la politique.",
  },
  es: {
    subject: { warning: "[Soporte Track] Aviso de SLA: ticket n.º {number} — {clock}", breach: "[Soporte Track] SLA incumplido: ticket n.º {number} — {clock}" },
    intro: { warning: "El objetivo «{clock}» del ticket n.º {number} está a punto de vencer (quedan {remaining} minutos laborables).", breach: "El objetivo «{clock}» del ticket n.º {number} no se ha cumplido." },
    clock: { first_response: "primera respuesta", resolution: "resolución" },
    priority: { low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente" },
    labels: { ticket: "Ticket", subject: "Asunto", priority: "Prioridad", clock: "Reloj", due: "Vence", remaining: "Restante", overdue: "Retraso de", assignee: "Responsable", unassigned: "nadie todavía", open: "Abrir el ticket" },
    minutes: "{count} minutos laborables",
    footer: "Recibe este mensaje porque trabaja en Track Operations. Los estados de SLA se calculan a partir de marcas de tiempo reales y del horario laboral de la política.",
  },
  it: {
    subject: { warning: "[Supporto Track] Avviso SLA: ticket n. {number} — {clock}", breach: "[Supporto Track] SLA violato: ticket n. {number} — {clock}" },
    intro: { warning: "L’obiettivo «{clock}» del ticket n. {number} sta per scadere ({remaining} minuti lavorativi rimasti).", breach: "L’obiettivo «{clock}» del ticket n. {number} non è stato rispettato." },
    clock: { first_response: "prima risposta", resolution: "risoluzione" },
    priority: { low: "Bassa", normal: "Normale", high: "Alta", urgent: "Urgente" },
    labels: { ticket: "Ticket", subject: "Oggetto", priority: "Priorità", clock: "Orologio", due: "Scadenza", remaining: "Rimanente", overdue: "In ritardo di", assignee: "Assegnatario", unassigned: "ancora nessuno", open: "Apri il ticket" },
    minutes: "{count} minuti lavorativi",
    footer: "Ricevi questo messaggio perché lavori in Track Operations. Gli stati SLA sono calcolati da timestamp reali e dagli orari lavorativi della policy.",
  },
  nl: {
    subject: { warning: "[Track-support] SLA-waarschuwing: ticket #{number} — {clock}", breach: "[Track-support] SLA overschreden: ticket #{number} — {clock}" },
    intro: { warning: "Het doel „{clock}” van ticket #{number} verloopt bijna ({remaining} werkminuten over).", breach: "Het doel „{clock}” van ticket #{number} is niet gehaald." },
    clock: { first_response: "eerste reactie", resolution: "oplossing" },
    priority: { low: "Laag", normal: "Normaal", high: "Hoog", urgent: "Urgent" },
    labels: { ticket: "Ticket", subject: "Onderwerp", priority: "Prioriteit", clock: "Klok", due: "Deadline", remaining: "Resterend", overdue: "Te laat met", assignee: "Toegewezen aan", unassigned: "nog niemand", open: "Ticket openen" },
    minutes: "{count} werkminuten",
    footer: "U ontvangt dit bericht omdat u in Track Operations werkt. SLA-statussen worden berekend uit echte tijdstempels en de werktijden van het beleid.",
  },
};

export interface SlaMailInput {
  kind: ClockFinding["kind"];
  clock: SlaClock;
  ticketNumber: number;
  subject: string;
  priority: SupportTicketPriority;
  dueAt: Date;
  remainingMinutes: number;
  timezone: string;
  /** display name of the assignee (never an e-mail address); null = unassigned */
  assigneeName: string | null;
  url: string;
}

const fill = (template: string, values: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key]! : m));

/** Subject + plain-text body in the recipient's locale (English for unknown locales); values are never re-interpreted as placeholders. */
export function renderSlaMail(locale: string, input: SlaMailInput): { subject: string; text: string } {
  const lang: SlaTextLocale = (SLA_TEXT_LOCALES as readonly string[]).includes(locale) ? (locale as SlaTextLocale) : "en";
  const copy = COPY[lang];
  let due: string;
  try {
    due = `${new Intl.DateTimeFormat(INTL_TAGS[lang], { dateStyle: "medium", timeStyle: "short", timeZone: input.timezone }).format(input.dueAt)} (${input.timezone})`;
  } catch {
    due = input.dueAt.toISOString();
  }
  const values = {
    number: String(input.ticketNumber),
    clock: copy.clock[input.clock],
    remaining: String(Math.max(0, Math.round(input.remainingMinutes))),
  };
  const overdue = input.kind === "breach";
  const remainingText = fill(copy.minutes, { count: String(Math.abs(Math.round(input.remainingMinutes))) });
  const lines = [
    fill(copy.intro[input.kind], values),
    "",
    `${copy.labels.ticket}: #${values.number}`,
    `${copy.labels.subject}: ${input.subject.replace(/[\r\n]+/g, " ").trim() || "—"}`,
    `${copy.labels.priority}: ${copy.priority[input.priority]}`,
    `${copy.labels.clock}: ${values.clock}`,
    `${copy.labels.due}: ${due}`,
    `${overdue ? copy.labels.overdue : copy.labels.remaining}: ${remainingText}`,
    `${copy.labels.assignee}: ${input.assigneeName?.trim() || copy.labels.unassigned}`,
    "",
    `${copy.labels.open}: ${input.url}`,
    "",
    "—",
    copy.footer,
  ];
  return { subject: fill(copy.subject[input.kind], values), text: lines.join("\n") };
}

// ---------------------------------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------------------------------

export interface SupportSlaSummary {
  evaluated: number;
  warnings: number;
  breaches: number;
  autoClosed: number;
  mailsSent: number;
  mailsFailed: number;
}

type PolicyRow = typeof supportSlaPolicies.$inferSelect;

interface Recipient {
  id: string;
  email: string;
  name: string;
  locale: string;
}

const RUNNING_STATUSES = ["new", "open", "pending", "on_hold"] as const;

/** Every `sla_warning` event of the tickets, by ticket (the run scoping happens in `warnedClocks`). */
async function loadWarningEvents(db: Db, ticketIds: string[]): Promise<Map<string, WarningEventRef[]>> {
  const events = new Map<string, WarningEventRef[]>();
  if (!ticketIds.length) return events;
  const rows = await withWorker(db, (tx) =>
    tx
      .select({ ticketId: supportEvents.ticketId, payload: supportEvents.payload })
      .from(supportEvents)
      .where(and(eq(supportEvents.kind, "sla_warning"), inArray(supportEvents.ticketId, ticketIds))),
  );
  for (const row of rows) {
    const list = events.get(row.ticketId) ?? [];
    list.push(warningRef(row.payload));
    events.set(row.ticketId, list);
  }
  return events;
}

/**
 * Writes the finding under a row lock: re-reads the clock state (an agent may have answered, reopened or
 * re-prioritised a second ago — then the finding is stale and the next minute re-evaluates), flips the
 * breach flag or checks that the current run has no warning yet, then inserts the event. Returns the
 * event id, or null when nothing was written (state changed, or another worker was first).
 */
async function recordFinding(db: Db, ticket: Pick<TicketRow, "id" | "organizationId" | "priority" | "reopenCount" | "assigneeUserId">, finding: ClockFinding, policy: PolicyRow, now: Date): Promise<string | null> {
  return withWorker(db, async (tx) => {
    const [fresh] = await tx
      .select({
        pausedAt: supportTickets.pausedAt,
        firstRespondedAt: supportTickets.firstRespondedAt,
        resolvedAt: supportTickets.resolvedAt,
        breachedFirstResponse: supportTickets.breachedFirstResponse,
        breachedResolution: supportTickets.breachedResolution,
        status: supportTickets.status,
        priority: supportTickets.priority,
        reopenCount: supportTickets.reopenCount,
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticket.id))
      .for("update");
    if (!fresh || fresh.pausedAt || !(RUNNING_STATUSES as readonly string[]).includes(fresh.status)) return null;
    if (fresh.priority !== ticket.priority || fresh.reopenCount !== ticket.reopenCount) return null;
    const stopped = finding.clock === "first_response" ? fresh.firstRespondedAt : fresh.resolvedAt;
    const flagged = finding.clock === "first_response" ? fresh.breachedFirstResponse : fresh.breachedResolution;
    if (stopped || flagged) return null;
    if (finding.kind === "breach") {
      await tx
        .update(supportTickets)
        .set(finding.clock === "first_response" ? { breachedFirstResponse: true, updatedAt: now } : { breachedResolution: true, updatedAt: now })
        .where(eq(supportTickets.id, ticket.id));
    } else {
      const warnings = await tx
        .select({ payload: supportEvents.payload })
        .from(supportEvents)
        .where(and(eq(supportEvents.ticketId, ticket.id), eq(supportEvents.kind, "sla_warning")));
      if (warnedClocks(warnings.map((w) => warningRef(w.payload)), fresh, policy).has(finding.clock)) return null;
    }
    const [event] = await tx
      .insert(supportEvents)
      .values({
        ticketId: ticket.id,
        organizationId: ticket.organizationId,
        actorKind: "system",
        actorUserId: null,
        kind: finding.kind === "breach" ? "sla_breach" : "sla_warning",
        payload: {
          clock: finding.clock,
          due_at: finding.dueAt.toISOString(),
          target_minutes: finding.targetMinutes,
          remaining_minutes: Math.round(finding.remainingMinutes),
          warning_percent: finding.warningPercent,
          reopen_count: fresh.reopenCount,
          policy_id: policy.id,
          assignee_user_id: ticket.assigneeUserId,
        },
        createdAt: now,
      })
      .returning({ id: supportEvents.id });
    return event?.id ?? null;
  });
}

async function loadRecipients(db: Db, ids: string[], includeAdmins: boolean): Promise<Recipient[]> {
  if (!ids.length && !includeAdmins) return [];
  const conditions: SQL[] = [];
  if (ids.length) conditions.push(inArray(user.id, ids));
  if (includeAdmins) conditions.push(eq(user.platformRole, "PLATFORM_ADMIN"));
  const rows = await withWorker(db, (tx) =>
    tx
      .select({ id: user.id, email: user.email, name: user.name, locale: user.locale, platformRole: user.platformRole })
      .from(user)
      .where(and(or(...conditions), sql`${user.platformRole} <> 'NONE'`)),
  );
  // only platform operators are ever mailed — a stale id of a former operator is dropped here
  return rows.filter((r) => r.platformRole === "PLATFORM_SUPPORT" || r.platformRole === "PLATFORM_ADMIN").map((r) => ({ id: r.id, email: r.email, name: r.name, locale: r.locale }));
}

interface TicketRow {
  id: string;
  number: number;
  subject: string;
  organizationId: string | null;
  priority: SupportTicketPriority;
  assigneeUserId: string | null;
  slaPolicyId: string | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  breachedFirstResponse: boolean;
  breachedResolution: boolean;
  pausedAt: Date | null;
  reopenCount: number;
}

async function notifyFinding(ctx: WorkerContext, db: Db, ticket: TicketRow, policy: PolicyRow, finding: ClockFinding, eventId: string, now: Date): Promise<{ sent: number; failed: number }> {
  const settings = escalationSettings(policy.escalation);
  const ids = new Set<string>();
  if (ticket.assigneeUserId) ids.add(ticket.assigneeUserId);
  if (finding.kind === "breach") for (const id of settings.notifyUserIds) ids.add(id);
  const recipients = await loadRecipients(db, [...ids], finding.kind === "breach" && settings.escalateToAdmins);
  const assigneeName = ticket.assigneeUserId ? (recipients.find((r) => r.id === ticket.assigneeUserId)?.name ?? null) : null;
  const url = opsTicketUrl(ctx.env.HOST_APP, ticket.id);
  const timezone = normalizeBusinessHours(policy.businessHours).timezone;
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const mail = renderSlaMail(recipient.locale, { kind: finding.kind, clock: finding.clock, ticketNumber: ticket.number, subject: ticket.subject, priority: ticket.priority, dueAt: finding.dueAt, remainingMinutes: finding.remainingMinutes, timezone, assigneeName, url });
    const result = await sendAlertMail({ to: recipient.email, subject: mail.subject, text: mail.text }, process.env, ctx.fetch);
    if (result.ok) sent += 1;
    else {
      failed += 1;
      ctx.logger.warn({ ticketId: ticket.id, eventId, transport: result.transport, err: result.error }, "sla notification not sent");
    }
  }
  const outcome = { recipient_user_ids: recipients.map((r) => r.id), mail: { sent, failed, at: now.toISOString() } };
  await withWorker(db, (tx) =>
    tx
      .update(supportEvents)
      .set({ payload: sql`${supportEvents.payload} || ${JSON.stringify(outcome)}::jsonb` })
      .where(eq(supportEvents.id, eventId)),
  );
  return { sent, failed };
}

/** Warnings, breaches and auto-close for every ticket with a running clock. */
export async function runSupportSla(ctx: WorkerContext, now: Date = ctx.now()): Promise<SupportSlaSummary> {
  const db = createDb(ctx.pool);
  const summary: SupportSlaSummary = { evaluated: 0, warnings: 0, breaches: 0, autoClosed: 0, mailsSent: 0, mailsFailed: 0 };
  const policies = await withWorker(db, (tx) => tx.select().from(supportSlaPolicies));
  const policyById = new Map(policies.map((p) => [p.id, p]));
  const defaultPolicy = policies.find((p) => p.isDefault) ?? null;

  const candidates: TicketRow[] = await withWorker(db, (tx) =>
    tx
      .select({
        id: supportTickets.id,
        number: supportTickets.number,
        subject: supportTickets.subject,
        organizationId: supportTickets.organizationId,
        priority: supportTickets.priority,
        assigneeUserId: supportTickets.assigneeUserId,
        slaPolicyId: supportTickets.slaPolicyId,
        firstResponseDueAt: supportTickets.firstResponseDueAt,
        resolutionDueAt: supportTickets.resolutionDueAt,
        firstRespondedAt: supportTickets.firstRespondedAt,
        resolvedAt: supportTickets.resolvedAt,
        breachedFirstResponse: supportTickets.breachedFirstResponse,
        breachedResolution: supportTickets.breachedResolution,
        pausedAt: supportTickets.pausedAt,
        reopenCount: supportTickets.reopenCount,
      })
      .from(supportTickets)
      .where(
        and(
          inArray(supportTickets.status, [...RUNNING_STATUSES]),
          isNull(supportTickets.pausedAt),
          isNull(supportTickets.mergedIntoId),
          isNotNull(supportTickets.slaPolicyId),
          or(
            and(isNull(supportTickets.firstRespondedAt), isNotNull(supportTickets.firstResponseDueAt), eq(supportTickets.breachedFirstResponse, false)),
            and(isNull(supportTickets.resolvedAt), isNotNull(supportTickets.resolutionDueAt), eq(supportTickets.breachedResolution, false)),
          ),
        ),
      )
      .orderBy(supportTickets.updatedAt)
      .limit(SUPPORT_SLA_BATCH_LIMIT),
  );
  const warnings = await loadWarningEvents(
    db,
    candidates.map((t) => t.id),
  );
  for (const ticket of candidates) {
    const policy = ticket.slaPolicyId ? policyById.get(ticket.slaPolicyId) : undefined;
    if (!policy) continue;
    summary.evaluated += 1;
    const findings = evaluateClocks(ticket, policy, warnedClocks(warnings.get(ticket.id) ?? [], ticket, policy), now);
    for (const finding of findings) {
      try {
        const eventId = await recordFinding(db, ticket, finding, policy, now);
        if (!eventId) continue;
        if (finding.kind === "breach") summary.breaches += 1;
        else summary.warnings += 1;
        const mail = await notifyFinding(ctx, db, ticket, policy, finding, eventId, now);
        summary.mailsSent += mail.sent;
        summary.mailsFailed += mail.failed;
      } catch (e) {
        ctx.logger.error({ ticketId: ticket.id, clock: finding.clock, kind: finding.kind, err: e instanceof Error ? e.message : String(e) }, "sla finding could not be recorded");
      }
    }
  }

  // auto-close: solved tickets older than the policy's auto-close window (the default policy covers tickets without one)
  const solved = await withWorker(db, (tx) =>
    tx
      .select({ id: supportTickets.id, organizationId: supportTickets.organizationId, slaPolicyId: supportTickets.slaPolicyId, resolvedAt: supportTickets.resolvedAt })
      .from(supportTickets)
      .where(and(eq(supportTickets.status, "solved"), isNotNull(supportTickets.resolvedAt), isNull(supportTickets.mergedIntoId)))
      .orderBy(supportTickets.resolvedAt)
      .limit(SUPPORT_SLA_BATCH_LIMIT),
  );
  for (const ticket of solved) {
    const policy = (ticket.slaPolicyId ? policyById.get(ticket.slaPolicyId) : undefined) ?? defaultPolicy;
    if (!policy) continue;
    const days = escalationSettings(policy.escalation).autoCloseDays;
    if (!autoCloseDue(ticket.resolvedAt, days, now)) continue;
    try {
      const closed = await withWorker(db, async (tx) => {
        const updated = await tx
          .update(supportTickets)
          .set({ status: "closed", closedAt: now, updatedAt: now })
          .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.status, "solved")))
          .returning({ id: supportTickets.id });
        if (!updated.length) return false;
        await tx.insert(supportEvents).values({
          ticketId: ticket.id,
          organizationId: ticket.organizationId,
          actorKind: "system",
          actorUserId: null,
          kind: "status",
          payload: { from: "solved", to: "closed", reason: "auto_close", after_days: days, policy_id: policy.id },
          createdAt: now,
        });
        return true;
      });
      if (closed) summary.autoClosed += 1;
    } catch (e) {
      ctx.logger.error({ ticketId: ticket.id, err: e instanceof Error ? e.message : String(e) }, "ticket could not be auto-closed");
    }
  }

  ctx.logger.debug(summary, "support sla evaluated");
  return summary;
}
