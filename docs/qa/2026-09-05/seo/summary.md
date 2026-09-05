# SEO, structured data and link integrity — crawl summary

Generated 2026-09-05T09:51:36.507Z by `node apps/web/scripts/qa/crawl.mjs` against `http://localhost:3003` (production build `next start`, BUILD_ID `rCAJOqYs841hSlnLSc99W`). Raw data: `crawl.json` next to this file (one entry per URL under `pages`, every unique link target under `linkChecks`, the redirect matrix results under `redirectMatrix`, robots/sitemaps/feeds under `resources`).

Run: started 2026-09-05T09:50:03.424Z, finished 2026-09-05T09:51:36.507Z (93 s), concurrency 8, request timeout 60000 ms. Declared site origin (sitemap `<loc>`, canonicals, hreflang, JSON-LD): `http://localhost:3000` — differs from the crawl base; URLs were rewritten to `http://localhost:3003` for fetching and compared against the declared origin (this is the `HOST_MARKETING` value of the local `.env`, not a page defect). Dashboard requests carried the stored Playwright session (ts.session_token; expired and dropped: ts.session_data).

## Counts

| Metric | Value |
| --- | --- |
| Sitemaps in the index | 12 (pages-en.xml: 48, knowledge-en.xml: 30, pages-de.xml: 48, knowledge-de.xml: 30, pages-fr.xml: 48, knowledge-fr.xml: 30, pages-es.xml: 48, knowledge-es.xml: 30, pages-it.xml: 48, knowledge-it.xml: 30, pages-nl.xml: 48, knowledge-nl.xml: 30) |
| Public URLs from the sitemaps | 468 |
| Dashboard URLs | 30 (24 static routes + 6 discovered via links) |
| Pages crawled | 498 |
| HTTP status distribution | 200: 497, 307: 1 |
| Pages with ≥ 1 error finding | 194 |
| Pages with exactly one h1 | 496 |
| Titles longer than 60 characters | 14 |
| Public pages with 7 hreflang links | 468 / 468 |
| Public pages with self-canonical | 468 / 468 |
| Public pages with meta description | 468 / 468 |
| JSON-LD blocks parsed | 912 on 468 pages; 6 blocks with errors |
| JSON-LD @type counts | Organization: 6, WebSite: 6, BreadcrumbList: 462, FAQPage: 198, HowTo: 6, ItemList: 6, SoftwareApplication: 6, WebPage: 24, TechArticle: 102, Blog: 6, ContactPage: 6, BlogPosting: 84 |
| Unique internal link/image targets checked | 960 |
| …answering 200 directly | 773 |
| …via exactly one redirect | 1 |
| …via a redirect chain (≥ 2 hops) | 0 |
| …broken (4xx/5xx or fetch error) | 186 |
| …401/403 | 0 |
| …405 (not a GET resource) | 0 |
| Redirect matrix rows checked | 46 of 96 (6 index/feed + 40 sampled of 90 article rows); 0 failures |
| Derived redirect checks (not in the matrix) | 19; 0 failures |

## Page failures (error findings)

