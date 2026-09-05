# Redirect matrix: Blog → Tracking Knowledge

Generated 2026-09-03 by `node apps/web/scripts/redirect-matrix.mjs` from `apps/web/content/knowledge/**`. Do not edit by hand — re-run the script after adding, renaming or translating articles.

## Rules

- Every old URL gets a **permanent (308/301) redirect straight to its final target** — no chains, no loops. The unprefixed English URLs (`/blog/...`) point directly at `/en/tracking-knowledge/...` instead of passing through `/en/blog/...`.
- Query strings (UTM parameters, `?category=`) are preserved by Next.js automatically.
- Rules are defined in `apps/web/src/lib/routes.ts` (`KNOWLEDGE_LEGACY_REDIRECTS`) and applied by `apps/web/next.config.ts` `redirects()`; they run before the locale proxy. Active locales: `en`, `de`; default `en`.
- `generic` rows are covered by the pattern rules (`/blog` → `/en/tracking-knowledge`, `/blog/feed.xml` → `/en/tracking-knowledge/feed.xml`, `/blog/:slug` → `/en/tracking-knowledge/:slug`, and `/:locale/blog[/feed.xml|/:slug]` → `/:locale/tracking-knowledge[...]`).
- `explicit` rows are articles whose localized slug differs from the old shared slug; each needs an entry in `KNOWLEDGE_SLUG_REDIRECTS` (checked by this script).
- The old `/[locale]/blog` routes no longer exist in the app; only these redirects answer them.

## Summary

- 96 old URLs: 6 index/feed URLs, 90 article URLs (2 locales × 30 topics + 30 unprefixed English).
- 0 explicit slug redirects required, 0 missing.

## Matrix

