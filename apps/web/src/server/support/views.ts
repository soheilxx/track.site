import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  supportViews,
  type SupportTicketChannel,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import {
  ASSIGNEE_FILTERS,
  DATE_FIELDS,
  DATE_RANGE_MAX_DAYS,
  DEFAULT_VIEW_KEYS,
  SAVED_VIEWS_MAX,
  SLA_FILTERS,
  TICKET_SEARCH_MAX,
  TICKET_SORTS,
  TICKET_TAG_MAX,
  TICKET_TAG_PATTERN,
  VIEW_NAME_MAX,
  type DateField,
  type DefaultViewKey,
  type SlaFilter,
  type TicketSort,
  type ViewScope,
} from "@/components/ops/support/list/constants";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";
import { parseTeamFilter, teamQueryValue, type TeamFilter } from "./teams";

/**
 * Ticket views of the support desk (docs/18 §"Ticket list"): the filter model of the queue, the seven default
 * views, the URL ↔ filter mapping and the loaders of the saved views (`support_views`, operator-only table).
 *
 * - A **view** is a stored filter set plus a sort. Default views are code (`DEFAULT_VIEWS`, keyed); saved views
 *   are rows — personal (`owner_user_id` = the operator) or shared (`owner_user_id` null, admins only).
 * - The queue URL carries `view=<key|id>` as the base and every other parameter as an override, so an operator
 *   can refine a view without losing it; `status=any` (and friends) override a view's value explicitly, and
 *   `dates=any` lifts the view's whole date range (`from`, `to`, `lastDays`) at once — the filter form's
 *   checkbox, since an empty date input means "as in the view".
 * - Nothing here reads tickets; `tickets.ts` turns the filters into SQL.
 */

export { DEFAULT_VIEW_KEYS, SAVED_VIEWS_MAX, TICKET_SORTS, VIEW_NAME_MAX };
export type { DateField, DefaultViewKey, SlaFilter, TicketSort, ViewScope };

// strict 8-4-4-4-12 form: Postgres rejects other 36-character hyphen layouts, and a bad link must never 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

const PLAN_ID = /^[a-z][a-z0-9_-]{0,39}$/;
const ORG_REF = /^[a-z0-9][a-z0-9 ._-]{0,63}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Statuses that still need a person (the default views build on this set). */
export const OPEN_TICKET_STATUSES: readonly SupportTicketStatus[] = ["new", "open", "pending", "on_hold"];

/** `any`, `unassigned`, `me` or the id of a platform user. */
export type AssigneeFilter = "any" | "unassigned" | "me" | string;

/** The stored part of a view (`support_views.filters`); every field has a neutral default. */
export interface ViewFilters {
  /** empty = any status */
  status: SupportTicketStatus[];
  priority: SupportTicketPriority[];
  channel: SupportTicketChannel[];
  assignee: AssigneeFilter;
  /** organisation id or slug / name fragment */
  organization: string | null;
  /** effective catalogue plan id of the requester's organisation */
  plan: string | null;
  /** every listed tag must be present */
  tags: string[];
  sla: SlaFilter;
  dateField: DateField;
  /** inclusive calendar day (UTC), `YYYY-MM-DD` */
  from: string | null;
  to: string | null;
  /** relative window in days on `dateField` (wins over `from` / `to` when set) */
  lastDays: number | null;
  /** `any` = no filter, `none` = tickets without a team, otherwise a team id or slug (`./teams`) */
  team: TeamFilter;
}

export interface TicketFilters extends ViewFilters {
  /** default view key or saved view id the filters are based on */
  view: string | null;
  /** search over subject, requester, organisation and ticket number (trimmed, ≤ TICKET_SEARCH_MAX) */
  q: string | null;
  sort: TicketSort;
  page: number;
}

export const EMPTY_VIEW_FILTERS: ViewFilters = {
  status: [],
  priority: [],
  channel: [],
  assignee: "any",
  organization: null,
  plan: null,
  tags: [],
  sla: "any",
  dateField: "updated",
  from: null,
  to: null,
  lastDays: null,
  team: "any",
};

export const DEFAULT_TICKET_SORT: TicketSort = "updated_desc";

