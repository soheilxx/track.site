#!/usr/bin/env bash
# Sequential runner of the cross-browser matrix projects (playwright.xbrowser.config.mjs), one results folder per project.
# Usage (repo root): bash docs/qa/2026-09-05/followup/browsers/run-xbrowser.sh <project> [<project> …]
# Sequential on purpose: the dashboard specs share one seeded owner (persisted motion preference, transcript).
set -u
ROOT="C:/Users/Soheil/Downloads/track.site"
DIR="$ROOT/docs/qa/2026-09-05/followup/browsers"
SCRATCH="${XB_SCRATCH:-C:/Users/Soheil/AppData/Local/Temp/claude/C--Users-Soheil-Downloads/c4e10eac-a8e9-429a-81d6-317c47246f54/scratchpad/xbrowser}"
cd "$ROOT/apps/web" || exit 1
for project in "$@"; do
  out="$DIR/runs/$project"
  mkdir -p "$out" "$SCRATCH/$project"
  echo "== $project ($(date -u +%H:%M:%SZ))"
  XB_OUT="$out" XB_TEST_RESULTS="$SCRATCH/$project" E2E_BASE_URL=http://localhost:3013 FORCE_COLOR=0 \
    pnpm exec playwright test --config "$DIR/playwright.xbrowser.config.mjs" --project="$project" --update-snapshots=none \
    > "$out/run.log" 2>&1
  echo "exit=$?" >> "$out/run.log"
  tail -n 2 "$out/run.log"
done
