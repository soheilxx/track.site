import type { OrgRole } from "@track-site/core";
import type { PaletteDestination, WorkspaceEnvironment, WorkspaceSite } from "@/server/workspace";

/** Serializable props the dashboard layout hands to the client shell (no secrets, no session tokens). */
export interface ShellUser {
  name: string;
  email: string;
}

export interface ShellOrganization {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

export interface ShellWorkspace {
  sites: WorkspaceSite[];
  site: WorkspaceSite | null;
  environments: WorkspaceEnvironment[];
  environment: WorkspaceEnvironment | null;
}

export interface ShellProps {
  user: ShellUser;
  organization: ShellOrganization | null;
  organizations: ShellOrganization[];
  workspace: ShellWorkspace | null;
  destinations: PaletteDestination[];
  locale: string;
}

export type { PaletteDestination, WorkspaceEnvironment, WorkspaceSite };
