# Olit: A Browser-Native AI Co-Scientist for Galaxy

Olit is an AI co-scientist that runs directly inside Galaxy, in the web browser.

It can inspect histories and datasets, plan analyses, search for and run Galaxy tools and workflows, follow their execution, inspect results, perform local computation, create visualizations and other artifacts, and continue working from what it finds.

**The browser runs the agent; Galaxy runs the science.**

Galaxy provides the computational environment: datasets, tools, workflows, jobs, histories, and provenance. Lightweight Python runs locally through Pyodide. The agent uses the researcher's active Galaxy session, and model credentials remain in the browser.

No separate agent server or per-user compute container is required.

## Why Olit?

Galaxy already provides AI capabilities for tasks such as chat, error analysis, and tool recommendation. Olit explores a different question:

> **Can an open-ended AI co-scientist operate Galaxy directly from the browser, using Galaxy itself as its computational environment?**

A research question can become a multi-step Galaxy analysis. Olit can inspect the available data, develop a plan, select and configure tools, submit jobs and workflows, wait for their results, inspect the outputs, and continue the analysis based on what it finds.

Scientific computation remains in Galaxy. Tools, parameters, inputs, outputs, and provenance remain part of the normal Galaxy research record rather than moving into a separate agent environment.

## Architecture

```mermaid
flowchart TB
    UI["Orbit's Chat Interface"]

    subgraph Olit
        UI
        Brain["Olit's Pyodide Brain"]
        Skill["Galaxy Skills"]
        Ops["Galaxy MCP"]
        State["State"]
        BrowserState["Browser Storage"]
        Notebook["Galaxy Notebook"]
        Session["Visualization Session"]
    end

    Model["LLM Provider"]
    GalaxyApi["Galaxy's API"]

    UI --> Brain
    Brain --> Skill
    Brain --> Ops
    Brain --> State
    State --> BrowserState
    State --> Notebook
    State --> Session
    Brain --> Model
    Ops --> GalaxyApi
```

## Olit and Orbit

[Orbit](https://github.com/galaxyproject/loom) is Galaxy's flagship AI environment and the main functional reference for Olit. Orbit pioneered the AI co-scientist model for Galaxy: an open-ended agent that can plan analyses, work with Galaxy tools and workflows, inspect results, and continue a research process over multiple steps.

Olit explores how that model translates to a browser-native architecture. Its name reflects that lineage, in a relationship similar in spirit to JupyterLab and JupyterLite: the research experience is adapted to a different runtime environment.

| | Orbit | Olit |
| --- | --- | --- |
| Agent runtime | Local/server Python | Browser / Pyodide |
| Scientific computation | Local environment + Galaxy | Galaxy |
| Shell | Available | None |
| Filesystem | Local filesystem | Galaxy data + browser storage |
| Galaxy access | MCP | Active Galaxy session |
| Deployment | Agent environment | Galaxy visualization plugin |
| Per-user agent backend | Required | None |

The architectures have different capability envelopes. Orbit provides a shell, local processes, unrestricted networking, and a conventional filesystem. Olit investigates what an AI co-scientist can do when the browser provides the agent runtime and Galaxy provides the scientific computational environment.

## Galaxy as the computational environment

Olit's constraints are deliberate.

Scientific analyses execute as normal Galaxy jobs and workflows. Inputs and outputs remain Galaxy datasets and collections. Galaxy records the tools, parameters, inputs, outputs, and provenance of the analysis.

Pyodide complements that remote computation with local Python for lightweight exploration and intermediate computation. Browser storage provides local agent state, while persistent research outputs can be represented using Galaxy-native artifacts.

The result is a division of responsibilities:

- **Galaxy** provides scientific tools, workflows, data, jobs, provenance, and persistent research outputs.
- **Pyodide** provides lightweight local Python computation.
- **The browser** provides the agent runtime, interface, local state, networking, and model connection.

Olit therefore does not introduce another general-purpose computational environment alongside Galaxy.

## Inside Galaxy

Olit is built as an application on Galaxy's Charts visualization plugin framework.

Galaxy visualization plugins are not limited to plots and viewers: they can be complete browser applications with access to Galaxy data and services. Olit uses that existing extension point to deliver an AI co-scientist inside the Galaxy interface.

Because Olit is served by Galaxy, it is same-origin with the Galaxy API and can operate through the researcher's active session. In normal embedded operation, this avoids a local proxy, a separate agent process, or a long-lived Galaxy API key held by another service.

The Python agent runs in a Web Worker through Pyodide. The surrounding TypeScript application connects the interface, browser runtime, model provider, and active Galaxy session. Model credentials remain in the browser rather than being held by a separate Olit backend.

This allows Olit to be distributed through Galaxy's existing visualization infrastructure without requiring a separate agent service.

`LAYOUT.md` maps the repository and its major components.

## Running it

Install dependencies once:

```bash
npm install
```

Then start the development environment:

```bash
npm run dev
```

The first run builds the Pyodide assets and the Olit brain wheel and can take several minutes.

To serve what is already built:

```bash
npx vite
```

Changes under `brain/` require rebuilding the wheel and restarting the development server:

```bash
npm run build:olit
```

### Against the stub

The end-to-end stub requires neither Galaxy nor a model. See `e2e/README.md`.

```bash
node e2e/stub.cjs &
GALAXY_ROOT=http://127.0.0.1:8099 \
LLM_PROVIDER=local \
LLM_ROOT=http://127.0.0.1:8099 \
LLM_PATH=/v1 \
LLM_MODEL=stub-model \
LLM_CONTEXT_WINDOW=40000 \
npm run dev
```

### Against Galaxy and a model

```bash
GALAXY_ROOT=http://127.0.0.1:8080 \
GALAXY_KEY=<galaxy-api-key> \
LLM_PROVIDER=gemini \
LLM_KEY="$GEMINI_KEY" \
LLM_MODEL=gemini-3.7-flash \
npm run dev
```

`LLM_PROVIDER` names an entry in `brain/olit/substrate/llm/providers.py`, which defines the endpoint, context window, and rate limit. Set `LLM_ROOT` and `LLM_PATH` for an endpoint the registry does not contain.

`GALAXY_KEY` is needed during local development because Vite serves Olit outside Galaxy, where the Galaxy session cookie does not apply.

Leave `LLM_PROVIDER` unset to use the provider picker. This is the production path: the model key remains in the browser worker and never enters the Python agent.

## Tests

```bash
npm test
```

This runs Vitest, pytest, TypeScript type checking, vendored-file verification, and the end-to-end drives.

To inspect the surface exposed to the agent:

```bash
npm run describe
```

This reports the tools and parameters exposed to the agent, the Galaxy queries they construct, guards that can refuse calls, and the sampling and loop policies.

## Scope

Olit deliberately does not reproduce a general-purpose local computing environment.

`run_python` executes inside Pyodide. Submitted code is asynchronous, so top-level `await` and `pyfetch` work, but networking follows browser security rules: CORS-enabled APIs are accessible; arbitrary network resources are not.

For research requiring a shell, unrestricted networking, local software installation, or a full filesystem, Orbit provides the appropriate execution environment.

Olit instead tests a different architectural proposition:

> **Galaxy is the computational environment. The browser is the agent runtime.**
