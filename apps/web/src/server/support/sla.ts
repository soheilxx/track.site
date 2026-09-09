import type { SlaEscalation, SlaPriorityTargets, SupportBusinessHours, SupportTicketPriority, SupportTicketStatus } from "@track-site/db";
import {
  SLA_AUTO_CLOSE_DAYS_DEFAULT,
  SLA_AUTO_CLOSE_DAYS_MAX,
  SLA_CLOCKS,
  SLA_DESCRIPTION_MAX,
  SLA_NAME_MAX,
  SLA_TARGET_MAX_MINUTES,
  SLA_TARGET_MIN_MINUTES,
  SLA_TARGET_UNITS,
  SLA_TIMEZONE_DEFAULT,
  SLA_UNIT_MINUTES,
  SLA_WARNING_PERCENT_DEFAULT,
  SLA_WARNING_PERCENT_MAX,
  SLA_WARNING_PERCENT_MIN,
  SLA_WEEKDAYS,
  type SlaClock,
  type SlaTargetUnit,
  type SlaWeekday,
} from "@/components/ops/support/sla/constants";

/**
 * SLA engine of the support desk (docs/18-support-desk.md §"SLA semantics"). Pure functions — no
 * database, no environment, no wall clock of their own — shared by the ticket slices, the policy editor
 * and the unit tests:
 *
 * 1. Business-hour arithmetic on a policy's `business_hours` (`{ timezone, days: { mon: [[540, 1080]] } }`,
 *    minutes since local midnight, several windows per day, DST-safe through `Intl`): `addBusinessMinutes`,
 *    `subtractBusinessMinutes`, `businessMinutesBetween`, `isBusinessTime`. A policy without any window
 *    runs a 24 × 7 clock.
 * 2. Due dates: `computeDueDates(policy, priority, from, pauses)` — the clock starts at `from` (ticket
 *    creation or reopening), counts business minutes only and stops inside every pause (`pending`); the
 *    due date is the instant the counted minutes reach the priority's target.
 * 3. Ticket lifecycle patches for `support_tickets` (the slices spread them into their UPDATE):
 *    `applyPolicyOnCreate`, `applyPolicyOnPriorityChange`, `pauseClock`, `resumeClock`,
 *    `transitionStatus`, `markFirstResponse`, plus `slaClockState` for the display.
 * 4. Policy selection (`selectSlaPolicy`: plan match, then default), escalation settings with defaults and
 *    the editor's validation (`parseSlaPolicyInput`).
 *
 * The worker job (apps/worker/src/jobs/support-sla.ts) mirrors the business-minute arithmetic — apps
 * never import each other — and both test files share fixtures so the copies stay in step.
 *
 * Integration contract (docs/18 §10): the ticket slices own the rows and take their SLA columns from these
 * helpers instead of shifting dates themselves, so the ticket detail, the bulk actions, the customer portal,
 * the inbound handler and the worker share one model — business minutes throughout. The helpers accept the
 * slices' own row picks (`TicketRow` without `createdAt`, breach flags optional) and a null policy (no SLA →
 * no due dates; a resume falls back to the wall clock). Who calls what:
 *   · creation (`createTicket` in inbound-handler, `insertTicket` in portal.ts for the dashboard and the
 *     contact form): `computeDueDates(policy | null, priority, receivedAt)`;
 *   · status change (`applyTicketChanges` in ops/actions/support-ticket.ts, `ticketStatusChange` in
 *     tickets.ts, `insertCustomerReply` in portal.ts, `markTicketSolvedAction`, the inbound reply append):
 *     `statusTransition(policy | null, ticket, next, now)` → `{ patch, reopened, pauseEndedMs }`;
 *   · priority change (`applyTicketChanges`): `applyPolicyOnPriorityChange`; first agent reply: `markFirstResponse`;
 *   · display (`slaView` in ticket.ts, the worker): `slaClockState(ticket, clock, now, policy)` — `due_soon`
 *     is exactly the worker's warning share, so the detail's "warning" and the `sla_warning` event never disagree.
 * Pause model: a ticket set to pending Friday 17:00 and answered Monday 10:00 moves its due dates by two
 * business hours (Mon–Fri 09–18), never by the 65 wall-clock hours in between. Shifts are computed in
 * milliseconds end to end (a 24 × 7 policy resumes by exactly `pause_total_ms`).
 *
 * Persisted clock run (migration 0018, docs/18 §"Hardening"): every clock start — creation
 * (`computeClockStart`) and reopening (`statusTransition`) — writes `sla_clock_started_at` and the targets the
 * running clocks were booked against (`first_response_target_ms`, `resolution_target_ms`). A priority change
 * on a clock without a due date measures from the persisted start, never from a creation days before the
 * reopening; the worker scopes its warnings to the run (`sla_clock_started_at`) instead of guessing from
 * `reopen_count`. Business hours: a policy without any window falls back to the desk's
 * `support_settings.business_hours` (`effectiveBusinessHours`, applied by every policy loader and the
 * worker); a desk without windows leaves the policy around the clock.
 */

export type { SlaClock, SlaTargetUnit, SlaWeekday };

// ---------------------------------------------------------------------------------------------------
// 1. Business hours
// ---------------------------------------------------------------------------------------------------

export interface BusinessWindow {
  /** minutes since local midnight, 0 … 1440 */
  start: number;
  end: number;
}

export interface NormalizedBusinessHours {
  timezone: string;
  days: Record<SlaWeekday, readonly BusinessWindow[]>;
  /** no window on any day → the clock runs around the clock */
  alwaysOpen: boolean;
}

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
/** Longest walk of the business calendar (a 90-day target over a 2-day week fits with room to spare). */
const MAX_WALK_DAYS = 1000;
const WEEKDAY_BY_INDEX: readonly SlaWeekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** True when `Intl` knows the zone (IANA names; the editor accepts nothing else). */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