| URL | Kind | Status | Findings |
| --- | --- | --- | --- |
| http://localhost:3000/en/docs | public | 200 | jsonld: $ TechArticle: missing/invalid datePublished; jsonld: $ TechArticle: missing author |
| http://localhost:3000/en/tracking-knowledge | public | 200 | image: http://localhost:3003/en/tracking-knowledge/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/meta-conversions-api-deduplication | public | 200 | image: http://localhost:3003/en/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/server-side-tracking-explained | public | 200 | image: http://localhost:3003/en/tracking-knowledge/server-side-tracking-explained/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/consent-mode-v2-guide | public | 200 | image: http://localhost:3003/en/tracking-knowledge/consent-mode-v2-guide/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/google-ads-enhanced-conversions | public | 200 | image: http://localhost:3003/en/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/tiktok-events-api-setup | public | 200 | image: http://localhost:3003/en/tracking-knowledge/tiktok-events-api-setup/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/ga4-measurement-protocol-eu | public | 200 | image: http://localhost:3003/en/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/dedup-event-id-order-id | public | 200 | image: http://localhost:3003/en/tracking-knowledge/dedup-event-id-order-id/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/microsoft-conversions-api-uet | public | 200 | image: http://localhost:3003/en/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/linkedin-conversions-api-b2b | public | 200 | image: http://localhost:3003/en/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/reddit-pinterest-snapchat-capi | public | 200 | image: http://localhost:3003/en/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/click-ids-attribution-windows | public | 200 | image: http://localhost:3003/en/tracking-knowledge/click-ids-attribution-windows/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/first-party-tracking-domains | public | 200 | image: http://localhost:3003/en/tracking-knowledge/first-party-tracking-domains/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/offline-conversions-crm | public | 200 | image: http://localhost:3003/en/tracking-knowledge/offline-conversions-crm/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/affiliate-postbacks-s2s | public | 200 | image: http://localhost:3003/en/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/tcf-2-2-gpp-gpc | public | 200 | image: http://localhost:3003/en/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/dsar-deletion-tracking-data | public | 200 | image: http://localhost:3003/en/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/data-retention-policy-tracking | public | 200 | image: http://localhost:3003/en/tracking-knowledge/data-retention-policy-tracking/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/tracking-health-score | public | 200 | image: http://localhost:3003/en/tracking-knowledge/tracking-health-score/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/ad-blockers-itp-measurement | public | 200 | image: http://localhost:3003/en/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/migrating-from-gtm | public | 200 | image: http://localhost:3003/en/tracking-knowledge/migrating-from-gtm/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/ai-assistant-tag-management-safety | public | 200 | image: http://localhost:3003/en/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/event-taxonomy-standard-events | public | 200 | image: http://localhost:3003/en/tracking-knowledge/event-taxonomy-standard-events/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/pii-in-tracking-data | public | 200 | image: http://localhost:3003/en/tracking-knowledge/pii-in-tracking-data/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/signed-configuration-supply-chain | public | 200 | image: http://localhost:3003/en/tracking-knowledge/signed-configuration-supply-chain/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/kill-switch-incident-playbook | public | 200 | image: http://localhost:3003/en/tracking-knowledge/kill-switch-incident-playbook/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/lead-gen-tracking-b2b | public | 200 | image: http://localhost:3003/en/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/subscription-saas-events | public | 200 | image: http://localhost:3003/en/tracking-knowledge/subscription-saas-events/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/shopify-server-side-purchases | public | 200 | image: http://localhost:3003/en/tracking-knowledge/shopify-server-side-purchases/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/woocommerce-server-side-tracking | public | 200 | image: http://localhost:3003/en/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image → 404 |
| http://localhost:3000/en/tracking-knowledge/shopware-6-tracking | public | 200 | image: http://localhost:3003/en/tracking-knowledge/shopware-6-tracking/opengraph-image → 404 |
| http://localhost:3000/de/docs | public | 200 | jsonld: $ TechArticle: missing/invalid datePublished; jsonld: $ TechArticle: missing author |
| http://localhost:3000/de/tracking-knowledge | public | 200 | image: http://localhost:3003/de/tracking-knowledge/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/meta-conversions-api-deduplication | public | 200 | image: http://localhost:3003/de/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/server-side-tracking-explained | public | 200 | image: http://localhost:3003/de/tracking-knowledge/server-side-tracking-explained/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/consent-mode-v2-guide | public | 200 | image: http://localhost:3003/de/tracking-knowledge/consent-mode-v2-guide/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/google-ads-enhanced-conversions | public | 200 | image: http://localhost:3003/de/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/tiktok-events-api-setup | public | 200 | image: http://localhost:3003/de/tracking-knowledge/tiktok-events-api-setup/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/ga4-measurement-protocol-eu | public | 200 | image: http://localhost:3003/de/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/dedup-event-id-order-id | public | 200 | image: http://localhost:3003/de/tracking-knowledge/dedup-event-id-order-id/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/microsoft-conversions-api-uet | public | 200 | image: http://localhost:3003/de/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/linkedin-conversions-api-b2b | public | 200 | image: http://localhost:3003/de/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/reddit-pinterest-snapchat-capi | public | 200 | image: http://localhost:3003/de/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/click-ids-attribution-windows | public | 200 | image: http://localhost:3003/de/tracking-knowledge/click-ids-attribution-windows/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/first-party-tracking-domains | public | 200 | image: http://localhost:3003/de/tracking-knowledge/first-party-tracking-domains/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/offline-conversions-crm | public | 200 | image: http://localhost:3003/de/tracking-knowledge/offline-conversions-crm/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/affiliate-postbacks-s2s | public | 200 | image: http://localhost:3003/de/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/tcf-2-2-gpp-gpc | public | 200 | image: http://localhost:3003/de/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/dsar-deletion-tracking-data | public | 200 | image: http://localhost:3003/de/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/data-retention-policy-tracking | public | 200 | image: http://localhost:3003/de/tracking-knowledge/data-retention-policy-tracking/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/tracking-health-score | public | 200 | image: http://localhost:3003/de/tracking-knowledge/tracking-health-score/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/ad-blockers-itp-measurement | public | 200 | image: http://localhost:3003/de/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/migrating-from-gtm | public | 200 | image: http://localhost:3003/de/tracking-knowledge/migrating-from-gtm/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/ai-assistant-tag-management-safety | public | 200 | image: http://localhost:3003/de/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/event-taxonomy-standard-events | public | 200 | image: http://localhost:3003/de/tracking-knowledge/event-taxonomy-standard-events/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/pii-in-tracking-data | public | 200 | image: http://localhost:3003/de/tracking-knowledge/pii-in-tracking-data/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/signed-configuration-supply-chain | public | 200 | image: http://localhost:3003/de/tracking-knowledge/signed-configuration-supply-chain/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/kill-switch-incident-playbook | public | 200 | image: http://localhost:3003/de/tracking-knowledge/kill-switch-incident-playbook/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/lead-gen-tracking-b2b | public | 200 | image: http://localhost:3003/de/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/subscription-saas-events | public | 200 | image: http://localhost:3003/de/tracking-knowledge/subscription-saas-events/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/shopify-server-side-purchases | public | 200 | image: http://localhost:3003/de/tracking-knowledge/shopify-server-side-purchases/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/woocommerce-server-side-tracking | public | 200 | image: http://localhost:3003/de/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image → 404 |
| http://localhost:3000/de/tracking-knowledge/shopware-6-tracking | public | 200 | image: http://localhost:3003/de/tracking-knowledge/shopware-6-tracking/opengraph-image → 404 |
| http://localhost:3000/fr/docs | public | 200 | jsonld: $ TechArticle: missing/invalid datePublished; jsonld: $ TechArticle: missing author |
| http://localhost:3000/fr/tracking-knowledge | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/meta-conversions-api-deduplication | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/server-side-tracking-explained | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/server-side-tracking-explained/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/consent-mode-v2-guide | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/consent-mode-v2-guide/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/google-ads-enhanced-conversions | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/tiktok-events-api-setup | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/tiktok-events-api-setup/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/ga4-measurement-protocol-eu | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/dedup-event-id-order-id | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/dedup-event-id-order-id/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/microsoft-conversions-api-uet | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/linkedin-conversions-api-b2b | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/reddit-pinterest-snapchat-capi | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/click-ids-attribution-windows | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/click-ids-attribution-windows/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/first-party-tracking-domains | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/first-party-tracking-domains/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/offline-conversions-crm | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/offline-conversions-crm/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/affiliate-postbacks-s2s | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/tcf-2-2-gpp-gpc | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/dsar-deletion-tracking-data | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/data-retention-policy-tracking | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/data-retention-policy-tracking/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/tracking-health-score | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/tracking-health-score/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/ad-blockers-itp-measurement | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/migrating-from-gtm | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/migrating-from-gtm/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/ai-assistant-tag-management-safety | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/event-taxonomy-standard-events | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/event-taxonomy-standard-events/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/pii-in-tracking-data | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/pii-in-tracking-data/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/signed-configuration-supply-chain | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/signed-configuration-supply-chain/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/kill-switch-incident-playbook | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/kill-switch-incident-playbook/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/lead-gen-tracking-b2b | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/subscription-saas-events | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/subscription-saas-events/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/shopify-server-side-purchases | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/shopify-server-side-purchases/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/woocommerce-server-side-tracking | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image → 404 |
| http://localhost:3000/fr/tracking-knowledge/shopware-6-tracking | public | 200 | image: http://localhost:3003/fr/tracking-knowledge/shopware-6-tracking/opengraph-image → 404 |
| http://localhost:3000/es/docs | public | 200 | jsonld: $ TechArticle: missing/invalid datePublished; jsonld: $ TechArticle: missing author |
| http://localhost:3000/es/tracking-knowledge | public | 200 | image: http://localhost:3003/es/tracking-knowledge/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/meta-conversions-api-deduplication | public | 200 | image: http://localhost:3003/es/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/server-side-tracking-explained | public | 200 | image: http://localhost:3003/es/tracking-knowledge/server-side-tracking-explained/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/consent-mode-v2-guide | public | 200 | image: http://localhost:3003/es/tracking-knowledge/consent-mode-v2-guide/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/google-ads-enhanced-conversions | public | 200 | image: http://localhost:3003/es/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/tiktok-events-api-setup | public | 200 | image: http://localhost:3003/es/tracking-knowledge/tiktok-events-api-setup/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/ga4-measurement-protocol-eu | public | 200 | image: http://localhost:3003/es/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/dedup-event-id-order-id | public | 200 | image: http://localhost:3003/es/tracking-knowledge/dedup-event-id-order-id/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/microsoft-conversions-api-uet | public | 200 | image: http://localhost:3003/es/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/linkedin-conversions-api-b2b | public | 200 | image: http://localhost:3003/es/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/reddit-pinterest-snapchat-capi | public | 200 | image: http://localhost:3003/es/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/click-ids-attribution-windows | public | 200 | image: http://localhost:3003/es/tracking-knowledge/click-ids-attribution-windows/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/first-party-tracking-domains | public | 200 | image: http://localhost:3003/es/tracking-knowledge/first-party-tracking-domains/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/offline-conversions-crm | public | 200 | image: http://localhost:3003/es/tracking-knowledge/offline-conversions-crm/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/affiliate-postbacks-s2s | public | 200 | image: http://localhost:3003/es/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/tcf-2-2-gpp-gpc | public | 200 | image: http://localhost:3003/es/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/dsar-deletion-tracking-data | public | 200 | image: http://localhost:3003/es/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/data-retention-policy-tracking | public | 200 | image: http://localhost:3003/es/tracking-knowledge/data-retention-policy-tracking/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/tracking-health-score | public | 200 | image: http://localhost:3003/es/tracking-knowledge/tracking-health-score/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/ad-blockers-itp-measurement | public | 200 | image: http://localhost:3003/es/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/migrating-from-gtm | public | 200 | image: http://localhost:3003/es/tracking-knowledge/migrating-from-gtm/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/ai-assistant-tag-management-safety | public | 200 | image: http://localhost:3003/es/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/event-taxonomy-standard-events | public | 200 | image: http://localhost:3003/es/tracking-knowledge/event-taxonomy-standard-events/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/pii-in-tracking-data | public | 200 | image: http://localhost:3003/es/tracking-knowledge/pii-in-tracking-data/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/signed-configuration-supply-chain | public | 200 | image: http://localhost:3003/es/tracking-knowledge/signed-configuration-supply-chain/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/kill-switch-incident-playbook | public | 200 | image: http://localhost:3003/es/tracking-knowledge/kill-switch-incident-playbook/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/lead-gen-tracking-b2b | public | 200 | image: http://localhost:3003/es/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/subscription-saas-events | public | 200 | image: http://localhost:3003/es/tracking-knowledge/subscription-saas-events/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/shopify-server-side-purchases | public | 200 | image: http://localhost:3003/es/tracking-knowledge/shopify-server-side-purchases/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/woocommerce-server-side-tracking | public | 200 | image: http://localhost:3003/es/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image → 404 |
| http://localhost:3000/es/tracking-knowledge/shopware-6-tracking | public | 200 | image: http://localhost:3003/es/tracking-knowledge/shopware-6-tracking/opengraph-image → 404 |
| http://localhost:3000/it/docs | public | 200 | jsonld: $ TechArticle: missing/invalid datePublished; jsonld: $ TechArticle: missing author |
| http://localhost:3000/it/tracking-knowledge | public | 200 | image: http://localhost:3003/it/tracking-knowledge/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/meta-conversions-api-deduplication | public | 200 | image: http://localhost:3003/it/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/server-side-tracking-explained | public | 200 | image: http://localhost:3003/it/tracking-knowledge/server-side-tracking-explained/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/consent-mode-v2-guide | public | 200 | image: http://localhost:3003/it/tracking-knowledge/consent-mode-v2-guide/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/google-ads-enhanced-conversions | public | 200 | image: http://localhost:3003/it/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/tiktok-events-api-setup | public | 200 | image: http://localhost:3003/it/tracking-knowledge/tiktok-events-api-setup/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/ga4-measurement-protocol-eu | public | 200 | image: http://localhost:3003/it/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/dedup-event-id-order-id | public | 200 | image: http://localhost:3003/it/tracking-knowledge/dedup-event-id-order-id/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/microsoft-conversions-api-uet | public | 200 | image: http://localhost:3003/it/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/linkedin-conversions-api-b2b | public | 200 | image: http://localhost:3003/it/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/reddit-pinterest-snapchat-capi | public | 200 | image: http://localhost:3003/it/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/click-ids-attribution-windows | public | 200 | image: http://localhost:3003/it/tracking-knowledge/click-ids-attribution-windows/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/first-party-tracking-domains | public | 200 | image: http://localhost:3003/it/tracking-knowledge/first-party-tracking-domains/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/offline-conversions-crm | public | 200 | image: http://localhost:3003/it/tracking-knowledge/offline-conversions-crm/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/affiliate-postbacks-s2s | public | 200 | image: http://localhost:3003/it/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/tcf-2-2-gpp-gpc | public | 200 | image: http://localhost:3003/it/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/dsar-deletion-tracking-data | public | 200 | image: http://localhost:3003/it/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/data-retention-policy-tracking | public | 200 | image: http://localhost:3003/it/tracking-knowledge/data-retention-policy-tracking/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/tracking-health-score | public | 200 | image: http://localhost:3003/it/tracking-knowledge/tracking-health-score/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/ad-blockers-itp-measurement | public | 200 | image: http://localhost:3003/it/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/migrating-from-gtm | public | 200 | image: http://localhost:3003/it/tracking-knowledge/migrating-from-gtm/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/ai-assistant-tag-management-safety | public | 200 | image: http://localhost:3003/it/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/event-taxonomy-standard-events | public | 200 | image: http://localhost:3003/it/tracking-knowledge/event-taxonomy-standard-events/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/pii-in-tracking-data | public | 200 | image: http://localhost:3003/it/tracking-knowledge/pii-in-tracking-data/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/signed-configuration-supply-chain | public | 200 | image: http://localhost:3003/it/tracking-knowledge/signed-configuration-supply-chain/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/kill-switch-incident-playbook | public | 200 | image: http://localhost:3003/it/tracking-knowledge/kill-switch-incident-playbook/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/lead-gen-tracking-b2b | public | 200 | image: http://localhost:3003/it/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/subscription-saas-events | public | 200 | image: http://localhost:3003/it/tracking-knowledge/subscription-saas-events/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/shopify-server-side-purchases | public | 200 | image: http://localhost:3003/it/tracking-knowledge/shopify-server-side-purchases/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/woocommerce-server-side-tracking | public | 200 | image: http://localhost:3003/it/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image → 404 |
| http://localhost:3000/it/tracking-knowledge/shopware-6-tracking | public | 200 | image: http://localhost:3003/it/tracking-knowledge/shopware-6-tracking/opengraph-image → 404 |
| http://localhost:3000/nl/docs | public | 200 | jsonld: $ TechArticle: missing/invalid datePublished; jsonld: $ TechArticle: missing author |
| http://localhost:3000/nl/tracking-knowledge | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/meta-conversions-api-deduplication | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/server-side-tracking-explained | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/server-side-tracking-explained/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/consent-mode-v2-guide | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/consent-mode-v2-guide/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/google-ads-enhanced-conversions | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/tiktok-events-api-setup | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/tiktok-events-api-setup/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/ga4-measurement-protocol-eu | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/dedup-event-id-order-id | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/dedup-event-id-order-id/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/microsoft-conversions-api-uet | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/linkedin-conversions-api-b2b | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/reddit-pinterest-snapchat-capi | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/click-ids-attribution-windows | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/click-ids-attribution-windows/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/first-party-tracking-domains | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/first-party-tracking-domains/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/offline-conversions-crm | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/offline-conversions-crm/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/affiliate-postbacks-s2s | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/tcf-2-2-gpp-gpc | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/dsar-deletion-tracking-data | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/data-retention-policy-tracking | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/data-retention-policy-tracking/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/tracking-health-score | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/tracking-health-score/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/ad-blockers-itp-measurement | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/migrating-from-gtm | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/migrating-from-gtm/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/ai-assistant-tag-management-safety | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/event-taxonomy-standard-events | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/event-taxonomy-standard-events/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/pii-in-tracking-data | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/pii-in-tracking-data/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/signed-configuration-supply-chain | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/signed-configuration-supply-chain/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/kill-switch-incident-playbook | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/kill-switch-incident-playbook/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/lead-gen-tracking-b2b | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/subscription-saas-events | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/subscription-saas-events/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/shopify-server-side-purchases | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/shopify-server-side-purchases/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/woocommerce-server-side-tracking | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image → 404 |
| http://localhost:3000/nl/tracking-knowledge/shopware-6-tracking | public | 200 | image: http://localhost:3003/nl/tracking-knowledge/shopware-6-tracking/opengraph-image → 404 |
| http://localhost:3003/app/destinations | dashboard | 200 | h1: 2 <h1> elements |
| http://localhost:3003/app/onboarding/organization | dashboard | 307 | status: HTTP 307 → /app/onboarding |

