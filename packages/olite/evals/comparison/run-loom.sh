#!/usr/bin/env bash
# Run loom's side of the comparison, refusing to start if the run would be void.
#
# Every check here corresponds to a way a previous comparison run was wasted. Prose in
# README.md was not enough -- the numbers come out looking plausible either way, which
# is exactly why this has to fail loudly instead of being remembered.
#
#   LOOM_DIR=~/loom ./run-loom.sh [scenario ...]

set -euo pipefail

LOOM_DIR="${LOOM_DIR:-$HOME/loom}"
MODEL="${LOOM_MODEL:-tacc:gpt-oss-120b}"
OUT="${LOOM_OUT:-$PWD/loom-results}"

fail() { echo "refusing to run: $*" >&2; exit 1; }

# 1. Galaxy. Without these loom emits its NOT CONNECTED prompt, has no galaxy_* tools
#    and routes every plan local, so it is not the same agent olite is measured as.
[ -n "${GALAXY_URL:-}" ] || fail "GALAXY_URL is unset; loom would run disconnected"
[ -n "${GALAXY_API_KEY:-}" ] || fail "GALAXY_API_KEY is unset; loom would run disconnected"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "x-api-key: ${GALAXY_API_KEY}" "${GALAXY_URL%/}/api/histories" || true)
[ "$code" = "200" ] || fail "GALAXY_URL/${GALAXY_API_KEY:+key} did not authenticate (/api/histories -> ${code:-no response})"

# 2. Inference. A rejected key still exits 0 and reports scenario failures, which reads
#    as loom failing rather than auth failing.
[ -n "${PROXY_URL:-}" ] || fail "PROXY_URL is unset"
[ -n "${PROXY_API_KEY:-}" ] || fail "PROXY_API_KEY is unset"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${PROXY_API_KEY}" "${PROXY_URL%/}/models" || true)
[ "$code" = "200" ] || fail "inference endpoint did not authenticate (/models -> ${code:-no response})"

[ -d "$LOOM_DIR/evals/scenarios" ] || fail "no loom scenarios under $LOOM_DIR"

# 3. loom's scenario filter is an exact directory name, and a miss exits 0 having run
#    nothing. Resolve the list up front so a typo is caught here.
if [ "$#" -gt 0 ]; then
    scenarios=("$@")
    for s in "${scenarios[@]}"; do
        [ -d "$LOOM_DIR/evals/scenarios/$s" ] || fail "no such loom scenario: $s"
    done
else
    scenarios=()
    while IFS= read -r d; do scenarios+=("$(basename "$d")"); done \
        < <(find "$LOOM_DIR/evals/scenarios" -mindepth 1 -maxdepth 1 -type d | sort)
fi

mkdir -p "$OUT"
echo "galaxy   ${GALAXY_URL}"
echo "model    ${MODEL}"
echo "results  ${OUT}"
echo "${#scenarios[@]} scenario(s)"

# 4. loom writes evals/results/<date>-<sha>.jsonl with writeFileSync, so consecutive
#    invocations clobber each other. Snapshot after each one.
for s in "${scenarios[@]}"; do
    echo "=== $s"
    (cd "$LOOM_DIR" && npm run evals -- "$s" --model "$MODEL" 2>&1) | grep -E "PASS|FAIL|passed|failed" || true
    latest=$(find "$LOOM_DIR/evals/results" -name '*.jsonl' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1 || true)
    [ -n "$latest" ] && cp "$latest" "$OUT/$s.jsonl"
done

echo "done; per-scenario results under $OUT"
