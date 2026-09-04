import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Alert,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  buttonVariants,
} from "@track-site/ui";
import { EvidenceBadge } from "@/components/app/insights/evidence";
import { count } from "@/components/app/insights/format";
import { InsightsPageHeader } from "@/components/app/insights/page-header";
import { AUDIENCE_SAMPLE_LIMIT, audienceInsights } from "@/server/insights";
import { switchToSiteAndOpenAudiencesAction } from "@/server/insights-actions";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

export const dynamic = "force-dynamic";

/**
 * Consent-aware audiences (moved from /app/audiences): segments derived on read from first-party
 * events of the last 30 days with marketing consent. Nothing is exported from here — advertising
 * platforms receive only the per-event server conversions the visitor consented to. A legacy
 * `?site=` (old bookmarks, carried over by the 308 shim) never re-scopes the data — the page offers
 * a switch of the active workspace instead, like the events explorer.
 */
export default async function AudiencesPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string | string[] }>;
}) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("insights.audiences");
  const tn = await getTranslations("insights.noSite");
  const locale = await getLocale();
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <EmptyState
          title={tn("title")}
          description={tn("text")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {tn("action")}
            </Link>
          }
        />
      </div>
    );
  }
  const site = workspace.site;
  const legacySite = Array.isArray(q.site) ? q.site[0] : q.site;
  const otherSite =
    legacySite && legacySite !== site.id
      ? (workspace.sites.find((s) => s.id === legacySite) ?? null)
      : null;
  const data = await audienceInsights(ctx, {
    siteId: site.id,
    environmentId: workspace.environment?.id ?? null,
  });
  return (
    <div className="space-y-8">
      <InsightsPageHeader
        title={t("title")}
        intro={t("intro", { limit: count(AUDIENCE_SAMPLE_LIMIT, locale) })}
        site={site}
        environment={workspace.environment}
      />
      {otherSite ? (
        <Banner
          tone="info"
          title={t("workspaceBanner.text", { site: otherSite.name })}
          action={
            <form action={switchToSiteAndOpenAudiencesAction}>
              <input type="hidden" name="siteId" value={otherSite.id} />
              <Button type="submit" size="sm" variant="secondary">
                {t("workspaceBanner.switch", { site: otherSite.name })}
              </Button>
            </form>
          }
        />
      ) : null}
      {data.considered === 0 ? (
        <EmptyState
          title={t("empty.title")}
          description={t("empty.text")}
          action={
            <Link href="/app/events" className={buttonVariants()}>
              {t("empty.action")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            <Alert tone="info">{t("consentNote", { n: count(data.withoutConsent, locale) })}</Alert>
            {data.withoutIdentity > 0 ? (
              <Alert tone="info">
                {t("identityNote", { n: count(data.withoutIdentity, locale) })}
              </Alert>
            ) : null}
            {data.truncated ? (
              <Alert tone="warn">
                {t("truncated", { limit: count(AUDIENCE_SAMPLE_LIMIT, locale) })}
              </Alert>
            ) : null}
          </div>
          <section aria-labelledby="segments-title" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="segments-title" className="text-base font-semibold text-ink">
                {t("segmentsTitle")}
              </h2>
              <EvidenceBadge kind="observed" />
            </div>
            <Table caption={t("caption")}>
              <THead>
                <tr>
                  <Th>{t("columns.segment")}</Th>
                  <Th className="text-right">{t("columns.size")}</Th>
                  <Th>{t("columns.events")}</Th>
                </tr>
              </THead>
              <TBody>
                {data.segments.map((s) => (
                  <Tr key={s.key}>
                    <Td label={t("columns.segment")} className="font-medium text-ink">
                      {t(`segments.${s.key}`)}
                    </Td>
                    <Td label={t("columns.size")} numeric>
                      {count(s.size, locale)}
                    </Td>
                    <Td label={t("columns.events")} className="font-mono text-xs text-ink-2">
                      {s.events}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </section>
        </>
      )}
      <Card variant="flat">
        <CardHeader>
          <CardTitle>{t("howTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-2">
          <p>{t("how1")}</p>
          <p>{t("how2")}</p>
          <p>{t("how3")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
