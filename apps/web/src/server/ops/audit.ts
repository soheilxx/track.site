import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, isNull, like, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { RETENTION_DEFAULT_DAYS, auditLog, organization, user, type Tx } from "@track-site/db";
import { auditCategory, flattenDiff, type AuditCategory } from "@/server/team";
import { actorUserIds, csvCell, isUuid, opsActorView, type OpsAuditEntryView } from "./organisations";
import { withPlatform, type PlatformContext } from "./platform";

/**
 * Track Operations → Audit explorer (task O8, docs/17). Platform-wide search over `audit_log`: every
 * actor kind (customers' members, Track AI, system jobs, source keys and platform operators), every
 * organisation and the platform-wide entries without one, with the same redacted diff rendering as the
 * Team module (`flattenDiff` redacts again before anything reaches the client — never raw payloads,
 * end-user personal data or secrets). Reads run as `tracksite_ops` through `withPlatform`; the explorer
 * itself writes nothing, the CSV export is audited by its route (`platform.audit.export`). The pure
 * helpers (filters, query string, category, CSV) are unit-tested.
 */

export const OPS_AUDIT_PAGE_SIZE = 50;
export const OPS_AUDIT_EXPORT_MAX_ROWS = 5000;
/** default retention of `audit_log` rows (worker retention job; organisations may override their own window) */
export const OPS_AUDIT_RETENTION_DAYS = RETENTION_DEFAULT_DAYS.audit_log ?? 730;
/** distinct target types offered in the filter (bounded) */
export const OPS_AUDIT_TARGET_TYPES_MAX = 100;

export const OPS_AUDIT_ACTOR_KINDS = ["platform", "user", "agent", "system", "source_key"] as const;
export type OpsAuditActorKindFilter = (typeof OPS_AUDIT_ACTOR_KINDS)[number];

/**
 * Slice of the log: everything, platform-wide entries only (no organisation — role grants, exports, kill
 * switches, announcements), or the break-glass trail (requests, approvals, revocations, notifications and
 * every tenant-detail page view recorded with a grant id).
 */
export const OPS_AUDIT_SCOPES = ["all", "platform_wide", "break_glass"] as const;
export type OpsAuditScope = (typeof OPS_AUDIT_SCOPES)[number];

export type OpsAuditCategory = AuditCategory | "platform";
export const OPS_AUDIT_CATEGORIES: readonly OpsAuditCategory[] = ["platform", "team", "organization", "sites", "config", "consent", "destinations", "credentials", "privacy", "billing", "ai", "other"];

export interface OpsAuditFilters {
  /** free text on action, target type, target id and request id */
  q: string | null;
  /** a user id (actor or "on behalf of") or one of OPS_AUDIT_ACTOR_KINDS */
  actor: string | null;
  /** "platform actions only": actor kind `platform` */
  platformOnly: boolean;
  /** exact action or prefix (`platform.organization` matches `platform.organization.suspend`) */
  action: string | null;
  /** organisation id or slug (resolved by the loader) */
  organization: string | null;
  targetType: string | null;
  scope: OpsAuditScope;
  from: Date | null;
  to: Date | null;
  page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACTION = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TARGET_TYPE = /^[a-z_]{1,40}$/;

/** URL → filters; anything invalid falls back to the default (never an error page for a bad link). */
export function parseOpsAuditFilters(q: Record<string, string | string[] | undefined>): OpsAuditFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const search = one(q.q).trim().slice(0, 64);
  const actor = one(q.actor).trim();
  const action = one(q.action).trim().toLowerCase().slice(0, 80);
  const organizationInput = one(q.organization).trim().toLowerCase().slice(0, 64);
  const targetType = one(q.target).trim();
  const scope = one(q.scope);
  const from = one(q.from);
  const to = one(q.to);
  const page = Number.parseInt(one(q.page), 10);
  const fromDate = DAY.test(from) ? new Date(`${from}T00:00:00.000Z`) : null;
  const toDate = DAY.test(to) ? new Date(`${to}T23:59:59.999Z`) : null;
  const platform = one(q.platform);
  return {
    q: search.length ? search : null,
    actor: isUuid(actor) || (OPS_AUDIT_ACTOR_KINDS as readonly string[]).includes(actor) ? actor : null,
    platformOnly: platform === "1" || platform === "on" || platform === "true",
    action: ACTION.test(action) ? action : null,
    organization: isUuid(organizationInput) || SLUG.test(organizationInput) ? organizationInput : null,
    targetType: TARGET_TYPE.test(targetType) ? targetType : null,
    scope: (OPS_AUDIT_SCOPES as readonly string[]).includes(scope) ? (scope as OpsAuditScope) : "all",
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : null,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Filters → query string (page links and the CSV export keep every other filter). */
export function opsAuditQueryString(filters: OpsAuditFilters, page: number = filters.page): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.platformOnly) params.set("platform", "1");
  if (filters.action) params.set("action", filters.action);
  if (filters.organization) params.set("organization", filters.organization);
  if (filters.targetType) params.set("target", filters.targetType);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.from) params.set("from", isoDay(filters.from));
  if (filters.to) params.set("to", isoDay(filters.to));
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function isOpsAuditFiltered(filters: OpsAuditFilters): boolean {
  return Boolean(filters.q || filters.actor || filters.platformOnly || filters.action || filters.organization || filters.targetType || filters.scope !== "all" || filters.from || filters.to);
}

