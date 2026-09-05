# Keyboard focus check 2026-09-05

Width 1440, Chromium. 40 × Tab from page load; after each Tab the focused element's computed styles (outline, box-shadow, border, background, colour, text-decoration, ::before/::after, parent) and rect are compared with the same element blurred. `visibleIndicator=false` means no computed difference between focused and unfocused state (a failure of "sichtbare Fokuszustände"). Crops of every focused element are under `screenshots/keyboard/<slug>/tab-NN.webp`. Raw data: `axe/keyboard/<slug>.json`.

## app-overview — http://localhost:3001/app

Steps 40, focused elements 40, focus on body 0, without visible indicator **4**, not matching :focus-visible 0.

| # | Element | Label | :focus-visible | Indicator | Change | Crop |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | a #main | Skip to content | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px; rect.y: -44 → 0 | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-01.webp |
| 2 | button | Organization: Acme Demo | yes | **NO** |  | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-02.webp |
| 3 | button | Site: Acme Shop A7K2Q9 | yes | **NO** |  | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-03.webp |
| 4 | button | Environment: Production | yes | **NO** |  | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-04.webp |
| 5 | button | Search or jump to… Ctrl K | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-05.webp |
| 6 | button[assistant-launcher] | Close Track AI | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-06.webp |
| 7 | button | Account menu | yes | **NO** |  | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-07.webp |
| 8 | a /app | Track – Command Center | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-08.webp |
| 9 | a /app | Command Center | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-09.webp |
| 10 | a /app/ai-setup | AI Setup | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-10.webp |
| 11 | a /app/events | Events | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-11.webp |
| 12 | a /app/destinations | Destinations | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-12.webp |
| 13 | a /app/data-quality | Data Quality | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-13.webp |
| 14 | a /app/consent | Consent & Privacy | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-14.webp |
| 15 | a /app/insights | Insights | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-15.webp |
| 16 | a /app/releases | Releases | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-16.webp |
| 17 | a /app/team | Team & Access | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-17.webp |
| 18 | a /app/billing | Billing | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-18.webp |
| 19 | a /app/settings | Settings | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-19.webp |
| 20 | a /app/settings/alerts | Alerts & Incident Mode | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-20.webp |
| 21 | a /app/ai-setup | Open AI Setup | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-21.webp |
| 22 | a /app/events?site=52157aef-3295-434c-8eac-7f71a744f2c7 | Open Events | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-22.webp |
| 23 | a /app/sites/52157aef-3295-434c-8eac-7f71a744f2c7 | Site details | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-23.webp |
| 24 | a[cc-next-action-cta] /app/ai-setup | Open AI Setup | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-24.webp |
| 25 | summary | Why this action | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-25.webp |
| 26 | a /app/consent | Warning Publish a consent policy The consent policy is still | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-26.webp |
| 27 | a /app/sites/52157aef-3295-434c-8eac-7f71a744f2c7 | Suggestion Verify shop.acme.test The domain is not verified  | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-27.webp |
| 28 | button | Explain Site | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-28.webp |
| 29 | button | Explain Configuration | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-29.webp |
| 30 | button | Explain Last event | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-30.webp |
| 31 | button | Explain Health score | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-31.webp |
| 32 | button | Explain Consent coverage | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-32.webp |
| 33 | button | Explain Destinations | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-33.webp |
| 34 | button | Explain Duplicate rate | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-34.webp |
| 35 | button | Explain Delivery errors | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-35.webp |
| 36 | button | Explain Queue lag | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-36.webp |
| 37 | button | Explain Plan usage | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-37.webp |
| 38 | a /app/ai-setup | Publish configuration | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-38.webp |
| 39 | a /app/events?site=52157aef-3295-434c-8eac-7f71a744f2c7 | Open Events | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-39.webp |
| 40 | div | Resize the Track AI panel | yes | yes | self.background: rgba(0, 0, 0, 0) → rgb(214, 224, 255) | docs/qa/2026-09-05/screenshots/keyboard/app-overview/tab-40.webp |

## en-home — http://localhost:3001/en

Steps 40, focused elements 40, focus on body 0, without visible indicator **0**, not matching :focus-visible 0.

