import "server-only";
import { asc, desc, eq, gte, sql } from "drizzle-orm";
import {
  SUPPORT_AUTO_ASSIGN_STRATEGIES,
  SUPPORT_INBOUND_EVENT_STATUSES,
  supportInboundEvents,
  supportSettings,
  supportSlaPolicies,
  supportTickets,
  type SlaPriorityTargets,
  type SupportAutoAssignStrategy,
  type SupportBusinessHours,
  type SupportInboundEventStatus,
  type Tx,
} from "@track-site/db";
import { env } from "@/env";
import type { Mail } from "@/server/mail";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";
import { listAgentsOnline } from "@/server/support/auto-assign";
import { INBOUND_EVENT_STALE_MS, acknowledgementText } from "@/server/support/inbound-handler";
import { SUPPORT_MAIL_DEFAULTS, buildTicketMail, supportMailSettings, type SupportMailSettings, type TicketMailTicket } from "@/server/support/mail";

/**
 * Support desk → settings (docs/18 §"Settings", task T5): the singleton `support_settings` row (id = 1),
 * its form model, the auto-acknowledgement mail, the auto-assignment helper and the SLA policy summary of
 * the overview page. Admin-only (`platform.sla.manage`); the mutation lives in
 * `server/ops/actions/support-settings.ts`.
 *
 * Not stored by this schema (migration 0015 has no columns): a blocked-sender list and an auto-close
 * interval. The settings page says so instead of showing fields without effect; the follow-up migration
 * adds `blocked_senders text[]` and `auto_close_days integer`, after which `SupportDeskSettings` grows.
 */

export const SETTINGS_ROW_ID = 1;
export const FROM_NAME_MAX = 80;
export const SIGNATURE_MAX = 1000;

export type SupportSettingsRow = typeof supportSettings.$inferSelect;

/** The stored, editable settings. */
export interface SupportDeskSettings {
  inboundDomain: string;
  fromName: string;
  fromAddress: string;
  signatureText: string;
  autoReplyEnabled: boolean;
  autoAssignStrategy: SupportAutoAssignStrategy;
  businessHours: SupportBusinessHours;
  csatEnabled: boolean;
}

export interface SupportSettingsView extends SupportDeskSettings {
  /** the row exists (false = defaults of the schema are shown, nothing was saved yet) */
  stored: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** sender settings as mails actually use them (environment overrides applied) */
  effective: SupportMailSettings;
  /** which stored values an environment variable overrides */
  envOverrides: { inboundDomain: boolean; fromAddress: boolean };
}

export const DEFAULT_BUSINESS_HOURS: SupportBusinessHours = { timezone: "Europe/Berlin", days: {} };

/** Defaults of the schema (what a missing row means). */
export function defaultSupportSettings(): SupportDeskSettings {
  return {
    inboundDomain: SUPPORT_MAIL_DEFAULTS.inboundDomain,
    fromName: SUPPORT_MAIL_DEFAULTS.fromName,
    fromAddress: SUPPORT_MAIL_DEFAULTS.fromAddress,
    signatureText: "",
    autoReplyEnabled: false,
    autoAssignStrategy: "none",
    businessHours: { ...DEFAULT_BUSINESS_HOURS, days: {} },
    csatEnabled: true,
  };
}

function safeEnv(): { SUPPORT_INBOUND_DOMAIN?: string | null; SUPPORT_FROM_ADDRESS?: string | null } {
  try {
    return env();
  } catch {
    return {};
  }
}

const envSet = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

export function settingsFromRow(row: SupportSettingsRow): SupportDeskSettings {
  return {
    inboundDomain: row.inboundDomain,
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    signatureText: row.signatureText,
    autoReplyEnabled: row.autoReplyEnabled,
    autoAssignStrategy: row.autoAssignStrategy,
    businessHours: normalizeBusinessHours(row.businessHours),
    csatEnabled: row.csatEnabled,
  };
}

/** The stored row as `tracksite_ops`, or null when the seed row is missing. */
export async function getSupportSettingsRow(tx: Tx): Promise<SupportSettingsRow | null> {
  const [row] = await tx.select().from(supportSettings).where(eq(supportSettings.id, SETTINGS_ROW_ID)).limit(1);
  return row ?? null;
}

