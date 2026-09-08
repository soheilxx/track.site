import { getTranslations } from "next-intl/server";
import { Alert, Status } from "@track-site/ui";
import type { PlatformUsersOverview } from "@/server/ops/users";

/** Four-eyes status of the viewer: deciding admins, whether own requests need a second admin, bootstrap and sign-out rules. */
export async function FourEyesPanel({ overview }: { overview: PlatformUsersOverview }) {
  const t = await getTranslations("opsUsers.overview.rules");
  return (
    <section aria-labelledby="ops-users-rules-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h2 id="ops-users-rules-title" className="text-sm font-semibold text-ink">
        {t("title")}
      </h2>
      <div className="mt-2 space-y-2 text-sm text-ink-2">
        <p>
          <Status tone={overview.eligibleAdminCount >= 2 ? "ok" : "warn"} indicator="icon">
            {t("admins", { eligible: overview.eligibleAdminCount, total: overview.adminCount })}
          </Status>
          <span className="block text-xs text-ink-3">{t("eligibleHint", { twoFactor: overview.requiresTwoFactor ? "yes" : "no" })}</span>
        </p>
        {overview.otherAdminExists ? <Alert tone="info">{t("on")}</Alert> : <Alert tone="warn">{t("off")}</Alert>}
        <p className="text-xs text-ink-3">{t("bootstrap")}</p>
        <p className="text-xs text-ink-3">{t("signOut", { minutes: overview.sessionCacheMinutes })}</p>
      </div>
    </section>
  );
}