## Titles longer than 60 characters

| URL | Length | Title |
| --- | --- | --- |
| http://localhost:3000/en/tracking-knowledge/reddit-pinterest-snapchat-capi | 62 | Reddit, Pinterest and Snapchat conversion APIs side by · Track |
| http://localhost:3000/de/tracking-knowledge/ai-assistant-tag-management-safety | 63 | Ein KI-Assistent, der dein Tracking nicht kaputt machen · Track |
| http://localhost:3000/de/tracking-knowledge/shopify-server-side-purchases | 63 | Shopify-Tracking, das den gehosteten Checkout übersteht · Track |
| http://localhost:3000/fr | 65 | Track – Tag manager AI-first et routeur d’événements côté serveur |
| http://localhost:3000/fr/tracking-knowledge/dsar-deletion-tracking-data | 64 | Traiter une demande d'exercice de droits sur les données · Track |
| http://localhost:3000/fr/tracking-knowledge/data-retention-policy-tracking | 62 | Une politique de conservation des données de tracking  · Track |
| http://localhost:3000/fr/tracking-knowledge/ai-assistant-tag-management-safety | 62 | Un assistant IA qui ne peut pas casser votre tracking  · Track |
| http://localhost:3000/es/tracking-knowledge/dsar-deletion-tracking-data | 62 | Gestionar una solicitud de ejercicio de derechos sobre · Track |
| http://localhost:3000/es/tracking-knowledge/shopify-server-side-purchases | 61 | Tracking de Shopify que sobrevive al checkout alojado · Track |
| http://localhost:3000/es/tracking-knowledge/woocommerce-server-side-tracking | 63 | Tracking de WooCommerce con webhooks de pedido firmados · Track |
| http://localhost:3000/it/tracking-knowledge/woocommerce-server-side-tracking | 61 | Tracking WooCommerce con webhook degli ordini firmati · Track |
| http://localhost:3000/nl/tracking-knowledge/reddit-pinterest-snapchat-capi | 61 | Reddit, Pinterest en Snapchat Conversions API's naast · Track |
| http://localhost:3000/nl/tracking-knowledge/dsar-deletion-tracking-data | 65 | Een verzoek van een betrokkene afhandelen in trackingdata · Track |
| http://localhost:3000/nl/tracking-knowledge/ai-assistant-tag-management-safety | 61 | Een AI-assistent die je tracking niet kapot kan maken · Track |

## Broken links and images (4xx/5xx, fetch errors)