interface LocalTime extends LocalDate {
  /** minutes since local midnight */
  minute: number;
  second: number;
}

function localTime(date: Date, timeZone: string): LocalTime {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), minute: get("hour") * 60 + get("minute"), second: get("second") };
}

function offsetMs(date: Date, timeZone: string): number {
  const l = localTime(date, timeZone);
  const asUtc = Date.UTC(l.year, l.month - 1, l.day, 0, l.minute, l.second);
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** Local calendar date of an instant in the zone. */
export function localDateOf(date: Date, timeZone: string): LocalDate {
  const l = localTime(date, timeZone);
  return { year: l.year, month: l.month, day: l.day };
}

/** Local date + minutes since midnight → instant (two-pass offset resolution handles DST transitions). */
export function localToInstant(date: LocalDate, minutesOfDay: number, timeZone: string): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day) + minutesOfDay * MINUTE_MS;
  const first = offsetMs(new Date(guess), timeZone);
  let result = guess - first;
  const second = offsetMs(new Date(result), timeZone);
  if (second !== first) result = guess - second;
  return new Date(result);
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function weekdayOf(date: LocalDate): SlaWeekday {
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]!;
}

const compareDates = (a: LocalDate, b: LocalDate): number => a.year - b.year || a.month - b.month || a.day - b.day;

/** Validates, sorts and merges the stored windows; an unknown zone falls back to the product default. */
export function normalizeBusinessHours(hours: SupportBusinessHours | null | undefined): NormalizedBusinessHours {
  const timezone = hours?.timezone && isValidTimeZone(hours.timezone) ? hours.timezone : SLA_TIMEZONE_DEFAULT;
  const days = {} as Record<SlaWeekday, readonly BusinessWindow[]>;
  let alwaysOpen = true;
  for (const day of SLA_WEEKDAYS) {
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

const isNormalized = (hours: SupportBusinessHours | NormalizedBusinessHours): hours is NormalizedBusinessHours => "alwaysOpen" in hours;
const norm = (hours: SupportBusinessHours | NormalizedBusinessHours): NormalizedBusinessHours => (isNormalized(hours) ? hours : normalizeBusinessHours(hours));

/** True when at least one valid window exists on any day (a policy or desk that is not around the clock). */
export function hasBusinessWindows(hours: SupportBusinessHours | null | undefined): boolean {
  return Boolean(hours) && !normalizeBusinessHours(hours).alwaysOpen;
}

/**
 * The hours a clock runs on: the policy's own windows when it has any, otherwise the desk's
 * `support_settings.business_hours` (docs/18 §11 — the desk hours are the default for a policy without
 * hours), and only when the desk has none either does the policy run around the clock. The worker mirrors this.
 */
export function effectiveBusinessHours(policyHours: SupportBusinessHours | null | undefined, deskHours: SupportBusinessHours | null | undefined): SupportBusinessHours {
  if (policyHours && hasBusinessWindows(policyHours)) return policyHours;
  if (deskHours && hasBusinessWindows(deskHours)) return deskHours;
  return policyHours ?? deskHours ?? { timezone: SLA_TIMEZONE_DEFAULT, days: {} };
}

/** A policy row with the desk's hours applied where its own are empty (what every loader hands to the engine). */
export function withDeskBusinessHours<T extends { businessHours: SupportBusinessHours }>(policy: T, deskHours: SupportBusinessHours | null | undefined): T {
  const businessHours = effectiveBusinessHours(policy.businessHours, deskHours);
  return businessHours === policy.businessHours ? policy : { ...policy, businessHours };
}

function addBusinessMs(from: Date, ms: number, hours: NormalizedBusinessHours): Date {
  if (ms <= 0) return from;
  if (hours.alwaysOpen) return new Date(from.getTime() + ms);
  let remaining = ms;
  let date = localDateOf(from, hours.timezone);
  let cursor = from.getTime();
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    for (const w of hours.days[weekdayOf(date)]) {
      const wEnd = localToInstant(date, w.end, hours.timezone).getTime();
      if (wEnd <= cursor) continue;
      const start = Math.max(cursor, localToInstant(date, w.start, hours.timezone).getTime());
      const available = wEnd - start;
      if (remaining <= available) return new Date(start + remaining);
      remaining -= available;
    }
    date = shiftDate(date, 1);
    cursor = localToInstant(date, 0, hours.timezone).getTime();
  }
  throw new Error("business calendar has no usable window within the walk limit");
}

function subtractBusinessMs(from: Date, ms: number, hours: NormalizedBusinessHours): Date {
  if (ms <= 0) return from;
  if (hours.alwaysOpen) return new Date(from.getTime() - ms);
  let remaining = ms;
  let date = localDateOf(from, hours.timezone);
  let cursor = from.getTime();
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    const windows = hours.days[weekdayOf(date)];
    for (let k = windows.length - 1; k >= 0; k--) {
      const w = windows[k]!;
      const wStart = localToInstant(date, w.start, hours.timezone).getTime();
      if (wStart >= cursor) continue;
      const end = Math.min(cursor, localToInstant(date, w.end, hours.timezone).getTime());
      // an exact fit lands on the end of the previous window, the same instant `addBusinessMs` produces
      // for an exact fit going forward, so the two walks stay inverses of each other on window edges
      if (remaining === 0) return new Date(end);
      const available = end - wStart;
      if (remaining < available) return new Date(end - remaining);
      remaining -= available;
    }
    date = shiftDate(date, -1);
    cursor = localToInstant(date, DAY_MINUTES, hours.timezone).getTime();
  }
  throw new Error("business calendar has no usable window within the walk limit");
}

