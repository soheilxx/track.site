import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  ALERT_RULE_KINDS,
  CONTACT_REQUEST_STATUSES,
  alertEvents,
  auditLog,
  contactKindEnum,
  contactRequests,
  dataSubjectRequests,
  deletionJobs,
  dsarKindEnum,
  knowledgeFeedback,
  organization,
  pgErrorCode,
  user,
  type AlertRuleKind,
  type ContactRequestStatus,
  type Tx,
} from "@track-site/db";
import { ACTIVE_LOCALES, isLocale, type AppLocale } from "@/i18n/routing";
import { listArticles } from "@/lib/knowledge";
import { articlePath } from "@/lib/knowledge-routes";
import { logger } from "@/server/db";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Track Operations → Inbox (docs/17 §2, task O6): data access and pure helpers for `/ops/inbox`.
 *
 * - Contact, demo and support requests from the public forms (`contact_requests`, global by design): list
 *   with status / kind / assignee / search filters, the detail with the message and its audit trail.
 * - Privacy overview: counts and due dates of data subject requests per organisation — metadata only,
 *   never the pseudonymous subject identifiers or reports (those stay in the tenant's privacy centre).
 * - Cross-tenant alert digest (`alert_events`, last 7 days, grouped by kind and organisation) and the
 *   knowledge feedback digest (`knowledge_feedback`, last 30 days, helpful / not helpful per article).
 *
 * Every loader runs as `tracksite_ops` through `withPlatform(ctx, …)` and returns aggregates and
 * metadata; nothing here reads event payloads or end-user data. Mutations live in `actions/inbox.ts`.
 */

export const INBOX_PAGE_SIZE = 50;
export const ALERT_DIGEST_DAYS = 7;
export const KNOWLEDGE_DIGEST_DAYS = 30;
/** Requests due within this many days count as "due soon" in the privacy overview. */
export const PRIVACY_DUE_SOON_DAYS = 7;

// strict 8-4-4-4-12 form: Postgres rejects other 36-character hyphen layouts, and a bad link must never 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CONTACT_KINDS = contactKindEnum.enumValues;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const DSAR_KINDS = dsarKindEnum.enumValues;
export type DsarKind = (typeof DSAR_KINDS)[number];

/** Allowed status transitions of a contact request (reopening is always possible, spam is a dead end until reopened). */
export const CONTACT_TRANSITIONS: Record<ContactRequestStatus, readonly ContactRequestStatus[]> = {
  new: ["in_progress", "done", "spam"],
  in_progress: ["done", "new", "spam"],
  done: ["in_progress"],
  spam: ["new"],
};

/** Transitions that hide a request from the default view and therefore need an explicit confirmation. */
export const CONFIRMED_TRANSITIONS: readonly ContactRequestStatus[] = ["spam"];

export function canTransition(from: ContactRequestStatus, to: ContactRequestStatus): boolean {
  return CONTACT_TRANSITIONS[from].includes(to);
}

export function isContactStatus(value: unknown): value is ContactRequestStatus {
  return typeof value === "string" && (CONTACT_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function isContactKind(value: unknown): value is ContactKind {
  return typeof value === "string" && (CONTACT_KINDS as readonly string[]).includes(value);
}

/** Statuses of the default view: everything that still needs a person. */
export const OPEN_STATUSES: readonly ContactRequestStatus[] = ["new", "in_progress"];

export type InboxStatusFilter = ContactRequestStatus | "open" | "all";
/** `all`, `unassigned`, `me` or the id of a platform user. */
export type InboxAssigneeFilter = "all" | "unassigned" | "me" | string;

export interface InboxFilters {
  status: InboxStatusFilter;
  kind: ContactKind | "all";
  assignee: InboxAssigneeFilter;
  /** search over name, e-mail and company (trimmed, ≤ 80 characters) */
  q: string | null;
  page: number;
}

export const DEFAULT_INBOX_FILTERS: InboxFilters = { status: "open", kind: "all", assignee: "all", q: null, page: 1 };

/** URL → filters; anything invalid falls back to the default (never an error page for a bad link). */
export function parseInboxFilters(q: Record<string, string | string[] | undefined>): InboxFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(q.status);
  const kind = one(q.kind);
  const assignee = one(q.assignee);
  const search = one(q.q).trim().slice(0, 80);
  const page = Number.parseInt(one(q.page), 10);
  return {
    status: status === "all" || status === "open" || isContactStatus(status) ? status : "open",
    kind: isContactKind(kind) ? kind : "all",
    assignee: assignee === "unassigned" || assignee === "me" || UUID.test(assignee) ? assignee : "all",
    q: search.length ? search : null,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Filters → query string; page links keep every other filter, defaults are omitted. */
export function inboxQueryString(filters: InboxFilters, page: number = filters.page): string {
  const params = new URLSearchParams();
  if (filters.status !== "open") params.set("status", filters.status);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.assignee !== "all") params.set("assignee", filters.assignee);
  if (filters.q) params.set("q", filters.q);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** True when anything but the default view is selected. */
export function inboxFiltered(filters: InboxFilters): boolean {
  return filters.status !== "open" || filters.kind !== "all" || filters.assignee !== "all" || filters.q !== null;
}

/** `ILIKE` pattern for a free-text search: wildcards of the input are escaped, the match is a substring. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** First line of a message, shortened for the list (the full text is on the detail page). */
export function messagePreview(message: string, max = 120): string {
  const line = message.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Short, human-readable reference of a request for e-mails and the trail (the id stays the key). */
export function contactReference(id: string): string {
  return id.replace(/-/g, "").slice(0, 10).toUpperCase();
}

export type ContactDelivery = "delivered" | "failed" | "not_sent";

/** How the original notification to the configured inbox address went. */
export function deliveryState(row: { deliveredAt: Date | string | null; deliveryError: string | null }): ContactDelivery {
  if (row.deliveredAt) return "delivered";
  if (row.deliveryError) return "failed";
  return "not_sent";
}

export type DueTone = "overdue" | "soon" | "later";

/** Tone of a due date relative to `now` (ms): overdue, due within `PRIVACY_DUE_SOON_DAYS`, or later. */
export function dueTone(dueAt: string, now: number, soonDays = PRIVACY_DUE_SOON_DAYS): DueTone {
  const at = new Date(dueAt).getTime();
  if (at < now) return "overdue";
  if (at - now <= soonDays * 86_400_000) return "soon";
  return "later";
}

/** Share of helpful votes in percent (integer) or null without votes — never an invented number. */
export function helpfulShare(helpful: number, total: number): number | null {
  return total > 0 ? Math.round((helpful / total) * 100) : null;
}

/** Link to the organisation in the console (Organisations module); the id is validated by the caller. */
export function organisationHref(organizationId: string): string {
  return `/ops/organisations/${organizationId}`;
}

// ---------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------

export interface PlatformOperator {
  id: string;
  name: string;
  email: string;
  platformRole: string;
}

export interface ContactRequestView {
  id: string;
  reference: string;
  kind: ContactKind;
  name: string;
  email: string;
  company: string | null;
  locale: string;
  status: ContactRequestStatus;
  assignee: { id: string; name: string } | null;
  /** organisation the requester was signed in to when submitting (metadata only) */
  organization: { id: string; name: string; slug: string } | null;
  delivery: ContactDelivery;
  preview: string;
  createdAt: string;
  handledAt: string | null;
}

export interface ContactTrailEntry {
  id: string;
  action: string;
  at: string;
  actorUserId: string | null;
  actorName: string | null;
  /** redacted diff of the action (statuses, ids, transport facts — never message bodies) */
  diff: Record<string, unknown> | null;
}

export interface ContactRequestDetail extends ContactRequestView {
  message: string;
  deliveryError: string | null;
  /** the requester was signed in when submitting */
  userLinked: boolean;
  trail: ContactTrailEntry[];
}

export interface InboxPage {
  entries: ContactRequestView[];
  total: number;
  page: number;
  pageCount: number;
  /** whole inbox, independent of the filters */
  counts: Record<ContactRequestStatus, number>;
}

export interface PrivacyOrganizationRow {
  id: string;
  name: string;
  slug: string;
  open: number;
  overdue: number;
  nextDueAt: string | null;
  completed: number;
  rejected: number;
  total: number;
  lastRequestedAt: string | null;
  failedDeletionJobs: number;
}

export interface PrivacyOverview {
  available: boolean;
  totals: {
    open: number;
    overdue: number;
    dueSoon: number;
    completed30d: number;
    rejected30d: number;
    failedDeletionJobs: number;
    organizations: number;
  };
  byKind: Array<{ kind: DsarKind; open: number }>;
  organizations: PrivacyOrganizationRow[];
}

export interface AlertDigestRow {
  organizationId: string;
  name: string | null;
  slug: string | null;
  kind: AlertRuleKind;
  total: number;
  open: number;
  critical: number;
  warning: number;
  lastTriggeredAt: string | null;
}

export interface AlertDigest {
  available: boolean;
  windowDays: number;
  totals: { events: number; open: number; critical: number; organizations: number };
  byKind: Array<{ kind: AlertRuleKind; total: number; open: number; critical: number }>;
  rows: AlertDigestRow[];
}

export interface KnowledgeDigestRow {
  translationGroupId: string;
  /** English title of the article; null when no English version exists (the id is shown instead) */
  title: string | null;
  /** public article URL in the operator's language, English or any published version */
  href: string | null;
  helpful: number;
  notHelpful: number;
  total: number;
  /** integer percent or null without votes */
  helpfulShare: number | null;
  locales: number;
  lastVoteAt: string | null;
}

export interface KnowledgeDigest {
  available: boolean;
  windowDays: number;
  totals: { votes: number; helpful: number; notHelpful: number; articles: number };
  rows: KnowledgeDigestRow[];
}

// ---------------------------------------------------------------------------------------------------
// Loaders (tracksite_ops)
// ---------------------------------------------------------------------------------------------------

const toIso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const num = (value: unknown): number => Number(value ?? 0);

const isMissingTable = (e: unknown): boolean => pgErrorCode(e) === "42P01";

const PLATFORM_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;

// window literals from module constants (integers, never user input)
const DUE_SOON_INTERVAL = sql.raw(`interval '${PRIVACY_DUE_SOON_DAYS} days'`);
const ALERT_WINDOW = sql.raw(`interval '${ALERT_DIGEST_DAYS} days'`);
const KNOWLEDGE_WINDOW = sql.raw(`interval '${KNOWLEDGE_DIGEST_DAYS} days'`);

function contactWhere(ctx: PlatformContext, filters: InboxFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.status === "open") where.push(inArray(contactRequests.status, [...OPEN_STATUSES]));
  else if (filters.status !== "all") where.push(eq(contactRequests.status, filters.status));
  if (filters.kind !== "all") where.push(eq(contactRequests.kind, filters.kind));
  if (filters.assignee === "unassigned") where.push(isNull(contactRequests.assigneeUserId));
  else if (filters.assignee === "me") where.push(eq(contactRequests.assigneeUserId, ctx.user.id));
  else if (filters.assignee !== "all") where.push(eq(contactRequests.assigneeUserId, filters.assignee));
  if (filters.q) {
    const pattern = likePattern(filters.q);
    const search = or(ilike(contactRequests.name, pattern), ilike(contactRequests.email, pattern), ilike(contactRequests.company, pattern));
    if (search) where.push(search);
  }
  return where;
}

const contactColumns = {
  id: contactRequests.id,
  kind: contactRequests.kind,
  name: contactRequests.name,
  email: contactRequests.email,
  company: contactRequests.company,
  message: contactRequests.message,
  locale: contactRequests.locale,
  status: contactRequests.status,
  organizationId: contactRequests.organizationId,
  userId: contactRequests.userId,
  assigneeUserId: contactRequests.assigneeUserId,
  deliveredAt: contactRequests.deliveredAt,
  deliveryError: contactRequests.deliveryError,
  handledAt: contactRequests.handledAt,
  createdAt: contactRequests.createdAt,
  assigneeName: user.name,
  organizationName: organization.name,
  organizationSlug: organization.slug,
};

/** Base query of the list and the detail: the request, its assignee's name and the linked organisation. */
const contactQuery = (tx: Tx) =>
  tx
    .select(contactColumns)
    .from(contactRequests)
    .leftJoin(user, eq(user.id, contactRequests.assigneeUserId))
    .leftJoin(organization, eq(organization.id, contactRequests.organizationId));

type ContactRow = Awaited<ReturnType<typeof contactQuery>>[number];

function contactView(row: ContactRow): ContactRequestView {
  return {
    id: row.id,
    reference: contactReference(row.id),
    kind: row.kind,
    name: row.name,
    email: row.email,
    company: row.company ?? null,
    locale: row.locale,
    status: row.status,
    assignee: row.assigneeUserId ? { id: row.assigneeUserId, name: row.assigneeName ?? "" } : null,
    organization:
      row.organizationId && row.organizationName && row.organizationSlug
        ? { id: row.organizationId, name: row.organizationName, slug: row.organizationSlug }
        : null,
    delivery: deliveryState({ deliveredAt: row.deliveredAt ?? null, deliveryError: row.deliveryError ?? null }),
    preview: messagePreview(row.message),
    createdAt: row.createdAt.toISOString(),
    handledAt: toIso(row.handledAt),
  };
}

/** One page of contact requests with the whole-inbox counts per status. */
export async function loadInbox(ctx: PlatformContext, filters: InboxFilters): Promise<InboxPage> {
  return withPlatform(ctx, async (tx) => {
    const where = contactWhere(ctx, filters);
    const [countRow] = await tx
      .select({
        new: sql<number>`count(*) FILTER (WHERE ${contactRequests.status} = 'new')::int`,
        in_progress: sql<number>`count(*) FILTER (WHERE ${contactRequests.status} = 'in_progress')::int`,
        done: sql<number>`count(*) FILTER (WHERE ${contactRequests.status} = 'done')::int`,
        spam: sql<number>`count(*) FILTER (WHERE ${contactRequests.status} = 'spam')::int`,
      })
      .from(contactRequests);
    const [filteredRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(contactRequests)
      .where(where.length ? and(...where) : undefined);
    const total = num(filteredRow?.total);
    const pageCount = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = await contactQuery(tx)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(contactRequests.createdAt), desc(contactRequests.id))
      .limit(INBOX_PAGE_SIZE)
      .offset((page - 1) * INBOX_PAGE_SIZE);
    return {
      entries: rows.map(contactView),
      total,
      page,
      pageCount,
      counts: {
        new: num(countRow?.new),
        in_progress: num(countRow?.in_progress),
        done: num(countRow?.done),
        spam: num(countRow?.spam),
      },
    };
  });
}

/** One contact request with its message and audit trail, or null for an unknown id. */
export async function loadContactRequest(ctx: PlatformContext, requestId: string): Promise<ContactRequestDetail | null> {
  if (!UUID.test(requestId)) return null;
  return withPlatform(ctx, async (tx) => {
    const [row] = await contactQuery(tx).where(eq(contactRequests.id, requestId)).limit(1);
    if (!row) return null;
    const trailRows = await tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        diff: auditLog.diff,
        actorUserId: sql<string | null>`${auditLog.actor}->>'userId'`,
      })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, "contact_request"), eq(auditLog.targetId, requestId)))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);
    const actorIds = [...new Set(trailRows.map((t) => t.actorUserId).filter((id): id is string => Boolean(id && UUID.test(id))))];
    const actorRows = actorIds.length ? await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, actorIds)) : [];
    const actorName = new Map(actorRows.map((a) => [a.id, a.name]));
    const view = contactView(row);
    return {
      ...view,
      message: row.message,
      deliveryError: row.deliveryError ?? null,
      userLinked: Boolean(row.userId),
      trail: trailRows.map((t) => ({
        id: t.id,
        action: t.action,
        at: t.createdAt.toISOString(),
        actorUserId: t.actorUserId,
        actorName: t.actorUserId ? (actorName.get(t.actorUserId) ?? null) : null,
        diff: t.diff ?? null,
      })),
    };
  });
}

