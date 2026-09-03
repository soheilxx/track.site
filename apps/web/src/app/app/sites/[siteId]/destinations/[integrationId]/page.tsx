import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DESTINATION_SETTING_KEYS } from "@track-site/ai";
import type { ConfigBundle } from "@track-site/config";
import { AFFILIATE_PRESETS, TEST_EVENT_HINTS, buildIntegrationMatrix, getConnector } from "@track-site/connectors";
import { defaultEnvironment, getIntegration, getOrCreateDraft, getSite, listCredentialRefs } from "@track-site/db";
import { STANDARD_EVENTS } from "@track-site/events";
import { DESTINATION_CLICK_IDS, DESTINATION_PURPOSE } from "@track-site/policy";
import { DestinationWizard } from "@/components/destinations/wizard";
import { requireOrgContext, withOrg } from "@/server/session";

export default async function DestinationWizardPage({ params, searchParams }: { params: Promise<{ siteId: string; integrationId: string }>; searchParams: Promise<{ oauth?: string }> }) {
  const { siteId, integrationId } = await params;
  const { oauth } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !/^[0-9a-f-]{36}$/i.test(integrationId)) notFound();
  const ctx = await requireOrgContext("integrations.read");
  const t = await getTranslations("destinations");
  const data = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, siteId);
    if (!site) return null;
    const integration = await getIntegration(tx, site.id, integrationId);
    if (!integration) return null;
    const envRow = await defaultEnvironment(tx, site.id);
    const draft = envRow ? await getOrCreateDraft(tx, { organizationId: ctx.organization.id, siteId: site.id, environmentId: envRow.id, createdBy: ctx.user.id }) : null;
    const refs = await listCredentialRefs(tx, integration.id);
    return { site, integration, draft, refs };
  });
  if (!data) notFound();
  const { site, integration, draft, refs } = data;
  const connector = getConnector(integration.connectorType);
  if (!connector) notFound();
  const row = buildIntegrationMatrix().find((r) => r.type === integration.connectorType)!;
  const dest = (draft?.bundle as ConfigBundle | undefined)?.destinations.find((d) => d.id === integration.id) ?? null;
  const preset = integration.connectorType === "affiliate" ? AFFILIATE_PRESETS[String(integration.publicConfig.preset ?? "")] : null;
  const requiredPublicIds = preset ? [...connector.meta.requiredPublicIds, ...preset.config.filter((c) => !c.secret).map((c) => ({ key: c.key, label: c.label, pattern: c.pattern, example: c.example, help: `${preset.name}: ${c.label}` }))] : connector.meta.requiredPublicIds;
  const requiredCredentials = preset
    ? preset.config
        .filter((c) => c.secret)
        .map((c) => ({ kind: c.key === "checksum_secret" ? "signing_secret" : c.key === "signature" ? "access_token" : "api_secret", label: `${preset.name}: ${c.label}`, help: preset.notes, oauth: null as string | null }))
        .concat(preset.auth.type === "basic" ? [{ kind: "api_secret", label: `${preset.name}: AuthToken`, help: "Basic authentication password (AccountSID is the public id).", oauth: null }] : [])
    : connector.meta.requiredCredentials.map((c) => ({ kind: c.kind, label: c.label, help: c.help, oauth: c.oauth?.provider ?? null }));
  const oauthNotice = oauth === "connected" ? t("wizard.connected") : oauth === "denied" ? "OAuth denied" : oauth === "not_configured" ? "OAuth for this provider is not configured on this platform (operator settings)." : oauth === "failed" ? "OAuth failed; try again." : oauth === "vault_missing" ? "Credential vault not configured." : null;
  return (
    <div className="space-y-4">
      <nav className="text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href={`/app/sites/${site.id}`} className="hover:underline">
          {site.name}
        </Link>{" "}
        / <Link href={`/app/sites/${site.id}/destinations`} className="hover:underline">{t("title")}</Link> / {integration.name}
      </nav>
      <h1 className="font-display text-2xl font-semibold text-ink">{integration.name}</h1>
      <DestinationWizard
        siteId={site.id}
        integration={{ id: integration.id, type: integration.connectorType, name: integration.name, status: integration.status, health: { status: integration.health.status, detail: integration.health.detail, checkedAt: integration.health.checkedAt }, testMode: integration.testMode, publicConfig: integration.publicConfig, settings: integration.settings }}
        connector={{ displayName: preset ? `${connector.meta.displayName} · ${preset.name}` : connector.meta.displayName, apiVersion: connector.meta.apiVersion, verifiedAt: preset ? (preset.verified === "network" ? "network documentation" : preset.verified) : connector.meta.verifiedAt, docsUrl: preset?.docsUrl ?? connector.meta.docsUrl, supportsBrowser: connector.meta.supportsBrowser, supportsServer: connector.meta.supportsServer, dedupField: connector.meta.dedupField, accessNote: preset ? `${preset.notes}${preset.verified === "network" ? " Confirm the parameter names with your network contact." : ""}` : (connector.meta.accessNote ?? null), requiredPublicIds, requiredCredentials, transfer: connector.meta.transfer }}
        purpose={integration.requiredPurpose ?? DESTINATION_PURPOSE[integration.connectorType]}
        clickIds={preset ? preset.clickIdParams : [...(DESTINATION_CLICK_IDS[integration.connectorType] ?? [])]}
        offline={row.offline}
        testHint={TEST_EVENT_HINTS[integration.connectorType] ?? ""}
        settingKeys={integration.connectorType === "affiliate" ? [] : (DESTINATION_SETTING_KEYS[integration.connectorType] ?? [])}
        credentials={refs.map((r) => ({ id: r.id, kind: r.kind, label: r.label, last4: r.last4, status: r.status }))}
        draft={dest ? { mode: dest.mode, enabled: dest.enabled, test_mode: dest.test_mode, mappings: dest.mappings.map((m) => ({ event: m.event, vendor_event: m.vendor_event, enabled: m.enabled })) } : null}
        standardEvents={STANDARD_EVENTS.map((e) => e.name)}
        oauthNotice={oauthNotice}
      />
    </div>
  );
}
