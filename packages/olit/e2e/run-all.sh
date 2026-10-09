#!/usr/bin/env bash
# Both e2e tiers. Non-zero if any driver fails.
set -uo pipefail
cd "$(dirname "$0")/.."

# A server left running from an earlier run answers first, and the drivers then grade it
# instead of this build. /dev/tcp rather than lsof, which CI images do not all carry.
for port in 8099 5173; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
        echo "e2e: port $port is already in use; stop that process first" >&2
        exit 1
    fi
done

fail=0
pids=()
# A failing driver's own words, where CI shows them: its log stays behind on the runner.
failed() {
    echo "FAIL  $1  ($2)"
    tail -n 25 "$2" | sed 's/^/      /'
    fail=1
}
# Wait for a server, or stop: drivers run against a server that never came up only fail obscurely.
await() {
    for _ in $(seq "$2"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
    echo "e2e: $1 did not answer within $2s (see $3)" >&2
    exit 1
}
# `npm run dev` outlives the kill: npm is the recorded pid, vite is its child, and the
# orphan then answers the next run's drivers. Take the servers by name as well.
cleanup() {
    for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
    pkill -f "e2e/stub.cjs" 2>/dev/null || true
    pkill -f "$PWD/node_modules/.bin/vite" 2>/dev/null || true
}
trap cleanup EXIT

node e2e/stub.cjs > /tmp/olit-e2e-stub.log 2>&1 & pids+=($!)
await http://127.0.0.1:8099/__seen 10 /tmp/olit-e2e-stub.log

GALAXY_ROOT=http://127.0.0.1:8099 LLM_PROVIDER=ollama LLM_ROOT=http://127.0.0.1:8099 \
  LLM_PATH=/v1 LLM_KEY=stub LLM_MODEL=stub-model \
  LLM_CONTEXT_WINDOW=64000 LLM_KEEP_RECENT_TOKENS=50 \
  npm run dev > /tmp/olit-e2e-dev.log 2>&1 & pids+=($!)
await http://localhost:5173/ 40 /tmp/olit-e2e-dev.log

ran=""
for d in confirm session reload tabs unsaved-changes approval-gate ratelimit visualization-artifact artifact-survives-switch artifact-restore-newest run-python; do
    ran="$ran $d"
    curl -sf -o /dev/null http://127.0.0.1:8099/__reset
    if LLM_CONTEXT_WINDOW=64000 node "e2e/$d-drive.cjs" > "/tmp/olit-e2e-$d.log" 2>&1; then
        echo "PASS  $d"
    else
        failed "$d" "/tmp/olit-e2e-$d.log"
    fi
done

# The built bundle, served the way Galaxy serves it: the stub renders the host page and
# the plugin static path, so these drivers get the credentials modal and the agent both.
# The build must not carry the dev env, or LLM_PROVIDER suppresses the modal.
if ! env -u LLM_PROVIDER -u LLM_ROOT -u LLM_MODEL -u LLM_KEY npm run build > /tmp/olit-e2e-build.log 2>&1; then
    echo "e2e: the build failed (see /tmp/olit-e2e-build.log)" >&2
    exit 1
fi

for d in credentials artifact-pane provider-switch galaxy-boot galaxy-frame saved-session recovery reset python-isolation; do
    ran="$ran $d"
    curl -sf -o /dev/null http://127.0.0.1:8099/__reset
    if node "e2e/$d-drive.cjs" > "/tmp/olit-e2e-$d.log" 2>&1; then
        echo "PASS  $d"
    else
        failed "$d" "/tmp/olit-e2e-$d.log"
    fi
done

# The credential lock in run_python's realm only shows in Firefox and WebKit, which attach
# Galaxy's SameSite-less cookie to a credentialed request from an opaque origin.
for browser in firefox webkit; do
    curl -sf -o /dev/null http://127.0.0.1:8099/__reset
    if BROWSER=$browser node e2e/python-isolation-drive.cjs > "/tmp/olit-e2e-python-isolation-$browser.log" 2>&1; then
        echo "PASS  python-isolation ($browser)"
    else
        failed "python-isolation ($browser)" "/tmp/olit-e2e-python-isolation-$browser.log"
    fi
done

# Derived from what is on disk, so a driver this script forgets to run is named here
# instead of vanishing. These need a real Galaxy; a green run above is not coverage of them.
echo
for f in e2e/*-drive.cjs; do
    d=$(basename "$f" -drive.cjs)
    case " $ran " in *" $d "*) continue;; esac
    printf '  SKIP  %-22s not run here: it needs a real Galaxy (see the header of %s)\n' "$d" "$f"
done

exit $fail
