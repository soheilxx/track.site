# 09 — Integrations handover

Status date: 2026-09-03. Companion to the generated [integration matrix](./integrations-matrix.md) (`pnpm --filter @track-site/connectors matrix`) and the machine check `packages/connectors/src/matrix.test.ts`.

## 1. The 20 integration areas and where they live

| # | Area | Browser tag | Server API | Module | API version (pin) |
|---|---|---|---|---|---|
| 1 | Meta (Pixel + Conversions API) | `meta_pixel` | Graph API `/{v}/{pixel}/events` | `packages/connectors/src/vendors/meta.ts` | v25.0 (`META_GRAPH_API_VERSION`) |
| 2 | Google Ads / YouTube (Google tag, conversion tracking, Enhanced Conversions, online/offline uploads) | `gtag` (AW-) | Google Ads API `customers/{id}:uploadClickConversions` | `vendors/google-ads.ts` | v25 (`GOOGLE_ADS_API_VERSION`) |
| 3 | TikTok (Pixel + Events API 2.0) | `tiktok_pixel` | `/open_api/v1.3/event/track/` | `vendors/tiktok.ts` | v1.3 (`TIKTOK_API_VERSION`) |
| 4 | Microsoft (UET + Conversions API) | `microsoft_uet` | `capi.uet.microsoft.com/v1/{tagId}/events` | `vendors/microsoft.ts` | v1 |
| 5 | LinkedIn (Insight Tag + Conversions API) | `linkedin_insight` | `api.linkedin.com/rest/conversionEvents` | `vendors/linkedin.ts` | 202608 (`LINKEDIN_API_VERSION`) |
| 6 | Reddit (Pixel + Conversions API) | `reddit_pixel` | `ads-api.reddit.com/api/v3/pixels/{id}/conversion_events` | `vendors/reddit.ts` | v3 (`REDDIT_API_VERSION`) |
| 7 | Pinterest (Tag + Conversions API) | `pinterest_tag` | `api.pinterest.com/v5/ad_accounts/{id}/events` | `vendors/pinterest.ts` | v5 |
| 8 | Snapchat (Snap Pixel + Conversions API) | `snap_pixel` | `tr.snapchat.com/v3/{pixel}/events` | `vendors/snapchat.ts` | v3 |
| 9 | X / Twitter (Pixel + Conversion API) | `x_pixel` | `ads-api.x.com/12/measurement/conversions/{pixel}` (OAuth 1.0a) | `vendors/x.ts`, `oauth1.ts` | 12 (`X_ADS_API_VERSION`) |
| 10 | Taboola (Realize pixel + S2S) | `taboola_pixel` | `trc.taboola.com/{account}/log/3/bulk-s2s-action` | `vendors/taboola.ts` | log/3 |
| 11 | Outbrain (pixel + S2S) | `outbrain_pixel` | `tr.outbrain.com/unifiedPixel` | `vendors/outbrain.ts` | unifiedPixel |
| 12 | Amazon Ads / DSP (Ad Tag + Events API) | `amazon_tag` | `advertising-api[-eu|-fe].amazon.com/events/v1` | `vendors/amazon.ts` | events-v1 |
| 13 | Spotify Ad Analytics (pixel + server pixel) | `spotify_pixel` | `img.byspotify.com` | `vendors/spotify.ts` | pixel-v1 |
| 14 | Quora (Pixel + Conversion API) | `quora_pixel` | `api.quora.com/_/ad/conversion` (`QUORA_CAPI_ENDPOINT` override) | `vendors/quora.ts` | v1 |
| 15 | Yahoo DSP (Dot tag + Conversions API) | `yahoo_dot` | `batch.datax.yahoo.com/v1/events/{pixelId}` | `vendors/yahoo.ts` | v1 |
| 16 | The Trade Desk (Universal Pixel + real-time conversions) | `ttd_pixel` | `insight.adsrvr.org/track/realtimeconversion` | `vendors/tradedesk.ts` | realtimeconversion |
| 17 | Google Marketing Platform (CM360 / DV360 / SA360 Floodlight) | `gmp_floodlight` (gtag DC-) | CM360 API `conversions/batchinsert` | `vendors/gmp.ts` | v5 (`CM360_API_VERSION`) |
| 18 | AdRoll (pixel + S2S event API, beta) | `adroll_pixel` | `srv.adroll.com/api?advertisable=EID` | `vendors/adroll.ts` | s2s-beta |
| 19 | Criteo (OneTag + S2S events) | `criteo_onetag` | `widget.criteo.com/m/event?version=s2s_v0` | `vendors/criteo.ts` | s2s_v1.0.0 |
| 20 | Affiliate S2S postbacks (Awin, CJ, impact.com, TradeTracker, Tradedoubler, Partnerize, Rakuten, Webgains, Digistore24, ADCELL, belboon, TUNE/HasOffers, Everflow, custom) | — | per-network templates (GET / form / JSON, checksums, Basic auth) | `vendors/affiliate.ts`, `vendors/affiliate-presets.ts`; inbound receiver `apps/collector/src/affiliate-inbound.ts` | postback-v1 |

