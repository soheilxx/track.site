# Contrast review of the axe "incomplete" color-contrast nodes (task E3, defect D15)

Input: the `incomplete` `color-contrast` nodes of `docs/qa/2026-09-05/axe/*--{375,1440}.json` (1935 nodes in 73 runs; the other 23 runs of the sweep had no such node). Method: `contrast-review.mjs` opens the same route at the same width, resolves each node by its axe target (or, for 8 selectors that F1 changed, by the recorded tag + class + text), and resolves the background by a computed-style walk — the ancestor chain (background-color, gradients, opacity), the elements painted below the text at the text's sample point (`elementsFromPoint`), the related nodes axe named (decorative `pointer-events: none` overlays) and, for SVG text, the shapes painted before it. Gradient and pattern stops are candidates; `min` is the lowest contrast over all candidates, `solid` the contrast against the plain background colours. Verdicts: `pass` (min ≥ required), `pass-pattern` (only the 1 px dots of the 24 px grid pattern fall below), `review-gradient`, `FAIL` (solid < required), `not-found`.

Before (build served on http://localhost:3014, generated 2026-09-05T14:34:33.016Z): {"pass":1879,"FAIL":48,"not-found":8}.
After the fixes (build `.next-e3` served on http://localhost:3014, generated 2026-09-05T15:03:23.844Z): {"pass":1935}.
Dark theme (`data-theme="dark"`, same dashboard nodes, 19 runs, generated 2026-09-05T15:03:41.393Z): {"pass":204}.

## 1. Failing nodes before the fixes → root cause → fix → after

| Route | Node (axe target) | Text | Foreground on background | solid | min | required | Root cause | Fix | After |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| app-data-quality | `.text-primary\/80` | 0 | #486fe6 on #eaf0ff | 3.92 | 3.92 | 4.5:1 | `text-primary/80` on `bg-primary-soft` is 3.92:1 | `data-quality/inbox.tsx`, `packages/ui/src/primitives/search.tsx`: `text-primary` (5.65:1) | pass (5.66 / min 5.66, #1f4fe0 on #eaf0ff, target with the renamed class) |
| app-team | `.overflow-x-auto.outline-none[role="region"] > .border-collapse.tab…` | Joined | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (6.04 / min 6.04, #62626b on #ffffff, target without .outline-none) |
| app-team | `.overflow-x-auto.outline-none[role="region"] > .border-collapse.tab…` | Actions | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (6.04 / min 6.04, #62626b on #ffffff, target without .outline-none) |
| features | `.bg-primary-soft` | Freigeben und veröffentlichen | #4d82ff on #16264d | 4.20 | 4.20 | 4.5:1 | dark/stage `--color-primary-soft` #16264d gives 4.20:1 for `text-primary` and 4.39:1 for `text-ink-3` | `tokens.css`: dark and stage `--color-primary-soft: #101c40` (4.69:1 / 4.90:1) | pass (4.72 / min 4.72, #4d82ff on #101c40) |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | Event | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (5.30 / min 5.30, #8b8b95 on #17171a, tag + class + text of the recorded html) |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | Ursprung | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (5.30 / min 5.30, #8b8b95 on #17171a, tag + class + text of the recorded html) |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | Consent | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (5.30 / min 5.30, #8b8b95 on #17171a, tag + class + text of the recorded html) |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | Entscheidung | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (5.30 / min 5.30, #8b8b95 on #17171a, tag + class + text of the recorded html) |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | Destinationen | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (5.30 / min 5.30, #8b8b95 on #17171a, tag + class + text of the recorded html) |
| features | `svg[aria-labelledby="_S_1_-title"] > .fill-cyan-strong[x="236"][y="…` | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (10.82 / min 10.82, #5fd2e8 on #0f0f11) |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser-SDK"…` | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server-API"]…` | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| features | `svg[aria-labelledby="_S_2_-title"] > .fill-cyan-strong[y="90"][x="1…` | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (10.82 / min 10.82, #5fd2e8 on #0f0f11) |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Browser-SDK"…` | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Server-API"]…` | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| home | `.fill-cyan-strong` | Ziele | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| home | `.fill-on-primary\/80[x="198"][y="119"]` | EU | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | `fill-on-primary/80` on the stage primary (#0a0a0a at 80 % on #4d82ff) is 4.48:1 | `packages/ui/src/diagram.tsx`: sublabels use `fill-on-primary/90` (5.15:1 on the stage, 5.53:1 in light) | pass (5.14 / min 5.14, #111622 on #4d82ff, target with the renamed class) |
| home | `.md\:block.hidden.rounded-\[var\(--radius-control\)\] > .leading-ti…` | Durch Consent blockiert | — on — | — | — | 4.5:1 | selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out) | resolved by tag + class + text (no code change) | pass (5.30 / min 5.30, #8b8b95 on #17171a, tag + text of the recorded html) |
| home | `text[y="120"]` | EU | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | `fill-on-primary/80` on the stage primary (#0a0a0a at 80 % on #4d82ff) is 4.48:1 | `packages/ui/src/diagram.tsx`: sublabels use `fill-on-primary/90` (5.15:1 on the stage, 5.53:1 in light) | pass (5.14 / min 5.14, #111622 on #4d82ff) |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > .fill-cyan-strong[x="236"][y="…` | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (10.82 / min 10.82, #5fd2e8 on #0f0f11) |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser-SDK"…` | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server-API"]…` | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > .fill-cyan-strong[y="90"][x="1…` | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (10.82 / min 10.82, #5fd2e8 on #0f0f11) |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Browser-SDK"…` | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Server-API"]…` | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| login | `.fill-on-primary\/80` | geprüfte Events | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | `fill-on-primary/80` on the stage primary (#0a0a0a at 80 % on #4d82ff) is 4.48:1 | `packages/ui/src/diagram.tsx`: sublabels use `fill-on-primary/90` (5.15:1 on the stage, 5.53:1 in light) | pass (5.14 / min 5.14, #111622 on #4d82ff, target with the renamed class) |
| pricing | `.fill-on-primary\/80` | angenommen · einmal gezählt | #fdfdfd on #f7f7f5 | 1.06 | 1.06 | 4.5:1 | the German sublabel is wider than the 124 px Track node: its ends are white on the ground | `event-definition.tsx`: the node width follows the sublabel length | pass (5.56 / min 5.56, #e9eefc on #1f4fe0, target with the renamed class) |
| security | `text[y="38"]` | Signierte Config | #4d82ff on #16264d | 4.20 | 4.20 | 4.5:1 | dark/stage `--color-primary-soft` #16264d gives 4.20:1 for `text-primary` and 4.39:1 for `text-ink-3` | `tokens.css`: dark and stage `--color-primary-soft: #101c40` (4.69:1 / 4.90:1) | pass (4.72 / min 4.72, #4d82ff on #101c40) |
| security | `text[y="54"]` | Ed25519 · fail closed | #8b8b95 on #16264d | 4.39 | 4.39 | 4.5:1 | dark/stage `--color-primary-soft` #16264d gives 4.20:1 for `text-primary` and 4.39:1 for `text-ink-3` | `tokens.css`: dark and stage `--color-primary-soft: #101c40` (4.69:1 / 4.90:1) | pass (4.93 / min 4.93, #8b8b95 on #101c40) |
| signup | `.fill-on-primary\/80` | geprüfte Events | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | `fill-on-primary/80` on the stage primary (#0a0a0a at 80 % on #4d82ff) is 4.48:1 | `packages/ui/src/diagram.tsx`: sublabels use `fill-on-primary/90` (5.15:1 on the stage, 5.53:1 in light) | pass (5.14 / min 5.14, #111622 on #4d82ff, target with the renamed class) |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser SDK"…` | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server API"]…` | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Browser SDK"…` | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Server API"]…` | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser SDK"…` | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server API"]…` | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Browser SDK"…` | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Server API"]…` | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | `.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage | `packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme | pass (8.52 / min 8.52, #5fd2e8 on #0d2a31) |

## 2. Every node (unique by route family, axe target and axe message; en/de and both widths merged, worst evaluation shown)

| Route | Node (axe target) | axe message | Text | Foreground on background | solid | min | required | Before | After | Runs |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| app-ai-setup | `.border-violet-soft-2` | bgOverlap | Track AI · first setup | #6d3df5 on #ffffff | 5.78 | 5.78 | 4.5:1 | pass | pass 5.78 | 1 |
| app-ai-setup | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-ai-setup | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-ai-setup | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-ai-setup | `.max-w-xl.mt-2` | bgOverlap | Tell me about your website or pick a sta | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-ai-setup | `.max-w-xl.mt-2.text-ink-2` | bgOverlap | Tell me about your website or pick a sta | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(1)` | bgOverlap | Start the setup for my site | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(2)` | bgOverlap | What is missing? | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(3)` | bgOverlap | Show my status | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(4)` | bgOverlap | Test everything | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| app-ai-setup | `.min-h-9.hover\:text-ink.select-none` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-ai-setup | `.mt-0\.5` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-ai-setup | `.mt-6 > .hover\:bg-primary-strong.shadow-sm.min-h-9` | bgOverlap | Open Track AI | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-ai-setup | `.mt-6 > .hover\:bg-primary-strong.text-on-primary.shadow-sm` | bgOverlap | Open Track AI | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-ai-setup | `.py-1` | bgOverlap | Track AI · first setup | #6d3df5 on #ffffff | 5.78 | 5.78 | 4.5:1 | pass | pass 5.78 | 1 |
| app-ai-setup | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-ai-setup | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-ai-setup | `#setup-stage-title` | bgOverlap | Let us set up tracking together | #0a0a0a on #ffffff | 19.80 | 19.80 | 3:1 | pass | pass 19.80 | 2 |
| app-ai-setup | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-alerts | `.border-line-2.bg-surface[data-testid="assistant-quick-action"]:nth…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-alerts | `.border-line-2.bg-surface[data-testid="assistant-quick-action"]:nth…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-alerts | `.gap-1.shrink-0.flex > .min-h-9.hover\:text-ink.select-none` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-alerts | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-alerts | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-alerts | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-alerts | `.mt-0\.5` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-alerts | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-alerts | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-alerts | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-attribution | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-attribution | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-attribution | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-attribution | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-attribution | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-attribution | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.transiti…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-attribution | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-attribution | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-attribution | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-attribution | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-billing | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-billing | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-billing | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-billing | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-billing | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-billing | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.whitespa…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-billing | `.mt-0\.5.text-ink-3.text-xs` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-billing | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-billing | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-billing | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-consent | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-consent | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-consent | `.min-h-9.hover\:text-ink[type="button"]` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-consent | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-consent | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-consent | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent-simulator | `.gap-x-3 > .text-ink-3` | bgOverlap | denied | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-consent-simulator | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-consent-simulator | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-consent-simulator | `.justify-between.gap-3.items-start > .gap-1.items-center.shrink-0 >…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-consent-simulator | `.justify-between.gap-3.items-start > .min-w-0 > .mt-0\.5` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-consent-simulator | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent-simulator | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent-simulator | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-consent-simulator | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-consent-simulator | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-data-quality | `.border-line-2.select-none[data-testid="assistant-quick-action"]:nt…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-data-quality | `.border-line-2.select-none[data-testid="assistant-quick-action"]:nt…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-data-quality | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-data-quality | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-data-quality | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-data-quality | `.justify-between > .gap-1.shrink-0.flex > .select-none.transition-\…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-data-quality | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-data-quality | `.text-primary\/80` | shortTextContent | 0 | #486fe6 on #eaf0ff | 3.92 | 3.92 | 4.5:1 | FAIL | pass 5.66 | 1 |
| app-data-quality | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-data-quality | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-data-quality | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-destinations | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-destinations | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-destinations | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-destinations | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-destinations | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-destinations | `.justify-between > .gap-1.shrink-0.flex > .min-h-9.select-none.tran…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-destinations | `.mt-0\.5.text-ink-3.text-xs` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-destinations | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-destinations | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-destinations | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-events | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.whitespa…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events | `.mt-0\.5` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-explorer | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-explorer | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events-explorer | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-events-explorer | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events-explorer | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-explorer | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-explorer | `.min-w-0 > .mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-explorer | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-explorer | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-explorer | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-matrix | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-matrix | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-matrix | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-matrix | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events-matrix | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-events-matrix | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.whitespa…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events-matrix | `.mt-0\.5.text-ink-3.text-xs` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-matrix | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-matrix | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-matrix | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-test-lab | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-test-lab | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events-test-lab | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-events-test-lab | `.justify-between.items-start.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-events-test-lab | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-test-lab | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-test-lab | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-test-lab | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-events-test-lab | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-events-test-lab | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-overview | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-overview | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-overview | `.gap-y-1 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-overview | `.gap-y-1 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-overview | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-overview | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-overview | `.items-start.justify-between.gap-3 > .min-w-0 > .mt-0\.5` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-overview | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-overview | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-overview | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-releases | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-releases | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-releases | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-releases | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-releases | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-releases | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-releases | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-releases | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-releases | `div[data-testid="assistant-context"] > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-releases | `div[data-testid="assistant-context"] > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-revenue-leaks | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-revenue-leaks | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-revenue-leaks | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-revenue-leaks | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-revenue-leaks | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-revenue-leaks | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-revenue-leaks | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-revenue-leaks | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-revenue-leaks | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-revenue-leaks | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-settings | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-settings | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-settings | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-settings | `.justify-between > .gap-1.shrink-0.flex > .min-h-9.select-none[type…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-settings | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-settings | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-settings | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-settings | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-settings | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-settings | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-team | `.gap-1.shrink-0.flex > .min-h-9.hover\:text-ink[type="button"]` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-team | `.gap-x-3 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-team | `.gap-x-3 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-team | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-team | `.justify-between.items-start.gap-3 > .min-w-0 > .mt-0\.5` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-team | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-team | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-team | `.overflow-x-auto.outline-none[role="region"] > .border-collapse.tab…` | elmPartiallyObscured |  | — on — | — | — | 4.5:1 | not-found | pass 6.04 | 1 |
| app-team | `.overflow-x-auto.outline-none[role="region"] > .border-collapse.tab…` | elmPartiallyObscured |  | — on — | — | — | 4.5:1 | not-found | pass 6.04 | 1 |
| app-team | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-team | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-team | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-team | `tr:nth-child(1) > .whitespace-nowrap.text-ink-2[data-label="Joined"]` | elmPartiallyObscured | 3 Sept 2026 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-team | `tr:nth-child(2) > .whitespace-nowrap.text-ink-2[data-label="Joined"]` | elmPartiallyObscured | 3 Sept 2026 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-team | `tr:nth-child(2) > td[data-label="Actions"] > .flex-wrap.gap-2.flex …` | elmPartiallyObscured | Remove | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-team | `tr:nth-child(3) > .whitespace-nowrap.text-ink-2[data-label="Joined"]` | elmPartiallyObscured | 3 Sept 2026 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-team | `tr:nth-child(3) > td[data-label="Actions"] > .flex-wrap.gap-2.flex …` | elmPartiallyObscured | Remove | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-usage | `.gap-y-1 > .text-ink-3` | bgOverlap | Environment: Production | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-usage | `.gap-y-1 > .truncate` | bgOverlap | Site: Acme Shop A7K2Q9 | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-usage | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | bgOverlap | Check my installation | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 1 |
| app-usage | `.justify-between > .gap-1.shrink-0.items-center > .min-h-9.select-n…` | bgOverlap | Expert mode | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 1 |
| app-usage | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Connect an integration | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-usage | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | bgOverlap | Fix tracking issues | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-usage | `.mt-0\.5.text-xs.text-ink-3` | bgOverlap | Setup and diagnostics for your site | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-usage | `.truncate > .font-mono.text-ink-3` | bgOverlap | A7K2Q9 | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 1 |
| app-usage | `#_R_3eivb_` | bgOverlap | Track AI | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| app-usage | `#track-ai-composer` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| docs | `.fill-ink[x="82"][y="96"]` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| docs | `.fill-on-primary` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| docs | `.fill-on-primary\/80` | bgOverlap | validieren · dedupe · routen | #d2dcf9 on #1f4fe0 | 4.71 | 4.71 | 4.5:1 | pass | pass 5.56 | 4 |
| docs | `.gap-x-6 > .text-primary.gap-1\.5[href$="integrations"]` | bgGradient | Alle Integrationen | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| docs | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Endpoint"] >…` | elmPartiallyObscuring | POST /v1/affiliate/in/{trackingId}/{pres | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| docs | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Endpunkt"] >…` | elmPartiallyObscuring | POST /v1/affiliate/in/{trackingId}/{pres | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| docs | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Endpoint"] >…` | elmPartiallyObscuring | GET /c/{trackingId}/manifest.json | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| docs | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Endpunkt"] >…` | elmPartiallyObscuring | GET /c/{trackingId}/manifest.json | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 1 |
| docs | `.max-w-page > .tracking-wide.text-primary.uppercase` | bgGradient | Dokumentation | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| docs | `.mt-5.text-lg.max-w-text` | bgGradient | Alles, was du brauchst, um Track zu inst | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| docs | `.text-\[10px\][x="82"][y="112"]` | bgOverlap | Browser · Server | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| docs | `.text-\[12px\][y="101"][x="570"]` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| docs | `.text-\[15px\]` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| docs | `.text-primary.gap-1\.5[href$="support"]` | bgGradient | Engineering-Support fragen | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| docs | `.text-primary.gap-1\.5[href$="tracking-knowledge"]` | bgGradient | Tracking Knowledge | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| docs | `h1` | bgGradient | Dokumentation | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| docs | `text[x="527"]` | imgNode | Zweck erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| docs | `text[x="650"]` | imgNode | Destinationen | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| docs | `text[y="141"]` | bgOverlap | GA4 | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| docs | `text[y="178"]` | imgNode | zurückgehalten: kein Zweck | #b91c1c on #ffffff | 6.47 | 6.47 | 4.5:1 | pass | pass 6.47 | 2 |
| docs | `text[y="61"]` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| docs | `text[y="62"]` | imgNode | Consent | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `.border-stage-line > .mt-4` | bgOverlap | Beispiel für Destination Health: zwei ge | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| feature-server-side-tracking | `.gap-1\.5.text-sm.text-ink-3 > span:nth-child(3)` | bgOverlap | per Kill-Switch pausiert | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > .tabular-nums[data-label="L…` | bgOverlap | 12 s ago | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > .tabular-nums[data-label="L…` | bgOverlap | vor 12 s | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > .tabular-nums[data-label="Q…` | bgOverlap | 0 Retries | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Destination"]` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Health"] > .…` | bgOverlap | healthy | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Mode"] > .py…` | bgOverlap | browser + server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Modus"] > .p…` | bgOverlap | Browser + Server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Zustand"] > …` | bgOverlap | gesund | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > .tabular-nums[data-label="L…` | bgOverlap | 40 s ago | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > .tabular-nums[data-label="L…` | bgOverlap | vor 40 s | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > .tabular-nums[data-label="Q…` | bgOverlap | 0 Retries | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Destination"]` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Health"] > .…` | bgOverlap | healthy | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Mode"] > .py…` | bgOverlap | server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Modus"] > .p…` | bgOverlap | Server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Zustand"] > …` | bgOverlap | gesund | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(3) > .tabular-nums[data-label="L…` | bgOverlap | 6 min ago | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(3) > .tabular-nums[data-label="L…` | bgOverlap | vor 6 min | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(3) > .tabular-nums[data-label="Q…` | bgOverlap | 3 in der Dead-Letter-Queue | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Destination"]` | bgOverlap | TikTok | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Mode"] > .py…` | bgOverlap | browser + server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Modus"] > .p…` | bgOverlap | Browser + Server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(4) > .tabular-nums[data-label="L…` | bgOverlap | 2 h ago | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(4) > .tabular-nums[data-label="L…` | bgOverlap | vor 2 h | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(4) > .tabular-nums[data-label="Q…` | bgOverlap | zurückgehalten | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Destination"]` | bgOverlap | LinkedIn | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Mode"] > .py…` | bgOverlap | server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Modus"] > .p…` | bgOverlap | Server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| feature-server-side-tracking | `.mt-5.text-lg.max-w-text` | bgGradient | Sende jede Conversion einmal und lass je | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| feature-server-side-tracking | `.overflow-x-auto > table > thead > tr > th[scope="col"]:nth-child(1)` | bgOverlap | Destination | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| feature-server-side-tracking | `.overflow-x-auto > table > thead > tr > th[scope="col"]:nth-child(2)` | bgOverlap | Modus | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| feature-server-side-tracking | `.overflow-x-auto > table > thead > tr > th[scope="col"]:nth-child(3)` | bgOverlap | Zustand | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| feature-server-side-tracking | `.py-1.font-medium[aria-current="page"]` | bgGradient | Serverseitiger Event-Router | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| feature-server-side-tracking | `.py-1.rounded-sm[href="/de"]` | bgGradient | Track | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 2 |
| feature-server-side-tracking | `.py-1.rounded-sm[href="/en"]` | bgGradient | Track | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 2 |
| feature-server-side-tracking | `.py-1.rounded-sm[href$="features"]` | bgGradient | Funktionen | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| feature-server-side-tracking | `.py-3.flex-wrap.justify-between > .py-0\.5.px-2\.5.text-xs` | bgOverlap | Beispieldaten: Statischer Beispielzustan | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 4 |
| feature-server-side-tracking | `.py-3.flex-wrap.justify-between > p` | bgOverlap | Destination Health | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| feature-server-side-tracking | `.py-3.text-micro.px-4` | bgOverlap | Zustand, Modus und Queue pro Destination | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| feature-server-side-tracking | `.text-\[15px\][x="504"][y="145"]` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| feature-server-side-tracking | `.text-warn > span:nth-child(3)` | bgOverlap | beeinträchtigt, Circuit Breaker offen | #f2a541 on #17171a | 8.72 | 8.72 | 4.5:1 | pass | pass 8.72 | 4 |
| feature-server-side-tracking | `.tracking-wide.uppercase.text-primary` | bgGradient | Funktionen | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| feature-server-side-tracking | `h1` | bgGradient | Serverseitiger Event-Router | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| feature-server-side-tracking | `text[x="236"]` | imgNode | eine Event-ID | #086f86 on #ffffff | 5.79 | 5.79 | 4.5:1 | pass | pass 5.79 | 2 |
| feature-server-side-tracking | `text[x="240"]` | bgOverlap | Server-API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 2 |
| feature-server-side-tracking | `text[x="392"]` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 2 |
| feature-server-side-tracking | `text[x="64"]` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[x="80"]` | bgOverlap | Browser-SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 2 |
| feature-server-side-tracking | `text[y="117"]` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="144"]` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="177"]` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="180"]` | imgNode | Consent / Policy | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="196"]` | imgNode | Consent erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| feature-server-side-tracking | `text[y="199"]` | bgOverlap | Server-API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 2 |
| feature-server-side-tracking | `text[y="204"]` | bgOverlap | wird wiederholt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="223"]` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 2 |
| feature-server-side-tracking | `text[y="237"]` | bgOverlap | LinkedIn | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="264"]` | imgNode | pausiert | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="305"]` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| feature-server-side-tracking | `text[y="31"]` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="340"]` | imgNode | Consent / Policy | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="354"]` | imgNode | Consent erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| feature-server-side-tracking | `text[y="389"]` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="416"]` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="445"]` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="472"]` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="501"]` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="528"]` | imgNode | wird wiederholt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="557"]` | bgOverlap | LinkedIn | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="57"]` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| feature-server-side-tracking | `text[y="584"]` | imgNode | pausiert | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="84"]` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| feature-server-side-tracking | `text[y="90"]` | bgOverlap | eine Event-ID | #086f86 on #ffffff | 5.79 | 5.79 | 4.5:1 | pass | pass 5.79 | 2 |
| feature-server-side-tracking | `text[y="91"]` | bgOverlap | Browser-SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 2 |
| feature-server-side-tracking | `th[scope="col"]:nth-child(4)` | bgOverlap | Letzte Zustellung | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| feature-server-side-tracking | `th[scope="col"]:nth-child(5)` | bgOverlap | Queue | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| features | `.bg-primary-soft` | bgOverlap | Freigeben und veröffentlichen | #4d82ff on #16264d | 4.20 | 4.20 | 4.5:1 | FAIL | pass 4.72 | 4 |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | bgOverlap |  | — on — | — | — | 4.5:1 | not-found | pass 5.30 | 1 |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | bgOverlap |  | — on — | — | — | 4.5:1 | not-found | pass 5.30 | 1 |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | bgOverlap |  | — on — | — | — | 4.5:1 | not-found | pass 5.30 | 1 |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | bgOverlap |  | — on — | — | — | 4.5:1 | not-found | pass 5.30 | 1 |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | bgOverlap |  | — on — | — | — | 4.5:1 | not-found | pass 5.30 | 1 |
| features | `.border-stage-line.shadow-stage.surface-stage > .rounded-\[var\(--r…` | bgOverlap | Blockgründe, die die Policy-Engine melde | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| features | `.flex-wrap.justify-between.items-start > .text-warn.gap-1\.5.inline…` | bgOverlap | wartet auf deine Freigabe | #f2a541 on #1f1933 | 8.19 | 8.19 | 4.5:1 | pass | pass 8.19 | 4 |
| features | `.flex-wrap.justify-between.items-start > div > .mt-1` | bgOverlap | Gebunden an genau dieses Diff und an dic | #c4c4cc on #1f1933 | 9.69 | 9.69 | 4.5:1 | pass | pass 9.69 | 4 |
| features | `.flex-wrap.justify-between.items-start > div > p:nth-child(1)` | bgOverlap | Version 13 veröffentlichen | #f4f4f5 on #1f1933 | 15.28 | 15.28 | 4.5:1 | pass | pass 15.28 | 4 |
| features | `.gap-3.flex:nth-child(1) > .max-w-\[85\%\].bg-violet-soft.rounded-\…` | bgOverlap | example-shop.test läuft auf Shopify mit  | #f4f4f5 on #241a45 | 14.60 | 14.60 | 4.5:1 | pass | pass 14.60 | 4 |
| features | `.gap-3.flex:nth-child(1) > .max-w-\[85\%\].bg-violet-soft.rounded-\…` | bgOverlap | Track AI | #8b8b95 on #241a45 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 4 |
| features | `.gap-3.flex:nth-child(3) > .max-w-\[85\%\].bg-violet-soft.rounded-\…` | bgOverlap | Pixel-ID geprüft. Die Conversions API br | #f4f4f5 on #241a45 | 14.60 | 14.60 | 4.5:1 | pass | pass 14.60 | 4 |
| features | `.gap-3.flex:nth-child(3) > .max-w-\[85\%\].bg-violet-soft.rounded-\…` | bgOverlap | Track AI | #8b8b95 on #241a45 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 4 |
| features | `.gap-3.justify-between.flex:nth-child(1) > code` | bgOverlap | analytics_storage | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.gap-3.justify-between.flex:nth-child(2) > .text-bad.gap-1\.5.inlin…` | bgOverlap | denied | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 4 |
| features | `.gap-3.justify-between.flex:nth-child(2) > .text-ok.gap-1\.5.inline…` | bgOverlap | erteilt | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.gap-3.justify-between.flex:nth-child(2) > code` | bgOverlap | ad_storage | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.gap-3.justify-between.flex:nth-child(3) > code` | bgOverlap | ad_user_data | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.gap-3.justify-between.flex:nth-child(4) > code` | bgOverlap | ad_personalization | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.gap-6.sm\:grid-cols-2.grid > div:nth-child(1) > .tracking-wide.upp…` | bgOverlap | Zwecke | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| features | `.gap-6.sm\:grid-cols-2.grid > div:nth-child(2) > .tracking-wide.upp…` | bgOverlap | Consent Mode v2 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Consent"] > …` | bgOverlap | Analyse | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Decision"] >…` | bgOverlap | delivered | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Destinationen"]` | bgOverlap | GA4 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Destinations"]` | bgOverlap | GA4 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Entscheidung…` | bgOverlap | zugestellt | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Event"] > code` | bgOverlap | page_view | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Origin"] > .…` | bgOverlap | browser | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(1) > td[data-label="Ursprung"] >…` | bgOverlap | Browser | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Consent"] > …` | bgOverlap | Marketing | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Decision"] >…` | bgOverlap | delivered | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Destinationen"]` | bgOverlap | Meta, TikTok | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Destinations"]` | bgOverlap | Meta, TikTok | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Entscheidung…` | bgOverlap | zugestellt | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Event"] > code` | bgOverlap | add_to_cart | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Origin"] > .…` | bgOverlap | browser | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(2) > td[data-label="Ursprung"] >…` | bgOverlap | Browser | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Consent"] > …` | bgOverlap | Marketing | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Decision"] >…` | bgOverlap | delivered, deduplicated (order id) | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Destinationen"]` | bgOverlap | Meta CAPI, Google Ads | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Destinations"]` | bgOverlap | Meta CAPI, Google Ads | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Entscheidung…` | bgOverlap | zugestellt, dedupliziert (Bestellnummer) | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Event"] > code` | bgOverlap | purchase | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Origin"] > .…` | bgOverlap | browser + server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(3) > td[data-label="Ursprung"] >…` | bgOverlap | Browser + Server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Destinationen"]` | bgOverlap | Meta CAPI | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Destinations"]` | bgOverlap | Meta CAPI | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Event"] > code` | bgOverlap | purchase | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Origin"] > .…` | bgOverlap | server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(4) > td[data-label="Ursprung"] >…` | bgOverlap | Server | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Consent"] > …` | bgOverlap | Marketing | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Decision"] >…` | bgOverlap | delivered | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Destinationen"]` | bgOverlap | LinkedIn | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Destinations"]` | bgOverlap | LinkedIn | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Entscheidung…` | bgOverlap | zugestellt | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Event"] > code` | bgOverlap | generate_lead | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Origin"] > .…` | bgOverlap | browser | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.hover\:bg-surface-2\/60:nth-child(5) > td[data-label="Ursprung"] >…` | bgOverlap | Browser | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 2 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(1) > .lg\:col-span-7.m…` | bgOverlap | Beispieldaten: Statischer Beispielzustan | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(1) > .lg\:col-span-7.m…` | bgOverlap | Geführte Einrichtung | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(1) > .lg\:col-span-7.m…` | bgOverlap | Der Assistent schlägt vor, Tools validie | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(3) > .lg\:col-span-7.m…` | bgOverlap | Beispieldaten: Statischer Beispielzustan | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(3) > .lg\:col-span-7.m…` | bgOverlap | Live-Events | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(3) > .lg\:col-span-7.m…` | bgOverlap | Jede Zeile ist ein Event mit Ursprung, d | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(5) > .lg\:col-span-7.m…` | bgOverlap | Beispieldaten: Statischer Beispielzustan | #c4c4cc on #1f1f23 | 9.48 | 9.48 | 4.5:1 | pass | pass 9.48 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(5) > .lg\:col-span-7.m…` | bgOverlap | Consent-Zustand und abgeleitete Signale | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.lg\:grid-cols-12.lg\:gap-12.gap-8:nth-child(5) > .lg\:col-span-7.m…` | bgOverlap | Zwecke kommen aus deinem CMP; alles ande | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| features | `.max-w-\[85\%\].rounded-\[var\(--radius-control\)\].bg-surface-2 > …` | bgOverlap | Ja, Meta zuerst. | #f4f4f5 on #1f1f23 | 14.94 | 14.94 | 4.5:1 | pass | pass 14.94 | 4 |
| features | `.max-w-\[85\%\].rounded-\[var\(--radius-control\)\].bg-surface-2 > …` | bgOverlap | Du | #8b8b95 on #1f1f23 | 4.87 | 4.87 | 4.5:1 | pass | pass 4.87 | 4 |
| features | `.md\:block.hidden > figcaption` | bgOverlap | Website → Track → Consent/Policy → Desti | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `.md\:hidden > figcaption` | bgOverlap | Website → Track → Consent/Policy → Desti | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `.min-w-0:nth-child(1) > dd` | bgOverlap | noch kein Consent-Signal für das Event | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.min-w-0:nth-child(1) > dt > code` | bgOverlap | consent_missing | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.min-w-0:nth-child(2) > dd` | bgOverlap | der Besucher hat abgelehnt | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.min-w-0:nth-child(2) > dt > code` | bgOverlap | consent_denied | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.min-w-0:nth-child(3) > dd` | bgOverlap | die Destination braucht einen nicht erte | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.min-w-0:nth-child(3) > dt > code` | bgOverlap | purpose_not_granted | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.min-w-0:nth-child(4) > dd` | bgOverlap | Global Privacy Control gesetzt | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.min-w-0:nth-child(4) > dt > code` | bgOverlap | gpc_opt_out | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.min-w-0:nth-child(5) > dd` | bgOverlap | Kill-Switch oder Circuit Breaker | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.min-w-0:nth-child(5) > dt > code` | bgOverlap | destination_paused | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.min-w-0:nth-child(6) > dd` | bgOverlap | abgeleiteter Consent erreicht nie Werbep | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.min-w-0:nth-child(6) > dt > code` | bgOverlap | inferred_data_not_exportable | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.p-3.rounded-\[var\(--radius-control\)\].bg-surface:nth-child(1) > …` | bgOverlap | Tresor-Karte · Meta-Access-Token | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.p-3.rounded-\[var\(--radius-control\)\].bg-surface:nth-child(1) > …` | bgOverlap | Verschlüsselt gespeichert; für niemanden | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.p-3.rounded-\[var\(--radius-control\)\].bg-surface:nth-child(1) > …` | bgOverlap | gespeichert | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.p-3.rounded-\[var\(--radius-control\)\].bg-surface:nth-child(2) > …` | bgOverlap | Durch die echte Pipeline gesendet, mit d | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| features | `.p-3.rounded-\[var\(--radius-control\)\].bg-surface:nth-child(2) > …` | bgOverlap | von Meta akzeptiert | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `.p-3.rounded-\[var\(--radius-control\)\].bg-surface:nth-child(2) > …` | bgOverlap | Testevent · purchase | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `.space-y-1.mt-3.font-mono > .text-ok:nth-child(1)` | bgOverlap | + destination meta: browser + server | #3ccf6e on #1f1933 | 8.27 | 8.27 | 4.5:1 | pass | pass 8.27 | 4 |
| features | `.space-y-1.mt-3.font-mono > .text-ok:nth-child(2)` | bgOverlap | + mapping purchase → Purchase (event id, | #3ccf6e on #1f1933 | 8.27 | 8.27 | 4.5:1 | pass | pass 8.27 | 4 |
| features | `.space-y-1.mt-3.font-mono > .text-warn` | bgOverlap | ~ consent: marketing required for meta | #f2a541 on #1f1933 | 8.19 | 8.19 | 4.5:1 | pass | pass 8.19 | 4 |
| features | `.text-bad.gap-1\.5.inline-flex > span:nth-child(2)` | bgOverlap | Marketing fehlt | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 4 |
| features | `.text-lg.max-w-text.mt-5` | bgGradient | Track ersetzt den Tag-Container durch ei | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| features | `.tracking-wide.uppercase.text-primary` | bgGradient | Funktionen | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | Technisch erforderlich | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | erteilt | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | Analyse | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | verweigert | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | Marketing | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | verweigert | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 4 |
| features | `div:nth-child(1) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | Personalisierung | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| features | `div:nth-child(2) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | granted | #3ccf6e on #17171a | 8.81 | 8.81 | 4.5:1 | pass | pass 8.81 | 4 |
| features | `div:nth-child(2) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | denied | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 4 |
| features | `div:nth-child(2) > .space-y-2.mt-2 > .gap-3.justify-between.flex:nt…` | bgOverlap | denied | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 4 |
| features | `div[role="region"] > table > thead > tr > th[scope="col"]:nth-child(1)` | bgOverlap | Event | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 1 |
| features | `div[role="region"] > table > thead > tr > th[scope="col"]:nth-child(2)` | bgOverlap | Origin | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 1 |
| features | `div[role="region"] > table > thead > tr > th[scope="col"]:nth-child(3)` | bgOverlap | Consent | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 1 |
| features | `div[role="region"] > table > thead > tr > th[scope="col"]:nth-child(4)` | bgOverlap | Decision | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 1 |
| features | `div[role="region"] > table > thead > tr > th[scope="col"]:nth-child(5)` | bgOverlap | Destinations | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 1 |
| features | `h1` | bgGradient | Jede Conversion einmal zugestellt, mit C | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| features | `svg[aria-labelledby="_S_1_-title"] > .fill-cyan-strong[x="236"][y="…` | bgOverlap | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | FAIL | pass 10.82 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > .fill-ok[y="196"][x="504"]` | bgOverlap | Consent erteilt | #3ccf6e on #0f0f11 | 9.43 | 9.43 | 4.5:1 | pass | pass 9.43 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(16) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(16) > g[data-desti…` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(17) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(17) > g[data-desti…` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | GA4 | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | TikTok | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-consent-gate="granted"]…` | bgOverlap | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| features | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > .fill-cyan-strong[y="90"][x="1…` | bgOverlap | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | FAIL | pass 10.82 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > .fill-ok[y="354"][x="160"]` | bgOverlap | Consent erteilt | #3ccf6e on #0f0f11 | 9.43 | 9.43 | 4.5:1 | pass | pass 9.43 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(20) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(20) > g[data-desti…` | bgOverlap | GA4 | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(21) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g:nth-child(21) > g[data-desti…` | bgOverlap | TikTok | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-consent-gate="granted"]…` | bgOverlap | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| features | `svg[aria-labelledby="_S_2_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > .fill-cyan-strong[x="236"][y="…` | imgNode | eine Event-ID | #086f86 on #ffffff | 5.79 | 5.79 | 4.5:1 | pass | pass 5.79 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > .fill-ok[y="196"][x="504"]` | imgNode | Consent erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(16) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(16) > g[data-desti…` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(17) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(17) > g[data-desti…` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | GA4 | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(19) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-consent-gate="granted"]…` | imgNode | Consent / Policy | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 2 |
| features | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > .fill-cyan-strong[y="90"][x="1…` | bgOverlap | eine Event-ID | #086f86 on #ffffff | 5.79 | 5.79 | 4.5:1 | pass | pass 5.79 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > .fill-ok[y="354"][x="160"]` | imgNode | Consent erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(18) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(19) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(20) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(20) > g[data-desti…` | bgOverlap | GA4 | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(21) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g:nth-child(21) > g[data-desti…` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-consent-gate="granted"]…` | imgNode | Consent / Policy | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 2 |
| features | `svg[aria-labelledby="_S_4_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| features | `td[data-label="Decision"] > .text-bad.gap-1\.5.inline-flex > span:n…` | bgOverlap | blocked: consent_missing | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 2 |
| features | `td[data-label="Entscheidung"] > .text-bad.gap-1\.5.inline-flex > sp…` | bgOverlap | blockiert: consent_missing | #f26d6d on #17171a | 6.12 | 6.12 | 4.5:1 | pass | pass 6.12 | 2 |
| home | `.fill-cyan-strong` | bgOverlap | Ziele | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 2 |
| home | `.fill-on-primary[x="198"][y="103"]` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| home | `.fill-on-primary\/80[x="198"][y="119"]` | bgOverlap | EU | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | FAIL | pass 5.14 | 2 |
| home | `.gap-1\.5.inline-flex:nth-child(3)` | bgGradient | Signierte, versionierte Konfigurationen | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| home | `.gap-x-5 > .gap-1\.5.inline-flex:nth-child(1)` | bgGradient | EU-Datenregion | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| home | `.gap-x-5 > .gap-1\.5.inline-flex:nth-child(2)` | bgGradient | Consent wird vor der Zustellung geprüft | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| home | `.gap-x-5 > .gap-1\.5.inline-flex:nth-child(4)` | bgGradient | Kein Custom HTML oder JavaScript | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| home | `.hover\:bg-surface > span[aria-hidden="true"]` | bgOverlap | Snippet kopieren | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| home | `.max-w-\[20rem\] > figcaption` | bgOverlap | Website → Track → Consent / Policy → Zie | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| home | `.md\:block.hidden.rounded-\[var\(--radius-control\)\] > .leading-ti…` | elmPartiallyObscured |  | — on — | — | — | 4.5:1 | not-found | pass 5.30 | 1 |
| home | `.mt-5.text-lg` | bgGradient | Track erfasst deine Website-Events first | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.36 | 4.5:1 | pass | pass 8.36 | 4 |
| home | `.mt-6 > p` | bgOverlap | Das Snippet | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 4 |
| home | `.mt-6.min-h-11[href$="how-it-works"]` | bgGradient | So funktioniert es | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.17 | 4.5:1 | pass | pass 5.17 | 4 |
| home | `.px-1\.5` | bgOverlap | html | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| home | `.rounded-\[var\(--radius-control\)\].min-w-0.py-2:nth-child(1) > .l…` | elmPartiallyObscured | Angenommen | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 3 |
| home | `.rounded-\[var\(--radius-control\)\].min-w-0.py-2:nth-child(2) > .l…` | elmPartiallyObscured | Zugestellt | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| home | `.rounded-\[var\(--radius-control\)\].min-w-0.py-2:nth-child(3) > .l…` | elmPartiallyObscured | Duplikate entfernt | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| home | `.sm\:block > figcaption` | bgOverlap | Website → Track → Consent / Policy → Zie | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| home | `.text-\[10px\][x="55"][y="119"]` | bgOverlap | tracker.js | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| home | `.text-\[12px\][y="108"][x="480"]` | bgOverlap | TikTok Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `.text-\[13px\][x="55"][y="103"]` | bgOverlap | Deine Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `.text-\[13px\][y="26"][x="130"]` | bgOverlap | Deine Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `.text-\[15px\].fill-ok[x="258"]` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| home | `.text-\[15px\][x="308"][y="108"]` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| home | `#_R_8oinn5uivb_-help` | bgGradient | Hier prüfen wir nur das Format. Danach l | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| home | `code` | bgOverlap | <script async src="https://cdn.track.sit | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 4 |
| home | `h1` | bgGradient | Ein Snippet. Jede Plattform. Jede Conver | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 15.85 | 3:1 | pass | pass 15.85 | 4 |
| home | `text[x="164"]` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| home | `text[x="45"]` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="104"]` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| home | `text[y="120"]` | bgOverlap | EU | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | FAIL | pass 5.14 | 2 |
| home | `text[y="143"]` | bgOverlap | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| home | `text[y="148"]` | bgOverlap | LinkedIn Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="187"]` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| home | `text[y="188"]` | bgOverlap | Reddit Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="222"]` | bgOverlap | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| home | `text[y="260"]` | bgOverlap | Meta Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="28"]` | bgOverlap | Meta Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="300"]` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="340"]` | bgOverlap | TikTok Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="380"]` | bgOverlap | LinkedIn Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="42"]` | bgOverlap | tracker.js | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| home | `text[y="420"]` | bgOverlap | Reddit Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="68"]` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| home | `text[y="82"]` | imgNode | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `.max-w-page > .tracking-wide.uppercase.text-primary` | bgGradient | So funktioniert es | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| how-it-works | `.md\:block.hidden > figcaption` | bgOverlap | Snippet → Track → Consent/Policy → Platt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `.md\:hidden > figcaption` | bgOverlap | Snippet → Track → Consent/Policy → Platt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `.text-lg.max-w-text.mt-5` | bgGradient | Ein Snippet auf deiner Site, eine geführ | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| how-it-works | `h1` | bgGradient | Von deiner Domain zu verifizierten Conve | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > .fill-cyan-strong[x="236"][y="…` | bgOverlap | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | FAIL | pass 10.82 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > .fill-ok[y="196"][x="504"]` | bgOverlap | Consent erteilt | #3ccf6e on #0f0f11 | 9.43 | 9.43 | 4.5:1 | pass | pass 9.43 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(16) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(16) > g[data-desti…` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(17) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(17) > g[data-desti…` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | GA4 | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | TikTok | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-consent-gate="granted"]…` | bgOverlap | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| how-it-works | `svg[aria-labelledby="_S_1_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > .fill-cyan-strong[y="90"][x="1…` | bgOverlap | eine Event-ID | #086f86 on #0f0f11 | 3.31 | 3.31 | 4.5:1 | FAIL | pass 10.82 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > .fill-ok[y="354"][x="160"]` | bgOverlap | Consent erteilt | #3ccf6e on #0f0f11 | 9.43 | 9.43 | 4.5:1 | pass | pass 9.43 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(20) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(20) > g[data-desti…` | bgOverlap | GA4 | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(21) > g[data-desti…` | bgOverlap | zugestellt | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g:nth-child(21) > g[data-desti…` | bgOverlap | TikTok | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-consent-gate="granted"]…` | bgOverlap | Consent / Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #0d2a31 | 2.61 | 2.61 | 4.5:1 | FAIL | pass 8.52 | 1 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| how-it-works | `svg[aria-labelledby="_S_3_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > .fill-cyan-strong[x="236"][y="…` | imgNode | eine Event-ID | #086f86 on #ffffff | 5.79 | 5.79 | 4.5:1 | pass | pass 5.79 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > .fill-ok[y="196"][x="504"]` | imgNode | Consent erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(16) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(16) > g[data-desti…` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(17) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(17) > g[data-desti…` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | GA4 | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(19) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-consent-gate="granted"]…` | imgNode | Consent / Policy | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 2 |
| how-it-works | `svg[aria-labelledby="_S_6_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > .fill-cyan-strong[y="90"][x="1…` | bgOverlap | eine Event-ID | #086f86 on #ffffff | 5.79 | 5.79 | 4.5:1 | pass | pass 5.79 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > .fill-ok[y="354"][x="160"]` | imgNode | Consent erteilt | #15803d on #ffffff | 5.02 | 5.02 | 4.5:1 | pass | pass 5.02 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(18) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(18) > g[data-desti…` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(19) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(19) > g[data-desti…` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(20) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(20) > g[data-desti…` | bgOverlap | GA4 | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(21) > g[data-desti…` | imgNode | zugestellt | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g:nth-child(21) > g[data-desti…` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-consent-gate="granted"]…` | imgNode | Consent / Policy | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-consent-gate="granted"]…` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-flow-node="Browser SDK"…` | bgOverlap | Browser SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-flow-node="Browser-SDK"…` | bgOverlap | Browser-SDK | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-flow-node="Server API"]…` | bgOverlap | Server API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-flow-node="Server-API"]…` | bgOverlap | Server-API | #086f86 on #e6f7fa | 5.25 | 5.25 | 4.5:1 | pass | pass 5.25 | 1 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-flow-node="Track"] > .f…` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 2 |
| how-it-works | `svg[aria-labelledby="_S_8_-title"] > g[data-flow-node="Website"] > …` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 2 |
| integration-meta | `.fill-on-primary` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| integration-meta | `.fill-on-primary\/80` | bgOverlap | Policy · Dedup | #d2dcf9 on #1f4fe0 | 4.71 | 4.71 | 4.5:1 | pass | pass 5.56 | 4 |
| integration-meta | `.text-\[10px\][y="152"][x="82"]` | bgOverlap | Server-API | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integration-meta | `.text-\[12px\]` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integration-meta | `.text-\[13px\].fill-ink[y="136"]` | bgOverlap | Dein Server | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integration-meta | `.text-\[15px\]` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 4 |
| integration-meta | `text[x="19"]` | bgOverlap | Me | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integration-meta | `text[y="134"]` | imgNode | Server | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integration-meta | `text[y="172"]` | bgOverlap | Offline | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integration-meta | `text[y="176"]` | imgNode | Consent: Marketing | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integration-meta | `text[y="212"]` | bgOverlap | CRM · Offline | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integration-meta | `text[y="228"]` | bgOverlap | Offline-Conversions | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integration-meta | `text[y="60"]` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integration-meta | `text[y="76"]` | bgOverlap | Browser-Tag | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integration-meta | `text[y="96"]` | bgOverlap | Browser | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integrations | `.fill-on-primary` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| integrations | `.fill-on-primary\/80` | bgOverlap | Policy · Dedup | #d2dcf9 on #1f4fe0 | 4.71 | 4.71 | 4.5:1 | pass | pass 5.56 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(10) > svg[viewBox="0 0…` | bgOverlap | Ou | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(11) > svg[viewBox="0 0…` | bgOverlap | Qu | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(12) > svg[viewBox="0 0…` | bgOverlap | Sp | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(13) > svg[viewBox="0 0…` | bgOverlap | Ta | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(14) > svg[viewBox="0 0…` | shortTextContent | X | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(15) > svg[viewBox="0 0…` | bgOverlap | AR | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(16) > svg[viewBox="0 0…` | bgOverlap | Cr | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(17) > svg[viewBox="0 0…` | bgOverlap | GM | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(18) > svg[viewBox="0 0…` | bgOverlap | TD | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(19) > svg[viewBox="0 0…` | bgOverlap | Ya | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(4) > svg[viewBox="0 0 …` | bgOverlap | MS | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(5) > svg[viewBox="0 0 …` | bgOverlap | Pi | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(6) > svg[viewBox="0 0 …` | bgOverlap | Re | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(7) > svg[viewBox="0 0 …` | bgOverlap | Sn | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(8) > svg[viewBox="0 0 …` | bgOverlap | TT | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.px-2.py-4.hover\:bg-surface-2\/60:nth-child(9) > svg[viewBox="0 0 …` | bgOverlap | Am | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `.text-\[12px\][y="159"][x="510"]` | bgOverlap | Analytics | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integrations | `.text-\[15px\]` | nonBmp | ✓ | #15803d on #ecfdf3 | 4.76 | 4.76 | 4.5:1 | pass | pass 4.76 | 4 |
| integrations | `section[aria-labelledby="_R_37dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | GA | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_37dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | Li | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_37dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | Me | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_57dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | G4 | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_77dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | Sh | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_77dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | SW | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_77dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | Wo | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_97dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | Af | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `section[aria-labelledby="_R_b7dbsnn5uivb_"] > .divide-y.divide-line…` | bgOverlap | WH | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| integrations | `text[y="112"]` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integrations | `text[y="128"]` | bgOverlap | Browser-Tag | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integrations | `text[y="194"]` | imgNode | Consent | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integrations | `text[y="196"]` | bgOverlap | Server · CRM | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integrations | `text[y="212"]` | bgOverlap | Server · Offline | #62626b on #ffffff | 6.04 | 6.04 | 4.5:1 | pass | pass 6.04 | 4 |
| integrations | `text[y="253"]` | bgOverlap | Eigene Systeme | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| integrations | `text[y="65"]` | bgOverlap | Werbeplattformen | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| knowledge-article-consent-mode-v2-guide | `th:nth-child(3)` | elmPartiallyObscured | ad_storage | #0a0a0a on #f7f7f5 | 18.46 | 18.46 | 4.5:1 | pass | pass 18.46 | 1 |
| knowledge-article-consent-mode-v2-guide | `th:nth-child(4)` | elmPartiallyObscured | ad_user_data | #0a0a0a on #f7f7f5 | 18.46 | 18.46 | 4.5:1 | pass | pass 18.46 | 2 |
| knowledge-article-consent-mode-v2-guide | `th:nth-child(5)` | elmPartiallyObscured | ad_personalization | #0a0a0a on #f7f7f5 | 18.46 | 18.46 | 4.5:1 | pass | pass 18.46 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(1) > td:nth-child(4)` | elmPartiallyObscured | denied | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(1) > td:nth-child(5)` | elmPartiallyObscured | denied | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(2) > td:nth-child(4)` | elmPartiallyObscured | denied | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(2) > td:nth-child(5)` | elmPartiallyObscured | denied | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(3) > td:nth-child(4)` | elmPartiallyObscured | granted | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(3) > td:nth-child(5)` | elmPartiallyObscured | denied | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(4) > td:nth-child(4)` | elmPartiallyObscured | granted | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-article-consent-mode-v2-guide | `tr:nth-child(4) > td:nth-child(5)` | elmPartiallyObscured | granted | #3f3f46 on #f7f7f5 | 9.74 | 9.74 | 4.5:1 | pass | pass 9.74 | 2 |
| knowledge-hub | `.gap-x-3 > .tabular-nums:nth-child(1)` | bgGradient | 30 Artikel | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `.gap-x-3 > .tabular-nums:nth-child(3)` | bgGradient | 9 Themen | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `.gap-x-3 > span[aria-hidden="true"]:nth-child(2)` | shortTextContent | · | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `.min-h-9.rounded-sm.underline-offset-4:nth-child(7)` | bgGradient | RSS-Feed | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `.pt-8 > .tracking-wide.uppercase.text-primary` | bgGradient | Track | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| knowledge-hub | `.py-1.rounded-sm[href="/de"]` | bgGradient | Track | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 2 |
| knowledge-hub | `.py-1.rounded-sm[href="/en"]` | bgGradient | Track | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 2 |
| knowledge-hub | `.py-1.text-ink[aria-current="page"]` | bgGradient | Tracking Knowledge | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| knowledge-hub | `.text-lg.max-w-text.mt-5` | bgGradient | Server-Side Tracking, Consent, Deduplizi | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| knowledge-hub | `#_R_1cpbsnn5uivb_` | bgGradient | Tippfehler, Akzente und Umlaute werden t | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `#hub-title` | bgGradient | Tracking Knowledge | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 3:1 | pass | pass 16.21 | 4 |
| knowledge-hub | `a[href$="#directory"]` | bgGradient | Zum Verzeichnis | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| knowledge-hub | `div:nth-child(1) > .mt-3 > li:nth-child(1) > .pr-3\.5.pl-1\.5.trans…` | bgOverlap | GA | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `div:nth-child(1) > .mt-3 > li:nth-child(2) > .pr-3\.5.pl-1\.5.trans…` | bgOverlap | Li | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `div:nth-child(1) > .mt-3 > li:nth-child(3) > .pr-3\.5.pl-1\.5.trans…` | bgOverlap | Me | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `div:nth-child(2) > .mt-3 > li:nth-child(1) > .pr-3\.5.pl-1\.5.trans…` | bgOverlap | Sh | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `div:nth-child(2) > .mt-3 > li:nth-child(2) > .pr-3\.5.pl-1\.5.trans…` | bgOverlap | SW | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `div:nth-child(2) > .mt-3 > li:nth-child(3) > .pr-3\.5.pl-1\.5.trans…` | bgOverlap | Wo | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(10) > .pr-3\.5.pl-1\.5.transition-\[border-color\,back…` | bgOverlap | Af | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(11) > .pr-3\.5.pl-1\.5.transition-\[border-color\,back…` | bgOverlap | GM | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(12) > .pr-3\.5.pl-1\.5.transition-\[border-color\,back…` | shortTextContent | X | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(13) > .pr-3\.5.pl-1\.5.transition-\[border-color\,back…` | bgOverlap | Ou | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(14) > .pr-3\.5.pl-1\.5.transition-\[border-color\,back…` | bgOverlap | Ta | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(4) > .pr-3\.5.pl-1\.5.transition-\[border-color\,backg…` | bgOverlap | MS | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(5) > .pr-3\.5.pl-1\.5.transition-\[border-color\,backg…` | bgOverlap | TT | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(6) > .pr-3\.5.pl-1\.5.transition-\[border-color\,backg…` | bgOverlap | G4 | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(7) > .pr-3\.5.pl-1\.5.transition-\[border-color\,backg…` | bgOverlap | Pi | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(8) > .pr-3\.5.pl-1\.5.transition-\[border-color\,backg…` | bgOverlap | Sn | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `li:nth-child(9) > .pr-3\.5.pl-1\.5.transition-\[border-color\,backg…` | bgOverlap | Re | #0a0a0a on #f1f1ef | 17.51 | 17.51 | 4.5:1 | pass | pass 17.51 | 4 |
| knowledge-hub | `p[aria-live="polite"]` | bgGradient | Alle 30 Artikel | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `span:nth-child(5)` | bgGradient | English · Deutsch · Français · Español · | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| knowledge-hub | `span[aria-hidden="true"]:nth-child(4)` | shortTextContent | · | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| login | `.fill-on-primary` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| login | `.fill-on-primary\/80` | bgOverlap | geprüfte Events | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | FAIL | pass 5.14 | 2 |
| login | `.gap-4.mt-6 > .items-start.gap-3:nth-child(1) > .min-w-0 > .block.f…` | bgOverlap | Passkeys und Zwei-Faktor-Login | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| login | `.gap-4.mt-6 > .items-start.gap-3:nth-child(1) > .min-w-0 > .mt-0\.5…` | bgOverlap | Melde dich mit einem Passkey an oder sic | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| login | `.gap-4.mt-6 > .items-start.gap-3:nth-child(2) > .min-w-0 > .block.f…` | bgOverlap | EU-Datenregion | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| login | `.gap-4.mt-6 > .items-start.gap-3:nth-child(2) > .min-w-0 > .mt-0\.5…` | bgOverlap | Eventdaten werden standardmäßig in der E | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| login | `.gap-4.mt-6 > .items-start.gap-3:nth-child(3) > .min-w-0 > .block.f…` | bgOverlap | Consent entscheidet über die Zustellung | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| login | `.gap-4.mt-6 > .items-start.gap-3:nth-child(3) > .min-w-0 > .mt-0\.5…` | bgOverlap | Ein Event erreicht eine Plattform nur, w | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| login | `.hover\:bg-primary-strong` | bgOverlap | Anmelden | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| login | `.max-w-prose` | bgOverlap | Track empfängt die Events deiner Website | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 2 |
| login | `.p-6 > .mt-2` | bgOverlap | Melde dich in deinem Track-Workspace an. | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 4 |
| login | `.text-\[10px\][x="66"][y="127"]` | bgOverlap | Browser · Server | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| login | `.text-\[12px\][y="116"][x="414"]` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| login | `.text-\[13px\][x="66"][y="111"]` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| login | `.text-\[15px\]` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| login | `.text-lg` | bgOverlap | Track | #0a0a0a on #f7f7f5 | 18.46 | 18.46 | 4.5:1 | pass | pass 18.46 | 4 |
| login | `.tracking-wide` | bgOverlap | Was du als Nächstes einrichtest | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| login | `#auth-preview-title` | bgOverlap | Ein Snippet. Geprüfte Events. Consent be | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| login | `#auth-title` | bgOverlap | Willkommen zurück | #0a0a0a on #ffffff | 19.80 | 19.80 | 3:1 | pass | pass 19.80 | 4 |
| login | `#email` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| login | `a[href$="forgot-password"]` | bgOverlap | Passwort vergessen? | #1f4fe0 on #ffffff | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| login | `figcaption` | bgOverlap | Illustration mit Beispielwerten, keine L | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| login | `label[for="email"]` | bgOverlap | E-Mail-Adresse | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| login | `label[for="password"]` | bgOverlap | Passwort | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| login | `text[x="26"]` | bgOverlap | zugestellt (Beispiel) | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| login | `text[y="151"]` | bgOverlap | Consent: erteilt | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| login | `text[y="186"]` | bgOverlap | GA4 | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| login | `text[y="46"]` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| pricing | `.fill-ink-3` | imgNode | Weiterleitung zählt nicht | #62626b on #f7f7f5 | 5.63 | 5.63 | 4.5:1 | pass | pass 5.63 | 4 |
| pricing | `.fill-on-primary` | bgOverlap | Track | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| pricing | `.fill-on-primary\/80` | bgOverlap | angenommen · einmal gezählt | #fdfdfd on #f7f7f5 | 1.06 | 1.06 | 4.5:1 | FAIL | pass 5.56 | 4 |
| pricing | `.gap-x-6 > .gap-1\.5.inline-flex.items-start:nth-child(1) > span` | bgGradient | Monatliche Abrechnung als Standard, Künd | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| pricing | `.gap-x-6 > .gap-1\.5.inline-flex.items-start:nth-child(2) > span` | bgGradient | Nettopreise in EUR, zzgl. USt., sofern a | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| pricing | `.gap-x-6 > .gap-1\.5.inline-flex.items-start:nth-child(3) > span` | bgGradient | 14 Tage Growth testen, ohne Kreditkarte | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| pricing | `.hover\:bg-primary-strong.min-h-12[href="/de/contact?topic=enterpri…` | bgOverlap | Mit dem Vertrieb sprechen | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| pricing | `.hover\:bg-primary-strong.min-h-12[href="/en/contact?topic=enterpri…` | bgOverlap | Talk to sales | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| pricing | `.lg\:grid-cols-\[1\.1fr_1fr\] > .min-w-0 > .mt-1` | bgOverlap | Individuelle Volumina, Infrastruktur, Go | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 4 |
| pricing | `.lg\:grid-cols-\[1\.1fr_1fr\] > .min-w-0 > .mt-4` | bgOverlap | Mehrverbrauch, Aufbewahrung und Volumen  | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > .mt-3.space-y-2 > .gap-2.item…` | bgOverlap | Individuelles Event-, Site-, Retention-  | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > .mt-3.space-y-2 > .gap-2.item…` | bgOverlap | SAML SSO, SCIM und individuelle Rollenmo | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > .mt-3.space-y-2 > .gap-2.item…` | bgOverlap | Individuelle Datenresidenz, Single-Tenan | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > .mt-3.space-y-2 > .gap-2.item…` | bgOverlap | SLA, Security Review, Audit-Export und v | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > .mt-3.space-y-2 > .gap-2.item…` | bgOverlap | Individuelle Migrationen, Connectoren un | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > .mt-3.space-y-2 > .gap-2.item…` | bgOverlap | Dedizierter technischer Ansprechpartner  | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(1) > h3` | bgOverlap | Das bringt Enterprise zusätzlich | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 4 |
| pricing | `.lg\:grid-cols-1 > div:nth-child(2) > h3` | bgOverlap | Dieselbe Grundlage wie jeder Tarif | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 4 |
| pricing | `.max-w-text > .tracking-wide.uppercase.text-micro` | bgGradient | Preise | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.17 | 4.5:1 | pass | pass 5.17 | 4 |
| pricing | `.max-w-text.text-body.mt-6` | bgOverlap | Für Organisationen, die individuelle Eve | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.min-h-12.px-6[href$="demo"]` | bgOverlap | Demo buchen | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| pricing | `.min-w-0 > .text-4xl.tracking-tight.font-bold` | bgOverlap | Custom | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 3:1 | pass | pass 17.42 | 4 |
| pricing | `.py-1\.5.rounded-\[var\(--radius-chip\)\].gap-1\.5:nth-child(1) > span` | bgOverlap | EU-Datenregion als Standard | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| pricing | `.py-1\.5.rounded-\[var\(--radius-chip\)\].gap-1\.5:nth-child(2) > span` | bgOverlap | Auftragsverarbeiter nach Art. 28 DSGVO,  | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| pricing | `.py-1\.5.rounded-\[var\(--radius-chip\)\].gap-1\.5:nth-child(3) > span` | bgOverlap | Row-Level-Mandantentrennung in der Daten | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| pricing | `.py-1\.5.rounded-\[var\(--radius-chip\)\].gap-1\.5:nth-child(4) > span` | bgOverlap | Envelope-verschlüsselte Zugangsdaten; Se | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| pricing | `.py-1\.5.rounded-\[var\(--radius-chip\)\].gap-1\.5:nth-child(5) > span` | bgOverlap | Signierte, versionierte Konfigurationen  | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass | pass 10.32 | 4 |
| pricing | `.text-\[12px\][y="96"][x="326"]` | bgOverlap | Google Ads | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| pricing | `.text-h3.mt-2` | bgOverlap | Individuelles Volumen, Governance und In | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 4 |
| pricing | `.text-lg.mt-5` | bgGradient | Jeder Tarif enthält Browser- und Server- | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.36 | 4.5:1 | pass | pass 8.36 | 4 |
| pricing | `#_R_3gpbsnn5uivb_-hint` | bgGradient | Abrechnung jeden Monat. Kündigung zum En | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.83 | 4.5:1 | pass | pass 4.83 | 4 |
| pricing | `#plan-enterprise-title` | bgOverlap | Enterprise | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 3:1 | pass | pass 17.42 | 4 |
| pricing | `h1` | bgGradient | Klare Tarife, die mit deinem Eventvolume | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 15.85 | 3:1 | pass | pass 15.85 | 4 |
| pricing | `text[x="54"]` | bgOverlap | Website | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| pricing | `text[y="158"]` | bgOverlap | TikTok | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| pricing | `text[y="34"]` | bgOverlap | Meta | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| privacy | `.mt-4:nth-child(4)` | bgGradient | Stand: 2026-09-03 | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| privacy | `.mt-5.max-w-text.text-lg` | bgGradient | Diese Erklärung beschreibt, wie der Betr | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| privacy | `.tracking-wide.text-primary.uppercase` | bgGradient | Rechtliches | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| privacy | `h1` | bgGradient | Datenschutzerklärung | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| security | `.fill-ink[x="241"][y="148"]` | bgOverlap | Collector | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| security | `.fill-ink[x="406"][y="148"]` | bgOverlap | Queue | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| security | `.fill-ink[y="148"][x="630"]` | bgOverlap | Worker | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| security | `.mt-4:nth-child(4)` | bgGradient | Stand: 2026-09-03 | #62626b on #f7f7f5 (min via pattern:div.grid-dots) | 5.63 | 4.94 | 4.5:1 | pass | pass 4.94 | 4 |
| security | `.mt-5.text-lg.max-w-text` | bgGradient | Wie Track Kundendaten schützt: Architekt | #3f3f46 on #f7f7f5 (min via pattern:div.grid-dots) | 9.74 | 8.55 | 4.5:1 | pass | pass 8.55 | 4 |
| security | `.text-\[10px\][x="241"][y="164"]` | bgOverlap | Origin · Rate-Limit · HMAC | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 4 |
| security | `.text-\[10px\][x="406"][y="164"]` | bgOverlap | dauerhaft | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| security | `.text-\[10px\][y="164"][x="630"]` | bgOverlap | Retries · Breaker · DLQ | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| security | `.text-\[15px\]` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| security | `.tracking-wide.text-primary.uppercase` | bgGradient | Sicherheit | #1f4fe0 on #f7f7f5 (min via pattern:div.grid-dots) | 6.02 | 5.28 | 4.5:1 | pass | pass 5.28 | 4 |
| security | `figcaption` | bgOverlap | Signierte Konfiguration erreicht den Bro | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 4 |
| security | `h1` | bgGradient | Sicherheit | #0a0a0a on #f7f7f5 (min via pattern:div.grid-dots) | 18.46 | 16.21 | 4.5:1 | pass | pass 16.21 | 4 |
| security | `text[x="71"]` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 4 |
| security | `text[x="785"]` | bgOverlap | Destination | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| security | `text[y="112"]` | bgOverlap | Policy | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| security | `text[y="250"]` | bgOverlap | Tresor | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| security | `text[y="266"]` | bgOverlap | KMS-Envelope | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| security | `text[y="38"]` | bgOverlap | Signierte Config | #4d82ff on #16264d | 4.20 | 4.20 | 4.5:1 | FAIL | pass 4.72 | 4 |
| security | `text[y="43"]` | bgOverlap | Kill-Switch | #f26d6d on #331416 | 5.74 | 5.74 | 4.5:1 | pass | pass 5.74 | 2 |
| security | `text[y="54"]` | bgOverlap | Ed25519 · fail closed | #8b8b95 on #16264d | 4.39 | 4.39 | 4.5:1 | FAIL | pass 4.93 | 4 |
| signup | `.fill-on-primary` | bgOverlap | Track | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass | pass 5.61 | 2 |
| signup | `.fill-on-primary\/80` | bgOverlap | geprüfte Events | #17223b on #4d82ff | 4.48 | 4.48 | 4.5:1 | FAIL | pass 5.14 | 2 |
| signup | `.gap-2:nth-child(2) > .bg-surface-2.size-5.rounded-full` | shortTextContent | 2 | #62626b on #f1f1ef | 5.34 | 5.34 | 4.5:1 | pass | pass 5.34 | 4 |
| signup | `.gap-2:nth-child(3)` | bgOverlap | 3Website hinzufügen | #62626b on #f7f7f5 | 5.63 | 5.63 | 4.5:1 | pass | pass 5.63 | 4 |
| signup | `.gap-2:nth-child(3) > .bg-surface-2.size-5.rounded-full` | shortTextContent | 3 | #62626b on #f1f1ef | 5.34 | 5.34 | 4.5:1 | pass | pass 5.34 | 4 |
| signup | `.gap-4.mt-6 > .items-start.gap-3:nth-child(1) > .min-w-0 > .block.f…` | bgOverlap | Passkeys und Zwei-Faktor-Login | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| signup | `.gap-4.mt-6 > .items-start.gap-3:nth-child(1) > .min-w-0 > .mt-0\.5…` | bgOverlap | Melde dich mit einem Passkey an oder sic | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| signup | `.gap-4.mt-6 > .items-start.gap-3:nth-child(2) > .min-w-0 > .block.f…` | bgOverlap | EU-Datenregion | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| signup | `.gap-4.mt-6 > .items-start.gap-3:nth-child(2) > .min-w-0 > .mt-0\.5…` | bgOverlap | Eventdaten werden standardmäßig in der E | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| signup | `.gap-4.mt-6 > .items-start.gap-3:nth-child(3) > .min-w-0 > .block.f…` | bgOverlap | Consent entscheidet über die Zustellung | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| signup | `.gap-4.mt-6 > .items-start.gap-3:nth-child(3) > .min-w-0 > .mt-0\.5…` | bgOverlap | Ein Event erreicht eine Plattform nur, w | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| signup | `.max-w-prose` | bgOverlap | Track empfängt die Events deiner Website | #c4c4cc on #0f0f11 | 11.05 | 11.05 | 4.5:1 | pass | pass 11.05 | 2 |
| signup | `.p-6 > .mt-2.text-ink-2` | bgOverlap | Kostenlos starten. Keine Kreditkarte nöt | #3f3f46 on #ffffff | 10.44 | 10.44 | 4.5:1 | pass | pass 10.44 | 4 |
| signup | `.text-\[10px\][x="66"][y="127"]` | bgOverlap | Browser · Server | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| signup | `.text-\[12px\][y="116"][x="414"]` | bgOverlap | Google Ads | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| signup | `.text-\[13px\][x="66"][y="111"]` | bgOverlap | Website | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| signup | `.text-\[15px\]` | nonBmp | ✓ | #3ccf6e on #0a2b20 | 7.50 | 7.50 | 4.5:1 | pass | pass 7.50 | 2 |
| signup | `.text-lg` | bgOverlap | Track | #0a0a0a on #f7f7f5 | 18.46 | 18.46 | 4.5:1 | pass | pass 18.46 | 4 |
| signup | `.tracking-wide` | bgOverlap | Was du als Nächstes einrichtest | #8b8b95 on #0f0f11 | 5.68 | 5.68 | 4.5:1 | pass | pass 5.68 | 2 |
| signup | `#auth-preview-title` | bgOverlap | Ein Snippet. Geprüfte Events. Consent be | #f4f4f5 on #0f0f11 | 17.42 | 17.42 | 4.5:1 | pass | pass 17.42 | 2 |
| signup | `#auth-title` | bgOverlap | Konto erstellen | #0a0a0a on #ffffff | 19.80 | 19.80 | 3:1 | pass | pass 19.80 | 4 |
| signup | `#email` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| signup | `#name` | bgOverlap |  | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| signup | `figcaption` | bgOverlap | Illustration mit Beispielwerten, keine L | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| signup | `label[for="email"]` | bgOverlap | E-Mail-Adresse | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| signup | `label[for="name"]` | bgOverlap | Dein Name | #0a0a0a on #ffffff | 19.80 | 19.80 | 4.5:1 | pass | pass 19.80 | 4 |
| signup | `li[aria-current="step"]` | bgOverlap | 1Konto erstellen | #0a0a0a on #f7f7f5 | 18.46 | 18.46 | 4.5:1 | pass | pass 18.46 | 4 |
| signup | `li[aria-current="step"] > .size-5.rounded-full.text-\[11px\]` | shortTextContent | 1 | #ffffff on #1f4fe0 | 6.46 | 6.46 | 4.5:1 | pass | pass 6.46 | 4 |
| signup | `ol > .gap-2:nth-child(2)` | bgOverlap | 2E-Mail bestätigen | #62626b on #f7f7f5 | 5.63 | 5.63 | 4.5:1 | pass | pass 5.63 | 4 |
| signup | `text[x="26"]` | bgOverlap | zugestellt (Beispiel) | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| signup | `text[y="151"]` | bgOverlap | Consent: erteilt | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass | pass 5.30 | 2 |
| signup | `text[y="186"]` | bgOverlap | GA4 | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |
| signup | `text[y="46"]` | bgOverlap | Meta | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass | pass 16.28 | 2 |

## 3. Dark theme (supplementary: the dashboard nodes with `data-theme="dark"`)

| Route | Node (axe target) | Text | Foreground on background | solid | min | required | Verdict |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| app-ai-setup | `.border-violet-soft-2` | Track AI · first setup | #9a78ff on #17171a | 5.54 | 5.54 | 4.5:1 | pass |
| app-ai-setup | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-ai-setup | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-ai-setup | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-ai-setup | `.max-w-xl.mt-2` | Tell me about your website or pick a sta | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-ai-setup | `.max-w-xl.mt-2.text-ink-2` | Tell me about your website or pick a sta | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(1)` | Start the setup for my site | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(2)` | What is missing? | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(3)` | Show my status | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.border-line-2[data-testid="setup-stage-starter"]:nth-child(4)` | Test everything | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `.min-h-9.hover\:text-ink.select-none` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-ai-setup | `.mt-0\.5` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-ai-setup | `.mt-6 > .hover\:bg-primary-strong.shadow-sm.min-h-9` | Open Track AI | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-ai-setup | `.mt-6 > .hover\:bg-primary-strong.text-on-primary.shadow-sm` | Open Track AI | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-ai-setup | `.py-1` | Track AI · first setup | #9a78ff on #17171a | 5.54 | 5.54 | 4.5:1 | pass |
| app-ai-setup | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-ai-setup | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-ai-setup | `#setup-stage-title` | Let us set up tracking together | #f4f4f5 on #17171a | 16.28 | 16.28 | 3:1 | pass |
| app-ai-setup | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-alerts | `.border-line-2.bg-surface[data-testid="assistant-quick-action"]:nth…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-alerts | `.border-line-2.bg-surface[data-testid="assistant-quick-action"]:nth…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-alerts | `.gap-1.shrink-0.flex > .min-h-9.hover\:text-ink.select-none` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-alerts | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-alerts | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-alerts | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-alerts | `.mt-0\.5` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-alerts | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-alerts | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-alerts | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-attribution | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-attribution | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-attribution | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-attribution | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-attribution | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-attribution | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.transiti…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-attribution | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-attribution | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-attribution | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-attribution | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-billing | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-billing | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-billing | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-billing | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-billing | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-billing | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.whitespa…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-billing | `.mt-0\.5.text-ink-3.text-xs` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-billing | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-billing | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-billing | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-consent | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-consent | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-consent | `.min-h-9.hover\:text-ink[type="button"]` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-consent | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-consent | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-consent | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent-simulator | `.gap-x-3 > .text-ink-3` | denied | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-consent-simulator | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-consent-simulator | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-consent-simulator | `.justify-between.gap-3.items-start > .gap-1.items-center.shrink-0 >…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-consent-simulator | `.justify-between.gap-3.items-start > .min-w-0 > .mt-0\.5` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-consent-simulator | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent-simulator | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent-simulator | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-consent-simulator | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-consent-simulator | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-data-quality | `.border-line-2.select-none[data-testid="assistant-quick-action"]:nt…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-data-quality | `.border-line-2.select-none[data-testid="assistant-quick-action"]:nt…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-data-quality | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-data-quality | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-data-quality | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-data-quality | `.justify-between > .gap-1.shrink-0.flex > .select-none.transition-\…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-data-quality | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-data-quality | `.text-primary\/80` | OO | #4d82ff on #101c40 | 4.72 | 4.72 | 4.5:1 | pass |
| app-data-quality | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-data-quality | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-data-quality | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-destinations | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-destinations | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-destinations | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-destinations | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-destinations | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-destinations | `.justify-between > .gap-1.shrink-0.flex > .min-h-9.select-none.tran…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-destinations | `.mt-0\.5.text-ink-3.text-xs` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-destinations | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-destinations | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-destinations | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-events | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.whitespa…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events | `.mt-0\.5` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-explorer | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-explorer | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events-explorer | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-events-explorer | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events-explorer | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-explorer | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-explorer | `.min-w-0 > .mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-explorer | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-explorer | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-explorer | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-matrix | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-matrix | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-matrix | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-matrix | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events-matrix | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-events-matrix | `.items-start > .gap-1.shrink-0.flex > .min-h-9.select-none.whitespa…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events-matrix | `.mt-0\.5.text-ink-3.text-xs` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-matrix | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-matrix | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-matrix | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-test-lab | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-test-lab | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events-test-lab | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-events-test-lab | `.justify-between.items-start.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-events-test-lab | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-test-lab | `.min-h-9.select-none[data-testid="assistant-quick-action"]:nth-chil…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-test-lab | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-test-lab | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-events-test-lab | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-events-test-lab | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-overview | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-overview | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-overview | `.gap-y-1 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-overview | `.gap-y-1 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-overview | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-overview | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-overview | `.items-start.justify-between.gap-3 > .min-w-0 > .mt-0\.5` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-overview | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-overview | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-overview | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-releases | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-releases | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-releases | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-releases | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-releases | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-releases | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-releases | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-releases | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-releases | `div[data-testid="assistant-context"] > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-releases | `div[data-testid="assistant-context"] > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-revenue-leaks | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-revenue-leaks | `.border-line-2.min-h-9[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-revenue-leaks | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-revenue-leaks | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-revenue-leaks | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-revenue-leaks | `.items-start.justify-between.gap-3 > .gap-1.shrink-0.flex > .min-h-…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-revenue-leaks | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-revenue-leaks | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-revenue-leaks | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-revenue-leaks | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-settings | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-settings | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-settings | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-settings | `.justify-between > .gap-1.shrink-0.flex > .min-h-9.select-none[type…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-settings | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-settings | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-settings | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-settings | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-settings | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-settings | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-team | `.gap-1.shrink-0.flex > .min-h-9.hover\:text-ink[type="button"]` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-team | `.gap-x-3 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-team | `.gap-x-3 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-team | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-team | `.justify-between.items-start.gap-3 > .min-w-0 > .mt-0\.5` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-team | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-team | `.min-h-9[data-testid="assistant-quick-action"][type="button"]:nth-c…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-team | `.overflow-x-auto.outline-none[role="region"] > .border-collapse.tab…` | Joined | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-team | `.overflow-x-auto.outline-none[role="region"] > .border-collapse.tab…` | Actions | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-team | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-team | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-team | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-team | `tr:nth-child(1) > .whitespace-nowrap.text-ink-2[data-label="Joined"]` | 3 Sept 2026 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-team | `tr:nth-child(2) > .whitespace-nowrap.text-ink-2[data-label="Joined"]` | 3 Sept 2026 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-team | `tr:nth-child(2) > td[data-label="Actions"] > .flex-wrap.gap-2.flex …` | Remove | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-team | `tr:nth-child(3) > .whitespace-nowrap.text-ink-2[data-label="Joined"]` | 3 Sept 2026 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-team | `tr:nth-child(3) > td[data-label="Actions"] > .flex-wrap.gap-2.flex …` | Remove | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-usage | `.gap-y-1 > .text-ink-3` | Environment: Production | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-usage | `.gap-y-1 > .truncate` | Site: Acme Shop A7K2Q9 | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-usage | `.hover\:bg-primary-strong.shadow-sm[data-testid="assistant-quick-ac…` | Check my installation | #0a0a0a on #4d82ff | 5.61 | 5.61 | 4.5:1 | pass |
| app-usage | `.justify-between > .gap-1.shrink-0.items-center > .min-h-9.select-n…` | Expert mode | #c4c4cc on #17171a | 10.32 | 10.32 | 4.5:1 | pass |
| app-usage | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Connect an integration | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-usage | `.min-h-9.border-line-2[data-testid="assistant-quick-action"]:nth-ch…` | Fix tracking issues | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-usage | `.mt-0\.5.text-xs.text-ink-3` | Setup and diagnostics for your site | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-usage | `.truncate > .font-mono.text-ink-3` | A7K2Q9 | #8b8b95 on #17171a | 5.30 | 5.30 | 4.5:1 | pass |
| app-usage | `#_R_3eivb_` | Track AI | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
| app-usage | `#track-ai-composer` |  | #f4f4f5 on #17171a | 16.28 | 16.28 | 4.5:1 | pass |