| Target | Status | Occurrences | Example pages |
| --- | --- | --- | --- |
| http://localhost:3003/en/tracking-knowledge/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge |
| http://localhost:3003/en/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/meta-conversions-api-deduplication |
| http://localhost:3003/en/tracking-knowledge/server-side-tracking-explained/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/server-side-tracking-explained |
| http://localhost:3003/en/tracking-knowledge/consent-mode-v2-guide/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/consent-mode-v2-guide |
| http://localhost:3003/en/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/google-ads-enhanced-conversions |
| http://localhost:3003/en/tracking-knowledge/tiktok-events-api-setup/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/tiktok-events-api-setup |
| http://localhost:3003/en/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/ga4-measurement-protocol-eu |
| http://localhost:3003/en/tracking-knowledge/dedup-event-id-order-id/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/dedup-event-id-order-id |
| http://localhost:3003/en/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/microsoft-conversions-api-uet |
| http://localhost:3003/en/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/linkedin-conversions-api-b2b |
| http://localhost:3003/en/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/reddit-pinterest-snapchat-capi |
| http://localhost:3003/en/tracking-knowledge/click-ids-attribution-windows/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/click-ids-attribution-windows |
| http://localhost:3003/en/tracking-knowledge/first-party-tracking-domains/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/first-party-tracking-domains |
| http://localhost:3003/en/tracking-knowledge/offline-conversions-crm/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/offline-conversions-crm |
| http://localhost:3003/en/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/affiliate-postbacks-s2s |
| http://localhost:3003/en/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/tcf-2-2-gpp-gpc |
| http://localhost:3003/en/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/dsar-deletion-tracking-data |
| http://localhost:3003/en/tracking-knowledge/data-retention-policy-tracking/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/data-retention-policy-tracking |
| http://localhost:3003/en/tracking-knowledge/tracking-health-score/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/tracking-health-score |
| http://localhost:3003/en/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/ad-blockers-itp-measurement |
| http://localhost:3003/en/tracking-knowledge/migrating-from-gtm/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/migrating-from-gtm |
| http://localhost:3003/en/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/ai-assistant-tag-management-safety |
| http://localhost:3003/en/tracking-knowledge/event-taxonomy-standard-events/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/event-taxonomy-standard-events |
| http://localhost:3003/en/tracking-knowledge/pii-in-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/pii-in-tracking-data |
| http://localhost:3003/en/tracking-knowledge/signed-configuration-supply-chain/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/signed-configuration-supply-chain |
| http://localhost:3003/en/tracking-knowledge/kill-switch-incident-playbook/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/kill-switch-incident-playbook |
| http://localhost:3003/en/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/lead-gen-tracking-b2b |
| http://localhost:3003/en/tracking-knowledge/subscription-saas-events/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/subscription-saas-events |
| http://localhost:3003/en/tracking-knowledge/shopify-server-side-purchases/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/shopify-server-side-purchases |
| http://localhost:3003/en/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/woocommerce-server-side-tracking |
| http://localhost:3003/en/tracking-knowledge/shopware-6-tracking/opengraph-image | 404 | 1 | http://localhost:3000/en/tracking-knowledge/shopware-6-tracking |
| http://localhost:3003/de/tracking-knowledge/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge |
| http://localhost:3003/de/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/meta-conversions-api-deduplication |
| http://localhost:3003/de/tracking-knowledge/server-side-tracking-explained/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/server-side-tracking-explained |
| http://localhost:3003/de/tracking-knowledge/consent-mode-v2-guide/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/consent-mode-v2-guide |
| http://localhost:3003/de/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/google-ads-enhanced-conversions |
| http://localhost:3003/de/tracking-knowledge/tiktok-events-api-setup/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/tiktok-events-api-setup |
| http://localhost:3003/de/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/ga4-measurement-protocol-eu |
| http://localhost:3003/de/tracking-knowledge/dedup-event-id-order-id/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/dedup-event-id-order-id |
| http://localhost:3003/de/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/microsoft-conversions-api-uet |
| http://localhost:3003/de/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/linkedin-conversions-api-b2b |
| http://localhost:3003/de/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/reddit-pinterest-snapchat-capi |
| http://localhost:3003/de/tracking-knowledge/click-ids-attribution-windows/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/click-ids-attribution-windows |
| http://localhost:3003/de/tracking-knowledge/first-party-tracking-domains/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/first-party-tracking-domains |
| http://localhost:3003/de/tracking-knowledge/offline-conversions-crm/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/offline-conversions-crm |
| http://localhost:3003/de/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/affiliate-postbacks-s2s |
| http://localhost:3003/de/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/tcf-2-2-gpp-gpc |
| http://localhost:3003/de/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/dsar-deletion-tracking-data |
| http://localhost:3003/de/tracking-knowledge/data-retention-policy-tracking/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/data-retention-policy-tracking |
| http://localhost:3003/de/tracking-knowledge/tracking-health-score/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/tracking-health-score |
| http://localhost:3003/de/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/ad-blockers-itp-measurement |
| http://localhost:3003/de/tracking-knowledge/migrating-from-gtm/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/migrating-from-gtm |
| http://localhost:3003/de/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/ai-assistant-tag-management-safety |
| http://localhost:3003/de/tracking-knowledge/event-taxonomy-standard-events/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/event-taxonomy-standard-events |
| http://localhost:3003/de/tracking-knowledge/pii-in-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/pii-in-tracking-data |
| http://localhost:3003/de/tracking-knowledge/signed-configuration-supply-chain/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/signed-configuration-supply-chain |
| http://localhost:3003/de/tracking-knowledge/kill-switch-incident-playbook/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/kill-switch-incident-playbook |
| http://localhost:3003/de/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/lead-gen-tracking-b2b |
| http://localhost:3003/de/tracking-knowledge/subscription-saas-events/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/subscription-saas-events |
| http://localhost:3003/de/tracking-knowledge/shopify-server-side-purchases/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/shopify-server-side-purchases |
| http://localhost:3003/de/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/woocommerce-server-side-tracking |
| http://localhost:3003/de/tracking-knowledge/shopware-6-tracking/opengraph-image | 404 | 1 | http://localhost:3000/de/tracking-knowledge/shopware-6-tracking |
| http://localhost:3003/fr/tracking-knowledge/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge |
| http://localhost:3003/fr/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/meta-conversions-api-deduplication |
| http://localhost:3003/fr/tracking-knowledge/server-side-tracking-explained/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/server-side-tracking-explained |
| http://localhost:3003/fr/tracking-knowledge/consent-mode-v2-guide/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/consent-mode-v2-guide |
| http://localhost:3003/fr/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/google-ads-enhanced-conversions |
| http://localhost:3003/fr/tracking-knowledge/tiktok-events-api-setup/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/tiktok-events-api-setup |
| http://localhost:3003/fr/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/ga4-measurement-protocol-eu |
| http://localhost:3003/fr/tracking-knowledge/dedup-event-id-order-id/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/dedup-event-id-order-id |
| http://localhost:3003/fr/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/microsoft-conversions-api-uet |
| http://localhost:3003/fr/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/linkedin-conversions-api-b2b |
| http://localhost:3003/fr/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/reddit-pinterest-snapchat-capi |
| http://localhost:3003/fr/tracking-knowledge/click-ids-attribution-windows/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/click-ids-attribution-windows |
| http://localhost:3003/fr/tracking-knowledge/first-party-tracking-domains/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/first-party-tracking-domains |
| http://localhost:3003/fr/tracking-knowledge/offline-conversions-crm/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/offline-conversions-crm |
| http://localhost:3003/fr/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/affiliate-postbacks-s2s |
| http://localhost:3003/fr/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/tcf-2-2-gpp-gpc |
| http://localhost:3003/fr/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/dsar-deletion-tracking-data |
| http://localhost:3003/fr/tracking-knowledge/data-retention-policy-tracking/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/data-retention-policy-tracking |
| http://localhost:3003/fr/tracking-knowledge/tracking-health-score/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/tracking-health-score |
| http://localhost:3003/fr/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/ad-blockers-itp-measurement |
| http://localhost:3003/fr/tracking-knowledge/migrating-from-gtm/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/migrating-from-gtm |
| http://localhost:3003/fr/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/ai-assistant-tag-management-safety |
| http://localhost:3003/fr/tracking-knowledge/event-taxonomy-standard-events/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/event-taxonomy-standard-events |
| http://localhost:3003/fr/tracking-knowledge/pii-in-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/pii-in-tracking-data |
| http://localhost:3003/fr/tracking-knowledge/signed-configuration-supply-chain/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/signed-configuration-supply-chain |
| http://localhost:3003/fr/tracking-knowledge/kill-switch-incident-playbook/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/kill-switch-incident-playbook |
| http://localhost:3003/fr/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/lead-gen-tracking-b2b |
| http://localhost:3003/fr/tracking-knowledge/subscription-saas-events/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/subscription-saas-events |
| http://localhost:3003/fr/tracking-knowledge/shopify-server-side-purchases/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/shopify-server-side-purchases |
| http://localhost:3003/fr/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/woocommerce-server-side-tracking |
| http://localhost:3003/fr/tracking-knowledge/shopware-6-tracking/opengraph-image | 404 | 1 | http://localhost:3000/fr/tracking-knowledge/shopware-6-tracking |
| http://localhost:3003/es/tracking-knowledge/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge |
| http://localhost:3003/es/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/meta-conversions-api-deduplication |
| http://localhost:3003/es/tracking-knowledge/server-side-tracking-explained/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/server-side-tracking-explained |
| http://localhost:3003/es/tracking-knowledge/consent-mode-v2-guide/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/consent-mode-v2-guide |
| http://localhost:3003/es/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/google-ads-enhanced-conversions |
| http://localhost:3003/es/tracking-knowledge/tiktok-events-api-setup/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/tiktok-events-api-setup |
| http://localhost:3003/es/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/ga4-measurement-protocol-eu |
| http://localhost:3003/es/tracking-knowledge/dedup-event-id-order-id/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/dedup-event-id-order-id |
| http://localhost:3003/es/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/microsoft-conversions-api-uet |
| http://localhost:3003/es/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/linkedin-conversions-api-b2b |
| http://localhost:3003/es/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/reddit-pinterest-snapchat-capi |
| http://localhost:3003/es/tracking-knowledge/click-ids-attribution-windows/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/click-ids-attribution-windows |
| http://localhost:3003/es/tracking-knowledge/first-party-tracking-domains/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/first-party-tracking-domains |
| http://localhost:3003/es/tracking-knowledge/offline-conversions-crm/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/offline-conversions-crm |
| http://localhost:3003/es/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/affiliate-postbacks-s2s |
| http://localhost:3003/es/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/tcf-2-2-gpp-gpc |
| http://localhost:3003/es/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/dsar-deletion-tracking-data |
| http://localhost:3003/es/tracking-knowledge/data-retention-policy-tracking/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/data-retention-policy-tracking |
| http://localhost:3003/es/tracking-knowledge/tracking-health-score/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/tracking-health-score |
| http://localhost:3003/es/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/ad-blockers-itp-measurement |
| http://localhost:3003/es/tracking-knowledge/migrating-from-gtm/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/migrating-from-gtm |
| http://localhost:3003/es/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/ai-assistant-tag-management-safety |
| http://localhost:3003/es/tracking-knowledge/event-taxonomy-standard-events/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/event-taxonomy-standard-events |
| http://localhost:3003/es/tracking-knowledge/pii-in-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/pii-in-tracking-data |
| http://localhost:3003/es/tracking-knowledge/signed-configuration-supply-chain/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/signed-configuration-supply-chain |
| http://localhost:3003/es/tracking-knowledge/kill-switch-incident-playbook/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/kill-switch-incident-playbook |
| http://localhost:3003/es/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/lead-gen-tracking-b2b |
| http://localhost:3003/es/tracking-knowledge/subscription-saas-events/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/subscription-saas-events |
| http://localhost:3003/es/tracking-knowledge/shopify-server-side-purchases/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/shopify-server-side-purchases |
| http://localhost:3003/es/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/woocommerce-server-side-tracking |
| http://localhost:3003/es/tracking-knowledge/shopware-6-tracking/opengraph-image | 404 | 1 | http://localhost:3000/es/tracking-knowledge/shopware-6-tracking |
| http://localhost:3003/it/tracking-knowledge/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge |
| http://localhost:3003/it/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/meta-conversions-api-deduplication |
| http://localhost:3003/it/tracking-knowledge/server-side-tracking-explained/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/server-side-tracking-explained |
| http://localhost:3003/it/tracking-knowledge/consent-mode-v2-guide/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/consent-mode-v2-guide |
| http://localhost:3003/it/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/google-ads-enhanced-conversions |
| http://localhost:3003/it/tracking-knowledge/tiktok-events-api-setup/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/tiktok-events-api-setup |
| http://localhost:3003/it/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/ga4-measurement-protocol-eu |
| http://localhost:3003/it/tracking-knowledge/dedup-event-id-order-id/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/dedup-event-id-order-id |
| http://localhost:3003/it/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/microsoft-conversions-api-uet |
| http://localhost:3003/it/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/linkedin-conversions-api-b2b |
| http://localhost:3003/it/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/reddit-pinterest-snapchat-capi |
| http://localhost:3003/it/tracking-knowledge/click-ids-attribution-windows/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/click-ids-attribution-windows |
| http://localhost:3003/it/tracking-knowledge/first-party-tracking-domains/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/first-party-tracking-domains |
| http://localhost:3003/it/tracking-knowledge/offline-conversions-crm/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/offline-conversions-crm |
| http://localhost:3003/it/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/affiliate-postbacks-s2s |
| http://localhost:3003/it/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/tcf-2-2-gpp-gpc |
| http://localhost:3003/it/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/dsar-deletion-tracking-data |
| http://localhost:3003/it/tracking-knowledge/data-retention-policy-tracking/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/data-retention-policy-tracking |
| http://localhost:3003/it/tracking-knowledge/tracking-health-score/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/tracking-health-score |
| http://localhost:3003/it/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/ad-blockers-itp-measurement |
| http://localhost:3003/it/tracking-knowledge/migrating-from-gtm/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/migrating-from-gtm |
| http://localhost:3003/it/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/ai-assistant-tag-management-safety |
| http://localhost:3003/it/tracking-knowledge/event-taxonomy-standard-events/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/event-taxonomy-standard-events |
| http://localhost:3003/it/tracking-knowledge/pii-in-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/pii-in-tracking-data |
| http://localhost:3003/it/tracking-knowledge/signed-configuration-supply-chain/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/signed-configuration-supply-chain |
| http://localhost:3003/it/tracking-knowledge/kill-switch-incident-playbook/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/kill-switch-incident-playbook |
| http://localhost:3003/it/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/lead-gen-tracking-b2b |
| http://localhost:3003/it/tracking-knowledge/subscription-saas-events/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/subscription-saas-events |
| http://localhost:3003/it/tracking-knowledge/shopify-server-side-purchases/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/shopify-server-side-purchases |
| http://localhost:3003/it/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/woocommerce-server-side-tracking |
| http://localhost:3003/it/tracking-knowledge/shopware-6-tracking/opengraph-image | 404 | 1 | http://localhost:3000/it/tracking-knowledge/shopware-6-tracking |
| http://localhost:3003/nl/tracking-knowledge/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge |
| http://localhost:3003/nl/tracking-knowledge/meta-conversions-api-deduplication/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/meta-conversions-api-deduplication |
| http://localhost:3003/nl/tracking-knowledge/server-side-tracking-explained/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/server-side-tracking-explained |
| http://localhost:3003/nl/tracking-knowledge/consent-mode-v2-guide/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/consent-mode-v2-guide |
| http://localhost:3003/nl/tracking-knowledge/google-ads-enhanced-conversions/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/google-ads-enhanced-conversions |
| http://localhost:3003/nl/tracking-knowledge/tiktok-events-api-setup/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/tiktok-events-api-setup |
| http://localhost:3003/nl/tracking-knowledge/ga4-measurement-protocol-eu/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/ga4-measurement-protocol-eu |
| http://localhost:3003/nl/tracking-knowledge/dedup-event-id-order-id/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/dedup-event-id-order-id |
| http://localhost:3003/nl/tracking-knowledge/microsoft-conversions-api-uet/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/microsoft-conversions-api-uet |
| http://localhost:3003/nl/tracking-knowledge/linkedin-conversions-api-b2b/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/linkedin-conversions-api-b2b |
| http://localhost:3003/nl/tracking-knowledge/reddit-pinterest-snapchat-capi/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/reddit-pinterest-snapchat-capi |
| http://localhost:3003/nl/tracking-knowledge/click-ids-attribution-windows/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/click-ids-attribution-windows |
| http://localhost:3003/nl/tracking-knowledge/first-party-tracking-domains/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/first-party-tracking-domains |
| http://localhost:3003/nl/tracking-knowledge/offline-conversions-crm/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/offline-conversions-crm |
| http://localhost:3003/nl/tracking-knowledge/affiliate-postbacks-s2s/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/affiliate-postbacks-s2s |
| http://localhost:3003/nl/tracking-knowledge/tcf-2-2-gpp-gpc/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/tcf-2-2-gpp-gpc |
| http://localhost:3003/nl/tracking-knowledge/dsar-deletion-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/dsar-deletion-tracking-data |
| http://localhost:3003/nl/tracking-knowledge/data-retention-policy-tracking/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/data-retention-policy-tracking |
| http://localhost:3003/nl/tracking-knowledge/tracking-health-score/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/tracking-health-score |
| http://localhost:3003/nl/tracking-knowledge/ad-blockers-itp-measurement/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/ad-blockers-itp-measurement |
| http://localhost:3003/nl/tracking-knowledge/migrating-from-gtm/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/migrating-from-gtm |
| http://localhost:3003/nl/tracking-knowledge/ai-assistant-tag-management-safety/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/ai-assistant-tag-management-safety |
| http://localhost:3003/nl/tracking-knowledge/event-taxonomy-standard-events/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/event-taxonomy-standard-events |
| http://localhost:3003/nl/tracking-knowledge/pii-in-tracking-data/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/pii-in-tracking-data |
| http://localhost:3003/nl/tracking-knowledge/signed-configuration-supply-chain/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/signed-configuration-supply-chain |
| http://localhost:3003/nl/tracking-knowledge/kill-switch-incident-playbook/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/kill-switch-incident-playbook |
| http://localhost:3003/nl/tracking-knowledge/lead-gen-tracking-b2b/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/lead-gen-tracking-b2b |
| http://localhost:3003/nl/tracking-knowledge/subscription-saas-events/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/subscription-saas-events |
| http://localhost:3003/nl/tracking-knowledge/shopify-server-side-purchases/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/shopify-server-side-purchases |
| http://localhost:3003/nl/tracking-knowledge/woocommerce-server-side-tracking/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/woocommerce-server-side-tracking |
| http://localhost:3003/nl/tracking-knowledge/shopware-6-tracking/opengraph-image | 404 | 1 | http://localhost:3000/nl/tracking-knowledge/shopware-6-tracking |