Also shipped: Google Analytics 4 (gtag + Measurement Protocol, `vendors/ga4.ts`) and the signed generic webhook (`webhook.ts`).

Browser loaders live in `packages/sdk/src/vendors.ts` (group 1) and `packages/sdk/src/vendors-extra.ts` (groups 2/3); every loader is the vendor's official base snippet, activated only after the destination's consent purpose is granted, and mirrors events with the shared dedup id. The tracker stays at 12 KB gzip (budget 30 KB).

Framework functions required by the supplement map to the `Connector` interface (`packages/connectors/src/connector.ts`): `validateConfiguration` → `validatePayload` + `requiredPublicIds` patterns, `validateCredentials`, `getCapabilities` → `meta` (browser/server/offline/dedup/transfer) + `buildIntegrationMatrix()`, `mapCanonicalEvent` → `mapEvent`, `validateMappedEvent` → `validatePayload`, `sendBrowserEvent` → SDK loaders, `sendServerEvent` / `sendOfflineEvent` → `dispatchBatch` (offline via `props.offline` / `legacy-import` source → vendor action source), `sendTestEvent` → `sendTest` + tool `send_destination_test_event`, `refreshAuthentication` → `oauth2.ts` + worker token cache, `handleVendorResponse` / `classifyError` → per connector, `retryEvent` → worker backoff + DLQ + replay, `getConnectorHealth` → `getHealth` + tool `validate_integration_credentials`.

## 2. Verification status of the vendor documentation

Every pin carries `verifiedAt` in `packages/connectors/src/versions.ts`. Primary documentation was fetched and checked for: Meta, GA4, Google Ads, Microsoft, LinkedIn, Pinterest, Snapchat, X, Taboola, Outbrain, Yahoo, CM360, AdRoll (NextRoll reference), Spotify (Ad Analytics), Criteo (OneTag S2S guide), Digistore24 (IPN signature example), Awin, impact.com, Tradedoubler, Webgains, TUNE, Everflow, Partnerize.

Documented as **secondary-source verified** (the vendor portal is login-only or renders client-side; field names were cross-checked with two or more integration references): TikTok Events API body, Reddit v3 body, Amazon Events API, Quora Conversion API base URL, The Trade Desk real-time conversion JSON, and the affiliate presets CJ, TradeTracker, Rakuten, ADCELL, belboon (`verified: "network"` — the wizard shows the template for confirmation and every parameter is editable per site). `unverifiedPins()` lists these for the matrix test.

## 3. Tests run

| Suite | Command | Result (2026-09-03) |
|---|---|---|
| Connector contract tests against mock vendors (all 22 types, 13 affiliate presets, OAuth 1.0a signing, Yahoo JWT token mint) | `pnpm --filter @track-site/connectors test:contract` | 61 tests pass |
| Integration matrix check | `pnpm --filter @track-site/connectors test` | 8 tests pass |
| Collector unit tests incl. inbound Digistore24 IPN | `pnpm --filter @track-site/collector test` | 11 tests pass |
| SDK (consent gate, loaders, budget) | `pnpm --filter @track-site/sdk test && pnpm --filter @track-site/sdk budget` | 8 tests pass, 12 KB gzip |
| AI tools (destination tools registered) | `pnpm --filter @track-site/ai test` | 12 tests pass |
| Typecheck / lint | `pnpm typecheck && pnpm lint` | clean (2 pre-existing Next warnings) |
| Browser walkthrough | dev server + worker + mock vendors | catalog → Meta wizard → pixel id → vault credential → mapping → publish v1 → test event routed through the worker |

