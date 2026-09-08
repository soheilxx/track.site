import type { OrgRole, PlatformRole } from "@track-site/core";
import type { PaletteDestination, WorkspaceEnvironment, WorkspaceSite } from "@/server/workspace";

/** Serializable props the dashboard layout hands to the client shell (no secrets, no session tokens). */
export interface ShellUser {
  name: string;
  email: string;
  /** `NONE` for every customer; a platform role adds the Track Operations entry to the account menu and the palette (docs/17) */
  platformRole: PlatformRole;
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