/** Team categories plus `platform` for operator and console actions (`platform.*`, `ops.*`). */
export function opsAuditCategory(action: string): OpsAuditCategory {
  if (action.startsWith("platform.") || action.startsWith("ops.")) return "platform";
  return auditCategory(action);
}

// ---------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------

export interface OpsAuditOrganizationRef {
  id: string;
  /** null when the organisation no longer exists (audit rows outlive their organisation) */
  name: string | null;
  slug: string | null;
}

export interface OpsAuditExplorerEntry extends Omit<OpsAuditEntryView, "category"> {
  category: OpsAuditCategory;
  /** null for platform-wide entries */
  organization: OpsAuditOrganizationRef | null;
}

export type OpsAuditOrganizationScope =
  | { kind: "any" }
  | { kind: "organization"; id: string; name: string | null; slug: string | null }
  /** the input matched neither an id nor a slug: the result is empty, and the page says so */
  | { kind: "unknown"; input: string };

export interface OpsAuditOperator {
  id: string;
  name: string;
  platformRole: string;
}

export interface OpsAuditPage {
  entries: OpsAuditExplorerEntry[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  targetTypes: string[];
  /** accounts with a platform role, for the actor filter */
  operators: OpsAuditOperator[];
  /** the filtered actor when it is a user id outside the operator list (a customer's member, a former operator) */
  actorFallback: { id: string; name: string | null } | null;
  organization: OpsAuditOrganizationScope;
  retentionDays: number;
  generatedAt: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function resolveOrganization(tx: Tx, input: string | null): Promise<OpsAuditOrganizationScope> {
  if (!input) return { kind: "any" };
  const rows = await tx
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(isUuid(input) ? eq(organization.id, input) : eq(organization.slug, input))
    .limit(1);
  const row = rows[0];
  if (row) return { kind: "organization", id: row.id, name: row.name, slug: row.slug };
  // an id keeps filtering (entries outlive their organisation); an unknown slug matches nothing
  return isUuid(input) ? { kind: "organization", id: input, name: null, slug: null } : { kind: "unknown", input };
}

/** WHERE of the explorer; exported for the integration test, pure apart from the drizzle builders. */
export function opsAuditWhere(filters: OpsAuditFilters, scope: OpsAuditOrganizationScope): SQL | undefined {
  const where: SQL[] = [];
  if (scope.kind === "organization") where.push(eq(auditLog.organizationId, scope.id));
  if (scope.kind === "unknown") where.push(sql`false`);
  if (filters.scope === "platform_wide") where.push(isNull(auditLog.organizationId));
  if (filters.scope === "break_glass") {
    where.push(or(like(auditLog.action, "ops.break_glass.%"), like(auditLog.action, "platform.break_glass.%"), sql`(${auditLog.metadata} ->> 'breakGlassId') is not null`)!);
  }
  if (filters.from) where.push(gte(auditLog.createdAt, filters.from));
  if (filters.to) where.push(lte(auditLog.createdAt, filters.to));
  if (filters.platformOnly) where.push(sql`(${auditLog.actor} ->> 'kind') = 'platform'`);
  if (filters.actor) {
    where.push(
      isUuid(filters.actor)
        ? sql`((${auditLog.actor} ->> 'userId') = ${filters.actor} or (${auditLog.actor} ->> 'onBehalfOfUserId') = ${filters.actor})`
        : sql`(${auditLog.actor} ->> 'kind') = ${filters.actor}`,
    );
  }
  if (filters.action) where.push(or(eq(auditLog.action, filters.action), like(auditLog.action, `${escapeLike(filters.action)}.%`))!);
  if (filters.targetType) where.push(eq(auditLog.targetType, filters.targetType));
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    where.push(or(ilike(auditLog.action, pattern), ilike(auditLog.targetId, pattern), ilike(auditLog.targetType, pattern), ilike(auditLog.requestId, pattern))!);
  }
  return where.length ? and(...where) : undefined;
}

type AuditRow = typeof auditLog.$inferSelect;

/** Rows → entries: actor names from the user table, organisation names from the organization table, redacted diffs. */
async function hydrate(tx: Tx, rows: AuditRow[]): Promise<OpsAuditExplorerEntry[]> {
  if (!rows.length) return [];
  const names = new Map<string, string>();
  const userIds = actorUserIds(rows.map((r) => r.actor ?? null));
  if (userIds.length) {
    const users = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds));
    for (const u of users) names.set(u.id, u.name);
  }
  const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((id): id is string => Boolean(id)))];
  const orgs = new Map<string, OpsAuditOrganizationRef>();
  if (orgIds.length) {
    const found = await tx.select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(inArray(organization.id, orgIds));
    for (const o of found) orgs.set(o.id, { id: o.id, name: o.name, slug: o.slug });
  }
  return rows.map((r): OpsAuditExplorerEntry => {
    const diff = flattenDiff(r.diff);
    const metadata = flattenDiff(r.metadata);
    return {
      id: r.id,
      action: r.action,
      category: opsAuditCategory(r.action),
      targetType: r.targetType,
      targetId: r.targetId ?? null,
      actor: opsActorView(r.actor ?? null, names),
      diff: diff.rows,
      diffTruncated: diff.truncated,
      metadata: metadata.rows,
      requestId: r.requestId ?? null,
      createdAt: r.createdAt.toISOString(),
      organization: r.organizationId ? (orgs.get(r.organizationId) ?? { id: r.organizationId, name: null, slug: null }) : null,
    };
  });
}