## Redirect chains (≥ 2 hops)

None: no internal link or image passed through more than one redirect.

## Links answered via exactly one redirect (informational)

| Target | Redirect | Occurrences | Example pages |
| --- | --- | --- | --- |
| http://localhost:3003/contact?topic=enterprise | 308 http://localhost:3003/contact?topic=enterprise → http://localhost:3003/en/contact?topic=enterprise | 1 | http://localhost:3003/app/billing |

## Structured data (JSON-LD)

912 `application/ld+json` blocks on 468 pages were parsed; validated types: Organization (6), WebSite (6), BreadcrumbList (462), FAQPage (198), HowTo (6), ItemList (6), SoftwareApplication (6), WebPage (24), TechArticle (102), Blog (6), ContactPage (6), BlogPosting (84). Required-field rules: BlogPosting/TechArticle (headline, datePublished, author with @type+name, publisher name+logo, absolute image/url/mainEntityOfPage), BreadcrumbList (ListItem with sequential position, name, absolute item), FAQPage (Question name + Answer text), Organization (name, url, logo), WebSite (name, url), Blog/WebPage (name, url), SoftwareApplication (name, applicationCategory, Offer price + priceCurrency).

### Schema errors

| Error | Blocks | Example pages |
| --- | --- | --- |
| $ TechArticle: missing/invalid datePublished | 6 | http://localhost:3000/en/docs, http://localhost:3000/de/docs, http://localhost:3000/fr/docs |
| $ TechArticle: missing author | 6 | http://localhost:3000/en/docs, http://localhost:3000/de/docs, http://localhost:3000/fr/docs |

