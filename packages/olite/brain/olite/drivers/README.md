# drivers

`loop/` is the agent: message, model, tool calls, results, repeat, until `finish` or the
step cap. Its tools are galaxy-mcp's named Galaxy tools, `run_python`, the record, GTN,
skills, and one tool per registered process.

`graph/` runs a crystallized `agent.yml` over the same substrate: `GraphDriver(substrate)
.run(graph, inputs)` returns `{state, last}`. Node types: executor, planner, materializer,
terminal, reasoning, loop, control, compute, traverse. Materializers and schema builders
register in code; nothing loads until a process runs.
