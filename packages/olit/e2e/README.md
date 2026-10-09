# End-to-end checks

Drives the real page against a stub that serves both the provider and Galaxy. Covers the
worker-boundary wiring vitest cannot reach: the destructive-op gate, Stop, compaction, Pyodide.

`bash e2e/run-all.sh` (or `npm run test:e2e`) runs both tiers; its loops are the list of drives.
Drives it does not run need a real Galaxy and model, and say what they need at the top.

## Dev tier — port 5173

```bash
node e2e/stub.cjs &                                   # provider + Galaxy on :8099

GALAXY_ROOT=http://127.0.0.1:8099 \
  LLM_PROVIDER=ollama LLM_ROOT=http://127.0.0.1:8099 LLM_PATH=/v1 \
  LLM_KEY=stub LLM_MODEL=stub-model \
  LLM_CONTEXT_WINDOW=64000 LLM_KEEP_RECENT_TOKENS=50 npm run dev &

LLM_CONTEXT_WINDOW=64000 node e2e/confirm-drive.cjs   # non-zero if a check fails
```

`LLM_PROVIDER` skips the credentials modal and routes the agent through vite's `/llm` proxy.
The dev page opens on `?dataset_id=` (default `__test__`, in the stub's `h1`); the history
holding that dataset keys the conversation kept in the browser's files (OPFS).

`LLM_KEEP_RECENT_TOKENS` must be small enough that the short transcript has something older
than the kept tail, or the compaction checks fail. They are skipped unless
`LLM_CONTEXT_WINDOW` is set.

## Built tier — port 8099

The stub serves the built bundle as a deployment does: `/api/plugins/olit`, the host page
carrying `data-incoming`, and the plugin static path. So `root`, the plugin `href`, the
Pyodide URL and the system prompt are the deployment's, and the credentials modal appears.

```bash
env -u LLM_PROVIDER -u LLM_ROOT -u LLM_MODEL -u LLM_KEY npm run build
node e2e/stub.cjs &
node e2e/galaxy-boot-drive.cjs
BROWSER=firefox node e2e/python-isolation-drive.cjs   # chromium by default; also webkit
```

Use the dev tier for fast iteration on `src/`, the built tier for anything that has to hold in
a deployment. Drives that name a real provider call `offline.cjs` first, which aborts every
request off 127.0.0.1.

## The stub

- `/__reset` restores a fresh Galaxy; `run-all.sh` calls it before every drive.
- `/__script?name=…` selects the scripted model responses.
- `/__galaxy?up=0|1`, `/__job?state=…`, `/__slow?ms=…` (a slow boot) set what Galaxy answers.
- `/__seen`, `/__pages`, `/__visualizations` report what the agent sent, so "declining sends
  nothing to Galaxy" is an assertion about the network rather than the UI.

Screenshots land at each driver's `OUT` path. A check can pass on a page that renders nothing.
