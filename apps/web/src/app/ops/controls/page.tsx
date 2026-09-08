import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KillSwitchCard } from "@/components/ops/controls/kill-switch-card";
import { Suspensions } from "@/components/ops/controls/suspensions";
import { OpsForbidden, opsPageMetadata } from "@/components/ops/shell";
import { KILL_SWITCH_ENGAGE_WORD, KILL_SWITCH_RELEASE_WORD, countActiveOrganizations, listSuspendedOrganizations, loadGlobalKillSwitch, probeCollector } from "@/server/ops/controls";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("controls");
}

/**
 * Controls → kill switch & suspensions: the platform kill switch next to the collector's live `/health`,
 * the suspended organizations and the suspend flow. Maintenance mode for the marketing site is
 * deliberately not here (see the note at the bottom of the page).
 */
export default async function OpsControlsPage() {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const ctx = access.ctx;
  const [t, locale, killSwitch, probe, suspended, activeCount] = await Promise.all([getTranslations("opsControls"), platformLocale(ctx.user), loadGlobalKillSwitch(ctx), probeCollector(), listSuspendedOrganizations(ctx), countActiveOrganizations(ctx)]);
  return (
    <div className="space-y-8">
      <KillSwitchCard state={killSwitch} probe={probe} words={{ engage: KILL_SWITCH_ENGAGE_WORD, release: KILL_SWITCH_RELEASE_WORD }} locale={locale} />
      <Suspensions suspended={suspended} activeCount={activeCount} locale={locale} />
      <section aria-labelledby="ops-maintenance-title" className="rounded-[var(--radius-card)] border border-dashed border-line-2 px-4 py-3 text-sm">
        <h2 id="ops-maintenance-title" className="font-semibold text-ink">
          {t("maintenance.title")}
        </h2>
        <p className="mt-1 text-ink-3">{t("maintenance.text")}</p>
      </section>
    </div>
  );
}
