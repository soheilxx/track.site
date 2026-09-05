# Redirect matrix: Blog → Tracking Knowledge (six locales, crawl-verified)

Generated 2026-09-05T11:36:46.727Z by `docs/qa/2026-09-05/seo/redirect-matrix-six-locales.mjs`. Active locales from `apps/web/src/i18n/routing.ts`: en, de, fr, es, it, nl (default `en`). Articles: en 30 (30 published), de 30 (30 published), fr 30 (30 published), es 30 (30 published), it 30 (30 published), nl 30 (30 published). Explicit slug redirects in `KNOWLEDGE_SLUG_REDIRECTS`: 0; articles whose localized slug differs from the file name without an explicit entry: 0.

Pattern rules (`apps/web/src/lib/routes.ts`, `KNOWLEDGE_LEGACY_REDIRECTS`, applied as permanent redirects by `apps/web/next.config.ts` before the locale proxy; Next.js keeps the query string):

- `/blog` → `/en/tracking-knowledge`, `/blog/feed.xml` → `/en/tracking-knowledge/feed.xml`, `/blog/:slug` → `/en/tracking-knowledge/:slug` (unprefixed English; not applied on the dedicated app/api/cdn hosts)
- `/:locale(en|de|fr|es|it|nl)/blog` → `/:locale/tracking-knowledge`, `…/blog/feed.xml` → `…/tracking-knowledge/feed.xml`, `…/blog/:slug` → `…/tracking-knowledge/:slug`
- explicit per-article rules run first when a localized slug differs from the old shared slug (none needed for this release: every localized slug equals the English file name)

Rows: **224** (unprefixed: 32, en: 32, de: 32, fr: 32, es: 32, it: 32, nl: 32). Verification against the production build (`crawl.json`, 2026-09-05T09:51:36.507Z): **verified 58**, derived 166, not checked 0, **failed 0**. "Verified" = the crawl fetched the old URL and saw exactly one 308 whose Location equals the target and a 200 at the target; "derived" = the identical pattern rule (same source shape, same locale group) was verified for other rows; nothing is marked verified without a fetch record. Additional crawl checks outside this matrix: query-string preservation (`?utm_source=qa&utm_medium=crawl`, `?category=guides`) and the dashboard legacy paths, see `summary.md` "Derived checks not covered by the matrix".

## Matrix

