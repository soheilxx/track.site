/**
 * Affiliate network postback presets. Every preset is a declarative request template rendered by the
 * affiliate connector: `{placeholders}` are replaced with event/config values, URL-encoded per position.
 * `verified` cites the primary documentation the template was checked against on the given date; presets marked
 * `verified: "network"` follow the network's advertiser documentation which is only available after login — the
 * wizard shows the template for confirmation with the network contact and every parameter can be edited per site.
 */
import type { CredentialKind, CredentialRequirement } from "../connector.ts";

export type AffiliateMethod = "GET" | "POST_FORM" | "POST_JSON";

/** vault credential kinds an affiliate destination can store; every secret field names the kind it is read from */
export type AffiliateCredentialKind = Extract<CredentialKind, "access_token" | "api_secret" | "signing_secret" | "webhook_secret">;

export interface AffiliatePublicField {
  key: string;
  label: string;
  pattern: string;
  example: string;
  /** entered in the wizard or chat and stored in publicConfig */
  secret?: false;
}

export interface AffiliateSecretField {
  key: string;
  label: string;
  pattern: string;
  example: string;
  /** stored in the vault through the secure credential card, never in publicConfig or chat */
  secret: true;
  /** vault credential kind the connector reads the value from (`ctx.getCredential(credential)`) */
  credential: AffiliateCredentialKind;
  /** the postback is delivered without the value (a network feature that is off by default) */
  optional?: boolean;
}

export type AffiliateConfigField = AffiliatePublicField | AffiliateSecretField;

export function isSecretField(field: AffiliateConfigField): field is AffiliateSecretField {
  return field.secret === true;
}

export interface AffiliatePreset {
  id: string;
  name: string;
  method: AffiliateMethod;
  /** URL template; may contain placeholders in the path (Partnerize) or query */
  url: string;
  /** query/form/json parameters as placeholder templates; empty rendered values are omitted */
  params: Record<string, string>;
  /** JSON body template for POST_JSON presets (rendered recursively) */
  json?: Record<string, unknown>;
  auth: { type: "none" } | { type: "basic"; userField: string; passwordCredential: "api_secret"; passwordLabel: string } | { type: "bearer"; credential: "access_token" } | { type: "query"; param: string; credential: "access_token" };
  /** which captured click id feeds `{click_id}` */
  clickIdParams: string[];
  /** site-level config keys the preset needs (public ids in the wizard / chat, secrets through the secure credential card) */
  config: AffiliateConfigField[];
  /** canonical events the preset sends; others are skipped unless mapped explicitly */
  events: string[];
  signature?: "tradedoubler" | null;
  /** postbacks are only attributable with a click id */
  requiresClickId: boolean;
  docsUrl: string;
  verified: string;
  notes: string;
}

