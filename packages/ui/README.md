# @track-site/ui

Design-system package for Track (docs/12-design-system.md is the binding spec). `src/styles/tokens.css` is the Tailwind v4 entry with every token; `src/primitives/*` are the components; `src/diagram.tsx` are the SVG data-flow primitives; `src/brand.tsx` is the mark and wordmark. Import everything from `@track-site/ui`.

## Tokens (tokens.css)

| Group | Utilities / variables |
| --- | --- |
| Surfaces | `bg-ground`, `bg-surface`, `bg-surface-2`; dark stage `bg-stage`, `bg-stage-2`, `bg-stage-3` |
| Ink | `text-ink`, `text-ink-2`, `text-ink-3` (AA on every surface) |
| Lines | `border-line`, `border-line-2` |
| Primary (cobalt, the only action colour) | `bg-primary`, `bg-primary-strong`, `bg-primary-soft`, `bg-primary-soft-2`, `text-on-primary` |
| AI / data-flow accents (sparse) | `violet`, `violet-strong`, `violet-soft`, `violet-soft-2`, `cyan`, `cyan-strong`, `cyan-soft`, `cyan-soft-2` |
| Semantic (states only) | `ok`, `warn`, `bad`, `info` + `*-soft` backgrounds |
| Radii | `rounded-[var(--radius-panel)]` 20 px (`--radius-panel-lg` 24), `--radius-card` 16, `--radius-control` 12, `--radius-control-sm` 10, `--radius-chip` 999 (chips only) |
| Shadows | `shadow-card`, `shadow-pop` (dialogs), `shadow-stage` |
| Containers | `.container-text` 720 px, `.container-page` 1200 px, `.container-wide` 1360 px (also `max-w-text/page/wide`) |
| Type scale | `text-h1`, `text-h2`, `text-h3` (clamp), `text-body`, `text-small`, `text-micro`; `font-display` for marketing headings, `font-sans` (Inter) elsewhere, `font-mono` |
| Spacing | 8 px system on the 4 px base: 4/8/12/16/24/32/48/64/96 = `1/2/3/4/6/8/12/16/24` |
| Motion | `--motion-fast` 160 ms (hover/focus), `--motion-base` 240 ms (tabs/filters), `--motion-slow` 400 ms (charts/flow), `--motion-pulse` 700 ms once; easing `ease-out`, `ease-in-out`, `ease-flow` (`cubic-bezier(.2,.8,.2,1)`) |

Rules: only `transform`/`opacity` move; no ambient loops except the Living AI Core; `prefers-reduced-motion` neutralises every animation/transition globally — mark motion that carries state with `data-motion="essential"` (the spinner does). Use `motion-safe:` for opt-in effects so nothing flashes on load.

Layout helpers: `.grid-dots` (very subtle dot pattern; mask it), `.surface-stage` (dark product stage — re-scopes all tokens so children built from tokens render dark in both themes), `.prose-track` (65–75 ch reading measure), `.table-stack` (stacked rows below 48 rem via `data-label`). Dark theme is `[data-theme="dark"]` with the `dark:` variant.

## Components (src/primitives)

Every component ships default, hover, focus-visible, active, disabled and — where meaningful — loading, error and success states; touch targets are ≥ 44 px on coarse pointers (`pointer-coarse:`). Links are `<a>`, actions are `<button>`, never nested.

| Area | Exports | Notes |
| --- | --- | --- |
| Actions | `Button`, `IconButton`, `LinkButton`, `buttonVariants`, `Spinner` | variants `primary/secondary/ghost/danger/link`, sizes `sm/md/lg/icon`; `loading` sets `aria-busy` and blocks clicks. For next-intl links: `<Link className={buttonVariants({ size: "lg" })}>` or `<LinkButton asChild><Link …/></LinkButton>` |
| Forms | `Field`, `Label`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `FieldError`, `FieldHint` | `state="error" \| "success"`; `Field` wires label/hint/error ids via a render prop |
| Navigation | `Tabs`/`TabList`/`Tab`/`TabPanel` (roving tabindex, `variant="line" \| "pill"`), `Breadcrumbs` (nav + ol + aria-current), `Pagination` (`hrefFor` or `onPageChange`), `SearchField`, `FilterChips` (`aria-pressed`) | pass `linkComponent={Link}` for next-intl links |
| Overlays | `Tooltip` (hover + focus, Escape), `Dialog`, `Sheet` (`side="right" \| "left" \| "bottom"`) | focus trap, `inert` background, scroll lock, focus restore; no library |
| Surfaces | `Card` (`variant="flat" \| "raised" \| "panel"`, `interactive`), `CardHeader/Title/Description/Content/Footer`, `ProductStage` (`tone="dark" \| "light"`, `dots`), `Container` (`width="page" \| "text" \| "wide"`) | use cards sparingly — no card soup |
| Data | `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td` (`label` for mobile), `StatCard`, `CodeBlock` (copy button, language label, `tone="stage"`), `Status` (dot + icon + text, `tone`, `live`), `Badge`, `Kbd` | tabular numerals for data |
| Feedback | `Alert`, `Banner` (action + dismiss slots), `EmptyState` (next-step action), `ErrorState`, `Skeleton`, `VisuallyHidden` | `bad` tones are `role="alert"`, others `role="status"` |

Localize every visible label that a component defaults in English (`closeLabel`, `copyLabel`, pagination `labels`, tooltip content) from the page's copy module.

## Diagram primitives (src/diagram.tsx)

`Diagram` owns the `<svg>` (viewBox from `width`/`height`, scales to its container) and the `<figcaption>`; it is decorative (`aria-hidden`) unless `title` is given. Inside it compose `FlowNode` (Website, Track, Consent/Policy, Destination; `tone`, `emphasis`), `FlowEdge` (line or S-curve, `arrow`, `dashed`, `animated` — dash motion stops under reduced motion), `ConsentGate` (`state="granted" \| "denied" \| "pending"`, glyph + colour), `DestinationChip` (label + health dot + `statusText`), `SignalDot` (`pulse` once). All colours come from tokens via `fill-*`/`stroke-*` utilities, so one diagram works on light, dark and inside a `ProductStage`. The information a diagram carries must also be in text.

## Composing pages (docs/12 §4)

- Alternate patterns: wide `ProductStage` → two-column narrative (text + `Diagram`) → comparison → timeline/flow → `Table` → focused `.prose-track` block → a few `Card`s. Never a wall of identical cards.
- Marketing headings: `font-display text-h1` / `text-h2`, body `text-ink-2`; dashboard: Inter, 14 px base, `tabular-nums`.
- Semantic colours only for states (`Status`, `Badge`, `Alert`, `Banner`); violet/cyan only for AI surfaces and flow lines.
- Server components by default; `Tabs`, `Tooltip`, `Dialog`, `Sheet`, `CodeBlock`, `SearchField`, `FilterChips`, `Switch` and the form controls are client components and can be used from server components as long as no handlers cross the boundary.
- Copy comes from `apps/web/src/lib/marketing-copy/*` (`pick(locale, COPY)`), never from string literals in components.
