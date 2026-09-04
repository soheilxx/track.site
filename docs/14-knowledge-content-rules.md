# Tracking Knowledge — content metadata rules

Editorial rules for the front matter that drives the knowledge hub (featured story, learning paths, key takeaways, filters). Article authoring itself (structure, boxes, sources) is documented separately in `docs/13-knowledge-authoring.md`; this file covers the metadata layer and its validator. Source of truth for the catalogues: `apps/web/src/lib/knowledge.ts` (topics, levels, content types, statuses) and `apps/web/src/lib/integrations-catalog.ts` (platform and shop slugs).

The structural rules below (files and groups, taxonomy values and cross-locale equality, takeaway count, featured flag, dates, learning paths, internal links) are enforced by `node apps/web/scripts/validate-knowledge-content.mjs` (exit 1 on findings, no build step); the editorial rules (wording and language of takeaways, platform materiality, when a date may be set) are checked in review. Together with `node apps/web/scripts/migrate-knowledge-frontmatter.mjs --check` (exit 1 when a file would still change) it forms the package script `knowledge:validate` of `@track-site/web`, which CI runs in the static job next to `pnpm test`; run `pnpm --filter @track-site/web knowledge:validate` and `pnpm --filter @track-site/web test` before handing content over. Both scripts resolve their paths from their own location, so they work from any working directory.

## 1. Files and groups

- One topic = one `translationGroupId` = the English file name, e.g. `content/knowledge/en/consent-mode-v2-guide.mdx` and `content/knowledge/de/consent-mode-v2-guide.mdx` share `translationGroupId: "consent-mode-v2-guide"`.
- Every group must exist in every active locale (`ACTIVE_LOCALES` in `src/i18n/routing.ts`, today `en` and `de`). Content is English and German only.
- `slug` is locale-specific and URL-safe (`^[a-z0-9-]{3,120}$`); it may differ per locale, the loader resolves alternates by group.
- `status` is one of `draft | translated | reviewed | published`; only `published` versions are listed, indexed and linked.

## 2. Taxonomy (must be identical across the language versions of a group)

| Field | Values | Rule |
| --- | --- | --- |
| `topic` | one of the nine topic worlds: `getting-started`, `pixel-platform-integrations`, `server-side-tracking`, `ecommerce-tracking`, `consent-privacy`, `attribution-analytics`, `ai-data-quality`, `troubleshooting`, `product-updates` | the single world the article primarily serves; `product-updates` is also the home of product-architecture explainers that are not tracking tutorials |
| `level` | `beginner` — no prior tracking setup needed, concepts explained from scratch; `intermediate` — assumes a working setup, event ids, consent purposes and vendor UIs are familiar; `advanced` — protocol-, DNS-, crypto- or framework-level detail, legal nuance | judge the article body, not the audience you hope for; a migration or a platform API tutorial is at least `intermediate` |
| `contentType` | `guide` (a plan or workflow to follow), `tutorial` (a concrete setup with requests, fields and checklists), `reference` (tables and lookups), `explainer` (what and why, little procedure), `update` (release note) | |
| `platforms[]` | non-commerce slugs of the integrations catalogue (`meta`, `google-ads`, `google-analytics`, `tiktok`, `microsoft`, `linkedin`, `reddit`, `pinterest`, `snapchat`, `x`, `taboola`, `outbrain`, `amazon`, `spotify`, `quora`, `yahoo`, `tradedesk`, `google-marketing-platform`, `adroll`, `criteo`, `affiliate-postbacks`, `webhook`) | only when the article materially covers the platform — a dedicated section, a table row with platform-specific fields, or per-platform instructions; a passing mention in a list does not qualify |
| `shopSystems[]` | commerce slugs (`shopify`, `woocommerce`, `shopware`) | same materiality rule |

The platform filter is only useful if it is precise: a reader filtering by `pinterest` expects Pinterest-specific content on every result.

## 3. Key takeaways

`takeaways` is a YAML list of **3–4** strings per file, written in the language of the file:

```yaml
takeaways:
  - "Consent Mode is a set of granted/denied flags that Google tags read; it is not a CMP and does not make a banner compliant."
  - "Derive analytics_storage, ad_storage, ad_user_data and ad_personalization from consent purposes rather than from vendor lists."
  - "Basic mode loads nothing before consent; advanced mode sends cookieless pings while denied and needs a documented legal decision."
```

Rules:

- Each takeaway summarises something the article itself says. No new claims, no numbers, sources or product promises that are not in the body; no popularity statements or success rates.
- One sentence each, roughly 15–35 words; the reader should be able to decide from the takeaways whether the article answers their question.
- Order follows the article: what it is → how it works → the boundary or the honest limitation. Ending on what the setup does *not* do is encouraged where the article does the same.
- Product name is `Track`; `track.site` appears only as a domain or address. `Tracking Knowledge` stays untranslated.
- Plain text only: the takeaways box renders the strings verbatim, so no Markdown (no backticks around `event_id` and friends, no bold, no links); the validator rejects backticks.
- The German list is written in German (not a machine translation of the English list); keep technical identifiers (`event_id`, `gclid`, `orders/paid`) unchanged.
- Takeaways are metadata, not body text: changing them never counts as an article update, so `updatedAt` stays untouched.

## 4. Featured story

- Exactly **one** group carries `featured: true`, in every locale of that group. The validator fails on zero or several.
- Pick the most broadly useful, recently reviewed article — the piece a first-time visitor to the hub should read first. Currently: `server-side-tracking-explained`.
- Changing the featured story is an editorial decision: move the flag in all locales in one change; never leave two groups flagged while "trying it out".

## 5. Dates

- `publishedAt` is required. `updatedAt` is set only when the body changed materially. `reviewedAt` is set only when a person actually reviewed the article on that date — never backfilled, never copied from another file, never invented for a metadata edit.
- Dates are ISO strings in quotes (`"2026-09-03"`).

## 6. Learning paths

`content/knowledge/paths.en.json` and `content/knowledge/paths.de.json` are JSON arrays of

```json
{ "id": "consent-and-privacy", "title": "…", "description": "…", "groupIds": ["consent-mode-v2-guide", "…"] }
```

Rules:

- **3–4** paths; **4–7** `translationGroupId`s each, no duplicates inside a path; a group may appear in more than one path.
- Ordered from basics to advanced: the first entries are the ones a reader can follow without the later ones.
- `id` (`^[a-z0-9-]{3,60}$`) and the `groupIds` list (including order) are identical in every locale; only `title` and `description` are localized. Descriptions name what the path covers, not who it is "perfect for".
- Every referenced group must exist and be `published` in that locale — a path never advertises an article the locale does not have.

Current paths: `server-side-foundations` (explained → taxonomy → GTM migration → dedup → health score → measurement loss → first-party domains), `consent-and-privacy` (Consent Mode v2 → PII → retention → DSAR → TCF/GPP/GPC), `conversion-apis` (Meta → Google Ads → GA4 → TikTok → Microsoft → LinkedIn → Reddit/Pinterest/Snapchat), `commerce-and-attribution` (Shopify → WooCommerce → Shopware → subscriptions → click ids → offline conversions → affiliate postbacks).

## 7. Internal links

Body links to other articles use `/tracking-knowledge/<slug>` of the **same locale** (no `/blog/`, no cross-locale prefix). The validator resolves every internal knowledge link against the published slugs of that locale; a broken link is the only reason to touch an article body during a metadata pass.

## 8. Adding an article

1. Create the English file, then every other active locale with the same `translationGroupId`.
2. Fill the taxonomy from section 2 and add the group to `MAPPING` in `apps/web/scripts/migrate-knowledge-frontmatter.mjs` (the migration script is the fallback that fills missing taxonomy fields; keep it consistent with the files).
3. Write the takeaways in both languages.
4. Consider whether a learning path should include it.
5. Run the validator, the migration check and the knowledge tests.
