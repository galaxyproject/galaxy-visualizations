# Olit

A browser-native AI research assistant for Galaxy, delivered as a Charts visualization
plugin. A Python brain inside Pyodide reaches the model through a user-supplied key, runs
local Python, and orchestrates Galaxy through the user's own session. There is no per-user
server container.

Its behaviour follows [Orbit](https://github.com/galaxyproject/loom), the Galaxy AI
co-scientist, whose skills and prompts apply here. `LAYOUT.md` maps the code.

## Running it

`npm install` once, then `npm run dev`, which builds the Pyodide assets and the brain wheel
first and so takes minutes. `npx vite` serves what is already built. Editing `brain/` needs
`npm run build:olit` and a dev server restart, because the wheel is named after its contents.

Against a stub, with no model and no Galaxy (`e2e/README.md`):

```bash
node e2e/stub.cjs &
GALAXY_ROOT=http://127.0.0.1:8099 LLM_PROVIDER=local LLM_ROOT=http://127.0.0.1:8099 \
  LLM_PATH=/v1 LLM_MODEL=stub-model LLM_CONTEXT_WINDOW=40000 npm run dev
```

Against a real Galaxy and a real model:

```bash
GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_KEY=<galaxy-api-key> \
LLM_PROVIDER=gemini LLM_KEY="$GEMINI_KEY" LLM_MODEL=gemini-3.7-flash npm run dev
```

`LLM_PROVIDER` names an entry in `brain/olit/substrate/llm/providers.py`, which carries the
endpoint, context window and rate limit; set `LLM_ROOT` and `LLM_PATH` for one the registry
lacks. `GALAXY_KEY` is needed because vite serves the page outside Galaxy, so no session
cookie applies. Leave `LLM_PROVIDER` unset to get the provider picker, which is the
production path: the key stays in the worker and never enters the brain.

## Tests

`npm test` runs vitest, pytest, `tsc`, the vendored-file check, and the e2e drives.
`npm run describe` prints the surface Olit exposes: its tools and their parameters, the
Galaxy queries they build, the guards that can refuse a call, and the sampling and loop
policy.

## Scope

No local shell or filesystem: Galaxy is the OS, and `run_python` is Pyodide only. Submitted
code runs async, so top-level `await` and `pyfetch` work, but the network reach is the
browser's: a CORS-open API is readable, anything else is not. Choose Orbit when you need a
shell or a per-user container.