/** The row of one request as stored (for actions); null for an unknown id. */
export async function getContactRequestRow(tx: Tx, requestId: string) {
  if (!UUID.test(requestId)) return null;
  const [row] = await tx.select().from(contactRequests).where(eq(contactRequests.id, requestId)).limit(1);
  return row ?? null;
}

/** Operators with a platform role (assignee options); the platform users module manages the roles. */
export async function loadPlatformOperators(ctx: PlatformContext, tx?: Tx): Promise<PlatformOperator[]> {
  const query = (t: Tx) =>
    t
      .select({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole })
      .from(user)
      .where(inArray(user.platformRole, [...PLATFORM_ROLES]))
      .orderBy(asc(user.name), asc(user.email));
  return tx ? query(tx) : withPlatform(ctx, query);
}

/** Data subject requests across tenants: counts and due dates per organisation, never subjects or reports. */
export async function loadPrivacyOverview(ctx: PlatformContext): Promise<PrivacyOverview> {
  const empty: PrivacyOverview = {
    available: false,
    totals: { open: 0, overdue: 0, dueSoon: 0, completed30d: 0, rejected30d: 0, failedDeletionJobs: 0, organizations: 0 },
    byKind: [],
    organizations: [],
  };
  return withPlatform(ctx, async (tx) => {
    try {
      return await tx.transaction(async (sp) => {
        const open = sql`${dataSubjectRequests.status} IN ('received', 'in_progress')`;
        const [totals] = await sp
          .select({
            open: sql<number>`count(*) FILTER (WHERE ${open})::int`,
            overdue: sql<number>`count(*) FILTER (WHERE ${open} AND ${dataSubjectRequests.dueAt} < now())::int`,
            dueSoon: sql<number>`count(*) FILTER (WHERE ${open} AND ${dataSubjectRequests.dueAt} >= now() AND ${dataSubjectRequests.dueAt} < now() + ${DUE_SOON_INTERVAL})::int`,
            completed30d: sql<number>`count(*) FILTER (WHERE ${dataSubjectRequests.status} = 'completed' AND ${dataSubjectRequests.completedAt} >= now() - interval '30 days')::int`,
            rejected30d: sql<number>`count(*) FILTER (WHERE ${dataSubjectRequests.status} = 'rejected' AND ${dataSubjectRequests.requestedAt} >= now() - interval '30 days')::int`,
          })
          .from(dataSubjectRequests);
        const kindRows = await sp
          .select({ kind: dataSubjectRequests.kind, open: sql<number>`count(*)::int` })
          .from(dataSubjectRequests)
          .where(open)
          .groupBy(dataSubjectRequests.kind);
        const orgRows = await sp
          .select({
            id: dataSubjectRequests.organizationId,
            name: organization.name,
            slug: organization.slug,
            open: sql<number>`count(*) FILTER (WHERE ${open})::int`,
            overdue: sql<number>`count(*) FILTER (WHERE ${open} AND ${dataSubjectRequests.dueAt} < now())::int`,
            nextDueAt: sql<Date | string | null>`min(${dataSubjectRequests.dueAt}) FILTER (WHERE ${open})`,
            completed: sql<number>`count(*) FILTER (WHERE ${dataSubjectRequests.status} = 'completed')::int`,
            rejected: sql<number>`count(*) FILTER (WHERE ${dataSubjectRequests.status} = 'rejected')::int`,
            total: sql<number>`count(*)::int`,
            lastRequestedAt: sql<Date | string | null>`max(${dataSubjectRequests.requestedAt})`,
          })
          .from(dataSubjectRequests)
          .leftJoin(organization, eq(organization.id, dataSubjectRequests.organizationId))
          .groupBy(dataSubjectRequests.organizationId, organization.name, organization.slug)
          .orderBy(
            desc(sql`count(*) FILTER (WHERE ${open} AND ${dataSubjectRequests.dueAt} < now())`),
            sql`min(${dataSubjectRequests.dueAt}) FILTER (WHERE ${open}) ASC NULLS LAST`,
            asc(organization.name),
          );
        const failedRows = await sp
          .select({ organizationId: deletionJobs.organizationId, failed: sql<number>`count(*)::int` })
          .from(deletionJobs)
          .where(eq(deletionJobs.status, "failed"))
          .groupBy(deletionJobs.organizationId);
        const failed = new Map(failedRows.map((r) => [r.organizationId, num(r.failed)]));
        const byKindMap = new Map(kindRows.map((r) => [r.kind, num(r.open)]));
        return {
          available: true,
          totals: {
            open: num(totals?.open),
            overdue: num(totals?.overdue),
            dueSoon: num(totals?.dueSoon),
            completed30d: num(totals?.completed30d),
            rejected30d: num(totals?.rejected30d),
            failedDeletionJobs: failedRows.reduce((sum, r) => sum + num(r.failed), 0),
            organizations: orgRows.length,
          },
          byKind: DSAR_KINDS.map((kind) => ({ kind, open: byKindMap.get(kind) ?? 0 })),
          organizations: orgRows.map((r) => ({
            id: r.id,
            name: r.name ?? "",
            slug: r.slug ?? "",
            open: num(r.open),
            overdue: num(r.overdue),
            nextDueAt: toIso(r.nextDueAt),
            completed: num(r.completed),
            rejected: num(r.rejected),
            total: num(r.total),
            lastRequestedAt: toIso(r.lastRequestedAt),
            failedDeletionJobs: failed.get(r.id) ?? 0,
          })),
        };
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      logger.warn("privacy tables missing: apply the baseline migrations");
      return empty;
    }
  });
}

/** Alert events of the last seven days grouped by kind and organisation (counts and timestamps only). */
export async function loadAlertDigest(ctx: PlatformContext): Promise<AlertDigest> {
  const empty: AlertDigest = { available: false, windowDays: ALERT_DIGEST_DAYS, totals: { events: 0, open: 0, critical: 0, organizations: 0 }, byKind: [], rows: [] };
  return withPlatform(ctx, async (tx) => {
    try {
      return await tx.transaction(async (sp) => {
        const inWindow = sql`${alertEvents.triggeredAt} >= now() - ${ALERT_WINDOW}`;
        const openCount = sql`count(*) FILTER (WHERE ${alertEvents.resolvedAt} IS NULL)`;
        const rows = await sp
          .select({
            organizationId: alertEvents.organizationId,
            name: organization.name,
            slug: organization.slug,
            kind: alertEvents.kind,
            total: sql<number>`count(*)::int`,
            open: sql<number>`${openCount}::int`,
            critical: sql<number>`count(*) FILTER (WHERE ${alertEvents.severity} = 'critical')::int`,
            warning: sql<number>`count(*) FILTER (WHERE ${alertEvents.severity} = 'warning')::int`,
            lastTriggeredAt: sql<Date | string | null>`max(${alertEvents.triggeredAt})`,
          })
          .from(alertEvents)
          .leftJoin(organization, eq(organization.id, alertEvents.organizationId))
          .where(inWindow)
          .groupBy(alertEvents.organizationId, organization.name, organization.slug, alertEvents.kind)
          .orderBy(desc(openCount), desc(sql`count(*)`), asc(organization.name), asc(alertEvents.kind));
        const byKind = new Map<AlertRuleKind, { total: number; open: number; critical: number }>();
        const organizations = new Set<string>();
        let events = 0;
        let open = 0;
        let critical = 0;
        for (const r of rows) {
          organizations.add(r.organizationId);
          events += num(r.total);
          open += num(r.open);
          critical += num(r.critical);
          const k = byKind.get(r.kind) ?? { total: 0, open: 0, critical: 0 };
          k.total += num(r.total);
          k.open += num(r.open);
          k.critical += num(r.critical);
          byKind.set(r.kind, k);
        }
        return {
          available: true,
          windowDays: ALERT_DIGEST_DAYS,
          totals: { events, open, critical, organizations: organizations.size },
          byKind: ALERT_RULE_KINDS.map((kind) => ({ kind, ...(byKind.get(kind) ?? { total: 0, open: 0, critical: 0 }) })),
          rows: rows.map((r) => ({
            organizationId: r.organizationId,
            name: r.name,
            slug: r.slug,
            kind: r.kind,
            total: num(r.total),
            open: num(r.open),
            critical: num(r.critical),
            warning: num(r.warning),
            lastTriggeredAt: toIso(r.lastTriggeredAt),
          })),
        };
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      logger.warn("alert tables missing: apply migration 0013_alerts");
      return empty;
    }
  });
}

/** Public URL of an article from its published slugs per locale: the operator's language, then English, then any version. */
export function knowledgeArticleHref(slugs: Partial<Record<AppLocale, string>>, locale: string): string | null {
  const preferred: AppLocale[] = isLocale(locale) ? [locale, "en"] : ["en"];
  for (const l of preferred) {
    const slug = slugs[l];
    if (slug) return `/${l}${articlePath(slug)}`;
  }
  for (const l of ACTIVE_LOCALES) {
    const slug = slugs[l];
    if (slug) return `/${l}${articlePath(slug)}`;
  }
  return null;
}

/** Published slug per active locale and the English title per translation group, read once per request (the loader re-reads files in development). */
async function knowledgeIndex(): Promise<{ titles: Map<string, string>; slugs: Map<string, Partial<Record<AppLocale, string>>> }> {
  const titles = new Map<string, string>();
  const slugs = new Map<string, Partial<Record<AppLocale, string>>>();
  for (const article of await listArticles("en", { includeUnpublished: true })) titles.set(article.translationGroupId, article.title);
  for (const locale of ACTIVE_LOCALES) {
    for (const article of await listArticles(locale)) {
      const entry = slugs.get(article.translationGroupId) ?? {};
      entry[locale] = article.slug;
      slugs.set(article.translationGroupId, entry);
    }
  }
  return { titles, slugs };
}

/** "Was this article helpful?" votes of the last 30 days per article, worst share first (anonymous by design). */
export async function loadKnowledgeDigest(ctx: PlatformContext, locale: string): Promise<KnowledgeDigest> {
  const empty: KnowledgeDigest = { available: false, windowDays: KNOWLEDGE_DIGEST_DAYS, totals: { votes: 0, helpful: 0, notHelpful: 0, articles: 0 }, rows: [] };
  const loaded = await withPlatform(ctx, async (tx) => {
    try {
      return await tx.transaction(async (sp) => {
        const inWindow = sql`${knowledgeFeedback.createdAt} >= now() - ${KNOWLEDGE_WINDOW}`;
        // totals over the whole window, independent of the row limit below (never a partial sum shown as the total)
        const [totals] = await sp
          .select({
            helpful: sql<number>`count(*) FILTER (WHERE ${knowledgeFeedback.helpful})::int`,
            notHelpful: sql<number>`count(*) FILTER (WHERE NOT ${knowledgeFeedback.helpful})::int`,
            articles: sql<number>`count(DISTINCT ${knowledgeFeedback.translationGroupId})::int`,
          })
          .from(knowledgeFeedback)
          .where(inWindow);
        const rows = await sp
          .select({
            translationGroupId: knowledgeFeedback.translationGroupId,
            helpful: sql<number>`count(*) FILTER (WHERE ${knowledgeFeedback.helpful})::int`,
            notHelpful: sql<number>`count(*) FILTER (WHERE NOT ${knowledgeFeedback.helpful})::int`,
            total: sql<number>`count(*)::int`,
            locales: sql<number>`count(DISTINCT ${knowledgeFeedback.locale})::int`,
            lastVoteAt: sql<Date | string | null>`max(${knowledgeFeedback.createdAt})`,
          })
          .from(knowledgeFeedback)
          .where(inWindow)
          .groupBy(knowledgeFeedback.translationGroupId)
          .orderBy(desc(sql`count(*) FILTER (WHERE NOT ${knowledgeFeedback.helpful})`), desc(sql`count(*)`), asc(knowledgeFeedback.translationGroupId))
          .limit(200);
        return { rows, totals: { helpful: num(totals?.helpful), notHelpful: num(totals?.notHelpful), articles: num(totals?.articles) } };
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      logger.warn("knowledge_feedback missing: apply migration 0005_knowledge_feedback");
      return null;
    }
  });
  if (!loaded) return empty;
  const { rows, totals } = loaded;
  const index = rows.length ? await knowledgeIndex() : null;
  const digestRows: KnowledgeDigestRow[] = [];
  for (const r of rows) {
    const h = num(r.helpful);
    const n = num(r.notHelpful);
    digestRows.push({
      translationGroupId: r.translationGroupId,
      title: index?.titles.get(r.translationGroupId) ?? null,
      href: knowledgeArticleHref(index?.slugs.get(r.translationGroupId) ?? {}, locale),
      helpful: h,
      notHelpful: n,
      total: num(r.total),
      helpfulShare: helpfulShare(h, num(r.total)),
      locales: num(r.locales),
      lastVoteAt: toIso(r.lastVoteAt),
    });
  }
  return {
    available: true,
    windowDays: KNOWLEDGE_DIGEST_DAYS,
    totals: { votes: totals.helpful + totals.notHelpful, helpful: totals.helpful, notHelpful: totals.notHelpful, articles: totals.articles },
    rows: digestRows,
  };
}
