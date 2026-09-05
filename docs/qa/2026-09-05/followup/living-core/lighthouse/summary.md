# Lighthouse static-panel comparison — Living AI Core

Generated 2026-09-05T14:39:25.582Z from the `app--<setting>--<variant>--runN.report.json` files in this directory (Lighthouse 13.4.1, mobile form factor, simulated throttling, performance category only, stored owner session). Scores are `categories.performance.score × 100`, metrics `audits.<id>.numericValue`; the median of the 3 runs of a group is the middle value. Variant `docked` = mobile emulation widened to 1280 × 800 @ DPR 2 (panel docked and open, core mounted); `phone` = default 412 × 823 @ DPR 1.75 (panel closed, core not mounted — control). Chrome: `C:/Users/Soheil/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe` with `--headless=new --use-angle=d3d11`.

## Medians per setting and variant

| Variant | Setting | Tier verified (Playwright, same emulation) | Perf (runs) | LCP | TBT | CLS | Speed Index | FCP | Main-thread work | Script boot-up |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| docked | full | webgl (pref full, canvas true) | **71** (76/71/70) | 5.00 s | 419 ms | 0.008 | 2.03 s | 1.67 s | 2.17 s | 1.15 s |
| docked | off | static (pref off, canvas false) | **77** (75/79/77) | 4.91 s | 221 ms | 0.007 | 1.74 s | 1.68 s | 1.70 s | 824 ms |
| docked | system | webgl (pref system, canvas true) | **71** (70/71/71) | 4.99 s | 430 ms | 0.008 | 1.74 s | 1.67 s | 2.15 s | 1.15 s |
| phone | off | core not mounted (panel closed) | **83** (83/84/83) | 4.23 s | 162 ms | 0.000 | 1.51 s | 1.51 s | 1.22 s | 663 ms |
| phone | system | core not mounted (panel closed) | **83** (82/84/83) | 4.24 s | 148 ms | 0.000 | 1.52 s | 1.52 s | 1.19 s | 627 ms |

## Delta against the static panel (setting `off`), medians

| Comparison | Perf points | LCP | TBT | CLS | Target (≤ 3 points worse) |
| --- | ---: | ---: | ---: | ---: | --- |
| docked/system-vs-off | -6 | +81 ms | +209 ms | +0.001 | FAIL |
| docked/full-vs-off | -6 | +83 ms | +198 ms | +0.001 | FAIL |
| phone/system-vs-off | 0 | +13 ms | -14 ms | 0.000 | pass |

## Per-run values

| Report | Perf | LCP | TBT | CLS | SI | FCP | Main-thread | Boot-up | Screen | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `app--full--docked--run1.report.json` | 76 | 5.00 s | 269 ms | 0.008 | 2.15 s | 1.67 s | 2.10 s | 1.15 s | 1280×800@2 mobile |  |
| `app--full--docked--run2.report.json` | 71 | 4.90 s | 419 ms | 0.008 | 1.93 s | 1.68 s | 2.39 s | 1.22 s | 1280×800@2 mobile |  |
| `app--full--docked--run3.report.json` | 70 | 5.05 s | 433 ms | 0.008 | 2.03 s | 1.67 s | 2.17 s | 1.14 s | 1280×800@2 mobile |  |
| `app--off--docked--run1.report.json` | 75 | 4.66 s | 337 ms | 0.007 | 1.94 s | 1.68 s | 2.07 s | 1.10 s | 1280×800@2 mobile |  |
| `app--off--docked--run2.report.json` | 79 | 5.02 s | 162 ms | 0.008 | 1.72 s | 1.68 s | 1.48 s | 713 ms | 1280×800@2 mobile |  |
| `app--off--docked--run3.report.json` | 77 | 4.91 s | 221 ms | 0.007 | 1.74 s | 1.68 s | 1.70 s | 824 ms | 1280×800@2 mobile |  |
| `app--system--docked--run1.report.json` | 70 | 5.00 s | 434 ms | 0.008 | 1.73 s | 1.67 s | 2.09 s | 1.13 s | 1280×800@2 mobile |  |
| `app--system--docked--run2.report.json` | 71 | 4.99 s | 430 ms | 0.008 | 1.74 s | 1.67 s | 2.15 s | 1.15 s | 1280×800@2 mobile |  |
| `app--system--docked--run3.report.json` | 71 | 4.91 s | 407 ms | 0.007 | 1.89 s | 1.68 s | 2.22 s | 1.16 s | 1280×800@2 mobile |  |
| `app--off--phone--run1.report.json` | 83 | 4.23 s | 162 ms | 0.000 | 1.52 s | 1.52 s | 1.30 s | 665 ms | 412×823@1.75 mobile |  |
| `app--off--phone--run2.report.json` | 84 | 4.22 s | 150 ms | 0.000 | 1.51 s | 1.51 s | 1.13 s | 602 ms | 412×823@1.75 mobile |  |
| `app--off--phone--run3.report.json` | 83 | 4.23 s | 188 ms | 0.000 | 1.51 s | 1.51 s | 1.22 s | 663 ms | 412×823@1.75 mobile |  |
| `app--system--phone--run1.report.json` | 82 | 4.24 s | 200 ms | 0.000 | 1.52 s | 1.52 s | 1.28 s | 725 ms | 412×823@1.75 mobile |  |
| `app--system--phone--run2.report.json` | 84 | 4.22 s | 148 ms | 0.000 | 1.51 s | 1.51 s | 1.19 s | 627 ms | 412×823@1.75 mobile |  |
| `app--system--phone--run3.report.json` | 83 | 4.38 s | 145 ms | 0.000 | 1.52 s | 1.52 s | 1.11 s | 594 ms | 412×823@1.75 mobile |  |