| # | Element | Label | :focus-visible | Indicator | Change | Crop |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | a #main | Skip to content | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px; rect.y: -44 → 0 | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-01.webp |
| 2 | a /en | Track – home | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-02.webp |
| 3 | button#_R_4l5uivb_-product-button | Product | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-03.webp |
| 4 | button#_R_4l5uivb_-integrations-button | Integrations | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-04.webp |
| 5 | button#_R_4l5uivb_-resources-button | Resources | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-05.webp |
| 6 | a /en/pricing | Pricing | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-06.webp |
| 7 | button | Language: English | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-07.webp |
| 8 | a /en/login | Log in | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-08.webp |
| 9 | a /en/signup | Start free | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-09.webp |
| 10 | input#_R_8oinn5uivb_-domain |  | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-10.webp |
| 11 | button | Start with your domain | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-11.webp |
| 12 | a /en/how-it-works | See how it works | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-12.webp |
| 13 | button | Pause stream | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-13.webp |
| 14 | button | Next event | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-14.webp |
| 15 | button | Reset demo | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-15.webp |
| 16 | button#_r_4_-tab-overview | Overview | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-16.webp |
| 17 | div#_r_4_-panel-overview | ACCEPTED 7 DELIVERED 5 DUPLICATES REMOVED 1 BLOCKED BY CONSE | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-17.webp |
| 18 | summary | › How the score is calculated | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-18.webp |
| 19 | button | Open AI Setup | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-19.webp |
| 20 | a /en/integrations/meta | M Meta Ads (Facebook & Instagram) Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-20.webp |
| 21 | a /en/integrations/google-ads | G Google Ads & YouTube Ads Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-21.webp |
| 22 | a /en/integrations/tiktok | T TikTok Ads Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-22.webp |
| 23 | a /en/integrations/linkedin | L LinkedIn Ads Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-23.webp |
| 24 | a /en/integrations/reddit | R Reddit Ads Browser · Server | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-24.webp |
| 25 | a /en/integrations/microsoft | MS Microsoft Advertising Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-25.webp |
| 26 | a /en/integrations/pinterest | P Pinterest Ads Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-26.webp |
| 27 | a /en/integrations/snapchat | S Snapchat Ads Browser · Server · Offline | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-27.webp |
| 28 | a /en/integrations/google-analytics | GA Google Analytics 4 Browser · Server | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-28.webp |
| 29 | a /en/integrations/shopify | Sh Shopify Browser · Server | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-29.webp |
| 30 | a /en/integrations/woocommerce | Wo WooCommerce Browser · Server | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-30.webp |
| 31 | a /en/integrations/shopware | Sw Shopware 6 Browser · Server | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-31.webp |
| 32 | a /en/integrations | All integrations | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-32.webp |
| 33 | a /en/how-it-works | Read the full walkthrough | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-33.webp |
| 34 | button | Copy snippet | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-34.webp |
| 35 | pre | <script async src="https://cdn.track.site/v1/tracker.js" dat | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-35.webp |
| 36 | a /en/features/ai-setup | How Track AI works | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-36.webp |
| 37 | pre | Draft v15 — review before publishing | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-37.webp |
| 38 | a /en/security | Security | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-38.webp |
| 39 | a /en/privacy | Privacy | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-39.webp |
| 40 | a /en/data-processing | Data processing (DPA) | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-home/tab-40.webp |

## en-pricing — http://localhost:3001/en/pricing

Steps 40, focused elements 40, focus on body 0, without visible indicator **0**, not matching :focus-visible 0.

