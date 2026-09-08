import type { AppEnv } from "@track-site/core";
import type { ActivePlatformRole } from "@/server/ops/platform";

/** Serializable props the /ops layout hands to the client shell (no secrets, no session tokens). */
export interface OpsShellUser {
  name: string;
  email: string;
}

export interface OpsEnvironment {
  appEnv: AppEnv;
  /** public host the console runs on (from HOST_MARKETING), e.g. `www.track.site` or `localhost:3000` */
  host: string;
}

export interface OpsShellProps {
  user: OpsShellUser;
  platformRole: ActivePlatformRole;
  environment: OpsEnvironment;
  locale: string;
}
