# drivers — how olite decides

Two interchangeable drivers over the same `substrate`. Both call the substrate's
capability-gated surface; neither owns Galaxy access.

## loop/ (present, default) — Orbit parity

A generic, hardcoded agent loop: message -> LLM (chat proxy) with the tool surface
-> tool calls -> execute against the substrate -> feed back -> repeat, until
`finish` or `MAX_STEPS`. Open-ended: the model plans at runtime. This is the
parity match for Orbit, whose brain is likewise a generic loop (pi) plus skills
and tools, not an authored graph.

The loop's tool surface (`loop/tools.py`) is intentionally small: `run_python`
(local Pyodide), `galaxy_api` (scoped catalog), `finish`. Named convenience
wrappers, write ops, and one tool per crystallized process (each invoking the
graph driver) are added on top of this same gate.

## graph/ (present) — crystallized processes

The polaris engine, adopted and owned here (`runner`, `handlers/*`, `resolver`,
`refs`, `expressions`, `schema`, `agents`, `types`, `constants`, `materializers`),
plus a substrate-composed `Registry` (`registry.py`): the handlers' `call_api` /
`reason` / `reason_structured` delegate to the shared substrate, so graph execution
goes through the SAME capability-gated catalog and rate-limited LLM as the loop.

`GraphDriver(substrate).run(graph, inputs)` executes a parsed `agent.yml` (a dict)
and returns `{state, last}`. Node types: `executor` (api.call / sub-agent / wait),
`traverse` (BFS lineage walker), `reasoning`, `planner` (schema-bounded routing),
`materializer` (registered Python fn), `loop`, `control`, `terminal`.

Materializers register in code (`register_materializer(name)` decorator), not via
entry points. Import is lazy: nothing loads the engine until a process runs.

The loop reaches a frozen process through that process's own tool (loop -> graph
bridge). Shipped processes live in `../registry/processes/` (`lineage_report`,
`organize_datasets`, `vintent_dataset`).