export const AFFILIATE_PRESETS: Record<string, AffiliatePreset> = {
  awin: {
    id: "awin",
    name: "Awin",
    method: "GET",
    url: "https://www.awin1.com/sread.php",
    params: { tt: "ss", tv: "2", merchant: "{merchant_id}", amount: "{value}", ch: "aw", cr: "{currency}", ref: "{order_id}", parts: "{commission_group}:{value}", vc: "{voucher}", cks: "{click_id}", testmode: "{test_mode}" },
    auth: { type: "none" },
    clickIdParams: ["awc"],
    config: [
      { key: "merchant_id", label: "Advertiser ID", pattern: "^[0-9]{3,10}$", example: "12345" },
      { key: "commission_group", label: "Commission group", pattern: "^[A-Z0-9_]{1,40}$", example: "DEFAULT" },
    ],
    events: ["purchase", "generate_lead", "sign_up"],
    requiresClickId: true,
    docsUrl: "https://help.awin.com/developers/docs/implementing-sales-tracking",
    verified: "2026-09-03",
    notes: "awc click id captured from the landing page and stored first-party; testmode=1 while the destination is in test mode.",
  },
  cj: {
    id: "cj",
    name: "CJ Affiliate",
    method: "GET",
    url: "https://www.emjcd.com/u",
    params: { CID: "{enterprise_id}", TYPE: "{action_id}", METHOD: "S2S", SIGNATURE: "{signature}", CJEVENT: "{click_id}", OID: "{order_id}", CURRENCY: "{currency}", AMOUNT: "{value}", DISCOUNT: "{discount}", COUPON: "{voucher}", eventTime: "{timestamp_iso}" },
    auth: { type: "none" },
    clickIdParams: ["cjevent"],
    config: [
      { key: "enterprise_id", label: "Enterprise ID (CID)", pattern: "^[0-9]{4,10}$", example: "1234567" },
      { key: "action_id", label: "Action ID (TYPE)", pattern: "^[0-9]{4,10}$", example: "402340" },
      { key: "signature", label: "Personal access token (SIGNATURE)", pattern: "^.{10,}$", example: "", secret: true, credential: "access_token" },
    ],
    events: ["purchase", "generate_lead", "sign_up"],
    requiresClickId: true,
    docsUrl: "https://developers.cj.com/docs/advertiser-site-tracking/cj-leads-integration",
    verified: "network",
    notes: "cjevent captured on landing and stored in the cje cookie (13 months); item-level ITEMn/AMTn/QTYn appended from the basket.",
  },
  impact: {
    id: "impact",
    name: "impact.com",
    method: "POST_FORM",
    url: "https://api.impact.com/Advertisers/{account_sid}/Conversions",
    params: { CampaignId: "{campaign_id}", ActionTrackerId: "{action_tracker_id}", EventDate: "{timestamp_iso}", OrderId: "{order_id}", ClickId: "{click_id}", CurrencyCode: "{currency}", Amount: "{value}", OrderPromoCode: "{voucher}", CustomerEmail: "{email_sha256}", CustomerStatus: "{customer_status}" },
    auth: { type: "basic", userField: "account_sid", passwordCredential: "api_secret", passwordLabel: "AuthToken (Basic auth password)" },
    clickIdParams: ["irclickid"],
    config: [
      { key: "account_sid", label: "Account SID", pattern: "^IR[A-Za-z0-9]{10,40}$", example: "IRabc123" },
      { key: "campaign_id", label: "Program (campaign) ID", pattern: "^[0-9]{3,10}$", example: "12345" },
      { key: "action_tracker_id", label: "Action tracker ID", pattern: "^[0-9]{3,10}$", example: "23456" },
    ],
    events: ["purchase", "generate_lead", "sign_up", "start_trial", "subscribe"],
    requiresClickId: false,
    docsUrl: "https://integrations.impact.com/brand-api-reference/reference/conversions/conversions",
    verified: "2026-09-03",
    notes: "Basic auth AccountSID:AuthToken; one attribution key required (ClickId=irclickid or CustomerId); items sent as ItemSku/ItemName/ItemQuantity/ItemPrice.",
  },
  tradetracker: {
    id: "tradetracker",
    name: "TradeTracker",
    method: "GET",
    url: "https://ts.tradetracker.net/",
    params: { cid: "{campaign_id}", pid: "{product_id}", tid: "{order_id}", data: "{value}", currency: "{currency}", descrMerchant: "{event_name}", descrAffiliate: "{voucher}", ttid: "{click_id}" },
    auth: { type: "none" },
    clickIdParams: ["tt", "ttid"],
    config: [
      { key: "campaign_id", label: "Campaign ID", pattern: "^[0-9]{3,10}$", example: "12345" },
      { key: "product_id", label: "Product (conversion) ID", pattern: "^[0-9]{3,10}$", example: "23456" },
    ],
    events: ["purchase", "generate_lead", "sign_up"],
    requiresClickId: true,
    docsUrl: "https://tradetracker.com/",
    verified: "network",
    notes: "TradeTracker publishes the advertiser tracking spec after login; confirm parameter names with your account manager.",
  },
  tradedoubler: {
    id: "tradedoubler",
    name: "Tradedoubler",
    method: "GET",
    url: "https://tbs.tradedoubler.com/report",
    params: { organization: "{organization_id}", event: "{event_id}", orderNumber: "{order_id}", orderValue: "{value}", currency: "{currency}", tduid: "{click_id}", voucher: "{voucher}", checksum: "{signature}", extid: "{email_sha256}", exttype: "1", reportInfo: "{basket_f}" },
    auth: { type: "none" },
    clickIdParams: ["tduid"],
    config: [
      { key: "organization_id", label: "Organization ID", pattern: "^[0-9]{3,10}$", example: "12345" },
      { key: "event_id", label: "Event ID", pattern: "^[0-9]{3,10}$", example: "23456" },
      { key: "checksum_secret", label: "Checksum secret code", pattern: "^.{4,}$", example: "", secret: true, credential: "signing_secret" },
    ],
    events: ["purchase", "generate_lead", "sign_up"],
    signature: "tradedoubler",
    requiresClickId: true,
    docsUrl: "https://dev.tradedoubler.com/tracking/advertiser/",
    verified: "2026-09-03",
    notes: "tduid captured from the landing page, stored 365 days; checksum = 'v04' + md5(secret + orderNumber + orderValue); leads use tbl.tradedoubler.com/report with leadNumber.",
  },
  partnerize: {
    id: "partnerize",
    name: "Partnerize",
    method: "GET",
    url: "https://prf.hn/conversion/tracking_mode:api/campaign:{campaign_id}/clickref:{click_id}/conversionref:{order_id}/currency:{currency}/country:{country}/customertype:{customer_status}/voucher:{voucher}/conversion_time:{timestamp_pz}/{items_pz}",
    params: {},
    auth: { type: "none" },
    clickIdParams: ["clickref"],
    config: [{ key: "campaign_id", label: "Campaign ID", pattern: "^[0-9a-z]{5,20}$", example: "10abc1234" }],
    events: ["purchase", "generate_lead", "sign_up", "subscribe"],
    requiresClickId: true,
    docsUrl: "https://help.phgsupport.com/hc/en-us/articles/360020395238-Tracking-Partnerize-Server-to-Server-S2S-Integration",
    verified: "2026-09-03",
    notes: "Path-style parameters; items rendered as [category:x/sku:y/value:z/quantity:n] containers; conversion_time in UTC.",
  },
  rakuten: {
    id: "rakuten",
    name: "Rakuten Advertising",
    method: "GET",
    url: "https://track.linksynergy.com/ep",
    params: { mid: "{merchant_id}", ord: "{order_id}", cur: "{currency}", skulist: "{items_skulist}", qlist: "{items_qlist}", amtlist: "{items_amtlist}", namelist: "{items_namelist}", tr: "{click_id}", land: "{landing_date}", date: "{timestamp_compact}" },
    auth: { type: "none" },
    clickIdParams: ["ranSiteID", "ransiteid"],
    config: [{ key: "merchant_id", label: "Merchant ID (MID)", pattern: "^[0-9]{3,10}$", example: "12345" }],
    events: ["purchase"],
    requiresClickId: true,
    docsUrl: "https://pubhelp.rakutenadvertising.com/hc/en-us/articles/14927247605517-Understand-Tracking-Technology",
    verified: "network",
    notes: "Rakuten shares the S2S specification with advertisers on request; pipe-delimited item lists (skulist/qlist/amtlist in cents).",
  },
  webgains: {
    id: "webgains",
    name: "Webgains",
    method: "POST_JSON",
    url: "https://api.webgains.io/queue-conversion",
    params: {},
    json: { ids: [{ name: "s2s", value: "{click_id}" }], programId: "{program_id}", value: "{value}", currency: "{currency}", orderReference: "{order_id}", voucherId: "{voucher}", location: "{url}", customerType: "{customer_status}", customerId: "{email_sha256}", items: "{items_webgains}" },
    auth: { type: "none" },
    clickIdParams: ["wgu"],
    config: [{ key: "program_id", label: "Program ID", pattern: "^[0-9]{3,10}$", example: "12345" }],
    events: ["purchase", "generate_lead", "sign_up"],
    requiresClickId: true,
    docsUrl: "https://knowledgehub.webgains.com/home/server-to-server-tracking",
    verified: "2026-09-03",
    notes: "wgu click id captured from the landing page; JSON POST with ids[{name:'s2s', value}].",
  },
  digistore24: {
    id: "digistore24",
    name: "Digistore24",
    method: "GET",
    url: "https://www.digistore24.com/tracking/conversion",
    params: { cid: "{click_id}", order_id: "{order_id}", amount: "{value}", currency: "{currency}", event: "{event_name}" },
    auth: { type: "none" },
    clickIdParams: ["ds24_cid", "cid"],
    config: [],
    events: ["purchase"],
    requiresClickId: true,
    docsUrl: "https://help.digistore24.com/hc/en-us/articles/24293288047761-S2S-Postback",
    verified: "network",
    notes: "Digistore24 primarily pushes S2S postbacks to the advertiser (inbound: configure https://api.<site>/v1/affiliate/in/digistore24 in Account → S2S Postback); outgoing template for vendors using external checkouts.",
  },
  adcell: {
    id: "adcell",
    name: "ADCELL",
    method: "GET",
    url: "https://t.adcell.com/t/track",
    params: { pid: "{program_id}", eid: "{event_id}", referenz: "{order_id}", betrag: "{value}", bid: "{click_id}", gutscheincode: "{voucher}", currency: "{currency}" },
    auth: { type: "none" },
    clickIdParams: ["bid", "adcell_bid"],
    config: [
      { key: "program_id", label: "Program ID (pid)", pattern: "^[0-9]{3,10}$", example: "1234" },
      { key: "event_id", label: "Event ID (eid)", pattern: "^[0-9]{3,10}$", example: "5678" },
    ],
    events: ["purchase", "generate_lead", "sign_up"],
    requiresClickId: true,
    docsUrl: "https://github.com/ADCELL/adcell-gtm-conversiontracking",
    verified: "network",
    notes: "Parameter names follow the ADCELL tracking code (pid, eid, referenz, betrag, bid); confirm the S2S endpoint with ADCELL support.",
  },
  belboon: {
    id: "belboon",
    name: "belboon",
    method: "GET",
    url: "https://tracking.belboon.com/s2s",
    params: { clickid: "{click_id}", order_id: "{order_id}", amount: "{value}", currency: "{currency}", event: "{event_name}", voucher: "{voucher}" },
    auth: { type: "none" },
    clickIdParams: ["bbclid", "clickid"],
    config: [],
    events: ["purchase", "generate_lead", "sign_up"],
    requiresClickId: true,
    docsUrl: "https://faq.belboon.com/en/knowledge-base/tracking/",
    verified: "network",
    notes: "belboon's S2S tracking is clickID-based; the endpoint and parameter names are provided by belboon on setup and editable here.",
  },
  tune: {
    id: "tune",
    name: "TUNE (HasOffers)",
    method: "GET",
    url: "https://{network_domain}/aff_lsr",
    params: { transaction_id: "{click_id}", amount: "{value}", adv_sub: "{order_id}", goal_id: "{goal_id}", security_token: "{security_token}", datetime: "{timestamp_sql}" },
    auth: { type: "none" },
    clickIdParams: ["transaction_id", "tune_tid"],
    config: [
      { key: "network_domain", label: "Network tracking domain", pattern: "^[a-z0-9.-]+\\.[a-z]{2,}$", example: "network.go2cloud.org" },
      { key: "goal_id", label: "Goal ID (optional)", pattern: "^([0-9]{1,10})?$", example: "" },
      { key: "security_token", label: "Security token (optional)", pattern: "^.{0,64}$", example: "", secret: true, credential: "api_secret", optional: true },
    ],
    events: ["purchase", "generate_lead", "sign_up", "start_trial"],
    requiresClickId: true,
    docsUrl: "https://support.tune.com/hc/en-us/articles/1500008230702-Server-Postback-Tracking-Implementation",
    verified: "2026-09-03",
    notes: "transaction_id captured from the tracking link on landing; datetime as YYYY-MM-DD HH:MM:SS.",
  },
  everflow: {
    id: "everflow",
    name: "Everflow",
    method: "GET",
    url: "https://{network_domain}/",
    params: { nid: "{network_id}", transaction_id: "{click_id}", amount: "{value}", order_id: "{order_id}", verification_token: "{security_token}", adv1: "{event_name}" },
    auth: { type: "none" },
    clickIdParams: ["_ef_transaction_id", "ef_transaction_id"],
    config: [
      { key: "network_domain", label: "Network tracking domain", pattern: "^[a-z0-9.-]+\\.[a-z]{2,}$", example: "www.eftrackall.com" },
      { key: "network_id", label: "Network ID (nid)", pattern: "^[0-9]{1,10}$", example: "1" },
      { key: "security_token", label: "Verification token (optional)", pattern: "^.{0,64}$", example: "", secret: true, credential: "api_secret", optional: true },
    ],
    events: ["purchase", "generate_lead", "sign_up", "start_trial"],
    requiresClickId: true,
    docsUrl: "https://helpdesk.everflow.io/customer/introduction-to-partner-advertiser-postbacks",
    verified: "2026-09-03",
    notes: "_ef_transaction_id captured from the tracking link; verification_token when enabled for the advertiser.",
  },
  custom: {
    id: "custom",
    name: "Custom postback",
    method: "GET",
    url: "{postback_url}",
    params: {},
    auth: { type: "none" },
    clickIdParams: ["aff_click_id", "aff_sub_id"],
    config: [{ key: "postback_url", label: "Postback URL template", pattern: "^https://.{5,}$", example: "https://network.example/postback?cid={click_id}&amount={value}&order={order_id}" }],
    events: ["purchase", "generate_lead", "sign_up", "subscribe", "start_trial", "contact", "book_appointment", "download", "custom_event"],
    requiresClickId: false,
    docsUrl: "https://track.site/docs/connectors/affiliate-postbacks",
    verified: "2026-09-03",
    notes: "Any network with a documented postback URL: placeholders {click_id} {order_id} {value} {currency} {event_name} {timestamp_iso} {email_sha256} {voucher} {quantity}.",
  },
};

