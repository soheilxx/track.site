"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ANNOUNCEMENT_SEVERITIES, featureFlagOverrides, featureFlags, organization, platformAnnouncements } from "@track-site/db";
import { invalidateFeatureFlagCache } from "@/server/flags";
import {
  CONTROLS_PATHS,
  KILL_SWITCH_FLAG_KEY,
  REASON_MAX,
  buildAnnouncementTexts,
  buildAudience,
  existingOrganizationIds,
  isReservedFlagKey,
  isValidFlagKey,
  killSwitchWord,
  lookupOrganization,
  parseOrganizationIdList,
  parsePlanList,
  parseUtcDateTime,
  type OrganizationLookup,
} from "@/server/ops/controls";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Controls actions (docs/17 §1 binding rules): every action requires PLATFORM_ADMIN (+ two-factor
 * step-up through `requirePlatform`), validates its input with zod, runs as `tracksite_ops`, writes an
 * `auditPlatform` entry inside the same transaction (organization id of the affected tenant when there
 * is one) and revalidates the module. Risky actions are confirmed in the UI and re-checked here: the
 * `confirmed: true` literal, and for the global kill switch the typed word (STOP / RESUME).
 */
export type ControlsError = "forbidden" | "invalid" | "not_found" | "unchanged" | "confirmation" | "reserved" | "exists" | "generic";

export type ControlsNotice =
  | "killSwitchEngaged"
  | "killSwitchReleased"
  | "suspended"
  | "unsuspended"
  | "flagCreated"
  | "flagRegistered"
  | "flagUpdated"
  | "flagDefaultChanged"
  | "overrideSaved"
  | "overrideRemoved"
  | "announcementCreated"
  | "announcementRevoked";

export interface ControlsActionState {
  ok: boolean;
  error: ControlsError | null;
  notice?: ControlsNotice | null;
  fieldErrors?: Record<string, string>;
  /** id or key of the affected row */
  id?: string;
}

const fail = (error: ControlsError, fieldErrors?: Record<string, string>): ControlsActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });
const done = (notice: ControlsNotice, id?: string): ControlsActionState => ({ ok: true, error: null, notice, ...(id ? { id } : {}) });

async function admin(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_ADMIN");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

function revalidateControls(extra: string[] = []): void {
  for (const path of [...CONTROLS_PATHS, ...extra]) revalidatePath(path);
}

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const reason = z.string().trim().min(3).max(REASON_MAX);
const flagKey = z.string().trim().refine(isValidFlagKey, "invalid key");

// ---------------------------------------------------------------------------------------------------
// Global kill switch
// ---------------------------------------------------------------------------------------------------

/**
 * Engages or releases the platform kill switch (`feature_flags.platform.kill_switch`, read by the collector
 * every 5 s: ingestion, config manifests and inbound webhooks answer 503 / paused while engaged). The
 * typed word is checked here again — STOP to engage, RESUME to release — and the reason is audited.
 */
export async function setGlobalKillSwitchAction(input: { engage: boolean; confirmation: string; reason: string }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ engage: z.boolean(), confirmation: z.string().max(32), reason }).safeParse(input);
  if (!parsed.success) return fail("invalid", { reason: "invalid" });
  const { engage, confirmation } = parsed.data;
  if (confirmation.trim() !== killSwitchWord(engage)) return fail("confirmation", { confirmation: "confirmation" });
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [current] = await tx.select({ defaultEnabled: featureFlags.defaultEnabled }).from(featureFlags).where(eq(featureFlags.key, KILL_SWITCH_FLAG_KEY)).limit(1);
    const before = current?.defaultEnabled === true;
    if (before === engage) return fail("unchanged");
    await tx
      .insert(featureFlags)
      .values({ key: KILL_SWITCH_FLAG_KEY, description: "Platform kill switch: the collector pauses ingestion, config delivery and inbound webhooks while enabled (Track Operations → Controls).", defaultEnabled: engage, createdBy: ctx.user.id })
      .onConflictDoUpdate({ target: featureFlags.key, set: { defaultEnabled: engage, updatedAt: sql`now()` } });
    await auditPlatform(ctx, { action: engage ? "platform.kill_switch.engage" : "platform.kill_switch.release", targetType: "platform_kill_switch", targetId: KILL_SWITCH_FLAG_KEY, diff: { before, after: engage, reason: parsed.data.reason }, metadata: { confirmation: killSwitchWord(engage) } }, tx);
    return done(engage ? "killSwitchEngaged" : "killSwitchReleased");
  });
  if (result.ok) revalidateControls(["/ops/health", "/ops"]);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Tenant suspensions
