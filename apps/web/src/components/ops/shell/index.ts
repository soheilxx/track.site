/**
 * Track Operations shell (docs/17-operations-console.md). The layout under `src/app/ops` renders `OpsShell`
 * for an authorised operator and `OpsForbidden` otherwise; module slices use `OpsPageHeader`,
 * `OpsForbidden` and `opsPageMetadata`, and register their route in `OPS_NAV`.
 */
export { OpsShell } from "./ops-shell";
export { OpsNav } from "./ops-nav";
export { OpsForbidden } from "./gate";
export { OpsPageHeader } from "./page-header";
export { OpsPlaceholder, opsPageMetadata } from "./placeholder";
export { EnvironmentBadge, OPS_ENVIRONMENT_TONE } from "./environment-badge";
export {
  OPS_MODULE_KEYS,
  OPS_NAV,
  isOpsNavActive,
  roleAllows,
  type OpsMinRole,
  type OpsModuleKey,
  type OpsNavItem,
} from "./nav-items";
export type { OpsEnvironment, OpsShellProps, OpsShellUser } from "./types";
