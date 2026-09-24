#!/usr/bin/env bash
# Run loom's side of the comparison. Each check below guards a way a run can be silently
# wasted: the numbers look plausible either way, so this fails loudly instead.
#
#   LOOM_DIR=~/loom ./run-loom.sh [scenario ...]

set -euo pipefail

LOOM_DIR="${LOOM_DIR:-$HOME/loom}"
MODEL="${LOOM_MODEL:-tacc:gpt-oss-120b}"
OUT="${LOOM_OUT:-$PWD/loom-results}"
# Our scenarios, copied into loom's scenario directory for the run and removed after.
# Copied rather than symlinked: the discovery walk keeps only real directories.
EXTRA="${LOOM_EXTRA_SCENARIOS:-$(cd "$(dirname "$0")" && pwd)/loom-scenarios}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# One spawn per scenario, which suits planning scenarios; work that outlives a turn needs
# drive-loom.py and its resume lifecycle instead.
PASSES=1
linked=()
cleanup() { for l in "${linked[@]:-}"; do rm -rf "$l"; done; }
trap cleanup EXIT

fail() { echo "refusing to run: $*" >&2; exit 1; }

# 1. Without Galaxy, loom runs its NOT CONNECTED prompt and routes every plan local.
[ -n "${GALAXY_URL:-}" ] || fail "GALAXY_URL is unset; loom would run disconnected"
[ -n "${GALAXY_API_KEY:-}" ] || fail "GALAXY_API_KEY is unset; loom would run disconnected"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "x-api-key: ${GALAXY_API_KEY}" "${GALAXY_URL%/}/api/histories" || true)
[ "$code" = "200" ] || fail "GALAXY_URL/${GALAXY_API_KEY:+key} did not authenticate (/api/histories -> ${code:-no response})"

# 2. A rejected key still exits 0 and reports scenario failures, reading as loom failing.
[ -n "${PROXY_URL:-}" ] || fail "PROXY_URL is unset"
[ -n "${PROXY_API_KEY:-}" ] || fail "PROXY_API_KEY is unset"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${PROXY_API_KEY}" "${PROXY_URL%/}/models" || true)
[ "$code" = "200" ] || fail "inference endpoint did not authenticate (/models -> ${code:-no response})"

[ -d "$LOOM_DIR/evals/scenarios" ] || fail "no loom scenarios under $LOOM_DIR"

# 3. loom's filter is an exact name and a miss exits 0 having run nothing.
if [ "$#" -gt 0 ]; then
    scenarios=("$@")
    for s in "${scenarios[@]}"; do
        if [ ! -d "$LOOM_DIR/evals/scenarios/$s" ]; then
            [ -d "$EXTRA/$s" ] || fail "no such scenario: $s (looked in loom and $EXTRA)"
            cp -R "$EXTRA/$s" "$LOOM_DIR/evals/scenarios/$s"
            linked+=("$LOOM_DIR/evals/scenarios/$s")
            [ -f "$EXTRA/$s/cwd/notebook.md" ] \
                || fail "$s has no staged history binding; run stage-cryptic.py first"
        fi
    done
else
    scenarios=()
    while IFS= read -r d; do scenarios+=("$(basename "$d")"); done \
        < <(find "$LOOM_DIR/evals/scenarios" -mindepth 1 -maxdepth 1 -type d | sort)
fi

# 4. The runner fakes HOME, which also hides the package cache. Without it every spawn
# re-resolves the Galaxy server, loses the handshake race, and the agent gets no Galaxy tools.
export UV_CACHE_DIR="${UV_CACHE_DIR:-$HOME/.cache/uv}"
[ -d "$UV_CACHE_DIR" ] || fail "UV_CACHE_DIR $UV_CACHE_DIR does not exist; galaxy-mcp would be re-resolved per spawn"

mkdir -p "$OUT"
echo "galaxy   ${GALAXY_URL}"
echo "model    ${MODEL}"
echo "results  ${OUT}"
echo "${#scenarios[@]} scenario(s)"

# 5. An early exit leaves the results directory untouched, so a file from an earlier run
# would be filed under this scenario. Snapshot only what was written after this invocation.
for s in "${scenarios[@]}"; do
    echo "=== $s"
    history=$(sed -n 's/^history_id: //p' "$EXTRA/$s/cwd/notebook.md" 2>/dev/null | head -1)
    for pass in $(seq 1 "$PASSES"); do
        [ "$PASSES" -gt 1 ] && echo "--- pass $pass/$PASSES" || true
        marker="$(mktemp)"                   # a timestamp to compare against
        (cd "$LOOM_DIR" && npm run evals -- "$s" --model "$MODEL" 2>&1) \
            | grep -E "PASS|FAIL|passed|failed" || true
        latest=$(find "$LOOM_DIR/evals/results" -name '*.jsonl' -newer "$marker" -print0 2>/dev/null \
            | xargs -0 ls -t 2>/dev/null | head -1 || true)
        rm -f "$marker"
        [ -n "$latest" ] || fail "loom wrote no results for $s; it did not run (a stale file would have been copied here)"
        cp "$latest" "$OUT/$s${PASSES:+.pass$pass}.jsonl"
        # Each pass is a fresh session, so state carries in the bound Galaxy page and history.
        if [ "$pass" -lt "$PASSES" ] && [ -n "$history" ]; then
            python3 "$HERE/settle-galaxy.py" "$history" "${LOOM_SETTLE_TIMEOUT:-5400}"
        fi
    done
    cp "$OUT/$s.pass$PASSES.jsonl" "$OUT/$s.jsonl" 2>/dev/null || true
done

echo "done; per-scenario results under $OUT"
