# Integration matrix

Generated from the connector registry on 2026-09-03. Regenerate with `pnpm --filter @track-site/connectors matrix`; `matrix.test.ts` fails when a connector type is missing, unverified or lacks a delivery path.

| Destination | Type | Browser | Server | Hybrid | Offline | Dedup key | Click IDs | Public IDs | Credentials | API version | Verified | Test events | Module |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Generic webhook | `webhook` | — | ✅ | — | — | `id` | — | `url` | signing_secret | 1 | 2026-09-02 | signed test payload | [webhook.ts](../packages/connectors/src/webhook.ts) |
| Meta Ads (Facebook & Instagram) | `meta` | ✅ | ✅ | ✅ | ✅ | `event_id` | `fbclid` | `pixel_id` | access_token | v25.0 | 2026-09-02 | test_event_code (Events Manager → Test events) | [meta.ts](../packages/connectors/src/vendors/meta.ts) |
| Google Ads (Google tag + Conversions upload) | `google_ads` | ✅ | ✅ | ✅ | ✅ | `orderId` | `gclid`, `gbraid`, `wbraid` | `conversion_id`, `customer_id`, `login_customer_id` | oauth_refresh_token (OAuth google) | v25 | 2026-09-03 | validateOnly upload | [google-ads.ts](../packages/connectors/src/vendors/google-ads.ts) |
| Google Analytics 4 | `ga4` | ✅ | ✅ | ✅ | — | `transaction_id` | `gclid`, `gbraid`, `wbraid` | `measurement_id` | api_secret | mp-v2 | 2026-09-02 | /debug/mp/collect validation + DebugView | [ga4.ts](../packages/connectors/src/vendors/ga4.ts) |
| TikTok Ads (Pixel + Events API) | `tiktok` | ✅ | ✅ | ✅ | ✅ | `event_id` | `ttclid` | `pixel_id` | access_token | v1.3 | 2026-09-03 | test_event_code (Events Manager → Test events) | [tiktok.ts](../packages/connectors/src/vendors/tiktok.ts) |
| Microsoft Advertising (UET + Conversions API) | `microsoft` | ✅ | ✅ | ✅ | ✅ | `eventId` | `msclkid` | `uet_tag_id` | access_token | v1 | 2026-09-03 | empty-batch probe; events visible in UET tag diagnostics | [microsoft.ts](../packages/connectors/src/vendors/microsoft.ts) |
| LinkedIn Ads (Insight Tag + Conversions API) | `linkedin` | ✅ | ✅ | ✅ | ✅ | `eventId` | `li_fat_id` | `partner_id`, `ad_account_id` | oauth_access_token (OAuth linkedin) | 202608 | 2026-09-03 | conversion-rule listing + 201 on stream | [linkedin.ts](../packages/connectors/src/vendors/linkedin.ts) |
| Reddit Ads (Pixel + Conversions API) | `reddit` | ✅ | ✅ | ✅ | — | `conversion_id` | `rdt_cid` | `pixel_id` | access_token | v3 | 2026-09-03 | test_mode flag | [reddit.ts](../packages/connectors/src/vendors/reddit.ts) |
| Pinterest Ads (Tag + Conversions API) | `pinterest` | ✅ | ✅ | ✅ | ✅ | `event_id` | `epik` | `tag_id`, `ad_account_id` | access_token | v5 | 2026-09-03 | ?test=true (Ads Manager → Test events) | [pinterest.ts](../packages/connectors/src/vendors/pinterest.ts) |
| Snapchat Ads (Snap Pixel + Conversions API) | `snapchat` | ✅ | ✅ | ✅ | ✅ | `event_id` | `sccid` | `pixel_id` | access_token | v3 | 2026-09-03 | /events/validate endpoint | [snapchat.ts](../packages/connectors/src/vendors/snapchat.ts) |
| X Ads (Pixel + Conversion API) | `x` | ✅ | ✅ | ✅ | — | `conversion_id` | `twclid` | `pixel_id` | oauth_access_token (OAuth x), oauth_token_secret (OAuth x) | 12 | 2026-09-03 | Events Manager test tab; /accounts probe | [x.ts](../packages/connectors/src/vendors/x.ts) |
| Taboola (Realize pixel + S2S) | `taboola` | ✅ | ✅ | ✅ | — | `orderid` | `tblci` | `account_id` | none | log/3 | 2026-09-03 | unauthenticated 204; Realize conversion log | [taboola.ts](../packages/connectors/src/vendors/taboola.ts) |
| Outbrain (pixel + S2S) | `outbrain` | ✅ | ✅ | ✅ | — | `orderId` | `ob_click_id`, `dicbo` | `marketer_id` | none | unifiedPixel | 2026-09-03 | postback echo; Amplify conversion report | [outbrain.ts](../packages/connectors/src/vendors/outbrain.ts) |
| Amazon Ads (Ad Tag + Events API) | `amazon` | ✅ | ✅ | ✅ | ✅ | `eventId` | `maas` | `tag_id`, `account_id`, `region`, `data_set_name` | oauth_refresh_token (OAuth amazon) | events-v1 | 2026-09-03 (secondary: Commanders Act / MetaRouter references; portal renders client-side) | empty-batch probe; Events Manager | [amazon.ts](../packages/connectors/src/vendors/amazon.ts) |
| Spotify Ad Analytics (pixel + server-side) | `spotify` | ✅ | ✅ | ✅ | — | `n/a` | `spclid` | `pixel_id` | none | pixel-v1 | 2026-09-03 | pixel endpoint probe; Ad Analytics conversions tab | [spotify.ts](../packages/connectors/src/vendors/spotify.ts) |
| Quora Ads (Pixel + Conversion API) | `quora` | ✅ | ✅ | ✅ | — | `event_id` | `qclid` | `pixel_id`, `account_id` | access_token | v1 | 2026-09-03 (help center + Commanders Act reference; OpenAPI requires Quora Ads login) | token probe; Ads Manager events | [quora.ts](../packages/connectors/src/vendors/quora.ts) |
| Yahoo DSP (Dot tag + Conversions API) | `yahoo` | ✅ | ✅ | ✅ | ✅ | `eventId` | `yclid`, `vmcid` | `pixel_id`, `project_id` | client_id, client_secret | v1 | 2026-09-03 | token mint + DataX success/partial response | [yahoo.ts](../packages/connectors/src/vendors/yahoo.ts) |
| The Trade Desk (Universal Pixel + Real-Time Conversions) | `tradedesk` | ✅ | ✅ | ✅ | — | `order_id` | `ttd_uuid` | `advertiser_id`, `pixel_id`, `tracker_id` | none | realtimeconversion | 2026-09-03 (secondary: Tealium / Adobe / RudderStack references; partner portal requires login) | endpoint probe (402 = unknown tag) | [tradedesk.ts](../packages/connectors/src/vendors/tradedesk.ts) |
| Google Marketing Platform (CM360 / DV360 / SA360 Floodlight) | `gmp` | ✅ | ✅ | ✅ | ✅ | `ordinal` | `gclid`, `dclid`, `gbraid`, `wbraid` | `floodlight_configuration_id`, `profile_id` | oauth_refresh_token (OAuth google) | v5 | 2026-09-03 | Floodlight configuration read + batchinsert status[] | [gmp.ts](../packages/connectors/src/vendors/gmp.ts) |
| AdRoll (pixel + S2S Event API, beta) | `adroll` | ✅ | ✅ | ✅ | — | `event_attributes.order_id` | `adroll_clid` | `advertiser_id`, `pixel_id` | access_token | s2s-beta | 2026-09-03 | dry_run=true | [adroll.ts](../packages/connectors/src/vendors/adroll.ts) |
| Criteo (OneTag + server-side events) | `criteo` | ✅ | ✅ | ✅ | — | `id` | `crto_clid` | `account_id` | none | s2s_v1.0.0 | 2026-09-03 | errors[] in the always-200 response | [criteo.ts](../packages/connectors/src/vendors/criteo.ts) |
| Affiliate networks (server-to-server postbacks) | `affiliate` | — | ✅ | — | — | `order_id` | `aff_click_id`, `aff_sub_id`, `awc`, `cjevent`, `irclickid`, `tduid`, `ttl`, `utm_term` | `preset` | access_token (optional), api_secret (optional), signing_secret (optional), webhook_secret (optional) | postback-v1 | 2026-09-03 | network test modes (Awin testmode, Impact queued response) | [affiliate.ts](../packages/connectors/src/vendors/affiliate.ts) |

