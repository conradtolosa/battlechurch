#!/usr/bin/env bash
# Run the browser tests against a local server.
#   dev/tests/run.sh                 # smoke + all tests
#   dev/tests/run.sh smoke           # quick: page loads, no errors
#   dev/tests/run.sh touch_moves.js phone --slow
# Uses BASE_URL if set (e.g. a Pages preview), else starts python's http.server
# on port 8765 from the repo root and stops it afterwards.
# The test machine can be slow (~17fps): if one check misses, re-run it alone
# (e.g. `--only=Reap`) before believing it.
set -u
cd "$(dirname "$0")/../.."
ROOT="$PWD"
export NODE_PATH="${NODE_PATH:-}:$(npm root -g 2>/dev/null)"

SERVER_PID=""
if [ -z "${BASE_URL:-}" ]; then
  if ! curl -s -o /dev/null http://localhost:8765/; then
    python3 -m http.server 8765 --directory "$ROOT" >/dev/null 2>&1 &
    SERVER_PID=$!
    for _ in $(seq 1 50); do curl -s -o /dev/null http://localhost:8765/ && break; sleep 0.1; done
  fi
fi
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

status=0
run() { echo; echo "=== $*"; node "dev/tests/$@" || status=1; }

case "${1:-all}" in
  smoke) run smoke.js ;;
  all)
    run smoke.js
    run touch_moves.js fold
    run touch_moves.js fold --keyboard
    run tutorial_flow.js
    run stick_trail.js
    ;;
  *) run "$@" ;;
esac
echo
[ $status -eq 0 ] && echo "ALL TEST FILES PASSED" || echo "SOME TESTS FAILED"
exit $status
