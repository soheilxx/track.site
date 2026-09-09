import { Settings2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { SupportTicketPriority } from "@track-site/db";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/controls/format";
import { formatNumber } from "@/lib/format";
import { DAY_KEYS, ONLINE_WINDOW_MINUTES, businessHoursToForm, type InboundLedgerView, type SlaPolicySummary, type SupportSettingsView } from "@/server/support/settings";
import { InboundLedger } from "./inbound-ledger";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const PRIORITIES: readonly SupportTicketPriority[] = ["urgent", "high", "normal", "low"];

/** Business minutes → "1 h", "3 d", "45 min" (whole units only; otherwise minutes). */
export function formatBusinessMinutes(minutes: number, t: Translate): string {
  if (minutes > 0 && minutes % 1440 === 0) return t("units.days", { count: minutes / 1440 });
  if (minutes > 0 && minutes % 60 === 0) return t("units.hours", { count: minutes / 60 });
  return t("units.minutes", { count: minutes });
}

/**
 * Overview of the desk settings: the saved general settings as facts (sender, reply domain, signature,
 * automation, business hours, CSAT) with the way to the form, the agents currently online, the inbound
 * e-mail ledger (webhook outcomes, failures with their error) and the SLA policies as stored (read-only
 * here — policy editing is its own section).
 */
export async function SettingsOverview({ settings, policies, agentsOnline, ledger, locale }: { settings: SupportSettingsView; policies: SlaPolicySummary[]; agentsOnline: number; ledger: InboundLedgerView; locale: string }) {
  const [t, ts, tt] = await Promise.all([getTranslations("supportMacros"), getTranslations("support"), getTranslations("supportTeams")]);
  const { form, extraWindows } = businessHoursToForm(settings.businessHours);
  const days = DAY_KEYS.filter((key) => form.days[key].enabled);
  // Round robin is applied by every ticket-creation path (docs/18 §"Integration"); the desk's business hours are
  // the fallback of every SLA policy without windows of its own (docs/18 §11, §"Hardening") — the facts say so.
  const facts: Array<{ label: string; value: string; notes?: string[] }> = [
    { label: t("settings.overview.sender"), value: `${settings.effective.fromName} <${settings.effective.fromAddress}>`, ...(settings.envOverrides.fromAddress ? { notes: [t("settings.overview.envOverride", { name: "SUPPORT_FROM_ADDRESS" })] } : {}) },
    { label: t("settings.overview.replyDomain"), value: settings.effective.inboundDomain, ...(settings.envOverrides.inboundDomain ? { notes: [t("settings.overview.envOverride", { name: "SUPPORT_INBOUND_DOMAIN" })] } : {}) },
    { label: t("settings.overview.signature"), value: settings.signatureText ? t("settings.overview.signatureLines", { count: settings.signatureText.split("\n").length }) : t("settings.overview.signatureNone") },
    { label: t("settings.overview.autoReply"), value: settings.autoReplyEnabled ? t("common.on") : t("common.off") },
    { label: t("settings.overview.autoAssign"), value: t(`settings.general.assign.${settings.autoAssignStrategy}`) },
    { label: t("settings.overview.csat"), value: settings.csatEnabled ? t("common.on") : t("common.off") },
    {
      label: t("settings.overview.businessHours"),
      value: days.length
        ? `${form.timezone} · ${days.map((key) => `${t(`settings.general.days.${key}`)} ${form.days[key].start}–${form.days[key].end}`).join(", ")}`
        : t("settings.overview.businessHoursNone", { timezone: form.timezone }),
      notes: [t("settings.overview.businessHoursFallback"), ...(Object.keys(extraWindows).length ? [t("settings.overview.extraWindows")] : [])],
    },
  ];

  return (
    <div className="space-y-6">
      {!settings.stored ? <Alert tone="warn">{t("settings.overview.notStored")}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{t("settings.overview.generalTitle")}</CardTitle>
              <CardDescription>{settings.updatedAt ? t("settings.overview.updated", { date: formatDateTime(settings.updatedAt, locale) ?? "" }) : t("settings.overview.generalText")}</CardDescription>
            </div>
            <Link href="/ops/support/settings/general" className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid="support-settings-edit">
              <Settings2 className="size-4" aria-hidden="true" /> {t("settings.overview.edit")}
            </Link>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              {facts.map((fact) => (
                <div key={fact.label} className="contents">
                  <dt className="text-ink-3">{fact.label}</dt>
                  <dd className="min-w-0 break-words text-ink">
                    {fact.value}
                    {fact.notes?.map((note) => (
                      <span key={note} className="mt-0.5 block text-xs text-ink-3">
                        {note}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.overview.presenceTitle")}</CardTitle>
            <CardDescription>{t("settings.overview.presenceText", { minutes: ONLINE_WINDOW_MINUTES })}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">{formatNumber(agentsOnline, locale)}</p>
            <p className="mt-1 text-sm text-ink-3">{t("settings.overview.agentsOnline", { count: agentsOnline, minutes: ONLINE_WINDOW_MINUTES })}</p>
            <div className="mt-3">
              <Status tone={settings.autoAssignStrategy !== "round_robin" ? "neutral" : agentsOnline > 0 ? "ok" : "warn"} data-testid="support-settings-round-robin">
                {settings.autoAssignStrategy !== "round_robin" ? t("settings.overview.roundRobinOff") : agentsOnline > 0 ? t("settings.overview.roundRobinActive") : t("settings.overview.roundRobinNobody")}
              </Status>
            </div>
          </CardContent>
        </Card>
      </div>

      <InboundLedger ledger={ledger} locale={locale} />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{t("settings.overview.sla.title")}</CardTitle>
            <CardDescription>{t("settings.overview.sla.text")}</CardDescription>
          </div>
          <Link href="/ops/support/settings/sla" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("settings.overview.sla.manage")}
          </Link>
        </CardHeader>
        <CardContent className="px-2 py-2 sm:px-3">
          {policies.length === 0 ? (
            <EmptyState title={t("settings.overview.sla.empty")} description={t("settings.overview.sla.emptyText")} />
          ) : (
            <Table caption={t("settings.overview.sla.caption")}>
              <THead>
                <Tr>
                  <Th>{t("settings.overview.sla.columns.name")}</Th>
                  <Th>{t("settings.overview.sla.columns.plans")}</Th>
                  <Th>{t("settings.overview.sla.columns.targets")}</Th>
                  <Th>{t("settings.overview.sla.columns.updated")}</Th>
                </Tr>
              </THead>
              <TBody>
                {policies.map((policy) => (
                  <Tr key={policy.id}>
                    <Td label={t("settings.overview.sla.columns.name")}>
                      <p className="font-medium text-ink">
                        {policy.name} {policy.isDefault ? <Badge tone="info">{t("settings.overview.sla.isDefault")}</Badge> : null}
                      </p>
                      {policy.description ? <p className="mt-0.5 max-w-md text-xs text-ink-3">{policy.description}</p> : null}
                    </Td>
                    <Td label={t("settings.overview.sla.columns.plans")}>{policy.planIds && policy.planIds.length ? policy.planIds.join(", ") : t("settings.overview.sla.allPlans")}</Td>
                    <Td label={t("settings.overview.sla.columns.targets")}>
                      <ul className="space-y-0.5 text-xs text-ink-2">
                        {PRIORITIES.map((priority) => {
                          const target = policy.priorities[priority];
                          if (!target) return null;
                          return (
                            <li key={priority}>
                              {t("settings.overview.sla.target", {
                                priority: ts(`priority.${priority}`),
                                first: formatBusinessMinutes(target.first_response_minutes, t),
                                resolution: formatBusinessMinutes(target.resolution_minutes, t),
                              })}
                            </li>
                          );
                        })}
                      </ul>
                    </Td>
                    <Td label={t("settings.overview.sla.columns.updated")}>{formatDateTime(policy.updatedAt, locale) ?? t("common.none")}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>{tt("settings.title")}</CardTitle>
            <CardDescription>{tt("settings.intro")}</CardDescription>
          </div>
          <Link href="/ops/support/settings/teams" className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid="support-settings-teams">
            {tt("users.manage")}
          </Link>
        </CardHeader>
      </Card>
    </div>
  );
}
