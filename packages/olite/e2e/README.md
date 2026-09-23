# End-to-end checks

Drives the real page against a stub that serves both the provider and Galaxy. Covers the
worker-boundary wiring the Python and vitest suites cannot reach: the destructive-op gate,
Stop, and compaction.

Two tiers. The dev tier runs vite; the built tier runs the bundle Galaxy would ship.

## Dev tier — port 5173

```bash
node e2e/stub.cjs &                                   # provider + Galaxy on :8099

GALAXY_ROOT=http://127.0.0.1:8099 \
  LLM_PROVIDER=ollama LLM_ROOT=http://127.0.0.1:8099 LLM_PATH=/v1 \
  LLM_KEY=stub LLM_MODEL=stub-model \
  LLM_CONTEXT_WINDOW=40000 LLM_KEEP_RECENT_TOKENS=50 npm run dev &

LLM_CONTEXT_WINDOW=40000 node e2e/confirm-drive.cjs   # non-zero if a check fails
node e2e/session-drive.cjs
node e2e/catalog-refusal-drive.cjs
node e2e/ratelimit-drive.cjs
node e2e/visualization-artifact-drive.cjs
node e2e/artifact-survives-switch-drive.cjs
node e2e/run-python-drive.cjs
```

`bash e2e/run-all.sh` runs both tiers. `live-workflow-drive.cjs` and
`live-visualization-drive.cjs` need a real Galaxy and model and are opt-in; each says what
it needs at the top.

`LLM_PROVIDER` skips the credentials modal, which would otherwise block startup, and routes
the brain through vite's `/llm` proxy.

**Which tier a new driver belongs to: the dev tier for fast iteration on `src/`, the built
tier for anything that has to hold in a deployment.** The dev tier bakes `LLM_PROVIDER` in
and so never shows the credentials modal; the built tier shows it and reaches the brain
through the same paths Galaxy uses.

`run-python` is the only check that runs submitted Python in real Pyodide: the brain's own
suite runs in CPython, where neither `eval_code_async` nor `pyfetch` exists. It asserts
top-level `await` and a cross-origin `pyfetch` against the stub, so the CORS path is real.

**Anything about persistence needs `?history_id=`.** `SessionMemory` keys on a history and
stays disabled without one, so the dev page persists neither the transcript nor the
artifacts until the URL supplies it, as Galaxy does in production.

`LLM_KEEP_RECENT_TOKENS` must be small enough that the short test transcript has something
older than the kept tail; at 500 the brain correctly reports "nothing older to summarize"
and the compaction checks fail. Compaction checks are skipped entirely unless
`LLM_CONTEXT_WINDOW` is set.

## Built tier — port 8099

The stub also serves the built bundle the way a deployment does: `/api/plugins/olite`,
the host page carrying `data-incoming`, and the plugin static path
`/static/plugins/visualizations/olite/static/`. So `root`, the plugin `href`, the Pyodide
URL and the system prompt are the deployment's, and the credentials modal appears because
the build carries no dev env.

```bash
env -u LLM_PROVIDER -u LLM_ROOT -u LLM_MODEL -u LLM_KEY npm run build
node e2e/stub.cjs &

node e2e/credentials-drive.cjs
node e2e/artifact-pane-drive.cjs
node e2e/provider-switch-drive.cjs
node e2e/galaxy-boot-drive.cjs
```

`galaxy-boot` connects a self-hosted endpoint through the modal and drives a full turn, so
a built app whose brain fails to start, whose Pyodide path 404s, or whose prompt does not
come from the plugin XML fails here.

Drivers that name a real provider call `offline.cjs` first, which aborts every request off
127.0.0.1: the brain boots on this tier and would otherwise reach the provider for real.

## The stub

`/__script?name=…` selects a scripted response (`confirm`, `slow`, `compact`, `ratelimit`,
`plan`, `visualization`, `python`).
`/__seen` returns every Galaxy request received, which is what makes "declining sends nothing
to Galaxy" an assertion about the network rather than the UI.

Screenshots land at each driver's `OUT` path. A check can pass on a page that renders nothing.