async function listOperators(tx: Tx): Promise<OpsAuditOperator[]> {
  const rows = await tx
    .select({ id: user.id, name: user.name, platformRole: user.platformRole })
    .from(user)
    .where(ne(user.platformRole, "NONE"))
    .orderBy(user.name, user.id);
  return rows.map((r) => ({ id: r.id, name: r.name, platformRole: r.platformRole }));
}

/** One page of the platform audit log; totals are counted, never estimated. */
export async function loadOpsAuditPage(ctx: PlatformContext, filters: OpsAuditFilters, now: Date = new Date()): Promise<OpsAuditPage> {
  return withPlatform(ctx, async (tx) => {
    // sequential on purpose: a transaction runs on one pg client
    const scope = await resolveOrganization(tx, filters.organization);
    const condition = opsAuditWhere(filters, scope);
    const [totalRow] = await tx.select({ n: count() }).from(auditLog).where(condition);
    const total = Number(totalRow?.n ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / OPS_AUDIT_PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = total
      ? await tx
          .select()
          .from(auditLog)
          .where(condition)
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(OPS_AUDIT_PAGE_SIZE)
          .offset((page - 1) * OPS_AUDIT_PAGE_SIZE)
      : [];
    const entries = await hydrate(tx, rows);
    const targetRows = await tx.selectDistinct({ targetType: auditLog.targetType }).from(auditLog).orderBy(auditLog.targetType).limit(OPS_AUDIT_TARGET_TYPES_MAX);
    const operators = await listOperators(tx);
    let actorFallback: OpsAuditPage["actorFallback"] = null;
    if (filters.actor && isUuid(filters.actor) && !operators.some((o) => o.id === filters.actor)) {
      const [u] = await tx.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, filters.actor)).limit(1);
      actorFallback = { id: filters.actor, name: u?.name ?? null };
    }
    return {
      entries,
      total,
      page,
      pageCount,
      pageSize: OPS_AUDIT_PAGE_SIZE,
      targetTypes: targetRows.map((t) => t.targetType),
      operators,
      actorFallback,
      organization: scope,
      retentionDays: OPS_AUDIT_RETENTION_DAYS,
      generatedAt: now.toISOString(),
    };
  });
}