// ---------------------------------------------------------------------------------------------------

export interface OrganizationLookupResult {
  ok: boolean;
  error: ControlsError | null;
  organization: OrganizationLookup | null;
}

/** Resolves an organization by id or slug for the suspension dialog (metadata only; nothing is changed or audited). */
export async function lookupOrganizationAction(input: { ref: string }): Promise<OrganizationLookupResult> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "forbidden", organization: null };
  const parsed = z.object({ ref: z.string().trim().min(1).max(120) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", organization: null };
  const org = await lookupOrganization(ctx, parsed.data.ref);
  return org ? { ok: true, error: null, organization: org } : { ok: false, error: "not_found", organization: null };
}

/**
 * Tenant kill switch: `organization.suspended_at` + reason. The collector treats a suspended organization
 * like a customer kill switch (ingestion and config manifests pause for every site within the site cache
 * TTL); the dashboard and API answer 403 for its members (requireOrgContext → assertOrganizationActive)
 * until the suspension is lifted. Confirmed in the UI; reason mandatory.
 */
export async function suspendOrganizationAction(input: { organizationId: string; reason: string; confirmed: true }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ organizationId: uuid, reason, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid", { reason: "invalid" });
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [org] = await tx.select({ id: organization.id, name: organization.name, slug: organization.slug, suspendedAt: organization.suspendedAt }).from(organization).where(eq(organization.id, parsed.data.organizationId)).limit(1);
    if (!org) return fail("not_found");
    if (org.suspendedAt) return fail("unchanged");
    await tx.update(organization).set({ suspendedAt: sql`now()`, suspendedReason: parsed.data.reason }).where(eq(organization.id, org.id));
    await auditPlatform(ctx, { action: "platform.organization.suspend", organizationId: org.id, targetType: "organization", targetId: org.id, diff: { slug: org.slug, name: org.name, reason: parsed.data.reason } }, tx);
    return done("suspended", org.id);
  });
  if (result.ok) revalidateControls(["/ops/organisations"]);
  return result;
}

export async function unsuspendOrganizationAction(input: { organizationId: string; confirmed: true }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ organizationId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [org] = await tx.select({ id: organization.id, name: organization.name, slug: organization.slug, suspendedAt: organization.suspendedAt, suspendedReason: organization.suspendedReason }).from(organization).where(eq(organization.id, parsed.data.organizationId)).limit(1);
    if (!org) return fail("not_found");
    if (!org.suspendedAt) return fail("unchanged");
    await tx.update(organization).set({ suspendedAt: null, suspendedReason: null }).where(eq(organization.id, org.id));
    await auditPlatform(ctx, { action: "platform.organization.unsuspend", organizationId: org.id, targetType: "organization", targetId: org.id, diff: { slug: org.slug, name: org.name, suspendedAt: org.suspendedAt.toISOString(), previousReason: org.suspendedReason } }, tx);
    return done("unsuspended", org.id);
  });
  if (result.ok) revalidateControls(["/ops/organisations"]);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------------------------------

const flagPaths = (key: string) => [`/ops/controls/flags/${encodeURIComponent(key)}`];

