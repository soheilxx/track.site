import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DESTINATION_PURPOSE, type ConnectorType } from "@track-site/policy";
import { Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, buttonVariants } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import type { ConsentPolicyView, SitePolicyState } from "@/server/consent";
import { DEFAULT_POLICY_FIELDS, EDITABLE_REGION_GROUPS, diffPolicyFields, effectiveDestinationPurpose, effectiveRegionMode, isWeaker, type PolicyFields } from "@/server/consent-policy";
import type { SimDestination } from "@/server/consent-simulator";
import { DraftEditor, type EditorConnector } from "./draft-editor";
import { connectorLabel, describeChange, purposeLabel, regionGroupLabel, regionModeLabel, type TranslateFn } from "./labels";
import { CreateDraftButton, DraftActions } from "./policy-actions";

interface PolicyPanelProps {
  site: { id: string; name: string };
  state: SitePolicyState;
  destinations: SimDestination[];
  canManage: boolean;
  locale: string;
}

/** The two versions that matter for the active site: what is live and what is being prepared. */
export async function PolicyPanel({ site, state, destinations, canManage, locale }: PolicyPanelProps) {
  const t = await getTranslations("consent.policy");
  const tc = await getTranslations("consent");
  const published = state.published;
  const draft = state.draft;
  const baseline = published ? published.fields : DEFAULT_POLICY_FIELDS;
  const siteTypes = Array.from(new Set(destinations.map((d) => d.connectorType)));
  const changes = draft ? diffPolicyFields(baseline, draft.fields) : [];
  const weaker = isWeaker(changes);
  const connectors: EditorConnector[] = Array.from(new Set<ConnectorType>([...siteTypes, ...(Object.keys(draft?.fields.destinationPurposes ?? {}) as ConnectorType[])]))
    .sort()
    .map((type) => ({ type, label: connectorLabel(tc, type), base: DESTINATION_PURPOSE[type], names: destinations.filter((d) => d.connectorType === type).map((d) => d.name) }));

  return (
    <section aria-labelledby="consent-policy-title" className="space-y-4">
      <div>
        <h2 id="consent-policy-title" className="text-lg font-semibold text-ink">
          {t("title", { site: site.name })}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{t("published")}</CardTitle>
              {published ? <Badge tone="ok">{t("version", { version: published.version })}</Badge> : <Badge tone="neutral">{t("platformDefault")}</Badge>}
            </div>
            {published?.publishedAt ? <CardDescription>{t("publishedAt", { date: formatDate(published.publishedAt, locale, "short") })}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            {published ? <PolicyFacts view={published} siteTypes={siteTypes} t={t} tc={tc} /> : <p className="text-sm text-ink-3">{t("noPublished")}</p>}
          </CardContent>
          <CardFooter className="flex-wrap">
            <Link href="/app/consent/simulator?policy=published" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {published ? t("simulatePublished") : t("simulateDefault")}
            </Link>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{t("draft")}</CardTitle>
              {draft ? <Badge tone="info">{t("version", { version: draft.version })}</Badge> : null}
            </div>
            {draft ? <CardDescription>{t("updatedAt", { date: formatDate(draft.updatedAt, locale, "short") })}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-5">
            {draft ? (
              <>
                <PolicyFacts view={draft} siteTypes={siteTypes} t={t} tc={tc} />
                <div>
                  <h3 className="text-sm font-semibold text-ink">{t("changes")}</h3>
                  {changes.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {changes.map((c) => (
                        <li key={`${c.kind}-${c.key}`} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                          <span>{describeChange(tc, c)}</span>
                          {c.weaker ? <Badge tone="warn">{t("weakerBadge")}</Badge> : <Badge tone="ok">{t("stricterBadge")}</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-ink-3">{t("noChanges")}</p>
                  )}
                </div>
                {canManage ? <DraftActions policyId={draft.id} version={draft.version} changes={changes.map((c) => ({ text: describeChange(tc, c), weaker: c.weaker }))} weaker={weaker} /> : null}
              </>
            ) : (
              <>
                <p className="text-sm text-ink-3">{t("noDraft")}</p>
                {canManage ? <CreateDraftButton siteId={site.id} /> : null}
              </>
            )}
          </CardContent>
          <CardFooter className="flex-wrap">
            {draft ? (
              <Link href="/app/consent/simulator?policy=draft" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {t("simulateDraft")}
              </Link>
            ) : null}
          </CardFooter>
        </Card>
      </div>
      {draft && canManage ? (
        <Card variant="flat">
          <CardContent>
            <DraftEditor policyId={draft.id} version={draft.version} fields={draft.fields} baseline={baseline} legalBasisNote={draft.legalBasisNote} connectors={connectors} />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

/** Region modes, destination purposes, operational events, CMP and consent mode of one version. */
function PolicyFacts({ view, siteTypes, t, tc }: { view: ConsentPolicyView; siteTypes: ConnectorType[]; t: TranslateFn; tc: TranslateFn }) {
  const fields: PolicyFields = view.fields;
  const types = Array.from(new Set<ConnectorType>([...siteTypes, ...(Object.keys(fields.destinationPurposes) as ConnectorType[])])).sort();
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6">
      <dt className="font-medium text-ink-2">{t("regionModes")}</dt>
      <dd>
        <ul className="flex flex-wrap gap-1.5">
          {EDITABLE_REGION_GROUPS.map((group) => {
            const mode = effectiveRegionMode(fields, group);
            return (
              <li key={group}>
                <Badge tone={mode === "strict_opt_in" ? "neutral" : "warn"}>
                  {regionGroupLabel(tc, group)}: {regionModeLabel(tc, mode)}
                </Badge>
              </li>
            );
          })}
        </ul>
      </dd>
      <dt className="font-medium text-ink-2">{t("destinationPurposes")}</dt>
      <dd className="text-ink">
        {types.length ? (
          <ul className="space-y-0.5">
            {types.map((type) => (
              <li key={type}>{t("requires", { destination: connectorLabel(tc, type), purpose: purposeLabel(tc, effectiveDestinationPurpose(fields, type)) })}</li>
            ))}
          </ul>
        ) : (
          <span className="text-ink-3">{t("noOverrides")}</span>
        )}
      </dd>
      <dt className="font-medium text-ink-2">{t("operationalEvents")}</dt>
      <dd className="text-ink">{fields.operationalEvents.length ? <span className="font-mono text-xs">{fields.operationalEvents.join(", ")}</span> : <span className="text-ink-3">{t("noOperational")}</span>}</dd>
      <dt className="font-medium text-ink-2">{t("cmp")}</dt>
      <dd className="text-ink">{view.cmp?.provider ?? <span className="text-ink-3">{t("cmpNone")}</span>}</dd>
      <dt className="font-medium text-ink-2">{t("consentMode")}</dt>
      <dd className="text-ink">{view.consentMode.mode}</dd>
      {view.legalBasisNote ? (
        <>
          <dt className="font-medium text-ink-2">{t("legalBasisNote")}</dt>
          <dd className="whitespace-pre-line text-ink-2">{view.legalBasisNote}</dd>
        </>
      ) : null}
    </dl>
  );
}