export const AFFILIATE_PLACEHOLDERS = [
  "click_id",
  "order_id",
  "value",
  "currency",
  "event_name",
  "quantity",
  "voucher",
  "discount",
  "email_sha256",
  "customer_status",
  "country",
  "url",
  "timestamp_iso",
  "timestamp_ms",
  "timestamp_s",
  "timestamp_sql",
  "timestamp_compact",
  "timestamp_pz",
  "landing_date",
  "test_mode",
  "items_skulist",
  "items_qlist",
  "items_amtlist",
  "items_namelist",
  "items_pz",
  "items_webgains",
  "basket_f",
  "signature",
] as const;

export interface AffiliateCredentialRequirement extends CredentialRequirement {
  kind: AffiliateCredentialKind;
  optional: boolean;
}

const INBOUND_ROUTE = "/v1/affiliate/in/{trackingId}/{preset}";

const KIND_LABELS: Record<AffiliateCredentialKind, string> = {
  access_token: "Network personal access token",
  api_secret: "Network API secret / security token",
  signing_secret: "Checksum secret / IPN passphrase",
  webhook_secret: "Inbound postback token",
};

/**
 * Credential requirements of one preset, or — with `null` — the union every preset can store, all marked
 * `optional` because which ones apply depends on `publicConfig.preset`. Outbound secrets come from the preset's
 * secret config fields and auth block; inbound postbacks (`/v1/affiliate/in/:trackingId/:preset`, apps/collector)
 * authenticate with the Digistore24 IPN passphrase (`signing_secret`) or a shared token (`webhook_secret`) and are
 * optional for every preset. The connector, the credential route, the wizard and the assistant tools read this list.
 */
