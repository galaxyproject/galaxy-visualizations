#!/usr/bin/env bash
# Run loom's side of the comparison. Each check below is a way a past run was silently
# wasted -- the numbers look plausible either way, so this fails loudly instead.
#
#   LOOM_DIR=~/loom ./run-loom.sh [scenario ...]

set -euo pipefail

LOOM_DIR="${LOOM_DIR:-$HOME/loom}"
MODEL="${LOOM_MODEL:-tacc:gpt-oss-120b}"
OUT="${LOOM_OUT:-$PWD/loom-results}"
# Scenarios that are ours rather than loom's. `run.ts` hardcodes evals/scenarios, so each one is
# copied in for the run and removed after: loom's own scenarios stay read unmodified. Copied, not
# symlinked -- `discoverScenarios` filters on `isDirectory()`, and a symlink is not one, so a
# linked scenario is silently invisible and loom exits 0 having run nothing.
EXTRA="${LOOM_EXTRA_SCENARIOS:-$(cd "$(dirname "$0")" && pwd)/loom-scenarios}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# loom's runner is a single spawn: it feeds every input and the process exits, so submitted
# Galaxy work never lands and its own auto-resume has no session left to fire into. Olit's
# harness settles advancing work between turns and then takes up to MAX_AUTO_FOLLOW_UPS
# automatic turns (src/auto-resume.ts). Matching that here, from the outside, keeps loom
# unmodified: each pass is a fresh loom session that re-reads its state from the bound Galaxy
# page and history, which is how a resumed session works in production anyway.
# One opening pass plus three follow-ups, matching MAX_AUTO_FOLLOW_UPS on the Olit side.
PASSES="${LOOM_PASSES:-4}"
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

mkdir -p "$OUT"
echo "galaxy   ${GALAXY_URL}"
echo "model    ${MODEL}"
echo "results  ${OUT}"
echo "${#scenarios[@]} scenario(s)"

# 5. A model id loom does not know, or any other early exit, leaves its results
# directory untouched -- and `ls -t` then hands back a file from a previous run, which
# gets filed under this scenario's name. Month-old numbers for a scenario that never ran
# read exactly like fresh ones. So the snapshot is taken only if loom wrote something
# newer than this invocation.
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
        # Each pass is a fresh loom session: the runner deletes its temp cwd, so the notebook
        # does not survive. State carries in Galaxy -- the bound page and history the fixture
        # points at -- which is what a resumed session reads in production too.
        if [ "$pass" -lt "$PASSES" ] && [ -n "$history" ]; then
            python3 "$HERE/settle-galaxy.py" "$history" "${LOOM_SETTLE_TIMEOUT:-5400}"
        fi
    done
    cp "$OUT/$s.pass$PASSES.jsonl" "$OUT/$s.jsonl" 2>/dev/null || true
done

echo "done; per-scenario results under $OUT"