/** The instant `minutes` of business time after `from` (inside a window, or exactly at a window's end). */
export function addBusinessMinutes(from: Date, minutes: number, hours: SupportBusinessHours | NormalizedBusinessHours): Date {
  return addBusinessMs(from, minutes * MINUTE_MS, norm(hours));
}

/** The instant `minutes` of business time before `from`. */
export function subtractBusinessMinutes(from: Date, minutes: number, hours: SupportBusinessHours | NormalizedBusinessHours): Date {
  return subtractBusinessMs(from, minutes * MINUTE_MS, norm(hours));
}

/** Business milliseconds inside [from, to] — the exact figure the lifecycle shifts by (0 when `to` is not after `from`). */
function businessMsBetween(from: Date, to: Date, h: NormalizedBusinessHours): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!(toMs > fromMs)) return 0;
  if (h.alwaysOpen) return toMs - fromMs;
  let total = 0;
  let date = localDateOf(from, h.timezone);
  const last = localDateOf(to, h.timezone);
  for (let i = 0; i < MAX_WALK_DAYS && compareDates(date, last) <= 0; i++) {
    for (const w of h.days[weekdayOf(date)]) {
      const wStart = localToInstant(date, w.start, h.timezone).getTime();
      const wEnd = localToInstant(date, w.end, h.timezone).getTime();
      total += Math.max(0, Math.min(wEnd, toMs) - Math.max(wStart, fromMs));
    }
    date = shiftDate(date, 1);
  }
  return total;
}

/** Business minutes inside [from, to] (fractional; 0 when `to` is not after `from`). */
export function businessMinutesBetween(from: Date, to: Date, hours: SupportBusinessHours | NormalizedBusinessHours): number {
  return businessMsBetween(from, to, norm(hours)) / MINUTE_MS;
}

/** Whether the instant lies inside a business window (always true for a 24 × 7 policy). */
export function isBusinessTime(at: Date, hours: SupportBusinessHours | NormalizedBusinessHours): boolean {
  const h = norm(hours);
  if (h.alwaysOpen) return true;
  const date = localDateOf(at, h.timezone);
  const t = at.getTime();
  return h.days[weekdayOf(date)].some((w) => localToInstant(date, w.start, h.timezone).getTime() <= t && t < localToInstant(date, w.end, h.timezone).getTime());
}

// ---------------------------------------------------------------------------------------------------
// 2. Policies, escalation, due dates
// ---------------------------------------------------------------------------------------------------

/** The columns of `support_sla_policies` the engine reads (the row itself satisfies the shape). */
export interface SlaPolicyLike {
  id?: string | null;
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
  escalation?: SlaEscalation | null;
}

/** Stored shape of `support_sla_policies.escalation` (all keys optional; `escalationSettings` applies the defaults). */
export interface SlaEscalationJson extends SlaEscalation {
  escalate_to_admins?: boolean;
  /** null = never auto-close; absent = product default */
  auto_close_days?: number | null;
}