export function affiliateCredentialRequirements(preset: AffiliatePreset | null): AffiliateCredentialRequirement[] {
  if (!preset) return unionRequirements();
  const out: AffiliateCredentialRequirement[] = [];
  for (const field of preset.config.filter(isSecretField)) {
    out.push({
      kind: field.credential,
      label: `${preset.name}: ${field.label}`,
      help: field.optional ? `Optional: the ${preset.name} postback is delivered without it. ${preset.notes}` : `Required by ${preset.name} for every postback. ${preset.notes}`,
      secret: true,
      oauth: null,
      optional: field.optional === true,
    });
  }
  if (preset.auth.type === "basic") {
    out.push({ kind: preset.auth.passwordCredential, label: `${preset.name}: ${preset.auth.passwordLabel}`, help: `Basic authentication password; the user name is the public id \`${preset.auth.userField}\`.`, secret: true, oauth: null, optional: false });
  }
  if (preset.auth.type === "bearer" || preset.auth.type === "query") {
    out.push({ kind: preset.auth.credential, label: `${preset.name}: API token`, help: preset.auth.type === "bearer" ? "Sent as the Authorization: Bearer header." : `Sent as the \`${preset.auth.param}\` query parameter.`, secret: true, oauth: null, optional: false });
  }
  const inboundUrl = INBOUND_ROUTE.replace("{preset}", preset.id);
  if (preset.id === "digistore24") {
    out.push({ kind: "signing_secret", label: `${preset.name}: IPN passphrase (inbound postbacks)`, help: `Only for postbacks ${preset.name} pushes to ${inboundUrl}: the passphrase configured in Digistore24 → S2S Postback, used to verify sha_sign.`, secret: true, oauth: null, optional: true });
  } else {
    out.push({ kind: "webhook_secret", label: `${preset.name}: inbound postback token`, help: `Only when ${preset.name} pushes conversions to ${inboundUrl}: shared token sent as the \`token\` query parameter or the \`x-tracksite-token\` header.`, secret: true, oauth: null, optional: true });
  }
  return out;
}