| Old URL | New URL (permanent) | Rule | Check | Crawl detail |
| --- | --- | --- | --- | --- |
| `/blog` | `/en/tracking-knowledge` | generic:unprefixed-index | verified | 308 → `/en/tracking-knowledge` (200) |
| `/blog/feed.xml` | `/en/tracking-knowledge/feed.xml` | generic:unprefixed-feed | verified | 308 → `/en/tracking-knowledge/feed.xml` (200) |
| `/en/blog` | `/en/tracking-knowledge` | generic:locale-index | verified | 308 → `/en/tracking-knowledge` (200) |
| `/en/blog/feed.xml` | `/en/tracking-knowledge/feed.xml` | generic:locale-feed | verified | 308 → `/en/tracking-knowledge/feed.xml` (200) |
| `/de/blog` | `/de/tracking-knowledge` | generic:locale-index | verified | 308 → `/de/tracking-knowledge` (200) |
| `/de/blog/feed.xml` | `/de/tracking-knowledge/feed.xml` | generic:locale-feed | verified | 308 → `/de/tracking-knowledge/feed.xml` (200) |
| `/fr/blog` | `/fr/tracking-knowledge` | generic:locale-index | verified | 308 → `/fr/tracking-knowledge` (200) |
| `/fr/blog/feed.xml` | `/fr/tracking-knowledge/feed.xml` | generic:locale-feed | verified | 308 → `/fr/tracking-knowledge/feed.xml` (200) |
| `/es/blog` | `/es/tracking-knowledge` | generic:locale-index | verified | 308 → `/es/tracking-knowledge` (200) |
| `/es/blog/feed.xml` | `/es/tracking-knowledge/feed.xml` | generic:locale-feed | verified | 308 → `/es/tracking-knowledge/feed.xml` (200) |
| `/it/blog` | `/it/tracking-knowledge` | generic:locale-index | verified | 308 → `/it/tracking-knowledge` (200) |
| `/it/blog/feed.xml` | `/it/tracking-knowledge/feed.xml` | generic:locale-feed | verified | 308 → `/it/tracking-knowledge/feed.xml` (200) |
| `/nl/blog` | `/nl/tracking-knowledge` | generic:locale-index | verified | 308 → `/nl/tracking-knowledge` (200) |
| `/nl/blog/feed.xml` | `/nl/tracking-knowledge/feed.xml` | generic:locale-feed | verified | 308 → `/nl/tracking-knowledge/feed.xml` (200) |
| `/blog/ad-blockers-itp-measurement` | `/en/tracking-knowledge/ad-blockers-itp-measurement` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/ad-blockers-itp-measurement` (200) |
| `/blog/affiliate-postbacks-s2s` | `/en/tracking-knowledge/affiliate-postbacks-s2s` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/affiliate-postbacks-s2s` (200) |
| `/blog/ai-assistant-tag-management-safety` | `/en/tracking-knowledge/ai-assistant-tag-management-safety` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/ai-assistant-tag-management-safety` (200) |
| `/blog/click-ids-attribution-windows` | `/en/tracking-knowledge/click-ids-attribution-windows` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/click-ids-attribution-windows` (200) |
| `/blog/consent-mode-v2-guide` | `/en/tracking-knowledge/consent-mode-v2-guide` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/data-retention-policy-tracking` | `/en/tracking-knowledge/data-retention-policy-tracking` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/dedup-event-id-order-id` | `/en/tracking-knowledge/dedup-event-id-order-id` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/dsar-deletion-tracking-data` | `/en/tracking-knowledge/dsar-deletion-tracking-data` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/event-taxonomy-standard-events` | `/en/tracking-knowledge/event-taxonomy-standard-events` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/first-party-tracking-domains` | `/en/tracking-knowledge/first-party-tracking-domains` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/first-party-tracking-domains` (200) |
| `/blog/ga4-measurement-protocol-eu` | `/en/tracking-knowledge/ga4-measurement-protocol-eu` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/ga4-measurement-protocol-eu` (200) |
| `/blog/google-ads-enhanced-conversions` | `/en/tracking-knowledge/google-ads-enhanced-conversions` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/google-ads-enhanced-conversions` (200) |
| `/blog/kill-switch-incident-playbook` | `/en/tracking-knowledge/kill-switch-incident-playbook` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/kill-switch-incident-playbook` (200) |
| `/blog/lead-gen-tracking-b2b` | `/en/tracking-knowledge/lead-gen-tracking-b2b` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/linkedin-conversions-api-b2b` | `/en/tracking-knowledge/linkedin-conversions-api-b2b` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/meta-conversions-api-deduplication` | `/en/tracking-knowledge/meta-conversions-api-deduplication` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/microsoft-conversions-api-uet` | `/en/tracking-knowledge/microsoft-conversions-api-uet` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/migrating-from-gtm` | `/en/tracking-knowledge/migrating-from-gtm` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/offline-conversions-crm` | `/en/tracking-knowledge/offline-conversions-crm` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/offline-conversions-crm` (200) |
| `/blog/pii-in-tracking-data` | `/en/tracking-knowledge/pii-in-tracking-data` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/pii-in-tracking-data` (200) |
| `/blog/reddit-pinterest-snapchat-capi` | `/en/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/reddit-pinterest-snapchat-capi` (200) |
| `/blog/server-side-tracking-explained` | `/en/tracking-knowledge/server-side-tracking-explained` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/server-side-tracking-explained` (200) |
| `/blog/shopify-server-side-purchases` | `/en/tracking-knowledge/shopify-server-side-purchases` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/shopware-6-tracking` | `/en/tracking-knowledge/shopware-6-tracking` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/signed-configuration-supply-chain` | `/en/tracking-knowledge/signed-configuration-supply-chain` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/subscription-saas-events` | `/en/tracking-knowledge/subscription-saas-events` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/tcf-2-2-gpp-gpc` | `/en/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:unprefixed-article | derived | same pattern rule verified in the crawl |
| `/blog/tiktok-events-api-setup` | `/en/tracking-knowledge/tiktok-events-api-setup` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/tiktok-events-api-setup` (200) |
| `/blog/tracking-health-score` | `/en/tracking-knowledge/tracking-health-score` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/tracking-health-score` (200) |
| `/blog/woocommerce-server-side-tracking` | `/en/tracking-knowledge/woocommerce-server-side-tracking` | generic:unprefixed-article | verified | 308 → `/en/tracking-knowledge/woocommerce-server-side-tracking` (200) |
| `/en/blog/ad-blockers-itp-measurement` | `/en/tracking-knowledge/ad-blockers-itp-measurement` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/affiliate-postbacks-s2s` | `/en/tracking-knowledge/affiliate-postbacks-s2s` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/ai-assistant-tag-management-safety` | `/en/tracking-knowledge/ai-assistant-tag-management-safety` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/click-ids-attribution-windows` | `/en/tracking-knowledge/click-ids-attribution-windows` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/consent-mode-v2-guide` | `/en/tracking-knowledge/consent-mode-v2-guide` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/consent-mode-v2-guide` (200) |
| `/en/blog/data-retention-policy-tracking` | `/en/tracking-knowledge/data-retention-policy-tracking` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/data-retention-policy-tracking` (200) |
| `/en/blog/dedup-event-id-order-id` | `/en/tracking-knowledge/dedup-event-id-order-id` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/dedup-event-id-order-id` (200) |
| `/en/blog/dsar-deletion-tracking-data` | `/en/tracking-knowledge/dsar-deletion-tracking-data` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/dsar-deletion-tracking-data` (200) |
| `/en/blog/event-taxonomy-standard-events` | `/en/tracking-knowledge/event-taxonomy-standard-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/first-party-tracking-domains` | `/en/tracking-knowledge/first-party-tracking-domains` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/ga4-measurement-protocol-eu` | `/en/tracking-knowledge/ga4-measurement-protocol-eu` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/google-ads-enhanced-conversions` | `/en/tracking-knowledge/google-ads-enhanced-conversions` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/kill-switch-incident-playbook` | `/en/tracking-knowledge/kill-switch-incident-playbook` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/lead-gen-tracking-b2b` | `/en/tracking-knowledge/lead-gen-tracking-b2b` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/lead-gen-tracking-b2b` (200) |
| `/en/blog/linkedin-conversions-api-b2b` | `/en/tracking-knowledge/linkedin-conversions-api-b2b` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/linkedin-conversions-api-b2b` (200) |
| `/en/blog/meta-conversions-api-deduplication` | `/en/tracking-knowledge/meta-conversions-api-deduplication` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/meta-conversions-api-deduplication` (200) |
| `/en/blog/microsoft-conversions-api-uet` | `/en/tracking-knowledge/microsoft-conversions-api-uet` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/microsoft-conversions-api-uet` (200) |
| `/en/blog/migrating-from-gtm` | `/en/tracking-knowledge/migrating-from-gtm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/offline-conversions-crm` | `/en/tracking-knowledge/offline-conversions-crm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/pii-in-tracking-data` | `/en/tracking-knowledge/pii-in-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/reddit-pinterest-snapchat-capi` | `/en/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/server-side-tracking-explained` | `/en/tracking-knowledge/server-side-tracking-explained` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/shopify-server-side-purchases` | `/en/tracking-knowledge/shopify-server-side-purchases` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/shopify-server-side-purchases` (200) |
| `/en/blog/shopware-6-tracking` | `/en/tracking-knowledge/shopware-6-tracking` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/shopware-6-tracking` (200) |
| `/en/blog/signed-configuration-supply-chain` | `/en/tracking-knowledge/signed-configuration-supply-chain` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/signed-configuration-supply-chain` (200) |
| `/en/blog/subscription-saas-events` | `/en/tracking-knowledge/subscription-saas-events` | generic:locale-article | verified | 308 → `/en/tracking-knowledge/subscription-saas-events` (200) |
| `/en/blog/tcf-2-2-gpp-gpc` | `/en/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/tiktok-events-api-setup` | `/en/tracking-knowledge/tiktok-events-api-setup` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/tracking-health-score` | `/en/tracking-knowledge/tracking-health-score` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/en/blog/woocommerce-server-side-tracking` | `/en/tracking-knowledge/woocommerce-server-side-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/ad-blockers-itp-measurement` | `/de/tracking-knowledge/ad-blockers-itp-measurement` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/ad-blockers-itp-measurement` (200) |
| `/de/blog/affiliate-postbacks-s2s` | `/de/tracking-knowledge/affiliate-postbacks-s2s` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/ai-assistant-tag-management-safety` | `/de/tracking-knowledge/ai-assistant-tag-management-safety` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/click-ids-attribution-windows` | `/de/tracking-knowledge/click-ids-attribution-windows` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/click-ids-attribution-windows` (200) |
| `/de/blog/consent-mode-v2-guide` | `/de/tracking-knowledge/consent-mode-v2-guide` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/data-retention-policy-tracking` | `/de/tracking-knowledge/data-retention-policy-tracking` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/data-retention-policy-tracking` (200) |
| `/de/blog/dedup-event-id-order-id` | `/de/tracking-knowledge/dedup-event-id-order-id` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/dsar-deletion-tracking-data` | `/de/tracking-knowledge/dsar-deletion-tracking-data` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/dsar-deletion-tracking-data` (200) |
| `/de/blog/event-taxonomy-standard-events` | `/de/tracking-knowledge/event-taxonomy-standard-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/first-party-tracking-domains` | `/de/tracking-knowledge/first-party-tracking-domains` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/first-party-tracking-domains` (200) |
| `/de/blog/ga4-measurement-protocol-eu` | `/de/tracking-knowledge/ga4-measurement-protocol-eu` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/google-ads-enhanced-conversions` | `/de/tracking-knowledge/google-ads-enhanced-conversions` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/kill-switch-incident-playbook` | `/de/tracking-knowledge/kill-switch-incident-playbook` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/kill-switch-incident-playbook` (200) |
| `/de/blog/lead-gen-tracking-b2b` | `/de/tracking-knowledge/lead-gen-tracking-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/linkedin-conversions-api-b2b` | `/de/tracking-knowledge/linkedin-conversions-api-b2b` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/linkedin-conversions-api-b2b` (200) |
| `/de/blog/meta-conversions-api-deduplication` | `/de/tracking-knowledge/meta-conversions-api-deduplication` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/microsoft-conversions-api-uet` | `/de/tracking-knowledge/microsoft-conversions-api-uet` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/microsoft-conversions-api-uet` (200) |
| `/de/blog/migrating-from-gtm` | `/de/tracking-knowledge/migrating-from-gtm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/offline-conversions-crm` | `/de/tracking-knowledge/offline-conversions-crm` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/offline-conversions-crm` (200) |
| `/de/blog/pii-in-tracking-data` | `/de/tracking-knowledge/pii-in-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/reddit-pinterest-snapchat-capi` | `/de/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/server-side-tracking-explained` | `/de/tracking-knowledge/server-side-tracking-explained` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/server-side-tracking-explained` (200) |
| `/de/blog/shopify-server-side-purchases` | `/de/tracking-knowledge/shopify-server-side-purchases` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/shopware-6-tracking` | `/de/tracking-knowledge/shopware-6-tracking` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/shopware-6-tracking` (200) |
| `/de/blog/signed-configuration-supply-chain` | `/de/tracking-knowledge/signed-configuration-supply-chain` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/subscription-saas-events` | `/de/tracking-knowledge/subscription-saas-events` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/subscription-saas-events` (200) |
| `/de/blog/tcf-2-2-gpp-gpc` | `/de/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/tiktok-events-api-setup` | `/de/tracking-knowledge/tiktok-events-api-setup` | generic:locale-article | verified | 308 → `/de/tracking-knowledge/tiktok-events-api-setup` (200) |
| `/de/blog/tracking-health-score` | `/de/tracking-knowledge/tracking-health-score` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/de/blog/woocommerce-server-side-tracking` | `/de/tracking-knowledge/woocommerce-server-side-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/ad-blockers-itp-measurement` | `/fr/tracking-knowledge/ad-blockers-itp-measurement` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/affiliate-postbacks-s2s` | `/fr/tracking-knowledge/affiliate-postbacks-s2s` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/ai-assistant-tag-management-safety` | `/fr/tracking-knowledge/ai-assistant-tag-management-safety` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/click-ids-attribution-windows` | `/fr/tracking-knowledge/click-ids-attribution-windows` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/consent-mode-v2-guide` | `/fr/tracking-knowledge/consent-mode-v2-guide` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/data-retention-policy-tracking` | `/fr/tracking-knowledge/data-retention-policy-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/dedup-event-id-order-id` | `/fr/tracking-knowledge/dedup-event-id-order-id` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/dsar-deletion-tracking-data` | `/fr/tracking-knowledge/dsar-deletion-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/event-taxonomy-standard-events` | `/fr/tracking-knowledge/event-taxonomy-standard-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/first-party-tracking-domains` | `/fr/tracking-knowledge/first-party-tracking-domains` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/ga4-measurement-protocol-eu` | `/fr/tracking-knowledge/ga4-measurement-protocol-eu` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/google-ads-enhanced-conversions` | `/fr/tracking-knowledge/google-ads-enhanced-conversions` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/kill-switch-incident-playbook` | `/fr/tracking-knowledge/kill-switch-incident-playbook` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/lead-gen-tracking-b2b` | `/fr/tracking-knowledge/lead-gen-tracking-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/linkedin-conversions-api-b2b` | `/fr/tracking-knowledge/linkedin-conversions-api-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/meta-conversions-api-deduplication` | `/fr/tracking-knowledge/meta-conversions-api-deduplication` | generic:locale-article | verified | 308 → `/fr/tracking-knowledge/meta-conversions-api-deduplication` (200) |
| `/fr/blog/microsoft-conversions-api-uet` | `/fr/tracking-knowledge/microsoft-conversions-api-uet` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/migrating-from-gtm` | `/fr/tracking-knowledge/migrating-from-gtm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/offline-conversions-crm` | `/fr/tracking-knowledge/offline-conversions-crm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/pii-in-tracking-data` | `/fr/tracking-knowledge/pii-in-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/reddit-pinterest-snapchat-capi` | `/fr/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/server-side-tracking-explained` | `/fr/tracking-knowledge/server-side-tracking-explained` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/shopify-server-side-purchases` | `/fr/tracking-knowledge/shopify-server-side-purchases` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/shopware-6-tracking` | `/fr/tracking-knowledge/shopware-6-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/signed-configuration-supply-chain` | `/fr/tracking-knowledge/signed-configuration-supply-chain` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/subscription-saas-events` | `/fr/tracking-knowledge/subscription-saas-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/tcf-2-2-gpp-gpc` | `/fr/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/tiktok-events-api-setup` | `/fr/tracking-knowledge/tiktok-events-api-setup` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/tracking-health-score` | `/fr/tracking-knowledge/tracking-health-score` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/fr/blog/woocommerce-server-side-tracking` | `/fr/tracking-knowledge/woocommerce-server-side-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/ad-blockers-itp-measurement` | `/es/tracking-knowledge/ad-blockers-itp-measurement` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/affiliate-postbacks-s2s` | `/es/tracking-knowledge/affiliate-postbacks-s2s` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/ai-assistant-tag-management-safety` | `/es/tracking-knowledge/ai-assistant-tag-management-safety` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/click-ids-attribution-windows` | `/es/tracking-knowledge/click-ids-attribution-windows` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/consent-mode-v2-guide` | `/es/tracking-knowledge/consent-mode-v2-guide` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/data-retention-policy-tracking` | `/es/tracking-knowledge/data-retention-policy-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/dedup-event-id-order-id` | `/es/tracking-knowledge/dedup-event-id-order-id` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/dsar-deletion-tracking-data` | `/es/tracking-knowledge/dsar-deletion-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/event-taxonomy-standard-events` | `/es/tracking-knowledge/event-taxonomy-standard-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/first-party-tracking-domains` | `/es/tracking-knowledge/first-party-tracking-domains` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/ga4-measurement-protocol-eu` | `/es/tracking-knowledge/ga4-measurement-protocol-eu` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/google-ads-enhanced-conversions` | `/es/tracking-knowledge/google-ads-enhanced-conversions` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/kill-switch-incident-playbook` | `/es/tracking-knowledge/kill-switch-incident-playbook` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/lead-gen-tracking-b2b` | `/es/tracking-knowledge/lead-gen-tracking-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/linkedin-conversions-api-b2b` | `/es/tracking-knowledge/linkedin-conversions-api-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/meta-conversions-api-deduplication` | `/es/tracking-knowledge/meta-conversions-api-deduplication` | generic:locale-article | verified | 308 → `/es/tracking-knowledge/meta-conversions-api-deduplication` (200) |
| `/es/blog/microsoft-conversions-api-uet` | `/es/tracking-knowledge/microsoft-conversions-api-uet` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/migrating-from-gtm` | `/es/tracking-knowledge/migrating-from-gtm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/offline-conversions-crm` | `/es/tracking-knowledge/offline-conversions-crm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/pii-in-tracking-data` | `/es/tracking-knowledge/pii-in-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/reddit-pinterest-snapchat-capi` | `/es/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/server-side-tracking-explained` | `/es/tracking-knowledge/server-side-tracking-explained` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/shopify-server-side-purchases` | `/es/tracking-knowledge/shopify-server-side-purchases` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/shopware-6-tracking` | `/es/tracking-knowledge/shopware-6-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/signed-configuration-supply-chain` | `/es/tracking-knowledge/signed-configuration-supply-chain` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/subscription-saas-events` | `/es/tracking-knowledge/subscription-saas-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/tcf-2-2-gpp-gpc` | `/es/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/tiktok-events-api-setup` | `/es/tracking-knowledge/tiktok-events-api-setup` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/tracking-health-score` | `/es/tracking-knowledge/tracking-health-score` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/es/blog/woocommerce-server-side-tracking` | `/es/tracking-knowledge/woocommerce-server-side-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/ad-blockers-itp-measurement` | `/it/tracking-knowledge/ad-blockers-itp-measurement` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/affiliate-postbacks-s2s` | `/it/tracking-knowledge/affiliate-postbacks-s2s` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/ai-assistant-tag-management-safety` | `/it/tracking-knowledge/ai-assistant-tag-management-safety` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/click-ids-attribution-windows` | `/it/tracking-knowledge/click-ids-attribution-windows` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/consent-mode-v2-guide` | `/it/tracking-knowledge/consent-mode-v2-guide` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/data-retention-policy-tracking` | `/it/tracking-knowledge/data-retention-policy-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/dedup-event-id-order-id` | `/it/tracking-knowledge/dedup-event-id-order-id` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/dsar-deletion-tracking-data` | `/it/tracking-knowledge/dsar-deletion-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/event-taxonomy-standard-events` | `/it/tracking-knowledge/event-taxonomy-standard-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/first-party-tracking-domains` | `/it/tracking-knowledge/first-party-tracking-domains` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/ga4-measurement-protocol-eu` | `/it/tracking-knowledge/ga4-measurement-protocol-eu` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/google-ads-enhanced-conversions` | `/it/tracking-knowledge/google-ads-enhanced-conversions` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/kill-switch-incident-playbook` | `/it/tracking-knowledge/kill-switch-incident-playbook` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/lead-gen-tracking-b2b` | `/it/tracking-knowledge/lead-gen-tracking-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/linkedin-conversions-api-b2b` | `/it/tracking-knowledge/linkedin-conversions-api-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/meta-conversions-api-deduplication` | `/it/tracking-knowledge/meta-conversions-api-deduplication` | generic:locale-article | verified | 308 → `/it/tracking-knowledge/meta-conversions-api-deduplication` (200) |
| `/it/blog/microsoft-conversions-api-uet` | `/it/tracking-knowledge/microsoft-conversions-api-uet` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/migrating-from-gtm` | `/it/tracking-knowledge/migrating-from-gtm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/offline-conversions-crm` | `/it/tracking-knowledge/offline-conversions-crm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/pii-in-tracking-data` | `/it/tracking-knowledge/pii-in-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/reddit-pinterest-snapchat-capi` | `/it/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/server-side-tracking-explained` | `/it/tracking-knowledge/server-side-tracking-explained` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/shopify-server-side-purchases` | `/it/tracking-knowledge/shopify-server-side-purchases` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/shopware-6-tracking` | `/it/tracking-knowledge/shopware-6-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/signed-configuration-supply-chain` | `/it/tracking-knowledge/signed-configuration-supply-chain` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/subscription-saas-events` | `/it/tracking-knowledge/subscription-saas-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/tcf-2-2-gpp-gpc` | `/it/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/tiktok-events-api-setup` | `/it/tracking-knowledge/tiktok-events-api-setup` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/tracking-health-score` | `/it/tracking-knowledge/tracking-health-score` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/it/blog/woocommerce-server-side-tracking` | `/it/tracking-knowledge/woocommerce-server-side-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/ad-blockers-itp-measurement` | `/nl/tracking-knowledge/ad-blockers-itp-measurement` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/affiliate-postbacks-s2s` | `/nl/tracking-knowledge/affiliate-postbacks-s2s` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/ai-assistant-tag-management-safety` | `/nl/tracking-knowledge/ai-assistant-tag-management-safety` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/click-ids-attribution-windows` | `/nl/tracking-knowledge/click-ids-attribution-windows` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/consent-mode-v2-guide` | `/nl/tracking-knowledge/consent-mode-v2-guide` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/data-retention-policy-tracking` | `/nl/tracking-knowledge/data-retention-policy-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/dedup-event-id-order-id` | `/nl/tracking-knowledge/dedup-event-id-order-id` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/dsar-deletion-tracking-data` | `/nl/tracking-knowledge/dsar-deletion-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/event-taxonomy-standard-events` | `/nl/tracking-knowledge/event-taxonomy-standard-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/first-party-tracking-domains` | `/nl/tracking-knowledge/first-party-tracking-domains` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/ga4-measurement-protocol-eu` | `/nl/tracking-knowledge/ga4-measurement-protocol-eu` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/google-ads-enhanced-conversions` | `/nl/tracking-knowledge/google-ads-enhanced-conversions` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/kill-switch-incident-playbook` | `/nl/tracking-knowledge/kill-switch-incident-playbook` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/lead-gen-tracking-b2b` | `/nl/tracking-knowledge/lead-gen-tracking-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/linkedin-conversions-api-b2b` | `/nl/tracking-knowledge/linkedin-conversions-api-b2b` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/meta-conversions-api-deduplication` | `/nl/tracking-knowledge/meta-conversions-api-deduplication` | generic:locale-article | verified | 308 → `/nl/tracking-knowledge/meta-conversions-api-deduplication` (200) |
| `/nl/blog/microsoft-conversions-api-uet` | `/nl/tracking-knowledge/microsoft-conversions-api-uet` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/migrating-from-gtm` | `/nl/tracking-knowledge/migrating-from-gtm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/offline-conversions-crm` | `/nl/tracking-knowledge/offline-conversions-crm` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/pii-in-tracking-data` | `/nl/tracking-knowledge/pii-in-tracking-data` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/reddit-pinterest-snapchat-capi` | `/nl/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/server-side-tracking-explained` | `/nl/tracking-knowledge/server-side-tracking-explained` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/shopify-server-side-purchases` | `/nl/tracking-knowledge/shopify-server-side-purchases` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/shopware-6-tracking` | `/nl/tracking-knowledge/shopware-6-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/signed-configuration-supply-chain` | `/nl/tracking-knowledge/signed-configuration-supply-chain` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/subscription-saas-events` | `/nl/tracking-knowledge/subscription-saas-events` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/tcf-2-2-gpp-gpc` | `/nl/tracking-knowledge/tcf-2-2-gpp-gpc` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/tiktok-events-api-setup` | `/nl/tracking-knowledge/tiktok-events-api-setup` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/tracking-health-score` | `/nl/tracking-knowledge/tracking-health-score` | generic:locale-article | derived | same pattern rule verified in the crawl |
| `/nl/blog/woocommerce-server-side-tracking` | `/nl/tracking-knowledge/woocommerce-server-side-tracking` | generic:locale-article | derived | same pattern rule verified in the crawl |