/** Settings for the pages: the row (or the defaults), the effective sender values and the overrides. */
export async function loadSupportSettings(ctx: PlatformContext): Promise<SupportSettingsView> {
  const row = await withPlatform(ctx, getSupportSettingsRow);
  const settings = row ? settingsFromRow(row) : defaultSupportSettings();
  const e = safeEnv();
  return {
    ...settings,
    stored: Boolean(row),
    createdAt: row?.createdAt.toISOString() ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    effective: supportMailSettings(settings),
    envOverrides: { inboundDomain: envSet(e.SUPPORT_INBOUND_DOMAIN), fromAddress: envSet(e.SUPPORT_FROM_ADDRESS) },
  };
}

/** Settings a mail or the inbound route needs, read inside a transaction (defaults when the row is missing). */
export async function supportDeskSettings(tx: Tx): Promise<SupportDeskSettings> {
  const row = await getSupportSettingsRow(tx);
  return row ? settingsFromRow(row) : defaultSupportSettings();
}

// ---------------------------------------------------------------------------------------------------
// Validation helpers (pure)
// ---------------------------------------------------------------------------------------------------

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** A DNS name with at least one dot (`support.track.site`); no scheme, path or port. */
export function isValidHostname(value: string): boolean {
  return HOSTNAME_RE.test(value.trim());
}

/** IANA time zone the runtime knows (`Intl` throws for unknown names). */
export function isValidTimeZone(value: string): boolean {
  const tz = value.trim();
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Time zones the runtime offers (suggestions for the settings form; the validator decides). */
export function timeZoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/Berlin"];
  }
}

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === "string" && (DAY_KEYS as readonly string[]).includes(value);
}

export interface BusinessDayForm {
  enabled: boolean;
  /** `HH:MM` */
  start: string;
  end: string;
}

export interface BusinessHoursForm {
  timezone: string;
  days: Record<DayKey, BusinessDayForm>;
}

export const DEFAULT_BUSINESS_DAY: BusinessDayForm = { enabled: false, start: "09:00", end: "18:00" };

/** Minutes since midnight → `HH:MM` (1440 → `24:00`). */
export function minutesToTime(minutes: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** `HH:MM` (or `HH:MM:SS` as some browsers send) → minutes since midnight; `24:00` allowed; null when malformed. */
export function timeToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

const isWindow = (w: unknown): w is [number, number] => Array.isArray(w) && w.length === 2 && w.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1440);

/** Drops malformed windows and unknown days; sorts the windows of a day. */
export function normalizeBusinessHours(hours: SupportBusinessHours | null | undefined): SupportBusinessHours {
  const timezone = typeof hours?.timezone === "string" && hours.timezone.trim() ? hours.timezone.trim() : DEFAULT_BUSINESS_HOURS.timezone;
  const days: SupportBusinessHours["days"] = {};
  for (const key of DAY_KEYS) {
    const list = hours?.days?.[key];
    if (!Array.isArray(list)) continue;
    const windows = list.filter(isWindow).filter(([a, b]) => a < b).sort((a, b) => a[0] - b[0]);
    if (windows.length) days[key] = windows.map(([a, b]) => [a, b] as [number, number]);
  }
  return { timezone, days };
}

export interface BusinessHoursFormModel {
  form: BusinessHoursForm;
  /** windows beyond the first one per day — the form edits one window a day and replaces the rest on save */
  extraWindows: Partial<Record<DayKey, Array<[number, number]>>>;
}

/** Stored hours → form model (one window per day; further windows are reported separately). */
export function businessHoursToForm(hours: SupportBusinessHours | null | undefined): BusinessHoursFormModel {
  const normalized = normalizeBusinessHours(hours);
  const days = {} as Record<DayKey, BusinessDayForm>;
  const extraWindows: BusinessHoursFormModel["extraWindows"] = {};
  for (const key of DAY_KEYS) {
    const windows = normalized.days[key] ?? [];
    const first = windows[0];
    days[key] = first ? { enabled: true, start: minutesToTime(first[0]), end: minutesToTime(first[1]) } : { ...DEFAULT_BUSINESS_DAY };
    if (windows.length > 1) extraWindows[key] = windows.slice(1);
  }
  return { form: { timezone: normalized.timezone, days }, extraWindows };
}