function unionRequirements(): AffiliateCredentialRequirement[] {
  const byKind = new Map<AffiliateCredentialKind, { required: string[]; optional: string[] }>();
  for (const preset of Object.values(AFFILIATE_PRESETS)) {
    for (const r of affiliateCredentialRequirements(preset)) {
      const entry = byKind.get(r.kind) ?? { required: [], optional: [] };
      (r.optional ? entry.optional : entry.required).push(preset.name);
      byKind.set(r.kind, entry);
    }
  }
  const list = (names: string[]) => (names.length > 5 ? `${names.length} presets incl. ${names.slice(0, 3).join(", ")}` : names.join(", "));
  return (Object.keys(KIND_LABELS) as AffiliateCredentialKind[])
    .filter((kind) => byKind.has(kind))
    .map((kind) => {
      const { required, optional } = byKind.get(kind) ?? { required: [], optional: [] };
      const parts = [required.length ? `required by ${list(required)}` : null, optional.length ? `optional for ${list(optional)}` : null].filter((p): p is string => p !== null);
      return { kind, label: KIND_LABELS[kind], help: `Depends on the selected network preset: ${parts.join("; ")}. Other presets do not use it — select the preset first and store only the credentials listed for it.`, secret: true, oauth: null, optional: true };
    });
}
