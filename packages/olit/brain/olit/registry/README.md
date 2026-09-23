# registry

**Skills** are markdown the model may follow, disclosed progressively as Orbit does it: the
frontmatter of every `SKILL.md` becomes a router in the system prompt and a body is read
with `skills_fetch({repo, path})`. `skills/olit-skills/` is our own and the default repo;
`skills/galaxy-skills/` is vendored at build time by `skills.install.js`, pinned by
`skills.lock.json`, and gitignored.

**Processes** are procedures the model cannot deviate from, each advertised as a tool
named after it. A graph process is an `agent.yml` under `processes/` run by the graph
driver (`vintent_dataset`); a Python process is an async function under `python/`
(`lineage_report`, `organize_datasets`). Both declare `capabilities`, which the session's
grant is intersected with. `extensions/` holds the materializers a graph can call, each
registered by its `bridge.py` when `load_primitives()` runs.