export interface BusinessHoursParse {
  value: SupportBusinessHours;
  /** field name (`timezone`, `day_mon`) → error code (`timezone`, `time`, `window`) */
  errors: Record<string, string>;
}

/** Form model → stored hours; a disabled day has no window, an enabled day needs `start < end`. */
export function businessHoursFromForm(form: BusinessHoursForm): BusinessHoursParse {
  const errors: Record<string, string> = {};
  const timezone = form.timezone.trim();
  if (!isValidTimeZone(timezone)) errors.timezone = "timezone";
  const days: SupportBusinessHours["days"] = {};
  for (const key of DAY_KEYS) {
    const day = form.days[key];
    if (!day?.enabled) continue;
    const start = timeToMinutes(day.start);
    const end = timeToMinutes(day.end);
    if (start == null || end == null) {
      errors[`day_${key}`] = "time";
      continue;
    }
    if (start >= end) {
      errors[`day_${key}`] = "window";
      continue;
    }
    days[key] = [[start, end]];
  }
  return { value: { timezone: timezone || DEFAULT_BUSINESS_HOURS.timezone, days }, errors };
}

/** Reads the business-hours fields of the settings form (`timezone`, `day_<key>_enabled|start|end`). */
export function businessHoursFormFrom(get: (name: string) => string, checked: (name: string) => boolean): BusinessHoursForm {
  const days = {} as Record<DayKey, BusinessDayForm>;
  for (const key of DAY_KEYS) days[key] = { enabled: checked(`day_${key}_enabled`), start: get(`day_${key}_start`), end: get(`day_${key}_end`) };
  return { timezone: get("timezone"), days };
}

export function isAutoAssignStrategy(value: unknown): value is SupportAutoAssignStrategy {
  return typeof value === "string" && (SUPPORT_AUTO_ASSIGN_STRATEGIES as readonly string[]).includes(value);
}

/**
 * Field changes between two settings versions (`{ field: { before, after } }`). The signature is e-mail
 * content and is recorded as `{ changed, lengthBefore, lengthAfter }`; business hours are compared as JSON.
 * An empty object means nothing changed.
 */
export function settingsDiff(before: SupportDeskSettings, after: SupportDeskSettings): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of ["inboundDomain", "fromName", "fromAddress", "autoReplyEnabled", "autoAssignStrategy", "csatEnabled"] as const) {
    if (before[key] !== after[key]) diff[key] = { before: before[key], after: after[key] };
  }
  if (before.signatureText !== after.signatureText) diff.signatureText = { changed: true, lengthBefore: before.signatureText.length, lengthAfter: after.signatureText.length };
  const hoursBefore = normalizeBusinessHours(before.businessHours);
  const hoursAfter = normalizeBusinessHours(after.businessHours);
  if (JSON.stringify(hoursBefore) !== JSON.stringify(hoursAfter)) diff.businessHours = { before: hoursBefore, after: hoursAfter };
  return diff;
}

// ---------------------------------------------------------------------------------------------------
// Auto-acknowledgement mail
// ---------------------------------------------------------------------------------------------------

/**
 * Plain text of the automatic acknowledgement — the very `acknowledgementText` the inbound route sends
 * (`inbound-handler.ts`; greeting, ticket number, how to add details; no sign-off — the mail layout adds the
 * footer and an automatic mail carries no signature). Kept as one source so the settings preview never
 * drifts from the mail. The customer portal's form acknowledgement (`portal.ts`) has its own wording.
 */
export function autoReplyText(input: { requesterName: string | null | undefined; number: number; locale: string | null | undefined }): string {
  return acknowledgementText(input.locale ?? "en", input.number, input.requesterName?.trim() || null);
}

export interface AutoReplyMailInput {
  ticket: TicketMailTicket;
  /** stored settings (environment overrides applied inside) */
  settings: Partial<SupportMailSettings> | null | undefined;
  locale?: string | null;
  /** the customer's message id and thread, for threading */
  inReplyTo?: string | null;
  references?: string[] | null;
}

/**
 * The automatic acknowledgement of a new ticket (`kind: "auto"`: Auto-Submitted / X-Auto-Response-Suppress
 * headers, no signature). The inbound route sends it only when `auto_reply_enabled` is on and
 * `detectAutoReply` cleared the incoming mail (loop prevention); the Message-ID is returned for the row.
 */
