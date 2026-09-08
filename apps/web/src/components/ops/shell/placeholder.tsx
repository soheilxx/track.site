import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@track-site/ui";
import { checkPlatform, type PlatformMinRole } from "@/server/ops/platform";
import { OpsForbidden } from "./gate";
import { OPS_NAV, type OpsModuleKey } from "./nav-items";
import { OpsPageHeader } from "./page-header";

/** Tab title of a console page: the module title, templated by the layout ("… · Track Operations"). */
export async function opsPageMetadata(module: OpsModuleKey): Promise<Metadata> {
  const t = await getTranslations("ops.pages");
  return { title: t(`${module}.title`) };
}

/**
 * Thin placeholder of a module slice: enforces the module's minimum role (inline 403 otherwise), renders the
 * localized header and an honest "in preparation" state — no invented metrics.
 */
export async function OpsPlaceholder({ module }: { module: OpsModuleKey }) {
  const minRole: PlatformMinRole =
    OPS_NAV.find((item) => item.key === module)?.minRole ?? "PLATFORM_SUPPORT";
  const access = await checkPlatform(minRole);
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const t = await getTranslations("ops");
  return (
    <div className="space-y-6">
      <OpsPageHeader title={t(`pages.${module}.title`)} intro={t(`pages.${module}.intro`)} />
      <EmptyState title={t("placeholder.title")} description={t("placeholder.text")} />
    </div>
  );
}