## Vendor prerequisites

- **Amazon Ads (Ad Tag + Events API)**: Amazon Ads API access requires an approved Login with Amazon application (platform-level) and conversion definitions created in the Ads account before events are accepted.
- **The Trade Desk (Universal Pixel + Real-Time Conversions)**: Server events are accepted only for pixels / event trackers defined in The Trade Desk platform for this advertiser; unknown tags return HTTP 402.
- **AdRoll (pixel + S2S Event API, beta)**: The AdRoll Server-to-Server Event API is in beta: request access and a Server Access Token from your NextRoll account manager before enabling server delivery. The pixel works without it.

## Affiliate presets

| Preset | Method | Click ID | Verified | Docs |
|---|---|---|---|---|
| Awin | GET | `awc` | 2026-09-03 | [docs](https://help.awin.com/developers/docs/implementing-sales-tracking) |
| CJ Affiliate | GET | `cjevent` | network documentation (login) — confirm parameters | [docs](https://developers.cj.com/docs/advertiser-site-tracking/cj-leads-integration) |
| impact.com | POST_FORM | `irclickid` | 2026-09-03 | [docs](https://integrations.impact.com/brand-api-reference/reference/conversions/conversions) |
| TradeTracker | GET | `tt`, `ttid` | network documentation (login) — confirm parameters | [docs](https://tradetracker.com/) |
| Tradedoubler | GET | `tduid` | 2026-09-03 | [docs](https://dev.tradedoubler.com/tracking/advertiser/) |
| Partnerize | GET | `clickref` | 2026-09-03 | [docs](https://help.phgsupport.com/hc/en-us/articles/360020395238-Tracking-Partnerize-Server-to-Server-S2S-Integration) |
| Rakuten Advertising | GET | `ranSiteID`, `ransiteid` | network documentation (login) — confirm parameters | [docs](https://pubhelp.rakutenadvertising.com/hc/en-us/articles/14927247605517-Understand-Tracking-Technology) |
| Webgains | POST_JSON | `wgu` | 2026-09-03 | [docs](https://knowledgehub.webgains.com/home/server-to-server-tracking) |
| Digistore24 | GET | `ds24_cid`, `cid` | network documentation (login) — confirm parameters | [docs](https://help.digistore24.com/hc/en-us/articles/24293288047761-S2S-Postback) |
| ADCELL | GET | `bid`, `adcell_bid` | network documentation (login) — confirm parameters | [docs](https://github.com/ADCELL/adcell-gtm-conversiontracking) |
| belboon | GET | `bbclid`, `clickid` | network documentation (login) — confirm parameters | [docs](https://faq.belboon.com/en/knowledge-base/tracking/) |
| TUNE (HasOffers) | GET | `transaction_id`, `tune_tid` | 2026-09-03 | [docs](https://support.tune.com/hc/en-us/articles/1500008230702-Server-Postback-Tracking-Implementation) |
| Everflow | GET | `_ef_transaction_id`, `ef_transaction_id` | 2026-09-03 | [docs](https://helpdesk.everflow.io/customer/introduction-to-partner-advertiser-postbacks) |
| Custom postback | GET | `aff_click_id`, `aff_sub_id` | 2026-09-03 | [docs](https://track.site/docs/connectors/affiliate-postbacks) |

## Deduplication

Browser and server paths share the source event id (`dedupId`). Each connector writes it into the vendor's dedup field listed above (Meta `event_id`, TikTok `event_id`, Reddit `conversion_id`, X `conversion_id`, Pinterest/Snapchat `event_id`, Microsoft `eventId`, LinkedIn `eventId`, Yahoo `eventId`, Amazon `eventId`/`clientDedupeId`, Quora `event_id`); purchase-type events additionally carry the order id (GA4 `transaction_id`, Google Ads `orderId`, CM360 `ordinal`, affiliate networks `order id`), and the worker's own `event_dedup` guard drops repeated source events before delivery.