/** Creates a flag with its global default; `platform.*` keys are reserved for system switches. */
export async function createFeatureFlagAction(_prev: ControlsActionState, formData: FormData): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ key: flagKey, description: z.string().trim().max(500), defaultEnabled: z.boolean() }).safeParse({ key: str(formData, "key"), description: str(formData, "description"), defaultEnabled: str(formData, "defaultEnabled") === "on" });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = "invalid";
    return fail("invalid", fieldErrors);
  }
  const { key, description, defaultEnabled } = parsed.data;
  if (isReservedFlagKey(key)) return fail("reserved", { key: "reserved" });
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [existing] = await tx.select({ key: featureFlags.key }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    if (existing) return fail("exists", { key: "exists" });
    await tx.insert(featureFlags).values({ key, description, defaultEnabled, createdBy: ctx.user.id });
    await auditPlatform(ctx, { action: "platform.feature_flag.create", targetType: "feature_flag", targetId: key, diff: { description, defaultEnabled } }, tx);
    return done("flagCreated", key);
  });
  if (result.ok) {
    invalidateFeatureFlagCache();
    revalidateControls(flagPaths(key));
  }
  return result;
}

/** Stores the row of a code-registered flag (description and default from `FEATURE_FLAGS`) so overrides can reference it. */
export async function registerFeatureFlagAction(input: { key: string; description: string; defaultEnabled: boolean }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ key: flagKey, description: z.string().trim().max(500), defaultEnabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { key, description, defaultEnabled } = parsed.data;
  if (isReservedFlagKey(key)) return fail("reserved");
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [existing] = await tx.select({ key: featureFlags.key }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    if (existing) return fail("exists");
    await tx.insert(featureFlags).values({ key, description, defaultEnabled, createdBy: ctx.user.id });
    await auditPlatform(ctx, { action: "platform.feature_flag.create", targetType: "feature_flag", targetId: key, diff: { description, defaultEnabled }, metadata: { source: "code_registry" } }, tx);
    return done("flagRegistered", key);
  });
  if (result.ok) {
    invalidateFeatureFlagCache();
    revalidateControls(flagPaths(key));
  }
  return result;
}

/** Description only; the default flips through `setFlagDefaultAction` (confirmed). */
export async function updateFeatureFlagAction(_prev: ControlsActionState, formData: FormData): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ key: flagKey, description: z.string().trim().max(500) }).safeParse({ key: str(formData, "key"), description: str(formData, "description") });
  if (!parsed.success) return fail("invalid", { description: "invalid" });
  const { key, description } = parsed.data;
  if (isReservedFlagKey(key)) return fail("reserved");
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [row] = await tx.select({ description: featureFlags.description }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    if (!row) return fail("not_found");
    if (row.description === description) return fail("unchanged");
    await tx.update(featureFlags).set({ description }).where(eq(featureFlags.key, key));
    await auditPlatform(ctx, { action: "platform.feature_flag.update", targetType: "feature_flag", targetId: key, diff: { description: { before: row.description, after: description } } }, tx);
    return done("flagUpdated", key);
  });
  if (result.ok) revalidateControls(flagPaths(key));
  return result;
}

/** Flips the global default of a flag — a flag flip is a risky action (docs/17): confirmed in the UI. */
export async function setFlagDefaultAction(input: { key: string; enabled: boolean; confirmed: true }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ key: flagKey, enabled: z.boolean(), confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { key, enabled } = parsed.data;
  if (isReservedFlagKey(key)) return fail("reserved");
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [row] = await tx.select({ defaultEnabled: featureFlags.defaultEnabled }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    if (!row) return fail("not_found");
    if (row.defaultEnabled === enabled) return fail("unchanged");
    await tx.update(featureFlags).set({ defaultEnabled: enabled }).where(eq(featureFlags.key, key));
    await auditPlatform(ctx, { action: "platform.feature_flag.set_default", targetType: "feature_flag", targetId: key, diff: { defaultEnabled: { before: row.defaultEnabled, after: enabled } } }, tx);
    return done("flagDefaultChanged", key);
  });
  if (result.ok) {
    invalidateFeatureFlagCache();
    revalidateControls(flagPaths(key));
  }
  return result;
}

