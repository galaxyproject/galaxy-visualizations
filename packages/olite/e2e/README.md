# End-to-end checks

Drives the real page against a stub that serves both the provider and Galaxy. Covers the
worker-boundary wiring the Python and vitest suites cannot reach: the destructive-op gate,
Stop, and compaction.

Two tiers, two ports.

## Dev tier — port 5173

```bash
node e2e/stub.cjs &                                   # provider + Galaxy on :8099

GALAXY_ROOT=http://127.0.0.1:8099 \
  LLM_PROVIDER=local LLM_ROOT=http://127.0.0.1:8099 LLM_PATH=/v1 \
  LLM_KEY=stub LLM_MODEL=stub-model \
  LLM_CONTEXT_WINDOW=40000 LLM_KEEP_RECENT_TOKENS=50 npm run dev &

LLM_CONTEXT_WINDOW=40000 node e2e/confirm-drive.cjs   # non-zero if a check fails
node e2e/session-drive.cjs
node e2e/catalog-refusal-drive.cjs
node e2e/ratelimit-drive.cjs
```

`LLM_PROVIDER` is required; without it vite refuses to configure and every driver fails at
"brain reports ready". It also skips the credentials modal, which would otherwise block
startup, and routes the brain through vite's `/llm` proxy so the key stays out of page JS.

`LLM_KEEP_RECENT_TOKENS` must be small enough that the short test transcript has something
older than the kept tail; at 500 the brain correctly reports "nothing older to summarize"
and the compaction checks fail. Compaction checks are skipped entirely unless
`LLM_CONTEXT_WINDOW` is set.

## Preview tier — port 4173

`credentials`, `artifact-pane` and `provider-switch` need a build **without** the dev env,
or `LLM_PROVIDER` is baked in and suppresses the modal they test.

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