| Old URL | New URL (permanent) | Rule | Note |
| --- | --- | --- | --- |
| `/blog` | `/en/tracking-knowledge` | generic |  |
| `/blog/feed.xml` | `/en/tracking-knowledge/feed.xml` | generic |  |
| `/en/blog` | `/en/tracking-knowledge` | generic |  |
| `/en/blog/feed.xml` | `/en/tracking-knowledge/feed.xml` | generic |  |
| `/de/blog` | `/de/tracking-knowledge` | generic |  |
| `/de/blog/feed.xml` | `/de/tracking-knowledge/feed.xml` | generic |  |
| `/blog/ad-blockers-itp-measurement` | `/en/tracking-knowledge/ad-blockers-itp-measurement` | generic |  |
| `/en/blog/ad-blockers-itp-measurement` | `/en/tracking-knowledge/ad-blockers-itp-measurement` | generic |  |
| `/blog/affiliate-postbacks-s2s` | `/en/tracking-knowledge/affiliate-postbacks-s2s` | generic |  |
| `/en/blog/affiliate-postbacks-s2s` | `/en/tracking-knowledge/affiliate-postbacks-s2s` | generic |  |
| `/blog/ai-assistant-tag-management-safety` | `/en/tracking-knowledge/ai-assistant-tag-management-safety` | generic |  |
| `/en/blog/ai-assistant-tag-management-safety` | `/en/tracking-knowledge/ai-assistant-tag-management-safety` | generic |  |
| `/blog/click-ids-attribution-windows` | `/en/tracking-knowledge/click-ids-attribution-windows` | generic |  |
| `/en/blog/click-ids-attribution-windows` | `/en/tracking-knowledge/click-ids-attribution-windows` | generic |  |
| `/blog/consent-mode-v2-guide` | `/en/tracking-knowledge/consent-mode-v2-guide` | generic |  |
| `/en/blog/consent-mode-v2-guide` | `/en/tracking-knowledge/consent-mode-v2-guide` | generic |  |
| `/blog/data-retention-policy-tracking` | `/en/tracking-knowledge/data-retention-policy-tracking` | generic |  |
| `/en/blog/data-retention-policy-tracking` | `/en/tracking-knowledge/data-retention-policy-tracking` | generic |  |
| `/blog/dedup-event-id-order-id` | `/en/tracking-knowledge/dedup-event-id-order-id` | generic |  |
| `/en/blog/dedup-event-id-order-id` | `/en/tracking-knowledge/dedup-event-id-order-id` | generic |  |
| `/blog/dsar-deletion-tracking-data` | `/en/tracking-knowledge/dsar-deletion-tracking-data` | generic |  |
| `/en/blog/dsar-deletion-tracking-data` | `/en/tracking-knowledge/dsar-deletion-tracking-data` | generic |  |
| `/blog/event-taxonomy-standard-events` | `/en/tracking-knowledge/event-taxonomy-standard-events` | generic |  |
| `/en/blog/event-taxonomy-standard-events` | `/en/tracking-knowledge/event-taxonomy-standard-events` | generic |  |
| `/blog/first-party-tracking-domains` | `/en/tracking-knowledge/first-party-tracking-domains` | generic |  |
| `/en/blog/first-party-tracking-domains` | `/en/tracking-knowledge/first-party-tracking-domains` | generic |  |
| `/blog/ga4-measurement-protocol-eu` | `/en/tracking-knowledge/ga4-measurement-protocol-eu` | generic |  |
| `/en/blog/ga4-measurement-protocol-eu` | `/en/tracking-knowledge/ga4-measurement-protocol-eu` | generic |  |
| `/blog/google-ads-enhanced-conversions` | `/en/tracking-knowledge/google-ads-enhanced-conversions` | generic |  |
| `/en/blog/google-ads-enhanced-conversions` | `/en/tracking-knowledge/google-ads-enhanced-conversions` | generic |  |
| `/blog/kill-switch-incident-playbook` | `/en/tracking-knowledge/kill-switch-incident-playbook` | generic |  |
| `/en/blog/kill-switch-incident-playbook` | `/en/tracking-knowledge/kill-switch-incident-playbook` | generic |  |
| `/blog/lead-gen-tracking-b2b` | `/en/tracking-knowledge/lead-gen-tracking-b2b` | generic |  |
| `/en/blog/lead-gen-tracking-b2b` | `/en/tracking-knowledge/lead-gen-tracking-b2b` | generic |  |
| `/blog/linkedin-conversions-api-b2b` | `/en/tracking-knowledge/linkedin-conversions-api-b2b` | generic |  |
| `/en/blog/linkedin-conversions-api-b2b` | `/en/tracking-knowledge/linkedin-conversions-api-b2b` | generic |  |
| `/blog/meta-conversions-api-deduplication` | `/en/tracking-knowledge/meta-conversions-api-deduplication` | generic |  |
| `/en/blog/meta-conversions-api-deduplication` | `/en/tracking-knowledge/meta-conversions-api-deduplication` | generic |  |
| `/blog/microsoft-conversions-api-uet` | `/en/tracking-knowledge/microsoft-conversions-api-uet` | generic |  |
| `/en/blog/microsoft-conversions-api-uet` | `/en/tracking-knowledge/microsoft-conversions-api-uet` | generic |  |
| `/blog/migrating-from-gtm` | `/en/tracking-knowledge/migrating-from-gtm` | generic |  |
| `/en/blog/migrating-from-gtm` | `/en/tracking-knowledge/migrating-from-gtm` | generic |  |
| `/blog/offline-conversions-crm` | `/en/tracking-knowledge/offline-conversions-crm` | generic |  |
| `/en/blog/offline-conversions-crm` | `/en/tracking-knowledge/offline-conversions-crm` | generic |  |
| `/blog/pii-in-tracking-data` | `/en/tracking-knowledge/pii-in-tracking-data` | generic |  |
| `/en/blog/pii-in-tracking-data` | `/en/tracking-knowledge/pii-in-tracking-data` | generic |  |
| `/blog/reddit-pinterest-snapchat-capi` | `/en/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic |  |
| `/en/blog/reddit-pinterest-snapchat-capi` | `/en/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic |  |
| `/blog/server-side-tracking-explained` | `/en/tracking-knowledge/server-side-tracking-explained` | generic |  |
| `/en/blog/server-side-tracking-explained` | `/en/tracking-knowledge/server-side-tracking-explained` | generic |  |
| `/blog/shopify-server-side-purchases` | `/en/tracking-knowledge/shopify-server-side-purchases` | generic |  |
| `/en/blog/shopify-server-side-purchases` | `/en/tracking-knowledge/shopify-server-side-purchases` | generic |  |
| `/blog/shopware-6-tracking` | `/en/tracking-knowledge/shopware-6-tracking` | generic |  |
| `/en/blog/shopware-6-tracking` | `/en/tracking-knowledge/shopware-6-tracking` | generic |  |
| `/blog/signed-configuration-supply-chain` | `/en/tracking-knowledge/signed-configuration-supply-chain` | generic |  |
| `/en/blog/signed-configuration-supply-chain` | `/en/tracking-knowledge/signed-configuration-supply-chain` | generic |  |
| `/blog/subscription-saas-events` | `/en/tracking-knowledge/subscription-saas-events` | generic |  |
| `/en/blog/subscription-saas-events` | `/en/tracking-knowledge/subscription-saas-events` | generic |  |
| `/blog/tcf-2-2-gpp-gpc` | `/en/tracking-knowledge/tcf-2-2-gpp-gpc` | generic |  |
| `/en/blog/tcf-2-2-gpp-gpc` | `/en/tracking-knowledge/tcf-2-2-gpp-gpc` | generic |  |
| `/blog/tiktok-events-api-setup` | `/en/tracking-knowledge/tiktok-events-api-setup` | generic |  |
| `/en/blog/tiktok-events-api-setup` | `/en/tracking-knowledge/tiktok-events-api-setup` | generic |  |
| `/blog/tracking-health-score` | `/en/tracking-knowledge/tracking-health-score` | generic |  |
| `/en/blog/tracking-health-score` | `/en/tracking-knowledge/tracking-health-score` | generic |  |
| `/blog/woocommerce-server-side-tracking` | `/en/tracking-knowledge/woocommerce-server-side-tracking` | generic |  |
| `/en/blog/woocommerce-server-side-tracking` | `/en/tracking-knowledge/woocommerce-server-side-tracking` | generic |  |
| `/de/blog/ad-blockers-itp-measurement` | `/de/tracking-knowledge/ad-blockers-itp-measurement` | generic |  |
| `/de/blog/affiliate-postbacks-s2s` | `/de/tracking-knowledge/affiliate-postbacks-s2s` | generic |  |
| `/de/blog/ai-assistant-tag-management-safety` | `/de/tracking-knowledge/ai-assistant-tag-management-safety` | generic |  |
| `/de/blog/click-ids-attribution-windows` | `/de/tracking-knowledge/click-ids-attribution-windows` | generic |  |
| `/de/blog/consent-mode-v2-guide` | `/de/tracking-knowledge/consent-mode-v2-guide` | generic |  |
| `/de/blog/data-retention-policy-tracking` | `/de/tracking-knowledge/data-retention-policy-tracking` | generic |  |
| `/de/blog/dedup-event-id-order-id` | `/de/tracking-knowledge/dedup-event-id-order-id` | generic |  |
| `/de/blog/dsar-deletion-tracking-data` | `/de/tracking-knowledge/dsar-deletion-tracking-data` | generic |  |
| `/de/blog/event-taxonomy-standard-events` | `/de/tracking-knowledge/event-taxonomy-standard-events` | generic |  |
| `/de/blog/first-party-tracking-domains` | `/de/tracking-knowledge/first-party-tracking-domains` | generic |  |
| `/de/blog/ga4-measurement-protocol-eu` | `/de/tracking-knowledge/ga4-measurement-protocol-eu` | generic |  |
| `/de/blog/google-ads-enhanced-conversions` | `/de/tracking-knowledge/google-ads-enhanced-conversions` | generic |  |
| `/de/blog/kill-switch-incident-playbook` | `/de/tracking-knowledge/kill-switch-incident-playbook` | generic |  |
| `/de/blog/lead-gen-tracking-b2b` | `/de/tracking-knowledge/lead-gen-tracking-b2b` | generic |  |
| `/de/blog/linkedin-conversions-api-b2b` | `/de/tracking-knowledge/linkedin-conversions-api-b2b` | generic |  |
| `/de/blog/meta-conversions-api-deduplication` | `/de/tracking-knowledge/meta-conversions-api-deduplication` | generic |  |
| `/de/blog/microsoft-conversions-api-uet` | `/de/tracking-knowledge/microsoft-conversions-api-uet` | generic |  |
| `/de/blog/migrating-from-gtm` | `/de/tracking-knowledge/migrating-from-gtm` | generic |  |
| `/de/blog/offline-conversions-crm` | `/de/tracking-knowledge/offline-conversions-crm` | generic |  |
| `/de/blog/pii-in-tracking-data` | `/de/tracking-knowledge/pii-in-tracking-data` | generic |  |
| `/de/blog/reddit-pinterest-snapchat-capi` | `/de/tracking-knowledge/reddit-pinterest-snapchat-capi` | generic |  |
| `/de/blog/server-side-tracking-explained` | `/de/tracking-knowledge/server-side-tracking-explained` | generic |  |
| `/de/blog/shopify-server-side-purchases` | `/de/tracking-knowledge/shopify-server-side-purchases` | generic |  |
| `/de/blog/shopware-6-tracking` | `/de/tracking-knowledge/shopware-6-tracking` | generic |  |
| `/de/blog/signed-configuration-supply-chain` | `/de/tracking-knowledge/signed-configuration-supply-chain` | generic |  |
| `/de/blog/subscription-saas-events` | `/de/tracking-knowledge/subscription-saas-events` | generic |  |
| `/de/blog/tcf-2-2-gpp-gpc` | `/de/tracking-knowledge/tcf-2-2-gpp-gpc` | generic |  |
| `/de/blog/tiktok-events-api-setup` | `/de/tracking-knowledge/tiktok-events-api-setup` | generic |  |
| `/de/blog/tracking-health-score` | `/de/tracking-knowledge/tracking-health-score` | generic |  |
| `/de/blog/woocommerce-server-side-tracking` | `/de/tracking-knowledge/woocommerce-server-side-tracking` | generic |  |
