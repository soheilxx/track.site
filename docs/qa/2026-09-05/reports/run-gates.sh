#!/usr/bin/env bash
# Runs the repository gates for the release report (supplement §11 "Abschlussbelege" 7) and stores
# each command's stdout+stderr and exit code under docs/qa/2026-09-05/reports/<gate>.txt.
# Usage: bash docs/qa/2026-09-05/reports/run-gates.sh   (from anywhere; no server is started)
set -u
cd /c/Users/Soheil/Downloads/track.site || exit 2
out=docs/qa/2026-09-05/reports
mkdir -p "$out"
export NO_COLOR=1 FORCE_COLOR=0 CI=1
# the DB-backed integration tests read TEST_DATABASE_URL from the process environment (as ci.yml does);
# take the local value from the root .env without printing it
set -a; eval "$(grep -E '^(TEST_DATABASE_URL|DATABASE_URL)=' .env)"; set +a
echo "TEST_DATABASE_URL set: $([ -n "${TEST_DATABASE_URL:-}" ] && echo yes || echo no)" >> "$out/_gates.log"
: > "$out/_gates.log"
echo "host: $(hostname); node $(node --version); pnpm $(pnpm --version); HEAD $(git rev-parse --short HEAD); started $(date -u +%FT%TZ)" >> "$out/_gates.log"

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
run test-integration pnpm test:integration
run test-contract pnpm test:contract
run build pnpm --filter @track-site/web build
echo "BUILD_ID: $(cat apps/web/.next/BUILD_ID 2>/dev/null)" >> "$out/build.txt"
echo "all done $(date -u +%FT%TZ)" >> "$out/_gates.log"