Mock vendors: `MOCK_VENDOR_PORT=3250 pnpm --filter @track-site/testing mock:vendors` with `VENDOR_MOCK_BASE_URL=http://127.0.0.1:3250` and `VENDOR_ALLOW_PRIVATE=true` route every connector to the local mocks.

## 4. Vendor prerequisites (operator and customer)

- Platform (operator) secrets in `.env` / secret manager: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID/SECRET` (Google Ads + CM360 scopes), `AMAZON_ADS_CLIENT_ID/SECRET` (Login with Amazon app approved for the Ads API), `LINKEDIN_CLIENT_ID/SECRET` (Marketing Developer Platform), `X_CONSUMER_KEY/SECRET` (X developer app with Ads API access). Without them the respective OAuth button reports "not configured".
- Microsoft Conversions API is a pilot: the customer account must be provisioned by Microsoft; the UET tag token comes from the tag settings.
- AdRoll S2S is beta: Server Access Token from the NextRoll account manager (shown in the wizard as prerequisite).
- The Trade Desk accepts events only for pixels / trackers defined for the advertiser (HTTP 402 otherwise).
- Amazon requires conversion definitions in the Ads account and an EU/NA/FE region choice.
- Affiliate networks: click id must reach the landing page (awc, cjevent, irclickid, tduid, clickref, wgu, tblci, `_ef_transaction_id`, …); Tradedoubler checksum secret, CJ personal access token, impact.com AuthToken, TUNE/Everflow security tokens are stored as credentials. Digistore24 pushes to `https://api.<host>/v1/affiliate/in/{trackingId}/digistore24` (IPN passphrase = `signing_secret`).

## 5. Deduplication

One `source_event_id` per event is generated in the browser (or server) and travels through the pipeline as `dedupId`. Browser loaders pass it as the vendor's dedup parameter (`eventID`, `event_id`, `conversionId`, `conversion_id`, `client_dedup_id`, `td1`, `u1`, …); the server connectors write the same id into the API field listed in the matrix. Purchases also carry the order id (`transaction_id`, `orderId`, `ordinal`, `orderid`, `order_id`), so vendor-side order deduplication works even when the browser event was lost. Before delivery, the worker's `event_dedup` guard drops repeated source events and `conversion_records` deduplicate purchases per order id across browser and server sources.

## 6. How a customer sets up an integration

1. **Destinations → Add destination** (or via the AI setup chat): pick the platform; for affiliate networks pick the preset.
2. The 19-step wizard (`apps/web/src/components/destinations/wizard.tsx`) walks through: destination facts and data-recipient notice → prerequisites → delivery mode (hybrid recommended) + test mode → public identifiers (format-validated) → vendor settings (test event codes, per-event conversion ids) → credentials (secure vault card or OAuth connect; secrets never reach the chat) → vendor validation (cheapest read / validate-only call, becomes destination health) → consent purpose → click-id capture → event mapping with verified defaults → dedup explanation → browser tag check → test event through the real pipeline with the vendor result → vendor-side verification hint → offline / CRM events (server API sample) → draft lint → publish diff → approval-gated publish (signed, versioned, roll-backable) → monitoring with pause/resume and recent attempts.
3. The same steps are exposed as typed tools for the assistant: `create_integration_draft`, `save_public_pixel_id_draft`, `set_destination_settings_draft`, `request_secure_credential_input`, `validate_integration_credentials`, `upsert_event_mapping_draft`, `send_destination_test_event`, `get_destination_status`, `prepare_publish` → `publish_config_version`.
4. Offline / CRM conversions: `POST /v1/s` with a source key, `props.offline: true` (or `source: legacy-import`); connectors with offline support translate this into the vendor's offline action source (Google Ads click conversions, CM360, Microsoft, Meta, Pinterest, Snapchat, TikTok, Amazon, Yahoo, LinkedIn).

## 7. Open points

- Vendor-side end-to-end runs with real accounts are not possible from this environment (no vendor credentials); all deliveries were verified against the documented request/response contracts through the mock vendors.
- TikTok, Reddit, Amazon, Quora and The Trade Desk should be re-checked against the vendor portals with a logged-in account before the first production sends (the wizard flags this in the destination step).
- The SDK loaders for group 2/3 vendors were written from the official base snippets; a browser smoke test per vendor with a real tag id is part of the launch checklist.
