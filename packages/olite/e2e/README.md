# End-to-end checks

Drives the real page against a stub that serves both the provider and Galaxy. Covers the
worker-boundary wiring the Python and vitest suites cannot reach: the destructive-op gate,
Stop, and compaction.

Two tiers, two ports.

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
```

`bash e2e/run-all.sh` runs both tiers. `live-workflow-drive.cjs` and
`live-visualization-drive.cjs` need a real Galaxy and model and are opt-in; each says what
it needs at the top.

`LLM_PROVIDER` skips the credentials modal, which would otherwise block startup, and routes
the brain through vite's `/llm` proxy.

**Which tier a new driver belongs to follows from one question: does it need the brain, or
does it need the credentials modal?** It cannot have both. The dev tier runs the brain and
has no modal; the preview tier has the modal and cannot run the brain, because a non-dev
build loads Pyodide from the Galaxy deployment path (`static/plugins/visualizations/olite/`)
and `vite preview` does not serve it. Nothing in the preview tier boots the brain, so a
built app whose brain fails to start would pass every check there.

**Anything about persistence needs `?history_id=`.** `SessionMemory` keys on a history and
stays disabled without one, so the dev page persists neither the transcript nor the
artifacts until the URL supplies it, as Galaxy does in production.

`LLM_KEEP_RECENT_TOKENS` must be small enough that the short test transcript has something
older than the kept tail; at 500 the brain correctly reports "nothing older to summarize"
and the compaction checks fail. Compaction checks are skipped entirely unless
`LLM_CONTEXT_WINDOW` is set.

## Preview tier — port 4173

`credentials`, `artifact-pane` and `provider-switch` need a build **without** the dev env,
or `LLM_PROVIDER` is baked in and suppresses the modal they test. They stop at the footer
controls for the reason above: the brain does not start here.

```bash
env -u LLM_PROVIDER -u LLM_ROOT -u LLM_MODEL -u LLM_KEY npm run build
GALAXY_ROOT=http://127.0.0.1:8099 npx vite preview &

node e2e/credentials-drive.cjs
node e2e/artifact-pane-drive.cjs
node e2e/provider-switch-drive.cjs
```

## The stub

`/__script?name=…` selects a scripted response (`confirm`, `slow`, `compact`, `ratelimit`).
`/__seen` returns every Galaxy request received, which is what makes "declining sends nothing
to Galaxy" an assertion about the network rather than the UI.

Screenshots land at each driver's `OUT` path. A check can pass on a page that renders nothing.
