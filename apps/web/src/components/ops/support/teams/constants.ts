/**
 * Limits and pure helpers of the support teams (docs/18 §"Agent-created tickets and teams"), shared by the
 * client components and the server module `@/server/support/teams` (which re-exports them). No imports: the
 * file is safe in either bundle (docs/17 §"Client bundles").
 */
export const TEAM_NAME_MAX = 60;
export const TEAM_SLUG_MAX = 40;
export const TEAM_DESCRIPTION_MAX = 280;
/** lower-case slug: letters, digits and `-`, never leading with `-` (the CHECK of migration 0017) */
export const TEAM_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Mirror of `SUPPORT_TEAM_ROLES` (packages/db) for client bundles; `teams.test.ts` guards against drift. */
export const TEAM_ROLES = ["member", "lead"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Query parameter of the queue's team filter (`?team=<slug | id | none | any>`). */
export const TEAM_QUERY_PARAM = "team";

/** `Customer success` → `customer-success`; null when nothing usable remains. */
export function slugifyTeamName(name: string): string | null {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TEAM_SLUG_MAX)
    .replace(/-+$/g, "");
  return TEAM_SLUG_PATTERN.test(slug) ? slug : null;
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}