### Schema warnings (recommended fields, origin notes)

| Warning | Blocks | Example pages |
| --- | --- | --- |
| $ HowTo: no validation rules for @type HowTo | 6 | http://localhost:3000/en/how-it-works, http://localhost:3000/de/how-it-works, http://localhost:3000/fr/how-it-works |
| $ ItemList: no validation rules for @type ItemList | 6 | http://localhost:3000/en/integrations, http://localhost:3000/de/integrations, http://localhost:3000/fr/integrations |
| $ TechArticle: missing recommended dateModified | 6 | http://localhost:3000/en/docs, http://localhost:3000/de/docs, http://localhost:3000/fr/docs |
| $ TechArticle: missing recommended publisher | 6 | http://localhost:3000/en/docs, http://localhost:3000/de/docs, http://localhost:3000/fr/docs |
| $ TechArticle: missing recommended image | 6 | http://localhost:3000/en/docs, http://localhost:3000/de/docs, http://localhost:3000/fr/docs |
| $ TechArticle: missing recommended mainEntityOfPage | 6 | http://localhost:3000/en/docs, http://localhost:3000/de/docs, http://localhost:3000/fr/docs |
| $ ContactPage: no validation rules for @type ContactPage | 6 | http://localhost:3000/en/contact, http://localhost:3000/de/contact, http://localhost:3000/fr/contact |
| $ BlogPosting: headline has 111 characters (Google truncates > 110) | 3 | http://localhost:3000/en/tracking-knowledge/kill-switch-incident-playbook, http://localhost:3000/it/tracking-knowledge/signed-configuration-supply-chain, http://localhost:3000/nl/tracking-knowledge/kill-switch-incident-playbook |
| $ TechArticle: headline has 128 characters (Google truncates > 110) | 2 | http://localhost:3000/en/tracking-knowledge/shopware-6-tracking, http://localhost:3000/nl/tracking-knowledge/shopware-6-tracking |
| $ TechArticle: headline has 115 characters (Google truncates > 110) | 1 | http://localhost:3000/de/tracking-knowledge/dedup-event-id-order-id |
| $ TechArticle: headline has 122 characters (Google truncates > 110) | 1 | http://localhost:3000/de/tracking-knowledge/data-retention-policy-tracking |
| $ BlogPosting: headline has 118 characters (Google truncates > 110) | 2 | http://localhost:3000/de/tracking-knowledge/ai-assistant-tag-management-safety, http://localhost:3000/fr/tracking-knowledge/offline-conversions-crm |
| $ BlogPosting: headline has 117 characters (Google truncates > 110) | 1 | http://localhost:3000/de/tracking-knowledge/pii-in-tracking-data |
| $ BlogPosting: headline has 112 characters (Google truncates > 110) | 4 | http://localhost:3000/de/tracking-knowledge/signed-configuration-supply-chain, http://localhost:3000/fr/tracking-knowledge/ai-assistant-tag-management-safety, http://localhost:3000/es/tracking-knowledge/first-party-tracking-domains |
| $ TechArticle: headline has 132 characters (Google truncates > 110) | 2 | http://localhost:3000/de/tracking-knowledge/shopify-server-side-purchases, http://localhost:3000/it/tracking-knowledge/data-retention-policy-tracking |
| $ TechArticle: headline has 112 characters (Google truncates > 110) | 1 | http://localhost:3000/de/tracking-knowledge/woocommerce-server-side-tracking |
| $ TechArticle: headline has 138 characters (Google truncates > 110) | 1 | http://localhost:3000/de/tracking-knowledge/shopware-6-tracking |
| $ TechArticle: headline has 111 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/google-ads-enhanced-conversions |
| $ TechArticle: headline has 116 characters (Google truncates > 110) | 2 | http://localhost:3000/fr/tracking-knowledge/ga4-measurement-protocol-eu, http://localhost:3000/it/tracking-knowledge/woocommerce-server-side-tracking |
| $ TechArticle: headline has 144 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/dedup-event-id-order-id |
| $ TechArticle: headline has 120 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/reddit-pinterest-snapchat-capi |
| $ TechArticle: headline has 124 characters (Google truncates > 110) | 5 | http://localhost:3000/fr/tracking-knowledge/click-ids-attribution-windows, http://localhost:3000/fr/tracking-knowledge/woocommerce-server-side-tracking, http://localhost:3000/fr/tracking-knowledge/shopware-6-tracking |
| $ BlogPosting: headline has 126 characters (Google truncates > 110) | 2 | http://localhost:3000/fr/tracking-knowledge/first-party-tracking-domains, http://localhost:3000/it/tracking-knowledge/kill-switch-incident-playbook |
| $ BlogPosting: headline has 115 characters (Google truncates > 110) | 3 | http://localhost:3000/fr/tracking-knowledge/dsar-deletion-tracking-data, http://localhost:3000/es/tracking-knowledge/dsar-deletion-tracking-data, http://localhost:3000/it/tracking-knowledge/first-party-tracking-domains |
| $ TechArticle: headline has 164 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/data-retention-policy-tracking |
| $ BlogPosting: headline has 135 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/pii-in-tracking-data |
| $ BlogPosting: headline has 130 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/signed-configuration-supply-chain |
| $ BlogPosting: headline has 125 characters (Google truncates > 110) | 2 | http://localhost:3000/fr/tracking-knowledge/kill-switch-incident-playbook, http://localhost:3000/es/tracking-knowledge/offline-conversions-crm |
| $ BlogPosting: headline has 121 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/subscription-saas-events |
| $ TechArticle: headline has 131 characters (Google truncates > 110) | 1 | http://localhost:3000/fr/tracking-knowledge/shopify-server-side-purchases |
| $ TechArticle: headline has 119 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/google-ads-enhanced-conversions |
| $ TechArticle: headline has 121 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/ga4-measurement-protocol-eu |
| $ TechArticle: headline has 117 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/reddit-pinterest-snapchat-capi |
| $ TechArticle: headline has 140 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/data-retention-policy-tracking |
| $ BlogPosting: headline has 116 characters (Google truncates > 110) | 2 | http://localhost:3000/es/tracking-knowledge/ai-assistant-tag-management-safety, http://localhost:3000/nl/tracking-knowledge/dsar-deletion-tracking-data |
| $ BlogPosting: headline has 113 characters (Google truncates > 110) | 3 | http://localhost:3000/es/tracking-knowledge/pii-in-tracking-data, http://localhost:3000/it/tracking-knowledge/ai-assistant-tag-management-safety, http://localhost:3000/nl/tracking-knowledge/offline-conversions-crm |
| $ BlogPosting: headline has 124 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/signed-configuration-supply-chain |
| $ BlogPosting: headline has 119 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/kill-switch-incident-playbook |
| $ TechArticle: headline has 130 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/shopify-server-side-purchases |
| $ TechArticle: headline has 127 characters (Google truncates > 110) | 1 | http://localhost:3000/es/tracking-knowledge/shopware-6-tracking |
| $ TechArticle: headline has 113 characters (Google truncates > 110) | 2 | http://localhost:3000/it/tracking-knowledge/dedup-event-id-order-id, http://localhost:3000/nl/tracking-knowledge/shopify-server-side-purchases |
| $ TechArticle: headline has 125 characters (Google truncates > 110) | 1 | http://localhost:3000/it/tracking-knowledge/shopware-6-tracking |
| $ TechArticle: headline has 123 characters (Google truncates > 110) | 1 | http://localhost:3000/nl/tracking-knowledge/data-retention-policy-tracking |
| $ TechArticle: headline has 114 characters (Google truncates > 110) | 1 | http://localhost:3000/nl/tracking-knowledge/woocommerce-server-side-tracking |

