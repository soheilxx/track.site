import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { RETENTION_DEFAULT_DAYS } from "@track-site/db";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { CoveragePanel } from "@/components/app/consent/coverage-panel";
import { ConsentPageHeader } from "@/components/app/consent/page-header";
import { PolicyPanel } from "@/components/app/consent/policy-panel";
import { DsarForm, DsarRow, RetentionForm } from "@/components/app/consent/privacy";
import { formatDate } from "@/lib/format";
import { loadConsentCoverage, loadOrganizationPolicies, loadPrivacyRecords, loadSiteDestinations, loadSitePolicyState } from "@/server/consent";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Consent & Privacy (supplement §8, module 8): the active site's policy (published + draft with
 * editor, publish and discard), coverage measured from recorded consent states, the organization-wide
 * policy list, retention windows and data subject requests. The impact simulator lives at
 * `/app/consent/simulator`.
 */
export default async function ConsentPage() {
  const ctx = await requireOrgContext("consent.read");
  const [t, workspace] = await Promise.all([getTranslations("consent"), activeSite(ctx)]);
  const locale = ctx.user.locale;
  const site = workspace.site;
  const [siteState, coverage, destinations, orgPolicies, privacy] = await Promise.all([
    site ? loadSitePolicyState(ctx, site.id) : Promise.resolve(null),
    site ? loadConsentCoverage(ctx, site.id) : Promise.resolve(null),
    site ? loadSiteDestinations(ctx, site.id) : Promise.resolve([]),
    loadOrganizationPolicies(ctx),
    loadPrivacyRecords(ctx),
  ]);
  const canManage = can(ctx.role, "consent.manage");
  const canRetention = can(ctx.role, "privacy.retention");
  const canDsar = can(ctx.role, "privacy.dsar");
  const statusTone = { draft: "info", published: "ok", archived: "neutral" } as const;

  return (
    <div className="space-y-8">
      <ConsentPageHeader
        title={t("title")}
        intro={t("intro")}
        actions={
          site ? (
            <Link href="/app/consent/simulator" className={buttonVariants({ variant: "secondary" })}>
              <FlaskConical className="size-4" aria-hidden="true" /> {t("openSimulator")}
            </Link>
          ) : null
        }
      />

      {site && siteState ? (
        <>
          <p className="text-sm text-ink-2">
            {t("siteContext", { site: site.name })} · <span className="font-mono text-ink-3">{site.trackingId}</span>
            <span className="text-ink-3"> · {t("switchSiteHint")}</span>
          </p>
          <CoveragePanel summary={coverage} locale={locale} />
          <PolicyPanel site={{ id: site.id, name: site.name }} state={siteState} destinations={destinations} canManage={canManage} locale={locale} />
        </>
      ) : (
        <EmptyState
          title={t("noSite")}
          description={t("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("createSite")}
            </Link>
          }
        />
      )}

      <section aria-labelledby="consent-policies-title" className="space-y-4">
        <div>
          <h2 id="consent-policies-title" className="text-lg font-semibold text-ink">
            {t("policies.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-3">{t("policies.intro")}</p>
        </div>
        {orgPolicies.length === 0 ? (
          <p className="text-sm text-ink-3">{t("policies.empty")}</p>
        ) : (
          <Card variant="flat">
            <CardContent className="px-2 py-2 sm:px-3">
              <Table caption={t("policies.caption")}>
                <THead>
                  <Tr>
                    <Th>{t("policies.site")}</Th>
                    <Th>{t("policies.version")}</Th>
                    <Th>{t("policies.status")}</Th>
                    <Th>{t("policies.cmp")}</Th>
                    <Th>{t("policies.mode")}</Th>
                    <Th>{t("policies.updated")}</Th>
                    <Th>{t("policies.published")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {orgPolicies.map((p) => (
                    <Tr key={p.id}>
                      <Td label={t("policies.site")}>
                        <Link href={`/app/sites/${p.siteId}/setup`} className="font-medium text-ink hover:underline">
                          {p.siteName}
                        </Link>
                      </Td>
                      <Td label={t("policies.version")}>{t("policy.version", { version: p.version })}</Td>
                      <Td label={t("policies.status")}>
                        <Badge tone={statusTone[p.status]}>{t(`status.${p.status}`)}</Badge>
                      </Td>
                      <Td label={t("policies.cmp")}>{p.cmp?.provider ?? "api"}</Td>
                      <Td label={t("policies.mode")}>{p.consentMode.mode}</Td>
                      <Td label={t("policies.updated")}>{formatDate(p.updatedAt, locale, "short")}</Td>
                      <Td label={t("policies.published")}>{p.publishedAt ? formatDate(p.publishedAt, locale, "short") : "–"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("retention.title")}</CardTitle>
          <CardDescription>{t("retention.text")}</CardDescription>
        </CardHeader>
        <CardContent>
          {canRetention ? (
            <RetentionForm kinds={Object.entries(RETENTION_DEFAULT_DAYS).map(([kind, defaultDays]) => ({ kind, defaultDays }))} values={Object.fromEntries(privacy.retention.map((r) => [r.dataKind, r.days]))} />
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-3">
              {Object.entries(RETENTION_DEFAULT_DAYS).map(([kind, days]) => (
                <li key={kind}>
                  <span className="font-mono text-xs">{kind}</span>: {privacy.retention.find((r) => r.dataKind === kind)?.days ?? days} {t("retention.days").toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dsar.title")}</CardTitle>
          <CardDescription>{t("dsar.text")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canDsar ? <DsarForm /> : null}
          {privacy.requests.length === 0 ? (
            <p className="text-sm text-ink-3">{t("dsar.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {privacy.requests.map((r) => (
                <DsarRow key={r.id} request={r} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
