# Running the loom side of the comparison

Comparing olit against Orbit means running **loom's** eval suite too. Three things in that
path are non-obvious, and each one produced a wasted run before it was understood. This is
the recipe.

## 1. loom needs a key-injecting proxy

pi forwards the literal string `PROXY_API_KEY` rather than resolving the environment
variable, so pointing `PROXY_URL` straight at an inference endpoint 401s on every request —
**and the runner still exits 0**, reporting scenario failures with `usage: None`. It looks
like loom failing, not like auth failing.

`loom-key-proxy.py` sits in front of the endpoint and swaps the header:

```bash
UPSTREAM=https://llm.jetstream-cloud.org/api REAL_KEY="$JETSTREAM2_KEY" PORT=8123 \
  python3 evals/comparison/loom-key-proxy.py &
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer PROXY_API_KEY" \
  http://127.0.0.1:8123/models        # expect 200, not 401
```

Then run loom with `PROXY_URL=http://127.0.0.1:8123`. `evals/.env` only fills variables that
are *unset*, so an exported value wins and loom's own file needs no editing.

## 2. loom runs disconnected unless you give it Galaxy

loom keys `buildGalaxyContextBlock` off `GALAXY_URL` / `GALAXY_API_KEY` in the environment
(`context.ts:234`). With neither set it emits its **NOT CONNECTED** prompt variant, has no
`galaxy_*` tools, and routes every plan `local` — which is why the routing dimension was long
believed "permanently non-comparable". It was not; it was measuring a disconnected agent.

Export both and the same cell goes from 0/9 to 3/3 on routing. **A comparison run without
these is not measuring the same agent olit is.**

## 3. loom's results file overwrites itself

`evals/lib/persist.ts` writes `evals/results/<date>-<sha>.jsonl` with `fs.writeFileSync`, so
consecutive invocations clobber each other. Snapshot after every invocation or keep only the
last one's data.

Also: loom's runner has no `--repeat`, but it runs each scenario **3 times internally**, so
one invocation is n=3. And its scenario filter is an **exact** directory-name match
(`path.basename(dir) === filter`) — a substring like `plan-creation` silently matches nothing
and completes in seconds having run nothing at all.

## Full invocation

```bash
cd ~/loom
export PROXY_URL=http://127.0.0.1:8123
export GALAXY_URL=http://127.0.0.1:8080 GALAXY_API_KEY=<key>
for rep in 1 2 3; do
  for s in plan-creation-rnaseq plan-creation-metagenomics plan-creation-somatic-variants \
           plan-creation-scrna-celltypes plan-creation-pharmacogenomics \
           behavior-underspecified-ask udt-authoring-threads; do
    npm run evals -- "$s" --model tacc:gpt-oss-120b,js2:llama-4-scout
    cp "$(ls -t evals/results/*.jsonl | head -1)" "$OUT/rep${rep}-${s}.jsonl"
  done
done
```

`tacc:gpt-oss-120b` is a label, not a destination: its `baseUrl` comes from `PROXY_URL` at
run time, so with the proxy above it hits Jetstream2. **Label results by endpoint, never by
entry name.**

## Grading

Aggregate per **dimension** from `failedDimensions`, not by the run-level `passed` flag — a
single routing failure marks the whole run failed, and routing is excluded from the
comparison for `scout` (it routes `local` even when connected, which is a model weakness
rather than a runtime difference).