## Redirect matrix (Blog → Tracking Knowledge)

Source: `docs/redirects-blog-to-tracking-knowledge.md` (96 rows: 6 index/feed, 90 article). Checked: every index/feed row and a deterministic sample of 40 article rows (every ⌊i·90/40⌋-th row). Expectation per row: exactly one 308 whose Location (path + query) equals the documented target, and the target answers 200 without a further redirect.

| Group | Rows | Pass | Fail |
| --- | --- | --- | --- |
| index/feed | 6 | 6 | 0 |
| article sample | 40 | 40 | 0 |

Failures:

None.

Full list of checked rows:

| Group | Old URL | Status | Location (path) | Target status | Result |
| --- | --- | --- | --- | --- | --- |
| index/feed | /blog | 308 | /en/tracking-knowledge | 200 | ok |
| index/feed | /blog/feed.xml | 308 | /en/tracking-knowledge/feed.xml | 200 | ok |
| index/feed | /en/blog | 308 | /en/tracking-knowledge | 200 | ok |
| index/feed | /en/blog/feed.xml | 308 | /en/tracking-knowledge/feed.xml | 200 | ok |
| index/feed | /de/blog | 308 | /de/tracking-knowledge | 200 | ok |
| index/feed | /de/blog/feed.xml | 308 | /de/tracking-knowledge/feed.xml | 200 | ok |
| article-sample | /blog/ad-blockers-itp-measurement | 308 | /en/tracking-knowledge/ad-blockers-itp-measurement | 200 | ok |
| article-sample | /blog/affiliate-postbacks-s2s | 308 | /en/tracking-knowledge/affiliate-postbacks-s2s | 200 | ok |
| article-sample | /blog/ai-assistant-tag-management-safety | 308 | /en/tracking-knowledge/ai-assistant-tag-management-safety | 200 | ok |
| article-sample | /blog/click-ids-attribution-windows | 308 | /en/tracking-knowledge/click-ids-attribution-windows | 200 | ok |
| article-sample | /en/blog/consent-mode-v2-guide | 308 | /en/tracking-knowledge/consent-mode-v2-guide | 200 | ok |
| article-sample | /en/blog/data-retention-policy-tracking | 308 | /en/tracking-knowledge/data-retention-policy-tracking | 200 | ok |
| article-sample | /en/blog/dedup-event-id-order-id | 308 | /en/tracking-knowledge/dedup-event-id-order-id | 200 | ok |
| article-sample | /en/blog/dsar-deletion-tracking-data | 308 | /en/tracking-knowledge/dsar-deletion-tracking-data | 200 | ok |
| article-sample | /blog/first-party-tracking-domains | 308 | /en/tracking-knowledge/first-party-tracking-domains | 200 | ok |
| article-sample | /blog/ga4-measurement-protocol-eu | 308 | /en/tracking-knowledge/ga4-measurement-protocol-eu | 200 | ok |
| article-sample | /blog/google-ads-enhanced-conversions | 308 | /en/tracking-knowledge/google-ads-enhanced-conversions | 200 | ok |
| article-sample | /blog/kill-switch-incident-playbook | 308 | /en/tracking-knowledge/kill-switch-incident-playbook | 200 | ok |
| article-sample | /en/blog/lead-gen-tracking-b2b | 308 | /en/tracking-knowledge/lead-gen-tracking-b2b | 200 | ok |
| article-sample | /en/blog/linkedin-conversions-api-b2b | 308 | /en/tracking-knowledge/linkedin-conversions-api-b2b | 200 | ok |
| article-sample | /en/blog/meta-conversions-api-deduplication | 308 | /en/tracking-knowledge/meta-conversions-api-deduplication | 200 | ok |
| article-sample | /en/blog/microsoft-conversions-api-uet | 308 | /en/tracking-knowledge/microsoft-conversions-api-uet | 200 | ok |
| article-sample | /blog/offline-conversions-crm | 308 | /en/tracking-knowledge/offline-conversions-crm | 200 | ok |
| article-sample | /blog/pii-in-tracking-data | 308 | /en/tracking-knowledge/pii-in-tracking-data | 200 | ok |
| article-sample | /blog/reddit-pinterest-snapchat-capi | 308 | /en/tracking-knowledge/reddit-pinterest-snapchat-capi | 200 | ok |
| article-sample | /blog/server-side-tracking-explained | 308 | /en/tracking-knowledge/server-side-tracking-explained | 200 | ok |
| article-sample | /en/blog/shopify-server-side-purchases | 308 | /en/tracking-knowledge/shopify-server-side-purchases | 200 | ok |
| article-sample | /en/blog/shopware-6-tracking | 308 | /en/tracking-knowledge/shopware-6-tracking | 200 | ok |
| article-sample | /en/blog/signed-configuration-supply-chain | 308 | /en/tracking-knowledge/signed-configuration-supply-chain | 200 | ok |
| article-sample | /en/blog/subscription-saas-events | 308 | /en/tracking-knowledge/subscription-saas-events | 200 | ok |
| article-sample | /blog/tiktok-events-api-setup | 308 | /en/tracking-knowledge/tiktok-events-api-setup | 200 | ok |
| article-sample | /blog/tracking-health-score | 308 | /en/tracking-knowledge/tracking-health-score | 200 | ok |
| article-sample | /blog/woocommerce-server-side-tracking | 308 | /en/tracking-knowledge/woocommerce-server-side-tracking | 200 | ok |
| article-sample | /de/blog/ad-blockers-itp-measurement | 308 | /de/tracking-knowledge/ad-blockers-itp-measurement | 200 | ok |
| article-sample | /de/blog/click-ids-attribution-windows | 308 | /de/tracking-knowledge/click-ids-attribution-windows | 200 | ok |
| article-sample | /de/blog/data-retention-policy-tracking | 308 | /de/tracking-knowledge/data-retention-policy-tracking | 200 | ok |
| article-sample | /de/blog/dsar-deletion-tracking-data | 308 | /de/tracking-knowledge/dsar-deletion-tracking-data | 200 | ok |
| article-sample | /de/blog/first-party-tracking-domains | 308 | /de/tracking-knowledge/first-party-tracking-domains | 200 | ok |
| article-sample | /de/blog/kill-switch-incident-playbook | 308 | /de/tracking-knowledge/kill-switch-incident-playbook | 200 | ok |
| article-sample | /de/blog/linkedin-conversions-api-b2b | 308 | /de/tracking-knowledge/linkedin-conversions-api-b2b | 200 | ok |
| article-sample | /de/blog/microsoft-conversions-api-uet | 308 | /de/tracking-knowledge/microsoft-conversions-api-uet | 200 | ok |
| article-sample | /de/blog/offline-conversions-crm | 308 | /de/tracking-knowledge/offline-conversions-crm | 200 | ok |
| article-sample | /de/blog/server-side-tracking-explained | 308 | /de/tracking-knowledge/server-side-tracking-explained | 200 | ok |
| article-sample | /de/blog/shopware-6-tracking | 308 | /de/tracking-knowledge/shopware-6-tracking | 200 | ok |
| article-sample | /de/blog/subscription-saas-events | 308 | /de/tracking-knowledge/subscription-saas-events | 200 | ok |
| article-sample | /de/blog/tiktok-events-api-setup | 308 | /de/tracking-knowledge/tiktok-events-api-setup | 200 | ok |

