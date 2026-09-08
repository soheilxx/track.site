import "server-only";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { platformAnnouncements, subscriptions, withTenant, type AnnouncementAudience, type AnnouncementSeverity, type AnnouncementTexts } from "@track-site/db";
import { DEFAULT_LOCALE } from "@/i18n/routing";
import { db, logger } from "@/server/db";

/**
 * Platform announcements for the customer dashboard (migration 0014 `platform_announcements`, written
 * only by platform admins in Track Operations → Controls). An announcement is shown while it is not
 * revoked and the database clock lies in [`starts_at`, `ends_at`), to every organization unless its
 * audience names plans and/or organization ids — then to the organizations matching either list.
 * Texts are `{ locale: { title, body } }`; a missing locale falls back to English, then to any locale.
 * The reader never throws: an unreachable database means no banners, logged at warn level.
 */
export interface AnnouncementView {
  id: string;
  severity: AnnouncementSeverity;
  title: string;
  body: string;
  linkUrl: string | null;
  /** ISO timestamps (serializable for the client banner) */
  startsAt: string;
  endsAt: string | null;
  updatedAt: string;
}

const SEVERITY_RANK: Record<AnnouncementSeverity, number> = { bad: 0, warn: 1, info: 2 };

/** Max banners shown at once — the most severe and most recent first. */
export const MAX_VISIBLE_ANNOUNCEMENTS = 3;

/** Localized copy of an announcement: the locale, then English, then the first locale that has a title. */
export function localizeAnnouncement(texts: AnnouncementTexts | null | undefined, locale: string): { title: string; body: string } | null {
  if (!texts || typeof texts !== "object") return null;
  const candidates = [texts[locale], texts[DEFAULT_LOCALE], ...Object.values(texts)];
  for (const entry of candidates) {
    if (entry && typeof entry.title === "string" && entry.title.trim()) return { title: entry.title.trim(), body: typeof entry.body === "string" ? entry.body.trim() : "" };
  }
  return null;
}

/** Whether an audience includes an organization: everyone when both lists are absent or empty. */
export function announcementApplies(audience: AnnouncementAudience | null | undefined, target: { organizationId: string; planId: string | null }): boolean {
  const plans = Array.isArray(audience?.plans) ? audience.plans.filter((p): p is string => typeof p === "string") : [];
  const orgIds = Array.isArray(audience?.organizationIds) ? audience.organizationIds.filter((o): o is string => typeof o === "string") : [];
  if (plans.length === 0 && orgIds.length === 0) return true;
  if (orgIds.some((id) => id.toLowerCase() === target.organizationId.toLowerCase())) return true;
  return target.planId !== null && plans.includes(target.planId);
}

export function sortAnnouncements<T extends { severity: AnnouncementSeverity; startsAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.startsAt.localeCompare(a.startsAt));
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Active announcements for one organization in the user's locale (the dashboard shell banner slot). */
export async function activeAnnouncements(organizationId: string, locale: string): Promise<AnnouncementView[]> {
  if (!UUID.test(organizationId)) return [];
  try {
    const rows = await withTenant(db(), organizationId, async (tx) => {
      const active = await tx
        .select({
          id: platformAnnouncements.id,
          severity: platformAnnouncements.severity,
          texts: platformAnnouncements.texts,
          audience: platformAnnouncements.audience,
          linkUrl: platformAnnouncements.linkUrl,
          startsAt: platformAnnouncements.startsAt,
          endsAt: platformAnnouncements.endsAt,
          updatedAt: platformAnnouncements.updatedAt,
        })
        .from(platformAnnouncements)
        .where(and(isNull(platformAnnouncements.revokedAt), lte(platformAnnouncements.startsAt, sql`now()`), or(isNull(platformAnnouncements.endsAt), gt(platformAnnouncements.endsAt, sql`now()`))))
        .orderBy(desc(platformAnnouncements.startsAt))
        .limit(50);
      const needsPlan = active.some((a) => Array.isArray(a.audience?.plans) && a.audience.plans.length > 0);
      let planId: string | null = null;
      if (needsPlan) {
        const [sub] = await tx.select({ planId: subscriptions.planId }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
        planId = sub?.planId ?? null;
      }
      return active.filter((a) => announcementApplies(a.audience, { organizationId, planId }));
    });
    const views: AnnouncementView[] = [];
    for (const row of rows) {
      const text = localizeAnnouncement(row.texts, locale);
      if (!text) continue;
      views.push({
        id: row.id,
        severity: row.severity,
        title: text.title,
        body: text.body,
        linkUrl: row.linkUrl,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt ? row.endsAt.toISOString() : null,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return sortAnnouncements(views).slice(0, MAX_VISIBLE_ANNOUNCEMENTS);
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "announcements lookup failed; showing none");
    return [];
  }
}
