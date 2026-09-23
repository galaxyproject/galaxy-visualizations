# Olit

A browser-native AI research assistant for Galaxy, delivered as a Charts visualization
plugin. The agent runs entirely in the browser: a Python brain inside Pyodide reaches the
model through a user-supplied key, runs local Python, and orchestrates Galaxy through the
user's own session. There is no per-user server container.

Its agent behaviour and interaction model follow [Orbit](https://github.com/galaxyproject/loom),
the Galaxy AI co-scientist, whose skills, prompts and evals apply here; every deliberate
difference is recorded in `seams/`. `LAYOUT.md` maps the code.

## Running it

All three need `npm install` once. `npm run dev` builds the Pyodide assets and the brain
wheel first, so the first start takes minutes; plain `npx vite` serves what is already built.
Editing `brain/` does nothing until `npm run build:olit` rebuilds the wheel, and the
wheel is named after its contents, so a running dev server keeps asking for the previous
one. Restart it after rebuilding the brain.

**Stub only, no model, no Galaxy** (`e2e/README.md`):

```bash
node e2e/stub.cjs &
GALAXY_ROOT=http://127.0.0.1:8099 LLM_PROVIDER=local LLM_ROOT=http://127.0.0.1:8099 \
  LLM_PATH=/v1 LLM_MODEL=stub-model LLM_CONTEXT_WINDOW=40000 npm run dev
```

**Real model, no browser** (`evals/README.md`): `python3 evals/run.py smoke`.

**Real Galaxy and a real model:**

```bash
GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_KEY=<galaxy-api-key> \
LLM_PROVIDER=gemini LLM_KEY="$GEMINI_KEY" LLM_MODEL=gemini-3.7-flash npm run dev
```

`LLM_PROVIDER` names an entry in `brain/olit/substrate/llm/providers.py`, which carries the
endpoint, context window and rate limit; vite proxies `/llm` to it and attaches `LLM_KEY`
there. For an endpoint the registry lacks, set `LLM_ROOT` and `LLM_PATH`. `GALAXY_KEY` is
needed because vite serves the page outside Galaxy, so no session cookie applies. Without
`LLM_PROVIDER` the page shows the provider picker, which is the production path: the key
is held by the worker and never enters the brain.

## Tests

`npm test` runs, in order: vitest, pytest, `tsc`, the seam checks, and the e2e drives.
`npm run seams` compares Olit against an Orbit checkout at `LOOM_ROOT` (`seams/README.md`).

## Scope

No local shell or filesystem: Galaxy is the OS, and `run_python` is Pyodide only. It runs
async, so submitted code can use top-level `await` and `pyfetch`, which makes network reach
the browser's: a CORS-open API is readable, anything else is not. Choose Orbit when you
need a shell or a per-user container.
