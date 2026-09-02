import type { OrgRole, PlatformRole } from "./rbac.ts";

/**
 * Tenant context is derived from the authenticated session or a server-side resolved
 * source key. It is never constructed from request bodies or model arguments.
 */
export interface UserActor {
  kind: "user";
  userId: string;
  role: OrgRole;
  platformRole: PlatformRole;
  email?: string;
}
export interface SystemActor {
  kind: "system";
  name: string;
}
export interface SourceKeyActor {
  kind: "source_key";
  sourceKeyId: string;
  siteId: string;
}
export interface AgentActor {
  kind: "agent";
  onBehalfOfUserId: string;
  role: OrgRole;
  chatSessionId: string;
}
export type Actor = UserActor | SystemActor | SourceKeyActor | AgentActor;

export interface TenantContext {
  organizationId: string;
  actor: Actor;
  requestId: string;
  ip?: string | undefined;
}

export function actorRole(actor: Actor): OrgRole | null {
  if (actor.kind === "user" || actor.kind === "agent") return actor.role;
  return null;
}

export function actorUserId(actor: Actor): string | null {
  if (actor.kind === "user") return actor.userId;
  if (actor.kind === "agent") return actor.onBehalfOfUserId;
  return null;
}
