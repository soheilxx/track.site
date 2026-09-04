import { getLocale, getTranslations } from "next-intl/server";
import { can } from "@track-site/core";
import { Alert } from "@track-site/ui";
import { Channels } from "@/components/app/alerts/channels";
import { History } from "@/components/app/alerts/history";
import { IncidentMode } from "@/components/app/alerts/incident-mode";
import { Rules } from "@/components/app/alerts/rules";
import { SettingsSubnav } from "@/components/app/settings/subnav";
import {
  loadAlertHistory,
  loadAlertSettings,
  loadIncidentTargets,
  parseHistoryFilters,
} from "@/server/alerts";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Alerts & Incident Mode (`/app/settings/alerts`, supplement §8 module 13). Priority first: Incident
 * Mode for the active site, then the notification channels, the rules and the alert history with
 * URL-backed filters. Read access needs `org.read`; changing channels and rules `org.update`; pausing a
 * destination `integrations.manage`; the environment kill switch `kill_switch.manage`.
 */
export default async function AlertsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const ctx = await requireOrgContext("org.read");
  const [t, locale, workspace] = await Promise.all([
    getTranslations("alerts"),
    getLocale(),
    activeSite(ctx),
  ]);
  const filters = parseHistoryFilters(q);
  const [settings, history, targets] = await Promise.all([
    loadAlertSettings(ctx),
    loadAlertHistory(ctx, filters),
    loadIncidentTargets(ctx, workspace),
  ]);
  const now = new Date().toISOString();
  const canManage = can(ctx.role, "org.update");
  const canManageDestinations = can(ctx.role, "integrations.manage");
  const canKillSwitch = can(ctx.role, "kill_switch.manage") && can(ctx.role, "config.publish");
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("intro")}</p>
        </div>
        <SettingsSubnav />
        {!canManage ? <p className="text-sm text-ink-3">{t("readOnly")}</p> : null}
      </div>
      <IncidentMode
        targets={targets}
        site={workspace.site ? { id: workspace.site.id, name: workspace.site.name } : null}
        canManageDestinations={canManageDestinations}
        canKillSwitch={canKillSwitch}
        locale={locale}
        now={now}
      />
      {settings.migrationMissing ? (
        <Alert tone="warn" title={t("migrationMissing")}>
          {t("migrationMissingText")}
        </Alert>
      ) : (
        <>
          <Channels channels={settings.channels} canManage={canManage} locale={locale} now={now} />
          <Rules
            rules={settings.rules}
            channels={settings.channels}
            sites={settings.sites}
            canManage={canManage}
            locale={locale}
            now={now}
          />
          <History
            page={history}
            filters={filters}
            locale={locale}
            canManage={canManage}
            now={now}
          />
        </>
      )}
    </div>
  );
}