export interface SlaEscalationSettings {
  warningPercent: number;
  notifyUserIds: string[];
  escalateToAdmins: boolean;
  /** days after `resolved_at` before a solved ticket closes itself; null = never */
  autoCloseDays: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escalation settings with defaults: warning at 80 %, admins escalated on breach, auto-close after 7 days. */
export function escalationSettings(raw: SlaEscalation | SlaEscalationJson | null | undefined): SlaEscalationSettings {
  const r = (raw ?? {}) as SlaEscalationJson;
  const percent = Number(r.warning_percent);
  const warningPercent = Number.isFinite(percent) && percent >= SLA_WARNING_PERCENT_MIN && percent <= SLA_WARNING_PERCENT_MAX ? Math.round(percent) : SLA_WARNING_PERCENT_DEFAULT;
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

/** Settings → the JSON stored on the policy row. */
export function escalationJson(settings: SlaEscalationSettings): SlaEscalationJson {
  return {
    warning_percent: settings.warningPercent,
    notify_user_ids: [...settings.notifyUserIds],
    escalate_to_admins: settings.escalateToAdmins,
    auto_close_days: settings.autoCloseDays,
  };
}

/** Target of one clock in business minutes; null when the policy has no (valid) entry for the priority. */
export function targetMinutes(policy: Pick<SlaPolicyLike, "priorities">, priority: SupportTicketPriority, clock: SlaClock): number | null {
  const entry = policy.priorities?.[priority];
  const value = clock === "first_response" ? entry?.first_response_minutes : entry?.resolution_minutes;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** The same target in milliseconds of business time — what `support_tickets.*_target_ms` stores; null without a policy or entry. */
export function targetMs(policy: Pick<SlaPolicyLike, "priorities"> | null | undefined, priority: SupportTicketPriority, clock: SlaClock): number | null {
  if (!policy) return null;
  const minutes = targetMinutes(policy, priority, clock);
  return minutes === null ? null : minutes * MINUTE_MS;
}

export interface SlaPause {
  from: Date;
  /** null = still paused */
  to: Date | null;
}

export interface SlaDueDates {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
}

const NO_DUE_DATES: SlaDueDates = { firstResponseDueAt: null, resolutionDueAt: null };

/**
 * Due dates of a ticket whose clock started at `from`. Business minutes count only outside the pauses
 * (in time order; a pause that begins after the target was reached changes nothing, an open pause leaves
 * the due date where it was until `resumeClock` shifts it). Missing targets — or no policy at all — give
 * null, never a guess.
 */
export function computeDueDates(policy: SlaPolicyLike | null | undefined, priority: SupportTicketPriority, from: Date, pauses: readonly SlaPause[] = []): SlaDueDates {
  if (!policy) return { ...NO_DUE_DATES };
  const hours = normalizeBusinessHours(policy.businessHours);
  const ordered = [...pauses].filter((p) => p.to === null || p.to.getTime() > p.from.getTime()).sort((a, b) => a.from.getTime() - b.from.getTime());
  const due = (clock: SlaClock): Date | null => {
    const target = targetMinutes(policy, priority, clock);
    if (target === null) return null;
    let at = addBusinessMs(from, target * MINUTE_MS, hours);
    for (const pause of ordered) {
      if (pause.from.getTime() >= at.getTime()) break;
      if (pause.to === null) break;
      if (pause.to.getTime() <= from.getTime()) continue;
      const start = pause.from.getTime() < from.getTime() ? from : pause.from;
      at = addBusinessMs(at, businessMsBetween(start, pause.to, hours), hours);
    }
    return at;
  };
  return { firstResponseDueAt: due("first_response"), resolutionDueAt: due("resolution") };
}

/** A clock start as the row stores it: the due dates plus `sla_clock_started_at` and the targets booked. */
export interface SlaClockStart extends SlaDueDates {
  slaClockStartedAt: Date;
  firstResponseTargetMs: number | null;
  resolutionTargetMs: number | null;
}

/**
 * Everything a fresh clock run writes (creation in the inbound handler, the portal and the contact form;
 * `statusTransition` uses it for a reopening): the due dates of `computeDueDates`, the start instant and the
 * targets in business milliseconds. Without a policy the due dates and targets are null — the start is still
 * recorded, so a later priority change or a policy assignment knows where the run began.
 */
export function computeClockStart(policy: SlaPolicyLike | null | undefined, priority: SupportTicketPriority, from: Date): SlaClockStart {
  return {
    ...computeDueDates(policy, priority, from),
    slaClockStartedAt: from,
    firstResponseTargetMs: targetMs(policy, priority, "first_response"),
    resolutionTargetMs: targetMs(policy, priority, "resolution"),
  };
}

/** The policy for a plan: an explicit plan match first, then the default, else null (no SLA — shown as such). */
export function selectSlaPolicy<T extends { planIds: string[] | null; isDefault: boolean }>(policies: readonly T[], planId: string | null | undefined): T | null {
  if (planId) {
    const match = policies.find((p) => Array.isArray(p.planIds) && p.planIds.includes(planId));
    if (match) return match;
  }
  return policies.find((p) => p.isDefault) ?? null;
}

// ---------------------------------------------------------------------------------------------------
// 3. Ticket lifecycle
// ---------------------------------------------------------------------------------------------------

/** The SLA columns of `support_tickets` the helpers read. */
export interface SlaTicketClock {
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: Date;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  pausedAt: Date | null;
  pauseTotalMs: number;
  breachedFirstResponse: boolean;
  breachedResolution: boolean;
  /** start of the current clock run (creation or the last reopening, migration 0018); a pick without it falls back to `createdAt` */
  slaClockStartedAt?: Date | null;
  /** the targets the running clocks were booked against (business milliseconds); informational for the display */
  firstResponseTargetMs?: number | null;
  resolutionTargetMs?: number | null;
  /**
   * An agent-created ticket whose clocks wait for the first customer reply (migration 0017, docs/18
   * §"Agent-created tickets and teams"): while set, a reopening or a priority change books no due dates —
   * `applyFirstCustomerReply` starts the run and clears the flag. Absent = not waiting.
   */
  slaPendingFirstCustomerReply?: boolean;
}

/** Column patch for `support_tickets` (spread into the slice's UPDATE). */
export interface SlaTicketPatch {
  slaPolicyId?: string | null;
  status?: SupportTicketStatus;
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  firstRespondedAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  pausedAt?: Date | null;
  pauseTotalMs?: number;
  breachedFirstResponse?: boolean;
  breachedResolution?: boolean;
  slaClockStartedAt?: Date | null;
  firstResponseTargetMs?: number | null;
  resolutionTargetMs?: number | null;
}

/** What a resume reads — a `TicketRow` pick of the ticket slices satisfies it. */
export type SlaResumeInput = Pick<SlaTicketClock, "pausedAt" | "pauseTotalMs" | "firstResponseDueAt" | "resolutionDueAt" | "firstRespondedAt" | "resolvedAt">;
/** What a status transition reads: no `createdAt`; absent breach flags count as not flagged. */
export type SlaTransitionInput = SlaResumeInput & Pick<SlaTicketClock, "status" | "priority" | "closedAt"> & Partial<Pick<SlaTicketClock, "breachedFirstResponse" | "breachedResolution" | "slaPendingFirstCustomerReply">>;
/** What a priority change reads: a clock without a due date so far starts from `slaClockStartedAt`, else from `createdAt`. */
export type SlaPriorityChangeInput = Pick<SlaTicketClock, "priority" | "createdAt" | "pausedAt" | "firstResponseDueAt" | "resolutionDueAt" | "firstRespondedAt" | "resolvedAt"> & Partial<Pick<SlaTicketClock, "slaClockStartedAt" | "slaPendingFirstCustomerReply">>;
/** What the display state reads. */
export type SlaClockStateInput = Pick<SlaTicketClock, "priority" | "pausedAt" | "firstResponseDueAt" | "resolutionDueAt" | "firstRespondedAt" | "resolvedAt" | "breachedFirstResponse" | "breachedResolution">;

const CLOSED_STATUSES: readonly SupportTicketStatus[] = ["solved", "closed"];
const firstResponseRunning = (t: Pick<SlaTicketClock, "firstRespondedAt">) => t.firstRespondedAt === null;
const resolutionRunning = (t: Pick<SlaTicketClock, "resolvedAt">) => t.resolvedAt === null;

/** A `solved` / `closed` ticket going back to work (any open state; `spam` is not a reopen). */
export function isSlaReopen(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return CLOSED_STATUSES.includes(from) && !CLOSED_STATUSES.includes(to) && to !== "spam";
}

/** Fresh clocks for a new ticket (creation time = clock start, persisted with the targets). */
export function applyPolicyOnCreate(policy: SlaPolicyLike, priority: SupportTicketPriority, createdAt: Date): SlaTicketPatch {
  const start = computeClockStart(policy, priority, createdAt);
  return {
    ...(policy.id !== undefined ? { slaPolicyId: policy.id ?? null } : {}),
    firstResponseDueAt: start.firstResponseDueAt,
    resolutionDueAt: start.resolutionDueAt,
    slaClockStartedAt: start.slaClockStartedAt,
    firstResponseTargetMs: start.firstResponseTargetMs,
    resolutionTargetMs: start.resolutionTargetMs,
    pausedAt: null,
    pauseTotalMs: 0,
    breachedFirstResponse: false,
    breachedResolution: false,
  };
}

function shiftDue(due: Date, deltaMinutes: number, hours: NormalizedBusinessHours): Date {
  return deltaMinutes >= 0 ? addBusinessMs(due, deltaMinutes * MINUTE_MS, hours) : subtractBusinessMs(due, -deltaMinutes * MINUTE_MS, hours);
}

/**
 * Priority change: every running clock moves by the difference between the old and the new target, so
 * absorbed pauses stay absorbed (a clock without a due date so far starts from the persisted clock start —
 * the last reopening — and only without one from the creation time). Breach flags follow the new due dates —
 * a shorter target can be overdue at once, a longer one is not. The booked targets are rewritten for the
 * running clocks, so the worker sees a new run.
 */
export function applyPolicyOnPriorityChange(policy: SlaPolicyLike, ticket: SlaPriorityChangeInput, priority: SupportTicketPriority, now: Date): SlaTicketPatch {
  const hours = normalizeBusinessHours(policy.businessHours);
  const patch: SlaTicketPatch = {};
  const start = ticket.slaClockStartedAt ?? ticket.createdAt;
  // an agent-created ticket still waiting for the first customer reply books nothing: its run has not started
  const waiting = ticket.slaPendingFirstCustomerReply === true;
  const recompute = (clock: SlaClock, current: Date | null): Date | null => {
    const target = targetMinutes(policy, priority, clock);
    if (target === null) return null;
    if (current === null && waiting) return null;
    const previous = targetMinutes(policy, ticket.priority, clock);
    if (current === null || previous === null) return addBusinessMs(start, target * MINUTE_MS, hours);
    return shiftDue(current, target - previous, hours);
  };
  const overdue = (due: Date | null): boolean => due !== null && ticket.pausedAt === null && now.getTime() > due.getTime();
  if (firstResponseRunning(ticket)) {
    patch.firstResponseDueAt = recompute("first_response", ticket.firstResponseDueAt);
    patch.firstResponseTargetMs = patch.firstResponseDueAt === null && waiting ? null : targetMs(policy, priority, "first_response");
    patch.breachedFirstResponse = overdue(patch.firstResponseDueAt);
  }
  if (resolutionRunning(ticket)) {
    patch.resolutionDueAt = recompute("resolution", ticket.resolutionDueAt);
    patch.resolutionTargetMs = patch.resolutionDueAt === null && waiting ? null : targetMs(policy, priority, "resolution");
    patch.breachedResolution = overdue(patch.resolutionDueAt);
  }
  return patch;
}

/** Stops the clock (entering `pending`); a ticket that is paused already is left alone. */
export function pauseClock(ticket: Pick<SlaTicketClock, "pausedAt">, now: Date): SlaTicketPatch {
  return ticket.pausedAt ? {} : { pausedAt: now };
}

/**
 * Restarts the clock: the business minutes of the pause move every running clock that was not overdue
 * when the pause began (a breach stays a breach); `pause_total_ms` accumulates the wall-clock pause.
 * Without a policy (a ticket without SLA) the shift is the wall-clock pause — its due dates are null anyway.
 */
export function resumeClock(policy: Pick<SlaPolicyLike, "businessHours"> | null | undefined, ticket: SlaResumeInput, now: Date): SlaTicketPatch {
  if (!ticket.pausedAt) return {};
  const pausedAt = ticket.pausedAt;
  const hours = normalizeBusinessHours(policy?.businessHours ?? null);
  const pausedMs = businessMsBetween(pausedAt, now, hours);
  const shift = (due: Date | null): Date | null => (due === null || due.getTime() < pausedAt.getTime() ? due : addBusinessMs(due, pausedMs, hours));
  const patch: SlaTicketPatch = { pausedAt: null, pauseTotalMs: ticket.pauseTotalMs + Math.max(0, now.getTime() - pausedAt.getTime()) };
  if (firstResponseRunning(ticket)) patch.firstResponseDueAt = shift(ticket.firstResponseDueAt);
  if (resolutionRunning(ticket)) patch.resolutionDueAt = shift(ticket.resolutionDueAt);
  return patch;
}

export interface SlaStatusTransition {
  /** column patch for `support_tickets` (`reopen_count` stays with the ticket slice) */
  patch: SlaTicketPatch;
  /** `solved` / `closed` → an open state (see `isSlaReopen`) */
  reopened: boolean;
  /** wall-clock milliseconds of the pause this transition ended (0 when none ended) */
  pauseEndedMs: number;
}

type TransitionView = Omit<SlaTicketClock, "createdAt">;

/**
 * Status change with its SLA consequences: `pending` pauses, leaving it resumes (a customer reply on a
 * pending ticket goes through here as `pending → open`), `solved` / `closed` stop the resolution clock at
 * `now` (breach = later than the due date), reopening a solved or closed ticket restarts the resolution
 * clock — and the first-response clock when nobody answered yet — from the reopening time. `spam` stops
 * every clock without a resolution. Same status → no change. Drop-in for the ticket slice's `statusPatch`:
 * takes its row pick and its nullable policy, returns the patch with `reopened` and `pauseEndedMs`.
 */
export function statusTransition(policy: SlaPolicyLike | null | undefined, ticket: SlaTransitionInput, to: SupportTicketStatus, now: Date): SlaStatusTransition {
  const reopened = isSlaReopen(ticket.status, to);
  if (to === ticket.status) return { patch: {}, reopened: false, pauseEndedMs: 0 };
  const patch: SlaTicketPatch = { status: to };
  let view: TransitionView = { ...ticket, breachedFirstResponse: ticket.breachedFirstResponse ?? false, breachedResolution: ticket.breachedResolution ?? false };
  const apply = (p: SlaTicketPatch) => {
    Object.assign(patch, p);
    view = { ...view, ...(p as Partial<TransitionView>) };
  };
  if (ticket.status === "pending" && ticket.pausedAt) apply(resumeClock(policy, view, now));
  if (reopened) {
    // a fresh run: the persisted clock start moves to the reopening and the targets are booked again — unless
    // the ticket is an agent-created one still waiting for the first customer reply: it keeps waiting
    // (due dates and targets stay null; `applyFirstCustomerReply` starts the run when that reply comes)
    const start = ticket.slaPendingFirstCustomerReply === true ? computeClockStart(null, ticket.priority, now) : computeClockStart(policy, ticket.priority, now);
    apply({ resolvedAt: null, closedAt: null, resolutionDueAt: start.resolutionDueAt, resolutionTargetMs: start.resolutionTargetMs, breachedResolution: false, pausedAt: null, slaClockStartedAt: start.slaClockStartedAt });
    if (firstResponseRunning(ticket)) apply({ firstResponseDueAt: start.firstResponseDueAt, firstResponseTargetMs: start.firstResponseTargetMs, breachedFirstResponse: false });
  }
  if (to === "pending") apply(pauseClock(view, now));
  if (to === "solved" || to === "closed") {
    if (view.resolvedAt === null) {
      const due = view.resolutionDueAt;
      apply({ resolvedAt: now, breachedResolution: view.breachedResolution || (due !== null && now.getTime() > due.getTime()) });
    }
    if (to === "closed" && view.closedAt === null) apply({ closedAt: now });
    if (view.pausedAt) apply({ pausedAt: null, pauseTotalMs: view.pauseTotalMs + Math.max(0, now.getTime() - view.pausedAt.getTime()) });
  }
  if (to === "spam" && view.pausedAt) apply({ pausedAt: null, pauseTotalMs: view.pauseTotalMs + Math.max(0, now.getTime() - view.pausedAt.getTime()) });
  return { patch, reopened, pauseEndedMs: Math.max(0, (patch.pauseTotalMs ?? ticket.pauseTotalMs) - ticket.pauseTotalMs) };
}

/** The column patch of `statusTransition` alone. */
export function transitionStatus(policy: SlaPolicyLike | null | undefined, ticket: SlaTransitionInput, to: SupportTicketStatus, now: Date): SlaTicketPatch {
  return statusTransition(policy, ticket, to, now).patch;
}

/** The first outbound agent message stops the first-response clock; later than the due date = breached. */
export function markFirstResponse(ticket: Pick<SlaTicketClock, "firstRespondedAt" | "firstResponseDueAt" | "breachedFirstResponse">, at: Date): SlaTicketPatch {
  if (ticket.firstRespondedAt !== null) return {};
  const due = ticket.firstResponseDueAt;
  return { firstRespondedAt: at, breachedFirstResponse: ticket.breachedFirstResponse || (due !== null && at.getTime() > due.getTime()) };
}

export type SlaClockStatus = "none" | "paused" | "running" | "due_soon" | "breached" | "met";

export interface SlaClockState {
  clock: SlaClock;
  status: SlaClockStatus;
  dueAt: Date | null;
  /** when the clock stopped (first response / resolution), null while running */
  stoppedAt: Date | null;
  /** wall-clock milliseconds until the due date (negative when overdue); null without a due date or once stopped */
  remainingMs: number | null;
}

/**
 * Display state of one clock from real timestamps only: `none` without a due date, `met` / `breached` once
 * stopped, `paused` while pending, otherwise `breached` past the due date, `due_soon` inside the policy's
 * warning share of the target (when the policy is given) and `running` before that.
 */
export function slaClockState(ticket: SlaClockStateInput, clock: SlaClock, now: Date, policy?: SlaPolicyLike | null): SlaClockState {
  const dueAt = clock === "first_response" ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  const stoppedAt = clock === "first_response" ? ticket.firstRespondedAt : ticket.resolvedAt;
  const flagged = clock === "first_response" ? ticket.breachedFirstResponse : ticket.breachedResolution;
  if (dueAt === null) return { clock, status: "none", dueAt, stoppedAt, remainingMs: null };
  if (stoppedAt !== null) return { clock, status: flagged || stoppedAt.getTime() > dueAt.getTime() ? "breached" : "met", dueAt, stoppedAt, remainingMs: null };
  const remainingMs = dueAt.getTime() - now.getTime();
  if (ticket.pausedAt) return { clock, status: "paused", dueAt, stoppedAt, remainingMs };
  if (flagged || remainingMs < 0) return { clock, status: "breached", dueAt, stoppedAt, remainingMs };
  if (policy) {
    const target = targetMinutes(policy, ticket.priority, clock);
    if (target !== null) {
      const { warningPercent } = escalationSettings(policy.escalation);
      const remainingBusiness = businessMinutesBetween(now, dueAt, policy.businessHours);
      if (remainingBusiness <= ((100 - warningPercent) / 100) * target) return { clock, status: "due_soon", dueAt, stoppedAt, remainingMs };
    }
  }
  return { clock, status: "running", dueAt, stoppedAt, remainingMs };
}

// ---------------------------------------------------------------------------------------------------
// 4. Editor validation
// ---------------------------------------------------------------------------------------------------

export interface SlaTargetInput {
  value: string;
  unit: string;
}

export interface SlaDayInput {
  enabled: boolean;
  /** `HH:MM` */
  start: string;
  end: string;
}

/** Raw editor values (strings as submitted; the action reads them from the FormData). */
export interface SlaPolicyRawInput {
  name: string;
  description: string;
  planIds: string[];
  isDefault: boolean;
  targets: Partial<Record<SupportTicketPriority, Partial<Record<SlaClock, SlaTargetInput>>>>;
  timezone: string;
  days: Partial<Record<SlaWeekday, SlaDayInput>>;
  warningPercent: string;
  escalateToAdmins: boolean;
  notifyUserIds: string[];
  /** empty or 0 = never */
  autoCloseDays: string;
}

export interface SlaPolicyValues {
  name: string;
  description: string;
  /** null = no explicit plans */
  planIds: string[] | null;
  isDefault: boolean;
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
  escalation: SlaEscalationJson;
}

export type SlaFieldErrorCode = "required" | "invalid" | "long" | "range" | "order" | "window" | "timezone";

export type SlaPolicyParse = { ok: true; value: SlaPolicyValues } | { ok: false; fieldErrors: Record<string, SlaFieldErrorCode> };

const PRIORITIES: readonly SupportTicketPriority[] = ["low", "normal", "high", "urgent"];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
const PLAN_ID_RE = /^[a-z][a-z0-9_-]{0,39}$/;

/** `"09:00"` → 540; `"24:00"` → 1440; null for anything else. */
export function timeToMinutes(value: string): number | null {
  const m = value.trim().match(TIME_RE);
  if (!m) return null;
  if (value.trim() === "24:00") return DAY_MINUTES;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 540 → `"09:00"`; 1440 → `"24:00"`. */
export function minutesToTime(minutes: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Business minutes → the largest unit that divides them evenly (for prefilling the editor). */
export function minutesToTargetInput(minutes: number): SlaTargetInput {
  if (minutes > 0 && minutes % SLA_UNIT_MINUTES.days === 0) return { value: String(minutes / SLA_UNIT_MINUTES.days), unit: "days" };
  if (minutes > 0 && minutes % SLA_UNIT_MINUTES.hours === 0) return { value: String(minutes / SLA_UNIT_MINUTES.hours), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

function parseTarget(input: SlaTargetInput | undefined): { minutes: number } | { error: SlaFieldErrorCode } {
  if (!input || !input.value.trim()) return { error: "required" };
  if (!(SLA_TARGET_UNITS as readonly string[]).includes(input.unit)) return { error: "invalid" };
  const raw = Number(input.value.trim().replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return { error: "invalid" };
  const minutes = Math.round(raw * SLA_UNIT_MINUTES[input.unit as SlaTargetUnit]);
  if (minutes < SLA_TARGET_MIN_MINUTES || minutes > SLA_TARGET_MAX_MINUTES) return { error: "range" };
  return { minutes };
}

/** Validates the editor input; every problem is reported per field (`targets.urgent.first_response`, `days.mon`, …). */
export function parseSlaPolicyInput(raw: SlaPolicyRawInput): SlaPolicyParse {
  const fieldErrors: Record<string, SlaFieldErrorCode> = {};
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (!name) fieldErrors.name = "required";
  else if (name.length > SLA_NAME_MAX) fieldErrors.name = "long";
  const description = raw.description.trim();
  if (description.length > SLA_DESCRIPTION_MAX) fieldErrors.description = "long";

  const planIds = Array.from(new Set(raw.planIds.map((p) => p.trim()).filter(Boolean)));
  if (planIds.some((p) => !PLAN_ID_RE.test(p))) fieldErrors.planIds = "invalid";

  const priorities: SlaPriorityTargets = {};
  for (const priority of PRIORITIES) {
    const first = parseTarget(raw.targets[priority]?.first_response);
    const resolution = parseTarget(raw.targets[priority]?.resolution);
    if ("error" in first) fieldErrors[`targets.${priority}.first_response`] = first.error;
    if ("error" in resolution) fieldErrors[`targets.${priority}.resolution`] = resolution.error;
    if ("minutes" in first && "minutes" in resolution) {
      if (first.minutes > resolution.minutes) fieldErrors[`targets.${priority}.resolution`] = "order";
      else priorities[priority] = { first_response_minutes: first.minutes, resolution_minutes: resolution.minutes };
    }
  }

  const timezone = raw.timezone.trim();
  if (!timezone) fieldErrors.timezone = "required";
  else if (!isValidTimeZone(timezone)) fieldErrors.timezone = "timezone";
  const days: SupportBusinessHours["days"] = {};
  for (const day of SLA_WEEKDAYS) {
    const input = raw.days[day];
    if (!input?.enabled) continue;
    const start = timeToMinutes(input.start);
    const end = timeToMinutes(input.end);
    if (start === null || end === null) fieldErrors[`days.${day}`] = "invalid";
    else if (start >= end) fieldErrors[`days.${day}`] = "window";
    else days[day] = [[start, end]];
  }

  const percent = Number(raw.warningPercent.trim());
  if (!raw.warningPercent.trim()) fieldErrors.warningPercent = "required";
  else if (!Number.isInteger(percent) || percent < SLA_WARNING_PERCENT_MIN || percent > SLA_WARNING_PERCENT_MAX) fieldErrors.warningPercent = "range";

  const notifyUserIds = Array.from(new Set(raw.notifyUserIds.map((id) => id.trim().toLowerCase()).filter(Boolean)));
  if (notifyUserIds.some((id) => !UUID_RE.test(id))) fieldErrors.notifyUserIds = "invalid";

  let autoCloseDays: number | null = null;
  const autoCloseRaw = raw.autoCloseDays.trim();
  if (autoCloseRaw) {
    const days_ = Number(autoCloseRaw);
    if (!Number.isInteger(days_) || days_ < 0 || days_ > SLA_AUTO_CLOSE_DAYS_MAX) fieldErrors.autoCloseDays = "range";
    else autoCloseDays = days_ === 0 ? null : days_;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      name,
      description,
      planIds: planIds.length ? planIds : null,
      isDefault: raw.isDefault,
      priorities,
      businessHours: { timezone, days },
      escalation: escalationJson({ warningPercent: percent, notifyUserIds, escalateToAdmins: raw.escalateToAdmins, autoCloseDays }),
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// 5. Editor values (server → client component props)
// ---------------------------------------------------------------------------------------------------

export interface SlaTargetFormValue {
  value: string;
  unit: SlaTargetUnit;
}

export interface SlaDayFormValue {
  enabled: boolean;
  start: string;
  end: string;
}

/** Prefilled values of the policy form (plain strings and booleans; safe to pass to a client component). */
export interface SlaPolicyFormValues {
  id: string | null;
  name: string;
  description: string;
  planIds: string[];
  isDefault: boolean;
  targets: Record<SupportTicketPriority, Record<SlaClock, SlaTargetFormValue>>;
  timezone: string;
  days: Record<SlaWeekday, SlaDayFormValue>;
  warningPercent: string;
  escalateToAdmins: boolean;
  notifyUserIds: string[];
  /** empty = never */
  autoCloseDays: string;
}

const SEED_TARGETS: Required<SlaPriorityTargets> = {
  urgent: { first_response_minutes: 60, resolution_minutes: 480 },
  high: { first_response_minutes: 240, resolution_minutes: 1440 },
  normal: { first_response_minutes: 480, resolution_minutes: 4320 },
  low: { first_response_minutes: 1440, resolution_minutes: 10080 },
};

const targetInput = (minutes: number | null | undefined): SlaTargetFormValue => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return { value: "", unit: "hours" };
  const input = minutesToTargetInput(minutes);
  return { value: input.value, unit: input.unit as SlaTargetUnit };
};

/** Values of a policy row for the editor (one window per day; further windows are kept only through the API). */
export function policyToFormValues(policy: {
  id: string | null;
  name: string;
  description: string;
  planIds: string[] | null;
  isDefault: boolean;
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
  escalation: SlaEscalation | SlaEscalationSettings | null;
}): SlaPolicyFormValues {
  const settings = policy.escalation && "warningPercent" in policy.escalation ? policy.escalation : escalationSettings(policy.escalation);
  const targets = {} as SlaPolicyFormValues["targets"];
  for (const priority of PRIORITIES) {
    const entry = policy.priorities?.[priority];
    targets[priority] = { first_response: targetInput(entry?.first_response_minutes), resolution: targetInput(entry?.resolution_minutes) };
  }
  const normalized = normalizeBusinessHours(policy.businessHours);
  const days = {} as SlaPolicyFormValues["days"];
  for (const day of SLA_WEEKDAYS) {
    const window = normalized.days[day][0];
    days[day] = window ? { enabled: true, start: minutesToTime(window.start), end: minutesToTime(window.end) } : { enabled: false, start: "09:00", end: "18:00" };
  }
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    planIds: policy.planIds ?? [],
    isDefault: policy.isDefault,
    targets,
    timezone: policy.businessHours?.timezone && isValidTimeZone(policy.businessHours.timezone) ? policy.businessHours.timezone : SLA_TIMEZONE_DEFAULT,
    days,
    warningPercent: String(settings.warningPercent),
    escalateToAdmins: settings.escalateToAdmins,
    notifyUserIds: [...settings.notifyUserIds],
    autoCloseDays: settings.autoCloseDays === null ? "" : String(settings.autoCloseDays),
  };
}

/** A new policy prefilled with the seeded defaults (Mon–Fri 09:00–18:00 Europe/Berlin, the default targets). */
export function defaultSlaPolicyFormValues(): SlaPolicyFormValues {
  return policyToFormValues({
    id: null,
    name: "",
    description: "",
    planIds: null,
    isDefault: false,
    priorities: SEED_TARGETS,
    businessHours: { timezone: SLA_TIMEZONE_DEFAULT, days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } },
    escalation: null,
  });
}

export { SLA_CLOCKS };
