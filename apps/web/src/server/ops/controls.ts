import "server-only";
import { asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { PLAN_IDS } from "@track-site/catalog";
import { featureFlagOverrides, featureFlags, organization, platformAnnouncements, sites, subscriptions, type AnnouncementAudience, type AnnouncementSeverity, type AnnouncementTexts } from "@track-site/db";
import { env } from "@/env";
import { ALL_LOCALES } from "@/i18n/routing";
import { FEATURE_FLAGS, isFeatureFlagKey } from "@/server/flags";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Controls module of Track Operations (docs/17): global kill switch, tenant suspensions, feature flags
 * and platform announcements. Reads run as `tracksite_ops` through `withPlatform` and return metadata
 * only (organization names, slugs, counts, timestamps) — never event data or personal data of end
 * users. Every mutation lives in `actions/controls.ts`.
 */

// ---------------------------------------------------------------------------------------------------
// Constants and pure rules (unit-tested)
// ---------------------------------------------------------------------------------------------------

/** Reserved feature-flag key that stores the platform kill switch (read by the collector every 5 s). */
export const KILL_SWITCH_FLAG_KEY = "platform.kill_switch";
/** `platform.*` keys are system switches: hidden from the flag list, never created or overridden by hand. */
export const RESERVED_FLAG_PREFIX = "platform.";
/** The words an admin must type to engage / release the global kill switch (not localized on purpose). */
export const KILL_SWITCH_ENGAGE_WORD = "STOP";
export const KILL_SWITCH_RELEASE_WORD = "RESUME";
/** Same CHECK as migration 0014 (`feature_flags_key_chk`). */
export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;
export const CONTROLS_PATHS = ["/ops/controls", "/ops/controls/flags", "/ops/controls/announcements"] as const;
export const REASON_MAX = 500;

export function isReservedFlagKey(key: string): boolean {
  return key.startsWith(RESERVED_FLAG_PREFIX);
}

export function isValidFlagKey(key: string): boolean {
  return FLAG_KEY_PATTERN.test(key);
}

/** The typed confirmation an admin must give for the kill switch direction. */
export function killSwitchWord(engage: boolean): string {
  return engage ? KILL_SWITCH_ENGAGE_WORD : KILL_SWITCH_RELEASE_WORD;
}

export type AnnouncementStatus = "scheduled" | "active" | "ended" | "revoked";

/** Display state of an announcement at `now`: revoked wins, then the window. */
export function announcementStatus(row: { startsAt: Date | string; endsAt: Date | string | null; revokedAt: Date | string | null }, now: Date = new Date()): AnnouncementStatus {
  if (row.revokedAt) return "revoked";
  const starts = new Date(row.startsAt).getTime();
  const ends = row.endsAt ? new Date(row.endsAt).getTime() : null;
  const t = now.getTime();
  if (starts > t) return "scheduled";
  if (ends !== null && ends <= t) return "ended";
  return "active";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Organization ids from a textarea (one per line, commas or spaces); duplicates dropped, invalid ones reported. */
export function parseOrganizationIdList(input: string): { ids: string[]; invalid: string[] } {
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (!isUuid(value)) {
      if (!invalid.includes(value)) invalid.push(value);
      continue;
    }
    if (!ids.includes(value)) ids.push(value);
  }
  return { ids, invalid };
}

/** Plan ids from checkbox values; unknown ids are dropped, order follows the catalogue. */
export function parsePlanList(values: readonly string[]): string[] {
  return PLAN_IDS.filter((id) => values.includes(id));
}

/**
 * Announcement texts from the six-locale form (`title_<locale>` / `body_<locale>`). English is mandatory;
 * a locale is stored only when its title is present (the reader falls back to English otherwise).
 */
export function buildAnnouncementTexts(get: (name: string) => string | null | undefined): { texts: AnnouncementTexts; errors: Record<string, string> } {
  const texts: AnnouncementTexts = {};
  const errors: Record<string, string> = {};
  for (const locale of ALL_LOCALES) {
    const title = (get(`title_${locale}`) ?? "").trim();
    const body = (get(`body_${locale}`) ?? "").trim();
    if (title.length > 160) errors[`title_${locale}`] = "long";
    if (body.length > 1000) errors[`body_${locale}`] = "long";
    if (!title && body) errors[`title_${locale}`] = "required";
    if (title) texts[locale] = { title, body };
  }
  if (!texts.en?.title) errors.title_en = "required";
  return { texts, errors };
}

/** Audience object for storage: `{}` when both lists are empty (everyone). */
export function buildAudience(plans: string[], organizationIds: string[]): AnnouncementAudience {
  const audience: AnnouncementAudience = {};
  if (plans.length) audience.plans = plans;
  if (organizationIds.length) audience.organizationIds = organizationIds;
  return audience;
}

/** `datetime-local` value ("2026-09-08T14:30") read as UTC; null when blank, undefined when unparsable. */
export function parseUtcDateTime(value: string | null | undefined): Date | null | undefined {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return undefined;
  const date = new Date(`${v}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ---------------------------------------------------------------------------------------------------
// Global kill switch
// ---------------------------------------------------------------------------------------------------

export interface GlobalKillSwitchView {
  /** the platform switch in the database (`feature_flags.platform.kill_switch`) */
  engaged: boolean;
  updatedAt: string | null;
  /** `KILL_SWITCH_GLOBAL` as seen by this web process — informative only, the collector's own value is what counts */
  envKillSwitch: boolean;
}

export async function loadGlobalKillSwitch(ctx: PlatformContext): Promise<GlobalKillSwitchView> {
  const [row] = await withPlatform(ctx, (tx) => tx.select({ defaultEnabled: featureFlags.defaultEnabled, updatedAt: featureFlags.updatedAt }).from(featureFlags).where(eq(featureFlags.key, KILL_SWITCH_FLAG_KEY)).limit(1));
  return { engaged: row?.defaultEnabled === true, updatedAt: row ? row.updatedAt.toISOString() : null, envKillSwitch: env().KILL_SWITCH_GLOBAL };
}

export interface CollectorProbe {
  url: string;
  checkedAt: string;
  reachable: boolean;
  status: number | null;
  ok: boolean | null;
  killSwitch: boolean | null;
  source: "env" | "platform" | null;
  error: string | null;
}

/** Live state of the collector's `/health` (3 s timeout, never cached); unreachable is reported as such, not guessed. */
export async function probeCollector(): Promise<CollectorProbe> {
  const url = `${env().HOST_INGEST}/health`;
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3_000), headers: { accept: "application/json" } });
    type HealthBody = { ok?: unknown; killSwitch?: unknown; killSwitchSource?: unknown };
    let body: HealthBody | null = null;
    try {
      const json: unknown = await res.json();
      body = json && typeof json === "object" ? (json as HealthBody) : null;
    } catch {
      body = null;
    }
    const source = body?.killSwitchSource === "env" || body?.killSwitchSource === "platform" ? body.killSwitchSource : null;
    return {
      url,
      checkedAt,
      reachable: true,
      status: res.status,
      ok: typeof body?.ok === "boolean" ? body.ok : null,
      killSwitch: typeof body?.killSwitch === "boolean" ? body.killSwitch : null,
      source,
      error: body ? null : "invalid_response",
    };
  } catch (e) {
    return { url, checkedAt, reachable: false, status: null, ok: null, killSwitch: null, source: null, error: e instanceof Error ? e.name : "unreachable" };
  }
}

// ---------------------------------------------------------------------------------------------------
// Tenant suspensions
// ---------------------------------------------------------------------------------------------------

export interface OrganizationLookup {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  planId: string | null;
  siteCount: number;
}

const siteCountSql = sql<number>`(SELECT count(*)::int FROM ${sites} s WHERE s.organization_id = ${organization.id} AND s.deleted_at IS NULL)`;

function organizationColumns() {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt,
    suspendedAt: organization.suspendedAt,
    suspendedReason: organization.suspendedReason,
    planId: subscriptions.planId,
    siteCount: siteCountSql,
  };
}

type OrganizationRow = { id: string; name: string; slug: string; createdAt: Date; suspendedAt: Date | null; suspendedReason: string | null; planId: string | null; siteCount: number };

const toLookup = (r: OrganizationRow): OrganizationLookup => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  createdAt: r.createdAt.toISOString(),
  suspendedAt: r.suspendedAt ? r.suspendedAt.toISOString() : null,
  suspendedReason: r.suspendedReason,
  planId: r.planId,
  siteCount: Number(r.siteCount ?? 0),
});

/** Every suspended organization, newest suspension first. */
export async function listSuspendedOrganizations(ctx: PlatformContext): Promise<OrganizationLookup[]> {
  const rows = await withPlatform(ctx, (tx) =>
    tx
      .select(organizationColumns())
      .from(organization)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id))
      .where(isNotNull(organization.suspendedAt))
      .orderBy(desc(organization.suspendedAt)),
  );
  return rows.map(toLookup);
}

/** One organization by id or slug (exact, case-insensitive); the console never searches free text here. */
export async function lookupOrganization(ctx: PlatformContext, ref: string): Promise<OrganizationLookup | null> {
  const value = ref.trim().toLowerCase();
  if (!value) return null;
  const where = isUuid(value) ? eq(organization.id, value) : eq(sql`lower(${organization.slug})`, value);
  const [row] = await withPlatform(ctx, (tx) => tx.select(organizationColumns()).from(organization).leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id)).where(where).limit(1));
  return row ? toLookup(row) : null;
}

/** Number of active (not suspended) organizations — context for the suspension list. */
export async function countActiveOrganizations(ctx: PlatformContext): Promise<number> {
  const [row] = await withPlatform(ctx, (tx) => tx.select({ n: count() }).from(organization).where(isNull(organization.suspendedAt)));
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------------------------------

export interface FeatureFlagListItem {
  key: string;
  description: string;
  /** the stored default; the code default while `registered` is false */
  defaultEnabled: boolean;
  /** a `feature_flags` row exists */
  registered: boolean;
  /** the app reads this key (`FEATURE_FLAGS` in server/flags.ts) */
  inCode: boolean;
  codeDefault: boolean | null;
  overrideCount: number;
  updatedAt: string | null;
}

/** Stored flags plus the code-registered keys that have no row yet; reserved `platform.*` keys are excluded. */
export async function listFeatureFlags(ctx: PlatformContext): Promise<FeatureFlagListItem[]> {
  const { rows, counts } = await withPlatform(ctx, async (tx) => ({
    rows: await tx.select({ key: featureFlags.key, description: featureFlags.description, defaultEnabled: featureFlags.defaultEnabled, updatedAt: featureFlags.updatedAt }).from(featureFlags).orderBy(asc(featureFlags.key)),
    counts: await tx.select({ key: featureFlagOverrides.key, n: count() }).from(featureFlagOverrides).groupBy(featureFlagOverrides.key),
  }));
  const overrideCount = new Map(counts.map((c) => [c.key, Number(c.n)]));
  const items: FeatureFlagListItem[] = rows
    .filter((r) => !isReservedFlagKey(r.key))
    .map((r) => ({
      key: r.key,
      description: r.description,
      defaultEnabled: r.defaultEnabled,
      registered: true,
      inCode: isFeatureFlagKey(r.key),
      codeDefault: isFeatureFlagKey(r.key) ? FEATURE_FLAGS[r.key].defaultEnabled : null,
      overrideCount: overrideCount.get(r.key) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    }));
  const stored = new Set(items.map((i) => i.key));
  for (const [key, def] of Object.entries(FEATURE_FLAGS)) {
    if (stored.has(key)) continue;
    items.push({ key, description: def.description, defaultEnabled: def.defaultEnabled, registered: false, inCode: true, codeDefault: def.defaultEnabled, overrideCount: 0, updatedAt: null });
  }
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

export interface FeatureFlagOverrideView {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: string;
}

export interface FeatureFlagDetail extends FeatureFlagListItem {
  overrides: FeatureFlagOverrideView[];
}

/** One flag with its overrides; null for reserved keys and for keys neither stored nor known to the code. */
export async function getFeatureFlag(ctx: PlatformContext, key: string): Promise<FeatureFlagDetail | null> {
  if (!isValidFlagKey(key) || isReservedFlagKey(key)) return null;
  const { row, overrides } = await withPlatform(ctx, async (tx) => ({
    row: (await tx.select({ key: featureFlags.key, description: featureFlags.description, defaultEnabled: featureFlags.defaultEnabled, updatedAt: featureFlags.updatedAt }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1))[0] ?? null,
    overrides: await tx
      .select({ id: featureFlagOverrides.id, organizationId: featureFlagOverrides.organizationId, organizationName: organization.name, organizationSlug: organization.slug, enabled: featureFlagOverrides.enabled, reason: featureFlagOverrides.reason, updatedAt: featureFlagOverrides.updatedAt })
      .from(featureFlagOverrides)
      .innerJoin(organization, eq(organization.id, featureFlagOverrides.organizationId))
      .where(eq(featureFlagOverrides.key, key))
      .orderBy(asc(organization.name)),
  }));
  const inCode = isFeatureFlagKey(key);
  if (!row && !inCode) return null;
  const codeDefault = inCode ? FEATURE_FLAGS[key].defaultEnabled : null;
  return {
    key,
    description: row ? row.description : inCode ? FEATURE_FLAGS[key].description : "",
    defaultEnabled: row ? row.defaultEnabled : (codeDefault ?? false),
    registered: row !== null,
    inCode,
    codeDefault,
    overrideCount: overrides.length,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    overrides: overrides.map((o) => ({ ...o, updatedAt: o.updatedAt.toISOString() })),
  };
}

// ---------------------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------------------

export interface AnnouncementListItem {
  id: string;
  severity: AnnouncementSeverity;
  /** English title (or the first available) for the list */
  title: string;
  /** locales with a title */
  locales: string[];
  audience: AnnouncementAudience;
  linkUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: AnnouncementStatus;
}

export async function listAnnouncements(ctx: PlatformContext, limit = 100): Promise<AnnouncementListItem[]> {
  const rows = await withPlatform(ctx, (tx) =>
    tx
      .select({ id: platformAnnouncements.id, severity: platformAnnouncements.severity, texts: platformAnnouncements.texts, audience: platformAnnouncements.audience, linkUrl: platformAnnouncements.linkUrl, startsAt: platformAnnouncements.startsAt, endsAt: platformAnnouncements.endsAt, revokedAt: platformAnnouncements.revokedAt, createdAt: platformAnnouncements.createdAt })
      .from(platformAnnouncements)
      .orderBy(desc(platformAnnouncements.startsAt))
      .limit(limit),
  );
  const now = new Date();
  return rows.map((r) => {
    const texts = r.texts && typeof r.texts === "object" ? r.texts : {};
    const locales = ALL_LOCALES.filter((l) => typeof texts[l]?.title === "string" && texts[l]!.title.trim().length > 0);
    const title = texts.en?.title?.trim() || (locales[0] ? texts[locales[0]]!.title.trim() : "");
    return {
      id: r.id,
      severity: r.severity,
      title,
      locales,
      audience: r.audience && typeof r.audience === "object" ? r.audience : {},
      linkUrl: r.linkUrl,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      status: announcementStatus(r, now),
    };
  });
}

/** Names of the organizations an announcement targets (for the list), keyed by id; unknown ids are absent. */
export async function organizationNames(ctx: PlatformContext, ids: string[]): Promise<Map<string, { name: string; slug: string }>> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return new Map();
  const rows = await withPlatform(ctx, (tx) => tx.select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(inArray(organization.id, valid)));
  return new Map(rows.map((r) => [r.id, { name: r.name, slug: r.slug }]));
}

/** Which of the given organization ids exist (audience validation). */
export async function existingOrganizationIds(ctx: PlatformContext, ids: string[]): Promise<Set<string>> {
  const names = await organizationNames(ctx, ids);
  return new Set(names.keys());
}
