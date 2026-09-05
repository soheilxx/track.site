#!/usr/bin/env bash
# Follow-up run 2 (2026-09-05, evening; task RP): serves the gate build (apps/web/.next) on port 3017 with the trusted
# origin pointed at that port (better-auth only accepts the configured origin for the Playwright `setup` sign-in),
# waits for the server, runs the full Playwright suite and stores the outputs under
# docs/qa/2026-09-05/followup2/reports/. The server is stopped by the caller (see server-3017.log for the pid).
# Usage: bash docs/qa/2026-09-05/followup2/reports/run-e2e.sh <run-label> [extra playwright args]
set -u
cd /c/Users/Soheil/Downloads/track.site || exit 2
out=docs/qa/2026-09-05/followup2/reports
label=${1:-run1}; shift || true
export NO_COLOR=1 FORCE_COLOR=0
export HOST_MARKETING=http://localhost:3017 HOST_APP=http://localhost:3017/app AI_DEV_FIXTURES=1
export E2E_BASE_URL=http://localhost:3017
# E2E_ENGINES= (empty): the optional firefox/webkit projects are not defined — Firefox cannot start on this
# machine (docs/16 D19); the WebKit project was not part of this gate run (D18 fix not yet re-verified in WebKit)
export E2E_ENGINES=

if ! curl -s -o /dev/null -w '%{http_code}' http://localhost:3017/en | grep -q 200; then
  { echo "\$ HOST_MARKETING=$HOST_MARKETING HOST_APP=$HOST_APP AI_DEV_FIXTURES=1 pnpm --filter @track-site/web start -p 3017"; echo "started: $(date -u +%FT%TZ)"; echo "BUILD_ID: $(cat apps/web/.next/BUILD_ID)"; } > "$out/server-3017.log"
  pnpm --filter @track-site/web start -p 3017 >> "$out/server-3017.log" 2>&1 &
  echo "server pid (pnpm wrapper): $!" >> "$out/server-3017.log"
  for i in $(seq 1 60); do
    sleep 1
    if curl -s -o /dev/null -w '%{http_code}' http://localhost:3017/en | grep -q 200; then break; fi
  done
  echo "ready after ${i}s: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3017/en)" >> "$out/server-3017.log"
fi

f="$out/e2e-$label.log"
{ echo "\$ E2E_BASE_URL=$E2E_BASE_URL E2E_ENGINES= pnpm --filter @track-site/web test:e2e $*"; echo "BUILD_ID served: $(curl -s http://localhost:3017/en | grep -o '/_next/static/[A-Za-z0-9_-]*/_buildManifest' | head -1)"; echo "started: $(date -u +%FT%TZ)"; echo; } > "$f"
pnpm --filter @track-site/web test:e2e "$@" >> "$f" 2>&1
code=$?
{ echo; echo "finished: $(date -u +%FT%TZ)"; echo "exit code: $code"; } >> "$f"
echo "e2e-$label exit $code"