export function buildAutoReplyMail(input: AutoReplyMailInput): { mail: Mail; messageId: string } {
  const locale = input.locale ?? input.ticket.locale ?? "en";
  const textBody = autoReplyText({ requesterName: input.ticket.requesterName, number: input.ticket.number, locale });
  return buildTicketMail({
    ticket: input.ticket,
    message: { id: "auto", textBody, kind: "auto", inReplyTo: input.inReplyTo ?? null, references: input.references ?? null },
    locale,
    settings: input.settings,
  });
}

export interface AutoReplyPreview {
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  locale: string;
  /** the sample the preview is built from (shown as such) */
  sample: { number: number; subject: string; requesterName: string };
}

/** Sample ticket used by the settings page preview (marked as an example in the UI). */
export const AUTO_REPLY_SAMPLE = { number: 1000, subject: "Question about the tracking setup", requesterName: "Alex Example", requesterEmail: "alex@example.com" } as const;

/** What the acknowledgement would look like with the given settings, for the settings page. */
export function previewAutoReply(settings: Partial<SupportMailSettings> | null | undefined, locale: string): AutoReplyPreview {
  const { mail } = buildAutoReplyMail({
    ticket: { id: "preview", number: AUTO_REPLY_SAMPLE.number, subject: AUTO_REPLY_SAMPLE.subject, requesterEmail: AUTO_REPLY_SAMPLE.requesterEmail, requesterName: AUTO_REPLY_SAMPLE.requesterName, locale },
    settings,
    locale,
  });
  return {
    from: mail.from ?? "",
    replyTo: mail.replyTo ?? "",
    subject: mail.subject,
    text: mail.text,
    locale,
    sample: { number: AUTO_REPLY_SAMPLE.number, subject: AUTO_REPLY_SAMPLE.subject, requesterName: AUTO_REPLY_SAMPLE.requesterName },
  };
}

// ---------------------------------------------------------------------------------------------------
// Auto-assignment (round robin among agents online) — the helpers live in auto-assign.ts since the
// integration pass wired them into every ticket-creation path; re-exported here for the settings pages
// and their tests.
// ---------------------------------------------------------------------------------------------------

export { ONLINE_WINDOW_MINUTES, chooseRoundRobinAssignee, listAgentsOnline, resolveAutoAssignee, type AgentOnline, type RoundRobinPick } from "@/server/support/auto-assign";

export async function countAgentsOnline(ctx: PlatformContext): Promise<number> {
  return withPlatform(ctx, async (tx) => (await listAgentsOnline(tx)).length);
}

// ---------------------------------------------------------------------------------------------------
// SLA policy summary (overview page; editing is the SLA slice's business)
// ---------------------------------------------------------------------------------------------------

export interface SlaPolicySummary {
  id: string;
  name: string;
  description: string;
  /** null = default for every plan */
  planIds: string[] | null;
  priorities: SlaPriorityTargets;
  isDefault: boolean;
  updatedAt: string;
}

export async function listSlaPolicySummaries(ctx: PlatformContext): Promise<SlaPolicySummary[]> {
  const rows = await withPlatform(ctx, (tx) => tx.select().from(supportSlaPolicies).orderBy(desc(supportSlaPolicies.isDefault), asc(supportSlaPolicies.name)));
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, planIds: r.planIds ?? null, priorities: r.priorities ?? {}, isDefault: r.isDefault, updatedAt: r.updatedAt.toISOString() }));
}

// ---------------------------------------------------------------------------------------------------
// Inbound e-mail ledger (`support_inbound_events`; overview page, docs/18 §4 "Timeline and ledger")
// ---------------------------------------------------------------------------------------------------

/** Ledger rows the overview lists (newest first). */
export const INBOUND_LEDGER_LIMIT = 25;
/** Window of the per-status counts, in days. */
export const INBOUND_LEDGER_WINDOW_DAYS = 7;
/**
 * A `received` row older than this has no outcome because its processing was interrupted; the provider's
 * retry reprocesses it. The handler's own `INBOUND_EVENT_STALE_MS` (`inbound-handler.ts`, already imported
 * for `acknowledgementText`) so the ledger and the retry decision never drift apart.
 */
export const INBOUND_LEDGER_STALE_MS: number = INBOUND_EVENT_STALE_MS;
/** The stored error (≤ 1000 characters) is shortened to this for the table. */
export const INBOUND_LEDGER_ERROR_MAX = 240;

