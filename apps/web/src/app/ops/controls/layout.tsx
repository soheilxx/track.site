import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ControlsSubnav } from "@/components/ops/controls/subnav";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { checkPlatform } from "@/server/ops/platform";

/**
 * Controls module (docs/17): admin-only. The layout enforces PLATFORM_ADMIN once (inline 403 otherwise)
 * and renders the module header with its section navigation; every page enforces the role again.
 */
export default async function OpsControlsLayout({ children }: { children: ReactNode }) {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const t = await getTranslations("ops.pages.controls");
  return (
    <div className="space-y-6">
      <OpsPageHeader title={t("title")} intro={t("intro")} />
      <ControlsSubnav />
      {children}
    </div>
  );
}