| # | Element | Label | :focus-visible | Indicator | Change | Crop |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | a #main | Skip to content | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset -2px; rect.y: -44 → 0 | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-01.webp |
| 2 | a /en | Track – home | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-02.webp |
| 3 | button#_R_4l5uivb_-product-button | Product | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-03.webp |
| 4 | button#_R_4l5uivb_-integrations-button | Integrations | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-04.webp |
| 5 | button#_R_4l5uivb_-resources-button | Resources | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-05.webp |
| 6 | a /en/pricing | Pricing | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-06.webp |
| 7 | button | Language: English | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-07.webp |
| 8 | a /en/login | Log in | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-08.webp |
| 9 | a /en/signup | Start free | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-09.webp |
| 10 | input | monthly | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-10.webp |
| 11 | a /en/signup?plan=starter&interval=monthly | Choose Starter | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-11.webp |
| 12 | a /en/signup?plan=growth&interval=monthly | Choose Growth | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-12.webp |
| 13 | a /en/signup?plan=pro&interval=monthly | Choose Pro | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-13.webp |
| 14 | a /en/contact?topic=enterprise | Talk to sales | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-14.webp |
| 15 | a /en/demo | Book a demo | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-15.webp |
| 16 | input#_R_bmi9bsnn5uivb_ | 1 | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-16.webp |
| 17 | select#_R_jmi9bsnn5uivb_ | 100,000 250,000 500,000 1,000,000 2,000,000 5,000,000 10,000 | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-17.webp |
| 18 | input#_R_rmi9bsnn5uivb_ | 2 | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-18.webp |
| 19 | select#_R_13mi9bsnn5uivb_ | 90 days 13 months 25 months Longer than 25 months | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-19.webp |
| 20 | a /en/signup?plan=starter&interval=monthly | Continue with Starter | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-20.webp |
| 21 | select#_R_bqi9bsnn5uivb_ | Starter Growth Pro | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-21.webp |
| 22 | input#_R_ai9bsnn5uivbH1_ | 7 | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-22.webp |
| 23 | input#_R_rqi9bsnn5uivb_ | 2,000,000 | yes | yes | self.boxShadow: none → rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px  | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-23.webp |
| 24 | a /en/signup?plan=growth&interval=monthly | Continue with Growth | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-24.webp |
| 25 | a /en/signup?plan=starter&interval=monthly | Get started | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-25.webp |
| 26 | a /en/signup?plan=growth&interval=monthly | Get started | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-26.webp |
| 27 | a /en/signup?plan=pro&interval=monthly | Get started | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-27.webp |
| 28 | a /en/contact?topic=enterprise | Talk to sales | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-28.webp |
| 29 | a /en/signup?plan=growth&interval=monthly | Start the Growth trial | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-29.webp |
| 30 | summary | What counts as a billable event? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-30.webp |
| 31 | summary | What happens when I reach the limit? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-31.webp |
| 32 | summary | How does the 14-day trial work? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-32.webp |
| 33 | summary | Do I pay per destination? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-33.webp |
| 34 | summary | Do staging and preview subdomains count as websites? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-34.webp |
| 35 | summary | Which taxes apply? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-35.webp |
| 36 | summary | Can I switch plans or cancel? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-36.webp |
| 37 | summary | Is the AI assistant limited? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-37.webp |
| 38 | summary | How does Enterprise billing work? | yes | yes | self.outline: none → solid 2px rgb(31, 79, 224) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-38.webp |
| 39 | a /en/signup?plan=growth&interval=monthly | Get started | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-39.webp |
| 40 | a /en/contact?topic=enterprise | Talk to sales | yes | yes | self.outline: none → solid 2px rgb(77, 130, 255) offset 2px | docs/qa/2026-09-05/screenshots/keyboard/en-pricing/tab-40.webp |


## Re-check (task F1, 2026-09-05, build `UANQbZ2DkEqCtTt7EriZY`)

Root cause of the four stops without an indicator on `/app` (Organization, Site, Environment, Account menu): Tailwind v4's `outline-none` sets `--tw-outline-style: none`, and `focus-visible:outline-2` compiles to `outline-style: var(--tw-outline-style)`, so the ring had a 2 px width and style `none`. `outline-none` was removed from the menu trigger and items (`apps/web/src/components/app/shell/menu.tsx`), the panel resize handle (`assistant-host.tsx`), the command palette input (`command-palette.tsx`) and the `ScrollRegion` primitive — the pattern the Button primitive already used. Re-run of the same 40-Tab check against the rebuilt server on port 3006: **en-home 0, en-pricing 0, app-overview 0 elements without a visible indicator** (steps 2, 3, 4 and 7 on `/app` now report `self.outline: none → solid 2px rgb(31, 79, 224) offset 2px`); tables and crops in `docs/qa/2026-09-05/recheck/axe/keyboard-summary.md` and `docs/qa/2026-09-05/recheck/screenshots/keyboard/app-overview/`. A Playwright regression test ("keyboard focus in the header", `apps/web/e2e/app.spec.ts`) asserts `:focus-visible` with a ≥ 2 px non-`none` outline on the four controls.