export interface InboundLedgerEntry {
  id: string;
  provider: string;
  providerEventId: string;
  status: SupportInboundEventStatus;
  receivedAt: string;
  processedAt: string | null;
  ticketId: string | null;
  ticketNumber: number | null;
  /** the stored error, shortened (`shortenLedgerError`); null for every outcome but `failed` */
  error: string | null;
  /** `received` without an outcome for longer than `INBOUND_LEDGER_STALE_MS` */
  stale: boolean;
}

export interface InboundLedgerView {
  entries: InboundLedgerEntry[];
  /** rows received within the window, by status — real rows only, zero when none */
  counts: Record<SupportInboundEventStatus, number>;
  /** rows received within the window */
  windowTotal: number;
  windowDays: number;
  limit: number;
  /** the clock the window and the stale flags were computed against */
  generatedAt: string;
}

/** A `received` row that is older than the stale window never got its outcome written. */
export function isStaleInboundEvent(entry: { status: SupportInboundEventStatus; receivedAt: string | Date }, now: Date): boolean {
  if (entry.status !== "received") return false;
  const received = new Date(entry.receivedAt).getTime();
  return Number.isFinite(received) && now.getTime() - received >= INBOUND_LEDGER_STALE_MS;
}

/** One line, whitespace collapsed, cut with an ellipsis; null for an empty error. */
export function shortenLedgerError(error: string | null | undefined, max = INBOUND_LEDGER_ERROR_MAX): string | null {
  const text = error?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
}

export function emptyInboundCounts(): Record<SupportInboundEventStatus, number> {
  return Object.fromEntries(SUPPORT_INBOUND_EVENT_STATUSES.map((status) => [status, 0])) as Record<SupportInboundEventStatus, number>;
}

/**
 * The inbound webhook ledger for the settings overview: the latest rows with their outcome (ticket number,
 * error) and the counts per status over the window. Everything comes from `support_inbound_events` and the
 * clock; nothing is derived from the provider's dashboard.
 */
export async function loadInboundLedger(ctx: PlatformContext, options: { limit?: number; windowDays?: number; now?: Date } = {}): Promise<InboundLedgerView> {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? INBOUND_LEDGER_LIMIT)));
  const windowDays = Math.max(1, Math.min(90, Math.floor(options.windowDays ?? INBOUND_LEDGER_WINDOW_DAYS)));
  return withPlatform(ctx, async (tx) => {
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const [rows, counted] = await Promise.all([
      tx
        .select({
          id: supportInboundEvents.id,
          provider: supportInboundEvents.provider,
          providerEventId: supportInboundEvents.providerEventId,
          status: supportInboundEvents.status,
          receivedAt: supportInboundEvents.receivedAt,
          processedAt: supportInboundEvents.processedAt,
          ticketId: supportInboundEvents.ticketId,
          ticketNumber: supportTickets.number,
          error: supportInboundEvents.error,
        })
        .from(supportInboundEvents)
        .leftJoin(supportTickets, eq(supportTickets.id, supportInboundEvents.ticketId))
        .orderBy(desc(supportInboundEvents.receivedAt), desc(supportInboundEvents.id))
        .limit(limit),
      tx
        .select({ status: supportInboundEvents.status, count: sql<number>`count(*)::int` })
        .from(supportInboundEvents)
        .where(gte(supportInboundEvents.receivedAt, since))
        .groupBy(supportInboundEvents.status),
    ]);
    const counts = emptyInboundCounts();
    for (const row of counted) if (row.status in counts) counts[row.status] = Number(row.count ?? 0);
    return {
      entries: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        providerEventId: r.providerEventId,
        status: r.status,
        receivedAt: r.receivedAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
        ticketId: r.ticketId ?? null,
        ticketNumber: r.ticketNumber == null ? null : Number(r.ticketNumber),
        error: r.status === "failed" ? shortenLedgerError(r.error) : null,
        stale: isStaleInboundEvent({ status: r.status, receivedAt: r.receivedAt }, now),
      })),
      counts,
      windowTotal: Object.values(counts).reduce((sum, n) => sum + n, 0),
      windowDays,
      limit,
      generatedAt: now.toISOString(),
    };
  });
}