/** Validates a stored filter set (jsonb of `support_views`, form input of the view editor). */
export const viewFiltersSchema = z.object({
  status: z.array(z.enum(SUPPORT_TICKET_STATUSES)).max(SUPPORT_TICKET_STATUSES.length).default([]),
  priority: z.array(z.enum(SUPPORT_TICKET_PRIORITIES)).max(SUPPORT_TICKET_PRIORITIES.length).default([]),
  channel: z.array(z.enum(SUPPORT_TICKET_CHANNELS)).max(SUPPORT_TICKET_CHANNELS.length).default([]),
  assignee: z.union([z.enum(ASSIGNEE_FILTERS), z.string().regex(UUID)]).default("any"),
  organization: z.string().trim().regex(ORG_REF).nullable().default(null),
  plan: z.string().trim().regex(PLAN_ID).nullable().default(null),
  tags: z.array(z.string().regex(TICKET_TAG_PATTERN)).max(TICKET_TAG_MAX).default([]),
  sla: z.enum(SLA_FILTERS).default("any"),
  dateField: z.enum(DATE_FIELDS).default("updated"),
  from: z.string().regex(ISO_DATE).nullable().default(null),
  to: z.string().regex(ISO_DATE).nullable().default(null),
  lastDays: z.number().int().min(1).max(DATE_RANGE_MAX_DAYS).nullable().default(null),
  // `any` | `none` | team id | team slug; anything else falls back to `any` (never a refused view)
  team: z.string().max(80).default("any").transform((value): TeamFilter => parseTeamFilter(value)),
});

export const viewSortSchema = z.enum(TICKET_SORTS);

export const viewNameSchema = z.string().trim().min(1).max(VIEW_NAME_MAX);

/** Stored filters → typed filters; unknown or invalid fields fall back to the neutral default (never a 500). */
export function viewFiltersFrom(value: unknown): ViewFilters {
  const parsed = viewFiltersSchema.safeParse(value ?? {});
  if (parsed.success) return dedupe(parsed.data);
  // salvage the valid fields one by one so an old row with one bad field keeps the rest
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(viewFiltersSchema.shape) as Array<keyof ViewFilters>) {
    const single = viewFiltersSchema.shape[key].safeParse(raw[key]);
    out[key] = single.success ? single.data : EMPTY_VIEW_FILTERS[key];
  }
  return dedupe(out as unknown as ViewFilters);
}

function dedupe(filters: ViewFilters): ViewFilters {
  const uniq = <T>(list: T[]): T[] => Array.from(new Set(list));
  return { ...filters, status: uniq(filters.status), priority: uniq(filters.priority), channel: uniq(filters.channel), tags: uniq(filters.tags) };
}

// ---------------------------------------------------------------------------------------------------
// Default views
// ---------------------------------------------------------------------------------------------------

export interface DefaultView {
  key: DefaultViewKey;
  filters: ViewFilters;
  sort: TicketSort;
}

/** The seven built-in queues; labels come from `supportTickets.views.defaults.<key>`. */
export const DEFAULT_VIEWS: readonly DefaultView[] = [
  { key: "unassigned", filters: { ...EMPTY_VIEW_FILTERS, status: [...OPEN_TICKET_STATUSES], assignee: "unassigned" }, sort: "updated_desc" },
  { key: "mine", filters: { ...EMPTY_VIEW_FILTERS, status: [...OPEN_TICKET_STATUSES], assignee: "me" }, sort: "updated_desc" },
  { key: "open", filters: { ...EMPTY_VIEW_FILTERS, status: [...OPEN_TICKET_STATUSES] }, sort: "updated_desc" },
  { key: "pending", filters: { ...EMPTY_VIEW_FILTERS, status: ["pending"] }, sort: "updated_desc" },
  { key: "breached", filters: { ...EMPTY_VIEW_FILTERS, status: [...OPEN_TICKET_STATUSES], sla: "breached" }, sort: "sla_due_asc" },
  { key: "solved_7d", filters: { ...EMPTY_VIEW_FILTERS, status: ["solved", "closed"], dateField: "resolved", lastDays: 7 }, sort: "updated_desc" },
  { key: "spam", filters: { ...EMPTY_VIEW_FILTERS, status: ["spam"] }, sort: "updated_desc" },
];

export const DEFAULT_VIEW_KEY: DefaultViewKey = "open";

export function isDefaultViewKey(value: unknown): value is DefaultViewKey {
  return typeof value === "string" && (DEFAULT_VIEW_KEYS as readonly string[]).includes(value);
}

