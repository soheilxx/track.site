# Track design system (Phase 2 reference)

Binding rules distilled from the owner's supplement §3, §4 and §10. Implementation lives in `packages/ui` (tokens, primitives) and `apps/web` (page patterns). fast.site is a quality reference only; nothing is copied.

## 1. Foundations

| Token group | Values |
| --- | --- |
| Ground / surfaces | `ground #f7f7f5`, `surface #ffffff`, `surface-2 #f1f1ef`, dark: `#0f0f11 / #17171a / #1f1f23` |
| Ink | `ink #0a0a0a`, `ink-2 #3f3f46`, `ink-3 #62626b` (AA on all surfaces) |
| Lines | `line #e4e4e7`, `line-2 #d4d4d8` |
| Primary (cobalt) | `primary #1f4fe0`, `primary-strong #173fbf`, `primary-soft #eaf0ff`, `on-primary #fff` (dark: `#4d82ff`) |
| AI / data-flow accents (sparse) | `violet #6d3df5`, `cyan #0aa5c2`, soft variants; used only for AI surfaces, flow lines and the Living AI Core |
| Semantic (states only) | `ok #15803d`, `warn #b45309`, `bad #b91c1c`, `info #0e7490` + soft backgrounds; never decorative |
| Spacing | 8 px system: 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Radii | panels 16–24 px, cards 16 px, controls 10–12 px, chips 999 px (only chips) |
| Shadows | `card` (1 px hairline + soft 24 px), `pop` (dialogs); no heavy glass, no neon |
| Containers | text 720 px, page 1200 px, wide product stage 1360 px |

Typography: display `Bricolage Grotesque` (marketing headings), text `Inter`, mono system. Scale (clamp): h1 `clamp(2.25rem, 1.6rem + 2.4vw, 3.5rem)`, h2 `clamp(1.75rem, 1.3rem + 1.4vw, 2.5rem)`, h3 1.375rem, body 1rem/1.6, small 0.875rem, micro 0.75rem. Dashboard uses Inter only, 14 px base, tabular numerals for data.

## 2. Motion

| Interaction | Duration | Easing |
| --- | --- | --- |
| hover / focus | 150–200 ms | ease-out |
| tabs, filters, card swaps | 200–300 ms | ease-in-out |
| charts, data-flow transitions | 350–500 ms | cubic-bezier(.2,.8,.2,1) |
| success pulse (Track AI) | 600–900 ms, once | ease-out |

Only `transform`/`opacity`; no layout shift; no endless ambient movement except the Living AI Core; `prefers-reduced-motion` disables all non-essential motion (no flash on load).

## 3. Components and states

Every primitive in `packages/ui` needs default, hover, focus-visible, active, loading, disabled and, where meaningful, success/error states; touch targets ≥ 44 × 44 px; links are `<a>`, actions are `<button>`, never nested.

Header (mega/dropdown nav + mobile drawer), Button (primary/secondary/ghost/danger, sizes sm/md/lg, `asChild`-style link variant), Link, Input/Textarea/Select/Checkbox/Radio/Switch, Tabs, Tooltip, Dialog/Sheet, Card (levels: flat, raised, product panel), Table (dense desktop, stacked mobile), Chart wrappers (recharts, tokens-driven), Status (dot + text + icon), CodeBlock (copy button), Toast (sonner), Banner, EmptyState (next step CTA), Skeleton, ErrorState, Breadcrumbs, Pagination, Search/Filter bar, Consent dialog, dark product stage wrapper.

## 4. Page patterns (no card soup)

Alternate deliberately between: wide product stage (dark or light), two-column narrative (text + diagram), comparison (before/after), timeline/flow (`Website → Track → Consent/Policy → Destination`), table, focused text block, and a small number of cards. Illustrations are CSS/SVG data-flow diagrams (signals, events, nodes, routing lines, consent gates, destinations) that carry information; no stock photos, no decorative 3D.

## 5. Interactive hero demo (home)

Local, deterministic fixtures only (no network, no real data, no mutations). Views: Overview, Live Events, Destinations, AI Setup, Attribution. Platforms: Meta, Google, TikTok, LinkedIn, Reddit (clickable). Stream: PageView, ViewContent, AddToCart, BeginCheckout, Purchase, Lead with browser/server origin, dedup marker, consent state, block/deliver reason, destination health, last delivery, Tracking Health Score with explainable parts, one AI recommendation grounded in the fixture (missing `currency` on a Purchase), one guided setup step (choose + confirm), reset. Mobile: own compact layout (3 metrics, horizontal tabs, short stream, one AI hint). Keyboard + screen reader operable; reduced motion fully usable; lazy-hydrated.

## 6. Accessibility and performance gates

WCAG 2.2 AA (axe in e2e), visible focus, landmarks, skip link, 200 % zoom, no colour-only states. Mobile targets LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; Lighthouse ≥ 95 accessibility/best practices/SEO. Responsive checks at 320, 375, 768, 1024, 1440, 1920 px without horizontal scroll.