/** Rows of the CSV export (same filters, newest first, at most OPS_AUDIT_EXPORT_MAX_ROWS); the route audits the export. */
export async function loadOpsAuditExport(ctx: PlatformContext, filters: OpsAuditFilters): Promise<{ entries: OpsAuditExplorerEntry[]; total: number; truncated: boolean; organization: OpsAuditOrganizationScope }> {
  return withPlatform(ctx, async (tx) => {
    const scope = await resolveOrganization(tx, filters.organization);
    const condition = opsAuditWhere(filters, scope);
    const [totalRow] = await tx.select({ n: count() }).from(auditLog).where(condition);
    const total = Number(totalRow?.n ?? 0);
    const rows = total ? await tx.select().from(auditLog).where(condition).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(OPS_AUDIT_EXPORT_MAX_ROWS) : [];
    const entries = await hydrate(tx, rows);
    return { entries, total, truncated: total > entries.length, organization: scope };
  });
}

// ---------------------------------------------------------------------------------------------------
// CSV export (redacted key lists, metadata only)
// ---------------------------------------------------------------------------------------------------

export const OPS_AUDIT_CSV_COLUMNS = [
  "id",
  "created_at",
  "organization_id",
  "organization_slug",
  "actor_kind",
  "actor_user_id",
  "actor_name",
  "actor_role",
  "actor_detail",
  "action",
  "category",
  "target_type",
  "target_id",
  "request_id",
  "diff",
  "diff_truncated",
  "metadata",
] as const;

/** `path=value` pairs of a flattened (redacted, truncated) diff in one cell. */
export function diffCell(rows: ReadonlyArray<{ path: string; value: string }>): string {
  return rows.map((r) => `${r.path}=${r.value.replace(/[\r\n]+/g, " ")}`).join("; ");
}

export function opsAuditCsv(entries: readonly OpsAuditExplorerEntry[]): string {
  const lines = [OPS_AUDIT_CSV_COLUMNS.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.id,
        e.createdAt,
        e.organization?.id ?? null,
        e.organization?.slug ?? null,
        e.actor.kind,
        e.actor.userId,
        e.actor.name,
        e.actor.role,
        e.actor.detail,
        e.action,
        e.category,
        e.targetType,
        e.targetId,
        e.requestId,
        diffCell(e.diff),
        e.diffTruncated ? "true" : "false",
        diffCell(e.metadata),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Filter values as stored in the export's audit entry (no free text beyond what the operator typed). */
export function opsAuditFilterSummary(filters: OpsAuditFilters): Record<string, string | boolean | null> {
  return {
    q: filters.q,
    actor: filters.actor,
    platformOnly: filters.platformOnly,
    action: filters.action,
    organization: filters.organization,
    targetType: filters.targetType,
    scope: filters.scope,
    from: filters.from ? filters.from.toISOString() : null,
    to: filters.to ? filters.to.toISOString() : null,
  };
}
