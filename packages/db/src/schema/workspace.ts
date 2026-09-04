import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { environments, orgRef, sites } from "./tenancy.ts";
import { id, timestamps } from "./_helpers.ts";

/** Per-user Track AI motion preference (supplement §9): follows the OS by default. */
export const AI_MOTION_VALUES = ["system", "full", "reduced", "off"] as const;
export type AiMotion = (typeof AI_MOTION_VALUES)[number];

/**
 * Workspace preferences of one user inside one organization (dashboard shell, migration 0006):
 * the site and environment the user is working on and the Track AI motion setting. A row is
 * created lazily on the first switch; the shell falls back to the `ts-active-site` cookie and then
 * to the organization's first site. Tenant table: `organization_id` + RLS policy.
 */
export const workspacePreferences = pgTable(
  "workspace_preferences",
  {
    id: id(),
    organizationId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeSiteId: uuid("active_site_id").references(() => sites.id, { onDelete: "set null" }),
    activeEnvironmentId: uuid("active_environment_id").references(() => environments.id, { onDelete: "set null" }),
    aiMotion: text("ai_motion").$type<AiMotion>().notNull().default("system"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("workspace_preferences_org_user_uq").on(t.organizationId, t.userId), index("workspace_preferences_org_idx").on(t.organizationId)],
);
