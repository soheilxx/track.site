# 05 - Connector Credential Matrix

Every connector implements the versioned interface in `packages/connectors/src/connector.ts`. API versions are pinned in `packages/connectors/src/versions.ts` with a `verifiedAt` date; the health dashboard warns 60 days before a documented sunset.

| Connector | Public identifiers (chat input allowed) | Secrets (secure card / OAuth only) | Auth | Endpoint (pinned) | Dedup key | Test mode |
| --- | --- | --- | --- | --- | --- | --- |
| Meta Pixel + Conversions API | Pixel / Dataset ID | CAPI access token (system user) | bearer | `graph.facebook.com/{META_GRAPH_API_VERSION}/{pixel_id}/events` | `event_id` = browser `eventID` | `test_event_code` |
| TikTok Pixel + Events API | Pixel Code | Events API access token | `Access-Token` header | `business-api.tiktok.com/open_api/{TIKTOK_API_VERSION}/event/track/` | `event_id` | `test_event_code` |
| Reddit Pixel + Conversions API | Pixel ID | Conversion access token | bearer | `ads-api.reddit.com/api/{REDDIT_API_VERSION}/pixels/{pixel_id}/conversion_events` | `conversion_id` | `test_id` |
| LinkedIn Insight Tag + Conversions API | Partner ID, Ad Account URN, Conversion Rule URN | OAuth 2.0 access + refresh token | OAuth, `Linkedin-Version: YYYYMM` | `api.linkedin.com/rest/conversionEvents` | `eventId` | staging conversion rules |
| GA4 Measurement Protocol | Measurement ID | MP API secret | query params | `region1.google-analytics.com/mp/collect` (EU), debug `/debug/mp/collect` | `transaction_id` (purchase) | debug endpoint |
| Google Ads Enhanced Conversions | Customer ID, Conversion Action resource, `AW-` label | OAuth refresh token (customer); developer token + client secret (platform) | OAuth | Google Ads API `{GOOGLE_ADS_API_VERSION}` `uploadClickConversions`, `partial_failure=true` | `order_id` | `validate_only` |
| Generic webhook | URL, allow-listed fields | signing secret (generated, shown once) | HMAC-SHA256 `X-TrackSite-Signature` with timestamp + nonce | customer URL (SSRF guarded) | `event_id` | test event |

## Credential lifecycle

| Stage | Behaviour |
| --- | --- |
| Capture | Only via secure credential card (outside the LLM transcript) or OAuth; the DLP interceptor prevents chat capture. |
| Storage | envelope encryption (`packages/core/crypto/envelope`), per-secret DEK, master key in KMS or local; only `credential_ref`, type, status, scope and last4 leave the vault. |
| Validation | `validateCredentials` calls the cheapest vendor read endpoint; result stored as integration health. |
| Rotation / revoke | `rotateOrRevokeSecret`; old versions kept 24 h for in-flight retries, then hard deleted; audit entry. |
| Expiry | OAuth expiry tracked; health warns 7 days ahead; dispatch pauses with `credential_expired`. |

## Platform-level environment variables (no values)

`META_GRAPH_API_VERSION`, `TIKTOK_API_VERSION`, `REDDIT_API_VERSION`, `LINKEDIN_API_VERSION`, `GOOGLE_ADS_API_VERSION`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `LINKEDIN_OAUTH_CLIENT_ID`, `LINKEDIN_OAUTH_CLIENT_SECRET`, `VENDOR_MOCK_BASE_URL` (tests only).

When a platform credential is missing, the connector reports `not_connected` honestly; nothing is simulated as success.