/** Creates or replaces the override of one organization for one flag (unique per organization + key). */
export async function setFlagOverrideAction(_prev: ControlsActionState, formData: FormData): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z
    .object({ key: flagKey, organization: z.string().trim().min(1).max(120), enabled: z.enum(["true", "false"]), reason: z.string().trim().max(REASON_MAX) })
    .safeParse({ key: str(formData, "key"), organization: str(formData, "organization"), enabled: str(formData, "enabled"), reason: str(formData, "reason") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = "invalid";
    return fail("invalid", fieldErrors);
  }
  const { key } = parsed.data;
  const enabled = parsed.data.enabled === "true";
  const overrideReason = parsed.data.reason || null;
  if (isReservedFlagKey(key)) return fail("reserved");
  const org = await lookupOrganization(ctx, parsed.data.organization);
  if (!org) return fail("not_found", { organization: "not_found" });
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [flag] = await tx.select({ key: featureFlags.key }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    if (!flag) return fail("not_found", { key: "not_found" });
    const [existing] = await tx.select({ id: featureFlagOverrides.id, enabled: featureFlagOverrides.enabled, reason: featureFlagOverrides.reason }).from(featureFlagOverrides).where(and(eq(featureFlagOverrides.organizationId, org.id), eq(featureFlagOverrides.key, key))).limit(1);
    if (existing && existing.enabled === enabled && (existing.reason ?? null) === overrideReason) return fail("unchanged");
    const [row] = await tx
      .insert(featureFlagOverrides)
      .values({ organizationId: org.id, key, enabled, reason: overrideReason, actorUserId: ctx.user.id })
      .onConflictDoUpdate({ target: [featureFlagOverrides.organizationId, featureFlagOverrides.key], set: { enabled, reason: overrideReason, actorUserId: ctx.user.id, updatedAt: sql`now()` } })
      .returning({ id: featureFlagOverrides.id });
    await auditPlatform(ctx, { action: "platform.feature_flag_override.set", organizationId: org.id, targetType: "feature_flag_override", targetId: row?.id ?? null, diff: { key, organizationSlug: org.slug, before: existing ? { enabled: existing.enabled, reason: existing.reason } : null, after: { enabled, reason: overrideReason } } }, tx);
    return done("overrideSaved", row?.id);
  });
  if (result.ok) {
    invalidateFeatureFlagCache();
    revalidateControls(flagPaths(key));
  }
  return result;
}

export async function removeFlagOverrideAction(input: { overrideId: string; confirmed: true }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ overrideId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  let key = "";
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [row] = await tx.select({ id: featureFlagOverrides.id, key: featureFlagOverrides.key, organizationId: featureFlagOverrides.organizationId, enabled: featureFlagOverrides.enabled, reason: featureFlagOverrides.reason }).from(featureFlagOverrides).where(eq(featureFlagOverrides.id, parsed.data.overrideId)).limit(1);
    if (!row) return fail("not_found");
    key = row.key;
    await tx.delete(featureFlagOverrides).where(eq(featureFlagOverrides.id, row.id));
    await auditPlatform(ctx, { action: "platform.feature_flag_override.remove", organizationId: row.organizationId, targetType: "feature_flag_override", targetId: row.id, diff: { key: row.key, before: { enabled: row.enabled, reason: row.reason } } }, tx);
    return done("overrideRemoved", row.id);
  });
  if (result.ok) {
    invalidateFeatureFlagCache();
    revalidateControls(key ? flagPaths(key) : []);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------------------

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "https url");

/**
 * Creates (and optionally schedules) an announcement: six-locale texts (English mandatory, other locales
 * fall back to English in the dashboard), severity, display window in UTC, audience by plan and/or
 * organization ids (every id must exist), optional https link. Shown by the dashboard shell banner.
 */
