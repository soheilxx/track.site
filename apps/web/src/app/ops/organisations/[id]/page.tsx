import { ArrowLeft, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Banner, Status, buttonVariants, cn } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { AuditList } from "@/components/ops/organisations/audit-list";
import { DestinationsTable } from "@/components/ops/organisations/destinations-table";
import { FlagOverrides } from "@/components/ops/organisations/flag-overrides";
import { subscriptionStatusLabel, subscriptionStatusTone } from "@/components/ops/organisations/labels";
import { MembersTable } from "@/components/ops/organisations/members-table";
import { OpsNotes } from "@/components/ops/organisations/ops-notes";
import { SignalsPanel } from "@/components/ops/organisations/signals-panel";
import { SitesTable } from "@/components/ops/organisations/sites-table";
import { SubscriptionPanel } from "@/components/ops/organisations/subscription-panel";
import { SuspensionControl } from "@/components/ops/organisations/suspension-control";
import { UsagePanel } from "@/components/ops/organisations/usage-panel";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { formatDate } from "@/lib/format";
import { isUuid, loadOrganisationDetail } from "@/server/ops/organisations";
import { checkPlatform, hasPlatformRole } from "@/server/ops/platform";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("ops.pages");
  return { title: `${id.slice(0, 8)} · ${t("organisations.title")}` };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Organisation detail (Track Operations, docs/17): members and roles, sites and environments with
 * snippet state, subscription and usage, destinations with health, data-quality and alert counts,
 * internal notes, feature-flag overrides, recent audit entries, suspend / unsuspend and the
 * break-glass entry point. Metadata and aggregates only; under an active grant the view is audited.
 */
export default async function OpsOrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const detail = await loadOrganisationDetail(access.ctx, id);
  if (!detail) notFound();
  const [t, tOps, locale] = await Promise.all([getTranslations("opsOrganisations"), getTranslations("ops"), getLocale()]);
  const org = detail.organization;
  const isAdmin = hasPlatformRole(access.ctx.platformRole, "PLATFORM_ADMIN");
  const breakGlassHref = `/ops/break-glass?organization=${org.id}`;
  return (
    <div className="space-y-8">
      <div>
        <Link href="/ops/organisations" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("detail.back")}
        </Link>
      </div>
      <OpsPageHeader
        title={org.name}
        intro={`${t("detail.slug")}: ${org.slug} · ${t("detail.id")}: ${org.id}`}
        context={
          <>
            <Badge tone="neutral">{detail.subscription.planName}</Badge>
            <Badge tone={subscriptionStatusTone(detail.subscription.status)}>{subscriptionStatusLabel(t, detail.subscription.status)}</Badge>
            {org.suspendedAt ? (
              <Status tone="bad" indicator="icon" chip>
                {t("suspended.badge")}
              </Status>
            ) : (
              <Status tone="ok" indicator="icon" chip>
                {t("suspended.active")}
              </Status>
            )}
            <span className="text-ink-3">{t("detail.created", { date: formatDate(org.createdAt, locale, "short") })}</span>
          </>
        }
        actions={
          <>
            {/* button-styled link to the break-glass module (its request form lists every organisation) */}
            <Link href={breakGlassHref} className={buttonVariants({ variant: "secondary" })} data-testid="ops-organisation-break-glass">
              <KeyRound className="size-4" aria-hidden="true" />
              {t("detail.breakGlass.request")}
            </Link>
            <SuspensionControl organizationId={org.id} name={org.name} suspended={Boolean(org.suspendedAt)} canManage={isAdmin} />
          </>
        }
      />

      {org.suspendedAt ? (
        <Banner tone="bad" title={t("suspended.bannerTitle")} data-testid="ops-organisation-suspended">
          {t("suspended.since", { date: formatDateTime(org.suspendedAt, locale) ?? "" })}
          {org.suspendedReason ? ` · ${t("suspended.reason")}: ${org.suspendedReason}` : null}
          <span className="block">{t("suspended.bannerText")}</span>
        </Banner>
      ) : null}

      {detail.breakGlass.own ? (
        <Banner tone="warn" title={t("detail.breakGlass.activeTitle", { date: formatDateTime(detail.breakGlass.own.endsAt, locale) ?? "" })} data-testid="ops-organisation-break-glass-active">
          {t("detail.breakGlass.activeText", { id: detail.breakGlass.own.id, reason: detail.breakGlass.own.reason })}
        </Banner>
      ) : (
        <p className="text-xs text-ink-3">
          {t("detail.breakGlass.none")}
          {detail.breakGlass.othersActive ? ` ${t("detail.breakGlass.othersActive", { count: detail.breakGlass.othersActive })}` : null}
          {detail.breakGlass.pending ? ` ${t("detail.breakGlass.pending", { count: detail.breakGlass.pending })}` : null}
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        <Section id="org-subscription" title={t("detail.sections.subscription")}>
          <SubscriptionPanel subscription={detail.subscription} organization={org} locale={locale} />
        </Section>
        <Section id="org-usage" title={t("detail.sections.usage")}>
          <UsagePanel usage={detail.usage} locale={locale} />
        </Section>
      </div>

      <Section id="org-members" title={t("detail.sections.members")}>
        <MembersTable members={detail.members} pendingInvitations={detail.pendingInvitations} locale={locale} />
      </Section>

      <Section id="org-sites" title={t("detail.sections.sites")}>
        <SitesTable sites={detail.sites} locale={locale} now={detail.generatedAt} />
      </Section>

      <Section id="org-destinations" title={t("detail.sections.destinations")}>
        <DestinationsTable destinations={detail.destinations} locale={locale} now={detail.generatedAt} />
      </Section>

      <Section id="org-signals" title={t("detail.sections.signals")}>
        <SignalsPanel signals={detail.signals} locale={locale} />
      </Section>

      <Section id="org-flags" title={t("detail.sections.flags")}>
        <FlagOverrides organizationId={org.id} organizationName={org.name} flags={detail.flags} canManage={isAdmin} locale={locale} />
      </Section>

      <Section id="org-notes" title={t("detail.sections.notes")}>
        <p className="text-sm text-ink-3">{t("detail.notes.intro")}</p>
        <OpsNotes organizationId={org.id} notes={detail.notes} locale={locale} />
      </Section>

      <Section id="org-audit" title={t("detail.sections.audit")}>
        <AuditList entries={detail.audit} organizationId={org.id} locale={locale} />
      </Section>

      <p className="text-xs text-ink-3">
        {t("detail.generated", { date: formatDateTime(detail.generatedAt, locale) ?? "" })} · {tOps("overview.rules.noRawData")}
      </p>
    </div>
  );
}
