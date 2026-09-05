# Client bundle analysis (build VaXHIAlSHJGtV0jRKwjXB)

Generated 2026-09-05T12:18:01.646Z by `apps/web/scripts/qa/bundle-analysis.mjs` from `.next/build-manifest.json` and the per-route `*_client-reference-manifest.js`. Sizes are bytes on disk (raw) and gzip level 9 (the production server compresses with gzip/brotli; Lighthouse "transfer" sizes differ slightly). A chunk's module list comes from the `[project]/…` markers Turbopack leaves in the chunk.

## Shared by every route (root main files + polyfill)

| Kind | Chunk | Raw | Gzip | Largest packages inside |
| --- | --- | ---: | ---: | --- |
| polyfill | `static/chunks/0cz1d0mv5g_q7.js` | 112594 | 39520 |  |
| root | `static/chunks/22vv26-qezbo-.js` | 7438 | 1984 |  |
| root | `static/chunks/0tt9kxqhjg2i7.js` | 26811 | 8463 |  |
| root | `static/chunks/42dfmdvax0djp.js` | 129657 | 34787 |  |
| root | `static/chunks/0x8kzgkz_i9l-.js` | 234546 | 73252 |  |
| root | `static/chunks/2hg_d8hn1679s.js` | 31503 | 8413 |  |
| root | `static/chunks/turbopack-0bqgtr5ftcyf7.js` | 10980 | 4320 |  |

Shared total: **170739 B gzip**

## [locale]/(marketing)/page

Route-specific client chunks (referenced by the route's client modules; loaded when the referencing module hydrates — modules behind `next/dynamic` load later): 10 chunks, **67525 B gzip** + shared 170739 B gzip.

| Chunk | Raw | Gzip | Referenced by (client entry modules) | Contains (packages, module count) |
| --- | ---: | ---: | --- | --- |
| `2txi_h_hog88p.js` | 58505 | 17428 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0tu2116so7ajv.js` | 39819 | 12033 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `2x_xeg2qf0fso.js` | 29969 | 10472 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3wz2hk1qf6g0f.js` | 37227 | 9682 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3ll8u3s2akgra.js` | 26782 | 9081 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3621g2w9mh-zy.js` | 14441 | 3681 | (next internals) |  |
| `2iavgma_p9_fh.js` | 8892 | 3625 | (next internals) |  |
| `13ho7qro_mpz6.js` | 992 | 553 | web/src/app/[locale]/(marketing)/error.tsx |  |
| `1kiz1mlrooesa.js` | 898 | 500 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0ek2o2om617p4.js` | 775 | 470 | web/src/app/global-error.tsx |  |

Watch-list modules in this route's client chunks (recharts / motion / zod / catalog / knowledge / lucide icons): 0 (of which lucide icon modules: 0)


## [locale]/(marketing)/pricing/page

Route-specific client chunks (referenced by the route's client modules; loaded when the referencing module hydrates — modules behind `next/dynamic` load later): 10 chunks, **71854 B gzip** + shared 170739 B gzip.

| Chunk | Raw | Gzip | Referenced by (client entry modules) | Contains (packages, module count) |
| --- | ---: | ---: | --- | --- |
| `2txi_h_hog88p.js` | 58505 | 17428 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0jx_kjlv5_nyu.js` | 47191 | 13410 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0tu2116so7ajv.js` | 39819 | 12033 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `2x_xeg2qf0fso.js` | 29969 | 10472 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3wz2hk1qf6g0f.js` | 37227 | 9682 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3621g2w9mh-zy.js` | 14441 | 3681 | (next internals) |  |
| `2iavgma_p9_fh.js` | 8892 | 3625 | (next internals) |  |
| `13ho7qro_mpz6.js` | 992 | 553 | web/src/app/[locale]/(marketing)/error.tsx |  |
| `1kiz1mlrooesa.js` | 898 | 500 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0ek2o2om617p4.js` | 775 | 470 | web/src/app/global-error.tsx |  |

Watch-list modules in this route's client chunks (recharts / motion / zod / catalog / knowledge / lucide icons): 0 (of which lucide icon modules: 0)


## [locale]/(marketing)/tracking-knowledge/page

Route-specific client chunks (referenced by the route's client modules; loaded when the referencing module hydrates — modules behind `next/dynamic` load later): 11 chunks, **73283 B gzip** + shared 170739 B gzip.

| Chunk | Raw | Gzip | Referenced by (client entry modules) | Contains (packages, module count) |
| --- | ---: | ---: | --- | --- |
| `2txi_h_hog88p.js` | 58505 | 17428 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0tu2116so7ajv.js` | 39819 | 12033 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `2x_xeg2qf0fso.js` | 29969 | 10472 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3wz2hk1qf6g0f.js` | 37227 | 9682 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `14pr2laduwkzm.js` | 24359 | 8902 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0m375hgj9swby.js` | 24992 | 5937 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3621g2w9mh-zy.js` | 14441 | 3681 | (next internals) |  |
| `2iavgma_p9_fh.js` | 8892 | 3625 | (next internals) |  |
| `13ho7qro_mpz6.js` | 992 | 553 | web/src/app/[locale]/(marketing)/error.tsx |  |
| `1kiz1mlrooesa.js` | 898 | 500 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0ek2o2om617p4.js` | 775 | 470 | web/src/app/global-error.tsx |  |

Watch-list modules in this route's client chunks (recharts / motion / zod / catalog / knowledge / lucide icons): 0 (of which lucide icon modules: 0)


## [locale]/(marketing)/tracking-knowledge/[slug]/page

Route-specific client chunks (referenced by the route's client modules; loaded when the referencing module hydrates — modules behind `next/dynamic` load later): 10 chunks, **60199 B gzip** + shared 170739 B gzip.

| Chunk | Raw | Gzip | Referenced by (client entry modules) | Contains (packages, module count) |
| --- | ---: | ---: | --- | --- |
| `2txi_h_hog88p.js` | 58505 | 17428 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0tu2116so7ajv.js` | 39819 | 12033 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `2x_xeg2qf0fso.js` | 29969 | 10472 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3wz2hk1qf6g0f.js` | 37227 | 9682 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `3621g2w9mh-zy.js` | 14441 | 3681 | (next internals) |  |
| `2iavgma_p9_fh.js` | 8892 | 3625 | (next internals) |  |
| `3om0m1y4tz04z.js` | 3753 | 1755 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `13ho7qro_mpz6.js` | 992 | 553 | web/src/app/[locale]/(marketing)/error.tsx |  |
| `1kiz1mlrooesa.js` | 898 | 500 | pkg/ui/src/primitives/button.tsx<br>pkg/ui/src/primitives/code-block.tsx<br>pkg/ui/src/primitives/dialog.tsx<br>npm:lucide-react@1.39.0_react@19.2.8 → lucide-react/dist/esm/Icon.mjs<br>pkg/ui/src/primitives/field.tsx<br>pkg/ui/src/primitives/pagination.tsx<br>pkg/ui/src/primitives/search.tsx<br>pkg/ui/src/primitives/scroll-region.tsx |  |
| `0ek2o2om617p4.js` | 775 | 470 | web/src/app/global-error.tsx |  |

Watch-list modules in this route's client chunks (recharts / motion / zod / catalog / knowledge / lucide icons): 0 (of which lucide icon modules: 0)