export function defaultView(key: DefaultViewKey): DefaultView {
  return DEFAULT_VIEWS.find((v) => v.key === key) ?? DEFAULT_VIEWS[2]!;
}

// ---------------------------------------------------------------------------------------------------
// URL ↔ filters
// ---------------------------------------------------------------------------------------------------

type Query = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v == null ? [] : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined): string => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

const isStatus = (v: string): v is SupportTicketStatus => (SUPPORT_TICKET_STATUSES as readonly string[]).includes(v);
const isPriority = (v: string): v is SupportTicketPriority => (SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(v);
const isChannel = (v: string): v is SupportTicketChannel => (SUPPORT_TICKET_CHANNELS as readonly string[]).includes(v);
export const isTicketSort = (v: string): v is TicketSort => (TICKET_SORTS as readonly string[]).includes(v);
const isSlaFilter = (v: string): v is SlaFilter => (SLA_FILTERS as readonly string[]).includes(v);
const isDateField = (v: string): v is DateField => (DATE_FIELDS as readonly string[]).includes(v);

/**
 * Multi-value parameter: absent → the base value, the literal `any` → no filter, otherwise the valid values.
 * A parameter with only invalid values counts as absent (a bad link falls back instead of showing nothing).
 */
function multi<T extends string>(raw: string | string[] | undefined, guard: (v: string) => v is T, base: T[]): T[] {
  const values = list(raw);
  if (values.length === 0) return base;
  if (values.includes("any")) return [];
  const valid = values.filter(guard);
  return valid.length ? Array.from(new Set(valid)) : base;
}

/** Nullable single value: absent → base, `any` → null (explicit reset), invalid → base. */
function single<T extends string>(raw: string | string[] | undefined, parse: (v: string) => T | undefined, base: T | null): T | null {
  const value = one(raw);
  if (!value) return base;
  if (value === "any") return null;
  const parsed = parse(value);
  return parsed === undefined ? base : parsed;
}

/** Keyed single value with a "no filter" key: absent → base, `any` → `none`, invalid → base. */
function keyed<T extends string>(raw: string | string[] | undefined, parse: (v: string) => T | undefined, base: T, none: T): T {
  const value = one(raw);
  if (!value) return base;
  if (value === "any") return none;
  const parsed = parse(value);
  return parsed === undefined ? base : parsed;
}

/** Normalised tag list: lower-cased, valid pattern, unique, capped. */
export function normalizeTags(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const tag = raw.trim().toLowerCase();
    if (TICKET_TAG_PATTERN.test(tag) && !out.includes(tag)) out.push(tag);
    if (out.length >= TICKET_TAG_MAX) break;
  }
  return out;
}

