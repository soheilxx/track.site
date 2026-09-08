import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { HealthCard, InboxCard, KeyNumbers, SupportCard } from "@/components/ops/overview";
import { OPS_NAV, OpsForbidden, OpsPageHeader, opsPageMetadata, roleAllows } from "@/components/ops/shell";
import { loadGrowthHeadline } from "@/server/ops/growth";
import { loadPlatformHealth } from "@/server/ops/health";
import { DEFAULT_INBOX_FILTERS, loadAlertDigest, loadInbox, loadPrivacyOverview } from "@/server/ops/inbox";
import { checkPlatform, platformLocale, withPlatform } from "@/server/ops/platform";
import { loadViewCounts } from "@/server/support/tickets";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("overview");
}

/** Value of a settled loader, or null with a redacted log line (never the message — vendor and worker texts may echo tenant data). */
function settled<T>(result: PromiseSettledResult<T>, name: string): T | null {
  if (result.status === "fulfilled") return result.value;
  const reason: unknown = result.reason;
  console.error(`[ops/overview] ${name} unavailable: ${reason instanceof Error ? reason.name : typeof reason}`);
  return null;
}

/**
 * Track Operations overview (docs/17): the growth module's key numbers, the support desk's live queue counts
 * (docs/18), the platform-health summary and the open inbox work, read through the modules' own server functions — every card degrades to an honest
 * "could not be loaded" state on its own — followed by the modules the operator may open and the rules
 * every operator works under. Aggregates and metadata only; nothing here needs a break-glass grant.
 */
export default async function OpsOverviewPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const ctx = access.ctx;
  const now = new Date();
  const [t, locale] = await Promise.all([getTranslations("ops"), platformLocale(ctx.user)]);
  const [headline, health, inbox, privacy, alerts, support] = await Promise.allSettled([
    withPlatform(ctx, (tx) => loadGrowthHeadline(tx, now)),
    loadPlatformHealth(ctx, { now }),
    loadInbox(ctx, DEFAULT_INBOX_FILTERS),
    loadPrivacyOverview(ctx),
    loadAlertDigest(ctx),
    loadViewCounts(ctx, [], now),
  ]);
  const modules = OPS_NAV.filter((item) => item.key !== "overview" && roleAllows(ctx.platformRole, item.minRole));
  return (
    <div className="space-y-8" data-testid="ops-overview">
      <OpsPageHeader title={t("pages.overview.title")} intro={t("pages.overview.intro")} />

      <KeyNumbers headline={settled(headline, "growth")} locale={locale} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SupportCard counts={settled(support, "support")} locale={locale} />
        <HealthCard view={settled(health, "health")} locale={locale} />
        <InboxCard inbox={settled(inbox, "inbox")} privacy={settled(privacy, "privacy")} alerts={settled(alerts, "alerts")} locale={locale} />
      </div>

      <section aria-labelledby="ops-modules-title" className="space-y-3">
        <h2 id="ops-modules-title" className="text-base font-semibold text-ink">
          {t("overview.modules")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex h-full min-h-11 items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left transition-colors duration-[var(--motion-fast)] ease-out hover:border-line-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{t(`nav.${item.key}`)}</span>
                    <span className="mt-1 block text-xs text-ink-3">{t(`pages.${item.key}.intro`)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ops-rules-title" className="space-y-3">
        <h2 id="ops-rules-title" className="text-base font-semibold text-ink">
          {t("overview.principles")}
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>{t("overview.rules.noRawData")}</li>
          <li>{t("overview.rules.breakGlass")}</li>
          <li>{t("overview.rules.audit")}</li>
        </ul>
      </section>
    </div>
  );
}
