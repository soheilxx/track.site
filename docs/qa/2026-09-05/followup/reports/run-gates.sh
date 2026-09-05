#!/usr/bin/env bash
# Follow-up run 2026-09-05 (task R2): repository gates on the working tree after the follow-up tasks
# (perf C1–C11, E1 harness, E2 playwright projects, E3 fixes). Stores each command's stdout+stderr and exit code
# under docs/qa/2026-09-05/followup/reports/<gate>.txt. No server is started by this script (see run-e2e.sh).
# Usage: bash docs/qa/2026-09-05/followup/reports/run-gates.sh
set -u
cd /c/Users/Soheil/Downloads/track.site || exit 2
out=docs/qa/2026-09-05/followup/reports
mkdir -p "$out"
export NO_COLOR=1 FORCE_COLOR=0 CI=1
: > "$out/_gates.log"
echo "host: $(hostname); node $(node --version); pnpm $(pnpm --version); HEAD $(git rev-parse --short HEAD) + working tree; started $(date -u +%FT%TZ)" >> "$out/_gates.log"

run() {
  name=$1; shift
  f="$out/$name.txt"
  { echo "\$ $*"; echo "cwd: $(pwd)"; echo "started: $(date -u +%FT%TZ)"; echo; } > "$f"
  "$@" >> "$f" 2>&1
  code=$?
  { echo; echo "finished: $(date -u +%FT%TZ)"; echo "exit code: $code"; } >> "$f"
  echo "$name exit $code ($(date -u +%FT%TZ))" >> "$out/_gates.log"
}

# --force: turbo must execute every task instead of replaying a cached log
run typecheck pnpm typecheck --force
run lint pnpm lint --force
run test pnpm test --force
run build pnpm --filter @track-site/web build
echo "BUILD_ID: $(cat apps/web/.next/BUILD_ID 2>/dev/null)" >> "$out/build.txt"
echo "all done $(date -u +%FT%TZ)" >> "$out/_gates.log"