export async function createAnnouncementAction(_prev: ControlsActionState, formData: FormData): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const fieldErrors: Record<string, string> = {};
  const severityParsed = z.enum(ANNOUNCEMENT_SEVERITIES).safeParse(str(formData, "severity"));
  if (!severityParsed.success) fieldErrors.severity = "invalid";
  const { texts, errors: textErrors } = buildAnnouncementTexts((name) => str(formData, name));
  Object.assign(fieldErrors, textErrors);
  const startsAt = parseUtcDateTime(str(formData, "startsAt"));
  const endsAt = parseUtcDateTime(str(formData, "endsAt"));
  if (startsAt === undefined) fieldErrors.startsAt = "invalid";
  if (endsAt === undefined) fieldErrors.endsAt = "invalid";
  const start = startsAt ?? new Date();
  if (endsAt && endsAt.getTime() <= start.getTime()) fieldErrors.endsAt = "window";
  const linkParsed = httpsUrl.safeParse(str(formData, "linkUrl"));
  if (!linkParsed.success) fieldErrors.linkUrl = "invalid";
  const plans = parsePlanList(formData.getAll("plans").filter((v): v is string => typeof v === "string"));
  const { ids: organizationIds, invalid } = parseOrganizationIdList(str(formData, "organizationIds"));
  if (invalid.length) fieldErrors.organizationIds = "invalid";
  if (Object.keys(fieldErrors).length) return fail("invalid", fieldErrors);
  if (organizationIds.length) {
    const existing = await existingOrganizationIds(ctx, organizationIds);
    if (organizationIds.some((id) => !existing.has(id))) return fail("invalid", { organizationIds: "not_found" });
  }
  const audience = buildAudience(plans, organizationIds);
  const severity = severityParsed.success ? severityParsed.data : "info";
  const linkUrl = linkParsed.success && linkParsed.data ? linkParsed.data : null;
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [row] = await tx.insert(platformAnnouncements).values({ startsAt: start, endsAt: endsAt ?? null, severity, texts, audience, linkUrl, createdBy: ctx.user.id }).returning({ id: platformAnnouncements.id });
    const id = row?.id ?? null;
    await auditPlatform(ctx, { action: "platform.announcement.create", targetType: "platform_announcement", targetId: id, diff: { severity, titleEn: texts.en?.title ?? null, locales: Object.keys(texts), startsAt: start.toISOString(), endsAt: endsAt ? endsAt.toISOString() : null, audience, linkUrl } }, tx);
    return done("announcementCreated", id ?? undefined);
  });
  if (result.ok) revalidateControls(["/ops/controls/announcements/new", "/app"]);
  return result;
}

/** Revokes an announcement (it disappears from every dashboard on the next request); confirmed in the UI. */
export async function revokeAnnouncementAction(input: { id: string; confirmed: true }): Promise<ControlsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ id: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await withPlatform(ctx, async (tx): Promise<ControlsActionState> => {
    const [row] = await tx.select({ id: platformAnnouncements.id, revokedAt: platformAnnouncements.revokedAt, severity: platformAnnouncements.severity, texts: platformAnnouncements.texts }).from(platformAnnouncements).where(eq(platformAnnouncements.id, parsed.data.id)).limit(1);
    if (!row) return fail("not_found");
    if (row.revokedAt) return fail("unchanged");
    await tx.update(platformAnnouncements).set({ revokedAt: sql`now()` }).where(eq(platformAnnouncements.id, row.id));
    await auditPlatform(ctx, { action: "platform.announcement.revoke", targetType: "platform_announcement", targetId: row.id, diff: { severity: row.severity, titleEn: row.texts?.en?.title ?? null } }, tx);
    return done("announcementRevoked", row.id);
  });
  if (result.ok) revalidateControls(["/app"]);
  return result;
}
