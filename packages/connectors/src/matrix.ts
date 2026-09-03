import { CONNECTOR_TYPES, DESTINATION_CLICK_IDS, DESTINATION_PURPOSE, type ConnectorType } from "@track-site/policy";
import { AFFILIATE_PRESETS } from "./vendors/affiliate-presets.ts";
import { getConnector } from "./registry.ts";
import { API_VERSIONS } from "./versions.ts";

/**
 * Machine-checkable integration matrix. `pnpm --filter @track-site/connectors matrix` renders it to
 * docs/integrations-matrix.md; `matrix.test.ts` fails CI when a connector type is missing, unverified or
 * lacks a delivery path. Offline support lists the connectors whose API accepts non-web action sources.
 */
export interface MatrixRow {
  type: ConnectorType;
  displayName: string;
  browser: boolean;
  server: boolean;
  hybrid: boolean;
  offline: boolean;
  testEvents: string;
  dedup: string;
  clickIds: string[];
  publicIds: string[];
  credentials: string[];
  apiVersion: string;
  verifiedAt: string;
  docsUrl: string;
  purpose: string;
  accessNote: string | null;
  module: string;
}

const OFFLINE: Partial<Record<ConnectorType, boolean>> = { google_ads: true, gmp: true, microsoft: true, meta: true, pinterest: true, snapchat: true, tiktok: true, amazon: true, yahoo: true, linkedin: true };
export const TEST_EVENT_HINTS: Partial<Record<ConnectorType, string>> = {
  meta: "test_event_code (Events Manager → Test events)",
  ga4: "/debug/mp/collect validation + DebugView",
  google_ads: "validateOnly upload",
  tiktok: "test_event_code (Events Manager → Test events)",
  microsoft: "empty-batch probe; events visible in UET tag diagnostics",
  linkedin: "conversion-rule listing + 201 on stream",
  reddit: "test_mode flag",
  pinterest: "?test=true (Ads Manager → Test events)",
  snapchat: "/events/validate endpoint",
  x: "Events Manager test tab; /accounts probe",
  taboola: "unauthenticated 204; Realize conversion log",
  outbrain: "postback echo; Amplify conversion report",
  amazon: "empty-batch probe; Events Manager",
  spotify: "pixel endpoint probe; Ad Analytics conversions tab",
  quora: "token probe; Ads Manager events",
  yahoo: "token mint + DataX success/partial response",
  tradedesk: "endpoint probe (402 = unknown tag)",
  gmp: "Floodlight configuration read + batchinsert status[]",
  adroll: "dry_run=true",
  criteo: "errors[] in the always-200 response",
  affiliate: "network test modes (Awin testmode, Impact queued response)",
  webhook: "signed test payload",
};

export function buildIntegrationMatrix(): MatrixRow[] {
  return CONNECTOR_TYPES.map((type) => {
    const c = getConnector(type);
    if (!c) throw new Error(`connector ${type} is not registered`);
    const pin = API_VERSIONS[type as keyof typeof API_VERSIONS];
    return {
      type,
      displayName: c.meta.displayName,
      browser: c.meta.supportsBrowser,
      server: c.meta.supportsServer,
      hybrid: c.meta.supportsBrowser && c.meta.supportsServer,
      offline: Boolean(OFFLINE[type]),
      testEvents: TEST_EVENT_HINTS[type] ?? "",
      dedup: c.meta.dedupField ?? "n/a",
      clickIds: [...(DESTINATION_CLICK_IDS[type] ?? [])],
      publicIds: c.meta.requiredPublicIds.map((p) => p.key),
      credentials: c.meta.requiredCredentials.map((r) => (r.oauth ? `${r.kind} (OAuth ${r.oauth.provider})` : r.kind)),
      apiVersion: c.meta.apiVersion,
      verifiedAt: pin?.verifiedAt ?? c.meta.verifiedAt,
      docsUrl: c.meta.docsUrl,
      purpose: DESTINATION_PURPOSE[type],
      accessNote: c.meta.accessNote ?? null,
      module: type === "webhook" ? "packages/connectors/src/webhook.ts" : `packages/connectors/src/vendors/${type === "google_ads" ? "google-ads" : type}.ts`,
    };
  });
}

export function renderIntegrationMatrix(rows: MatrixRow[] = buildIntegrationMatrix()): string {
  const yes = (b: boolean) => (b ? "✅" : "—");
  const lines = [
    "# Integration matrix",
    "",
    `Generated from the connector registry on ${new Date().toISOString().slice(0, 10)}. Regenerate with \`pnpm --filter @track-site/connectors matrix\`; \`matrix.test.ts\` fails when a connector type is missing, unverified or lacks a delivery path.`,
    "",
    "| Destination | Type | Browser | Server | Hybrid | Offline | Dedup key | Click IDs | Public IDs | Credentials | API version | Verified | Test events | Module |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.displayName} | \`${r.type}\` | ${yes(r.browser)} | ${yes(r.server)} | ${yes(r.hybrid)} | ${yes(r.offline)} | \`${r.dedup}\` | ${r.clickIds.map((c) => `\`${c}\``).join(", ") || "—"} | ${r.publicIds.map((c) => `\`${c}\``).join(", ") || "—"} | ${r.credentials.join(", ") || "none"} | ${r.apiVersion} | ${r.verifiedAt} | ${r.testEvents} | [${r.module.split("/").pop()}](../${r.module}) |`),
    "",
    "## Vendor prerequisites",
    "",
    ...rows.filter((r) => r.accessNote).map((r) => `- **${r.displayName}**: ${r.accessNote}`),
    "",
    "## Affiliate presets",
    "",
    "| Preset | Method | Click ID | Verified | Docs |",
    "|---|---|---|---|---|",
    ...Object.values(AFFILIATE_PRESETS).map((p) => `| ${p.name} | ${p.method} | ${p.clickIdParams.map((c) => `\`${c}\``).join(", ")} | ${p.verified === "network" ? "network documentation (login) — confirm parameters" : p.verified} | [docs](${p.docsUrl}) |`),
    "",
    "## Deduplication",
    "",
    "Browser and server paths share the source event id (`dedupId`). Each connector writes it into the vendor's dedup field listed above (Meta `event_id`, TikTok `event_id`, Reddit `conversion_id`, X `conversion_id`, Pinterest/Snapchat `event_id`, Microsoft `eventId`, LinkedIn `eventId`, Yahoo `eventId`, Amazon `eventId`/`clientDedupeId`, Quora `event_id`); purchase-type events additionally carry the order id (GA4 `transaction_id`, Google Ads `orderId`, CM360 `ordinal`, affiliate networks `order id`), and the worker's own `event_dedup` guard drops repeated source events before delivery.",
    "",
  ];
  return lines.join("\n");
}
