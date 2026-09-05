# Lighthouse static-panel comparison — Living AI Core

Generated 2026-09-05T15:58:18.229Z from the `app--<setting>--<variant>--runN.report.json` files in this directory (Lighthouse 13.4.1, mobile form factor, simulated throttling, performance category only, stored owner session). Scores are `categories.performance.score × 100`, metrics `audits.<id>.numericValue`; the median of the 3 runs of a group is the middle value. Variant `docked` = mobile emulation widened to 1280 × 800 @ DPR 2 (panel docked and open, core mounted); `phone` = default 412 × 823 @ DPR 1.75 (panel closed, core not mounted — control). Chrome: `C:/Users/Soheil/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe` with `--headless=new --use-angle=d3d11`.

## Medians per setting and variant

| Variant | Setting | Tier verified (Playwright, same emulation) | Perf (runs) | LCP | TBT | CLS | Speed Index | FCP | Main-thread work | Script boot-up |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| docked | full | webgl (pref full, canvas true) | **80** (80/80/80) | 5.01 s | 95 ms | 0.008 | 1.86 s | 1.67 s | 1.41 s | 638 ms |
| docked | off | static (pref off, canvas false) | **81** (82/79/81) | 4.69 s | 107 ms | 0.008 | 1.99 s | 1.68 s | 1.45 s | 675 ms |
| docked | system | css (pref system, canvas false) | **80** (80/81/80) | 5.00 s | 99 ms | 0.008 | 1.88 s | 1.68 s | 1.41 s | 664 ms |

## Delta against the static panel (setting `off`), medians

| Comparison | Perf points | LCP | TBT | CLS | Target (≤ 3 points worse) |
| --- | ---: | ---: | ---: | ---: | --- |
| docked/system-vs-off | -1 | +315 ms | -8 ms | 0.000 | pass |
| docked/full-vs-off | -1 | +320 ms | -12 ms | 0.000 | pass |

## Per-run values

| Report | Perf | LCP | TBT | CLS | SI | FCP | Main-thread | Boot-up | Screen | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `app--full--docked--run1.report.json` | 80 | 5.05 s | 90 ms | 0.008 | 1.86 s | 1.68 s | 1.41 s | 651 ms | 1280×800@2 mobile |  |
| `app--full--docked--run2.report.json` | 80 | 5.01 s | 123 ms | 0.008 | 1.86 s | 1.67 s | 1.38 s | 638 ms | 1280×800@2 mobile |  |
| `app--full--docked--run3.report.json` | 80 | 5.01 s | 95 ms | 0.008 | 1.92 s | 1.67 s | 1.41 s | 636 ms | 1280×800@2 mobile |  |
| `app--off--docked--run1.report.json` | 82 | 4.61 s | 107 ms | 0.008 | 2.37 s | 1.70 s | 1.39 s | 655 ms | 1280×800@2 mobile |  |
| `app--off--docked--run2.report.json` | 79 | 4.69 s | 210 ms | 0.007 | 1.99 s | 1.68 s | 1.70 s | 868 ms | 1280×800@2 mobile |  |
| `app--off--docked--run3.report.json` | 81 | 4.76 s | 99 ms | 0.008 | 1.84 s | 1.68 s | 1.45 s | 675 ms | 1280×800@2 mobile |  |
| `app--system--docked--run1.report.json` | 80 | 5.01 s | 99 ms | 0.008 | 1.92 s | 1.68 s | 1.46 s | 665 ms | 1280×800@2 mobile |  |
| `app--system--docked--run2.report.json` | 81 | 4.87 s | 82 ms | 0.008 | 1.88 s | 1.68 s | 1.41 s | 647 ms | 1280×800@2 mobile |  |
| `app--system--docked--run3.report.json` | 80 | 5.00 s | 115 ms | 0.008 | 1.85 s | 1.67 s | 1.41 s | 664 ms | 1280×800@2 mobile |  |