/** Calendar day parameter; only real dates pass (`2026-02-30` is refused). */
export function parseIsoDate(value: string): string | undefined {
  if (!ISO_DATE.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? undefined : value;
}

/**
 * URL → filters on top of a base (the selected view's filters and sort). Anything invalid falls back to the
 * base, then to the neutral default — never an error page for a bad link.
 */
export function parseTicketFilters(q: Query, base?: { filters: ViewFilters; sort: TicketSort; view: string | null }): TicketFilters {
  const b = base?.filters ?? EMPTY_VIEW_FILTERS;
  const view = one(q.view);
  const search = one(q.q).slice(0, TICKET_SEARCH_MAX);
  const sort = one(q.sort);
  const page = Number.parseInt(one(q.page), 10);
  const lastDaysRaw = one(q.lastDays);
  const lastDays = Number.parseInt(lastDaysRaw, 10);
  // `dates=any`: the view's date range does not apply; a date parameter of its own in the same URL still wins
  const dates = one(q.dates) === "any" ? { from: null, to: null, lastDays: null } : { from: b.from, to: b.to, lastDays: b.lastDays };
  return {
    view: base?.view ?? (isDefaultViewKey(view) || isUuid(view) ? view : null),
    status: multi(q.status, isStatus, b.status),
    priority: multi(q.priority, isPriority, b.priority),
    channel: multi(q.channel, isChannel, b.channel),
    assignee: keyed<AssigneeFilter>(q.assignee, (v) => (v === "unassigned" || v === "me" || isUuid(v) ? v : undefined), b.assignee, "any"),
    organization: single(q.org, (v) => (ORG_REF.test(v) ? v : undefined), b.organization),
    plan: single(q.plan, (v) => (PLAN_ID.test(v) ? v : undefined), b.plan),
    tags: (() => {
      const values = list(q.tags);
      if (values.length === 0) return b.tags;
      if (values.includes("any")) return [];
      const tags = normalizeTags(values);
      return tags.length ? tags : b.tags;
    })(),
    sla: keyed<SlaFilter>(q.sla, (v) => (isSlaFilter(v) ? v : undefined), b.sla, "any"),
    dateField: keyed<DateField>(q.dateField, (v) => (isDateField(v) ? v : undefined), b.dateField, b.dateField),
    from: single(q.from, parseIsoDate, dates.from),
    to: single(q.to, parseIsoDate, dates.to),
    lastDays: lastDaysRaw === "any" ? null : Number.isFinite(lastDays) && lastDays >= 1 && lastDays <= DATE_RANGE_MAX_DAYS ? lastDays : dates.lastDays,
    // absent → the view's team; `any` lifts it; a slug or id names a team (unknown values count as `any`)
    team: one(q.team) ? parseTeamFilter(q.team) : b.team,
    q: search.length ? search : null,
    sort: isTicketSort(sort) ? sort : (base?.sort ?? DEFAULT_TICKET_SORT),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** The stored part of the queue's current filters (what "save as view" persists). */
export function viewFiltersOf(filters: TicketFilters): ViewFilters {
  const { status, priority, channel, assignee, organization, plan, tags, sla, dateField, from, to, lastDays, team } = filters;
  return { status, priority, channel, assignee, organization, plan, tags, sla, dateField, from, to, lastDays, team };
}

/**
 * Filters → query string. Only differences from the base view are written (`any` marks an explicit reset of a
 * value the view sets), so links stay short and the view stays selected; page links keep every other value.
 */
export function ticketQueryString(filters: TicketFilters, page: number = filters.page, base?: { filters: ViewFilters; sort: TicketSort }): string {
  const b = base?.filters ?? EMPTY_VIEW_FILTERS;
  const params = new URLSearchParams();
  if (filters.view) params.set("view", filters.view);
  const setList = (name: string, value: string[], baseValue: string[]) => {
    if (sameList(value, baseValue)) return;
    if (value.length === 0) params.set(name, "any");
    else params.set(name, value.join(","));
  };
  const setOne = (name: string, value: string | number | null, baseValue: string | number | null) => {
    if (value === baseValue) return;
    params.set(name, value == null ? "any" : String(value));
  };
  setList("status", filters.status, b.status);
  setList("priority", filters.priority, b.priority);
  setList("channel", filters.channel, b.channel);
  setOne("assignee", filters.assignee === "any" ? null : filters.assignee, b.assignee === "any" ? null : b.assignee);
  setOne("org", filters.organization, b.organization);
  setOne("plan", filters.plan, b.plan);
  setList("tags", filters.tags, b.tags);
  setOne("sla", filters.sla === "any" ? null : filters.sla, b.sla === "any" ? null : b.sla);
  if (filters.dateField !== b.dateField) params.set("dateField", filters.dateField);
  setOne("from", filters.from, b.from);
  setOne("to", filters.to, b.to);
  setOne("lastDays", filters.lastDays, b.lastDays);
  setOne("team", teamQueryValue(filters.team), teamQueryValue(b.team));
  if (filters.q) params.set("q", filters.q);
  if (filters.sort !== (base?.sort ?? DEFAULT_TICKET_SORT)) params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v) => b.includes(v));

/** True when the queue shows more than the plain view (any override or a search). */
export function ticketsFiltered(filters: TicketFilters, base?: { filters: ViewFilters; sort: TicketSort }): boolean {
  const b = base?.filters ?? EMPTY_VIEW_FILTERS;
  return (
    Boolean(filters.q) ||
    !sameList(filters.status, b.status) ||
    !sameList(filters.priority, b.priority) ||
    !sameList(filters.channel, b.channel) ||
    filters.assignee !== b.assignee ||
    filters.organization !== b.organization ||
    filters.plan !== b.plan ||
    !sameList(filters.tags, b.tags) ||
    filters.sla !== b.sla ||
    filters.dateField !== b.dateField ||
    filters.from !== b.from ||
    filters.to !== b.to ||
    filters.lastDays !== b.lastDays ||
    filters.team !== b.team
  );
}

/** Link to the queue for a view (default key or saved id). */
export function viewHref(view: string): string {
  return `/ops/support?view=${encodeURIComponent(view)}`;
}

// ---------------------------------------------------------------------------------------------------
// Saved views (operator-only table)
// ---------------------------------------------------------------------------------------------------

export interface SavedView {
  id: string;
  name: string;
  scope: ViewScope;
  /** owner for personal views; null for shared ones */
  ownerUserId: string | null;
  filters: ViewFilters;
  sort: TicketSort;
  position: number;
  createdAt: string;
  updatedAt: string;
}

type ViewRow = typeof supportViews.$inferSelect;

export function savedViewFrom(row: ViewRow): SavedView {
  return {
    id: row.id,
    name: row.name,
    scope: row.ownerUserId ? "personal" : "shared",
    ownerUserId: row.ownerUserId,
    filters: viewFiltersFrom(row.filters),
    sort: isTicketSort(row.sort) ? row.sort : DEFAULT_TICKET_SORT,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Views the operator may use: shared ones and their own personal ones, by position then name. */
export async function loadSavedViews(ctx: PlatformContext, tx?: Tx): Promise<SavedView[]> {
  const query = (t: Tx) =>
    t
      .select()
      .from(supportViews)
      .where(or(isNull(supportViews.ownerUserId), eq(supportViews.ownerUserId, ctx.user.id)))
      .orderBy(asc(supportViews.position), asc(supportViews.name), asc(supportViews.createdAt))
      .limit(SAVED_VIEWS_MAX);
  const rows = tx ? await query(tx) : await withPlatform(ctx, query);
  return rows.map(savedViewFrom);
}

/** One saved view the operator may use (shared or their own); null for other operators' personal views. */
export async function getSavedView(ctx: PlatformContext, id: string, tx?: Tx): Promise<SavedView | null> {
  if (!isUuid(id)) return null;
  const query = async (t: Tx) => {
    const [row] = await t
      .select()
      .from(supportViews)
      .where(and(eq(supportViews.id, id), or(isNull(supportViews.ownerUserId), eq(supportViews.ownerUserId, ctx.user.id))))
      .limit(1);
    return row ?? null;
  };
  const row = tx ? await query(tx) : await withPlatform(ctx, query);
  return row ? savedViewFrom(row) : null;
}

/** Whether the operator may edit or delete a view: own personal views, shared views for admins only. */
export function canManageView(ctx: Pick<PlatformContext, "user" | "platformRole">, view: Pick<SavedView, "scope" | "ownerUserId">): boolean {
  if (view.scope === "shared") return ctx.platformRole === "PLATFORM_ADMIN";
  return view.ownerUserId === ctx.user.id;
}

/**
 * Resolves the base of the queue from the `view` parameter: a default view, a saved view the operator may
 * use, or the default queue ("All open") when the parameter is missing or unknown. `explicit` says whether
 * the URL named a view at all — with filters but without a view the queue starts from the neutral set.
 */
export async function resolveViewBase(
  ctx: PlatformContext,
  q: Query,
): Promise<{ view: string | null; filters: ViewFilters; sort: TicketSort; saved: SavedView | null; missing: boolean }> {
  const raw = one(q.view);
  if (isDefaultViewKey(raw)) {
    const view = defaultView(raw);
    return { view: raw, filters: view.filters, sort: view.sort, saved: null, missing: false };
  }
  if (isUuid(raw)) {
    const saved = await getSavedView(ctx, raw);
    if (saved) return { view: saved.id, filters: saved.filters, sort: saved.sort, saved, missing: false };
    const fallback = defaultView(DEFAULT_VIEW_KEY);
    return { view: DEFAULT_VIEW_KEY, filters: fallback.filters, sort: fallback.sort, saved: null, missing: true };
  }
  const hasOverrides = Object.keys(q).some((k) => k !== "view" && k !== "page");
  if (hasOverrides) return { view: null, filters: EMPTY_VIEW_FILTERS, sort: DEFAULT_TICKET_SORT, saved: null, missing: false };
  const view = defaultView(DEFAULT_VIEW_KEY);
  return { view: DEFAULT_VIEW_KEY, filters: view.filters, sort: view.sort, saved: null, missing: false };
}
