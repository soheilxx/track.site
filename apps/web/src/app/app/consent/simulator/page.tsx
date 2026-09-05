import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONNECTOR_TYPES } from "@track-site/policy";
import { Badge, Banner, Breadcrumbs, Card, CardContent, CardHeader, CardTitle, EmptyState, buttonVariants } from "@track-site/ui";
import { ConsentPageHeader } from "@/components/app/consent/page-header";
import { ShareLink } from "@/components/app/consent/share-link";
import { SimulationResults } from "@/components/app/consent/simulation-results";
import { SimulatorForm, type SimulatorDestinationOption, type SimulatorPolicyOption } from "@/components/app/consent/simulator-form";
import { intlLocale } from "@/lib/format";
import { loadSiteCustomEventNames, loadSiteDestinations, loadSitePolicyState } from "@/server/consent";
import {
  DEFAULT_SIMULATOR_INPUT,
  REGION_UNKNOWN,
  defaultSignalFor,
  filterEvents,
  parseSimulatorInput,
  selectDestinations,
  serializeSimulatorInput,
  simulate,
  simulatorEvents,
  sitePolicyFrom,
  type SimulatorInput,
  type SimulatorQuery,
} from "@/server/consent-simulator";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Consent Impact Simulator: the scenario lives in the URL (shareable, deterministic), the server
 * evaluates it with the real policy engine against the active site's draft or published policy and
 * its destinations. Clearly labelled as a simulation; no legal assessment.
 */
export default async function ConsentSimulatorPage({ searchParams }: { searchParams: Promise<SimulatorQuery> }) {
  const [query, ctx] = await Promise.all([searchParams, requireOrgContext("consent.read")]);
  const [t, tc, workspace] = await Promise.all([getTranslations("consent.simulator"), getTranslations("consent"), activeSite(ctx)]);
  const locale = ctx.user.locale;
  const site = workspace.site;
  const breadcrumbs = <Breadcrumbs label={t("breadcrumbLabel")} items={[{ label: t("back"), href: "/app/consent" }, { label: t("breadcrumb") }]} linkComponent={Link} />;

  if (!site) {
    return (
      <div className="space-y-6">
        <ConsentPageHeader title={t("title")} intro={t("intro")} badge={<Badge tone="violet">{t("badge")}</Badge>} breadcrumbs={breadcrumbs} />
        <EmptyState
          title={tc("noSite")}
          description={tc("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {tc("createSite")}
            </Link>
          }
        />
      </div>
    );
  }

  const [state, destinations, customNames] = await Promise.all([loadSitePolicyState(ctx, site.id), loadSiteDestinations(ctx, site.id), loadSiteCustomEventNames(ctx, site.id)]);
  const cmpProvider = (state.published ?? state.draft)?.cmp?.provider ?? null;
  const defaults: SimulatorInput = { ...DEFAULT_SIMULATOR_INPUT, policy: state.published ? "published" : "draft", signal: defaultSignalFor(cmpProvider) };
  const parsed = parseSimulatorInput(query, defaults);
  // a draft that does not exist falls back to the published version (or the platform default), never to an error
  const chosen = parsed.policy === "draft" && state.draft ? state.draft : (state.published ?? state.draft);
  const input: SimulatorInput = { ...parsed, policy: chosen?.status === "draft" ? "draft" : "published" };
  const policy = sitePolicyFrom(chosen ? { version: chosen.version, ...chosen.fields } : null);
  const selected = selectDestinations(input, destinations);
  const events = filterEvents(simulatorEvents(customNames), input.category);
  const result = simulate(input, policy, selected, events);
  const policyLabel = chosen ? (chosen.status === "draft" ? t("form.policyDraft", { version: chosen.version }) : t("form.policyPublished", { version: chosen.version })) : t("form.policyDefault");
  const sharePath = `/app/consent/simulator?${serializeSimulatorInput(input)}`;
  const countryName = input.region === REGION_UNKNOWN ? t("form.regionUnknown") : (safeRegionName(locale, input.region) ?? input.region);

  const policies: SimulatorPolicyOption[] = [
    { value: "published", version: state.published?.version ?? null },
    { value: "draft", version: state.draft?.version ?? null },
  ];
  const destinationOptions: SimulatorDestinationOption[] = destinations.map((d) => ({ id: d.id, name: d.name, connectorType: d.connectorType, status: d.status }));
  const present = new Set(destinations.map((d) => d.connectorType));
  const hypothetical = CONNECTOR_TYPES.filter((type) => !present.has(type));

  return (
    <div className="space-y-6">
      <ConsentPageHeader title={t("title")} intro={t("intro")} badge={<Badge tone="violet">{t("badge")}</Badge>} breadcrumbs={breadcrumbs} />
      <Banner tone="info" title={t("disclaimerTitle")}>
        {t("disclaimer")}
      </Banner>
      <p className="text-sm text-ink-2">
        {tc("siteContext", { site: site.name })} · <span className="font-mono text-ink-3">{site.trackingId}</span>
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* sticky only within the visible height of the main scroll area (header 3.5 rem + 1.5 rem above and below): a form taller
            than the viewport scrolls inside the card, so "Run simulation" is reachable without scrolling to the end of the results */}
        <Card className="self-start lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3.5rem-3rem)] lg:overflow-y-auto lg:overscroll-contain">
          <CardHeader>
            <CardTitle>{t("form.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SimulatorForm key={sharePath} input={input} defaults={defaults} policies={policies} destinations={destinationOptions} hypothetical={hypothetical} hasCustomEvents={customNames.length > 0} locale={locale} />
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-6">
          <h2 className="sr-only">{t("result.title")}</h2>
          <SimulationResults result={result} policyLabel={policyLabel} countryName={countryName} locale={locale} />
          <Card variant="flat">
            <CardHeader>
              <CardTitle>{t("share.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ShareLink path={sharePath} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function safeRegionName(locale: string, code: string): string | null {
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: "region" }).of(code) ?? null;
  } catch {
    return null;
  }
}