### Derived checks not covered by the matrix

| Old URL | Expected target | Status | Location (path) | Target status | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| /fr/blog | /fr/tracking-knowledge | 308 | /fr/tracking-knowledge | 200 | ok | locale fr not in the matrix (derived from the pattern rules) |
| /fr/blog/feed.xml | /fr/tracking-knowledge/feed.xml | 308 | /fr/tracking-knowledge/feed.xml | 200 | ok | locale fr not in the matrix (derived) |
| /fr/blog/meta-conversions-api-deduplication | /fr/tracking-knowledge/meta-conversions-api-deduplication | 308 | /fr/tracking-knowledge/meta-conversions-api-deduplication | 200 | ok | locale fr not in the matrix (derived) |
| /es/blog | /es/tracking-knowledge | 308 | /es/tracking-knowledge | 200 | ok | locale es not in the matrix (derived from the pattern rules) |
| /es/blog/feed.xml | /es/tracking-knowledge/feed.xml | 308 | /es/tracking-knowledge/feed.xml | 200 | ok | locale es not in the matrix (derived) |
| /es/blog/meta-conversions-api-deduplication | /es/tracking-knowledge/meta-conversions-api-deduplication | 308 | /es/tracking-knowledge/meta-conversions-api-deduplication | 200 | ok | locale es not in the matrix (derived) |
| /it/blog | /it/tracking-knowledge | 308 | /it/tracking-knowledge | 200 | ok | locale it not in the matrix (derived from the pattern rules) |
| /it/blog/feed.xml | /it/tracking-knowledge/feed.xml | 308 | /it/tracking-knowledge/feed.xml | 200 | ok | locale it not in the matrix (derived) |
| /it/blog/meta-conversions-api-deduplication | /it/tracking-knowledge/meta-conversions-api-deduplication | 308 | /it/tracking-knowledge/meta-conversions-api-deduplication | 200 | ok | locale it not in the matrix (derived) |
| /nl/blog | /nl/tracking-knowledge | 308 | /nl/tracking-knowledge | 200 | ok | locale nl not in the matrix (derived from the pattern rules) |
| /nl/blog/feed.xml | /nl/tracking-knowledge/feed.xml | 308 | /nl/tracking-knowledge/feed.xml | 200 | ok | locale nl not in the matrix (derived) |
| /nl/blog/meta-conversions-api-deduplication | /nl/tracking-knowledge/meta-conversions-api-deduplication | 308 | /nl/tracking-knowledge/meta-conversions-api-deduplication | 200 | ok | locale nl not in the matrix (derived) |
| /blog/meta-conversions-api-deduplication?utm_source=qa&utm_medium=crawl | /en/tracking-knowledge/meta-conversions-api-deduplication?utm_source=qa&utm_medium=crawl | 308 | /en/tracking-knowledge/meta-conversions-api-deduplication?utm_source=qa&utm_medium=crawl | 200 | ok | query string preserved (unprefixed) |
| /en/blog/meta-conversions-api-deduplication?category=guides | /en/tracking-knowledge/meta-conversions-api-deduplication?category=guides | 308 | /en/tracking-knowledge/meta-conversions-api-deduplication?category=guides | 200 | ok | query string preserved (prefixed) |
| / | /en | 308 | /en | 200 | ok | root → default locale (proxy) |
| /pricing | /en/pricing | 308 | /en/pricing | 200 | ok | unprefixed marketing URL → /en (next.config) |
| /app/setup | /app/ai-setup | 308 | /app/ai-setup | 200 | ok | dashboard legacy path (next.config, session cookie sent) |
| /app/debugger | /app/events/explorer | 308 | /app/events/explorer | 200 | ok | dashboard legacy path (next.config, session cookie sent) |
| /app/audiences | /app/insights/audiences | 308 | /app/insights/audiences | 200 | ok | dashboard legacy path (next.config, session cookie sent) |

## robots.txt, sitemaps and feeds

- robots.txt: HTTP 200; Sitemap line: `Sitemap: http://localhost:3000/sitemap.xml`; Disallow /app: true; Disallow /api: true
- sitemap index: HTTP 200; `<sitemapindex>`: true; 12 sitemaps listed

| Sitemap | Status | URLs | URLs without 7 xhtml alternates | hreflang codes | /blog/ URLs |
| --- | --- | --- | --- | --- | --- |
| pages-en.xml | 200 | 48 | 0 | en de fr es it nl x-default | no |
| knowledge-en.xml | 200 | 30 | 0 | en de fr es it nl x-default | no |
| pages-de.xml | 200 | 48 | 0 | en de fr es it nl x-default | no |
| knowledge-de.xml | 200 | 30 | 0 | en de fr es it nl x-default | no |
| pages-fr.xml | 200 | 48 | 0 | en de fr es it nl x-default | no |
| knowledge-fr.xml | 200 | 30 | 0 | en de fr es it nl x-default | no |
| pages-es.xml | 200 | 48 | 0 | en de fr es it nl x-default | no |
| knowledge-es.xml | 200 | 30 | 0 | en de fr es it nl x-default | no |
| pages-it.xml | 200 | 48 | 0 | en de fr es it nl x-default | no |
| knowledge-it.xml | 200 | 30 | 0 | en de fr es it nl x-default | no |
| pages-nl.xml | 200 | 48 | 0 | en de fr es it nl x-default | no |
| knowledge-nl.xml | 200 | 30 | 0 | en de fr es it nl x-default | no |

| Feed | Status | Content-Type | Items | /blog/ URLs |
| --- | --- | --- | --- | --- |
| http://localhost:3003/en/tracking-knowledge/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 | no |
| http://localhost:3003/de/tracking-knowledge/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 | no |
| http://localhost:3003/fr/tracking-knowledge/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 | no |
| http://localhost:3003/es/tracking-knowledge/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 | no |
| http://localhost:3003/it/tracking-knowledge/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 | no |
| http://localhost:3003/nl/tracking-knowledge/feed.xml | 200 | application/rss+xml; charset=utf-8 | 30 | no |

## Dashboard pages (stored session)

| URL | Status | h1 | Title (length) | lang | robots meta | Error findings |
| --- | --- | --- | --- | --- | --- | --- |
| http://localhost:3003/app | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/ai-setup | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/billing | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/billing/usage | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/consent | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/consent/simulator | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/data-quality | 200 | 1 | Data Quality · Track (20) | en | — | none |
| http://localhost:3003/app/data-quality/revenue-leaks | 200 | 1 | Signal gaps & revenue leaks · Track (35) | en | — | none |
| http://localhost:3003/app/destinations | 200 | 2 | Track (5) | en | — | h1: 2 <h1> elements |
| http://localhost:3003/app/events | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/events/explorer | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/events/matrix | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/events/test-lab | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/insights | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/insights/attribution | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/insights/audiences | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/onboarding | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/onboarding/organization | 307 | 0 | — | — | — | status: HTTP 307 → /app/onboarding |
| http://localhost:3003/app/releases | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/settings | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/settings/alerts | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/team | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/team/audit | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites/52157aef-3295-434c-8eac-7f71a744f2c7 | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites/52157aef-3295-434c-8eac-7f71a744f2c7/shop | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites/52157aef-3295-434c-8eac-7f71a744f2c7/setup | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites/52157aef-3295-434c-8eac-7f71a744f2c7/destinations/new | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites/52157aef-3295-434c-8eac-7f71a744f2c7/destinations/6e6dfca6-8e86-46c0-ba84-c93f5e0416c3 | 200 | 1 | Track (5) | en | — | none |
| http://localhost:3003/app/sites/52157aef-3295-434c-8eac-7f71a744f2c7/destinations | 200 | 1 | Track (5) | en | — | none |

Meta description, canonical and hreflang are recorded for dashboard pages in crawl.json but not required: `/app` is disallowed in robots.txt and never localized by URL.

## Linked localized pages that are not in the sitemaps (informational)

| Path | Linked from n pages |
| --- | --- |
| /en/login | 78 |
| /en/signup | 78 |
| /de/login | 78 |
| /de/signup | 78 |
| /fr/login | 78 |
| /fr/signup | 78 |
| /es/login | 78 |
| /es/signup | 78 |
| /it/login | 78 |
| /it/signup | 78 |
| /nl/login | 78 |
| /nl/signup | 78 |

## All page-level warnings and infos (counts by code)

| severity:code | Findings |
| --- | --- |
| error:image | 186 |
| warn:jsonld | 100 |
| info:description | 29 |
| info:canonical | 29 |
| info:robots | 29 |
| warn:title-length | 14 |
| error:jsonld | 12 |
| info:link-redirect | 1 |
| error:h1 | 1 |
| error:status | 1 |
