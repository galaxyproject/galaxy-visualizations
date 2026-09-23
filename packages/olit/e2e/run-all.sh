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
# `npm run dev` outlives the kill: npm is the recorded pid, vite is its child, and the
# orphan then answers the next run's drivers. Take the servers by name as well.
cleanup() {
    for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
    pkill -f "e2e/stub.cjs" 2>/dev/null || true
    pkill -f "$PWD/node_modules/.bin/vite" 2>/dev/null || true
}
trap cleanup EXIT

node e2e/stub.cjs > /tmp/olit-e2e-stub.log 2>&1 & pids+=($!)
for _ in $(seq 20); do curl -sf -o /dev/null http://127.0.0.1:8099/__seen && break; sleep 0.5; done

GALAXY_ROOT=http://127.0.0.1:8099 LLM_PROVIDER=ollama LLM_ROOT=http://127.0.0.1:8099 \
  LLM_PATH=/v1 LLM_KEY=stub LLM_MODEL=stub-model \
  LLM_CONTEXT_WINDOW=40000 LLM_KEEP_RECENT_TOKENS=50 \
  npm run dev > /tmp/olit-e2e-dev.log 2>&1 & pids+=($!)
for _ in $(seq 40); do curl -sf -o /dev/null http://localhost:5173/ && break; sleep 1; done

for d in confirm session catalog-refusal ratelimit visualization-artifact artifact-survives-switch run-python; do
    if LLM_CONTEXT_WINDOW=40000 node "e2e/$d-drive.cjs" > "/tmp/olit-e2e-$d.log" 2>&1; then
        echo "PASS  $d"
    else
        echo "FAIL  $d  (/tmp/olit-e2e-$d.log)"; fail=1
    fi
done

# The built bundle, served the way Galaxy serves it: the stub renders the host page and
# the plugin static path, so these drivers get the credentials modal and the brain both.
# The build must not carry the dev env, or LLM_PROVIDER suppresses the modal.
env -u LLM_PROVIDER -u LLM_ROOT -u LLM_MODEL -u LLM_KEY npm run build > /tmp/olit-e2e-build.log 2>&1

for d in credentials artifact-pane provider-switch galaxy-boot; do
    if node "e2e/$d-drive.cjs" > "/tmp/olit-e2e-$d.log" 2>&1; then
        echo "PASS  $d"
    else
        echo "FAIL  $d  (/tmp/olit-e2e-$d.log)"; fail=1
    fi
done

exit $fail
