# registry — what olite knows

Skills and processes are the same shelf ("how to do a task") at two maturities on
one spectrum of rigidity:

- **skills (soft): markdown guidance for the open loop.** Prose know-how injected
  into the system prompt. The model *may* follow it; it can still adapt. This is
  Orbit's approach, and Orbit's `galaxy-skills` are reusable here now that the loop's
  tool names match galaxy-mcp. Use a skill when the task is *guidance* — "how uploads
  work", "which op lists histories", "the usual analysis shape."
- **processes (hard): crystallized `agent.yml` deterministic procedures.** A frozen
  graph with schema-bounded LLM decisions and deterministic transforms, invoked by
  the loop as one reliable tool named after the process. The model *cannot* deviate. Use a
  process when the task must be *deterministic/validated/bounded* — a procedure a
  markdown skill cannot guarantee (e.g. reproduce ~65 chart transforms and emit a
  valid Vega-Lite spec every time: `vintent_dataset`).

Pick the form by need: guidance → skill; a procedure that must run the same way every
time → process. A task can also start as a skill and crystallize into a process once
it is proven and worth freezing. Both are governed by the same capability manifest.

## processes (present)

Crystallized `agent.yml` graphs, authored under `processes/` and loaded by
`ProcessRegistry` (`processes.py`). Each declares `id`, `description`, and
`when_to_use`. Each is advertised as its own tool, named after the process, with
parameters generated from its `inputs:` block (`type`, `required`, `default`).
Calling it runs the graph driver over the same substrate, so it inherits the
session's capability manifest.

Shipped:
- **`lineage_report`** (`processes/lineage_report.yml`): fetch source dataset ->
  `traverse` upstream (dataset -> creating_job -> inputs/outputs) -> `reasoning`
  narrative -> `lineage.mermaid` materializer -> `terminal`. Exercises executor +
  traverse + reasoning + materializer + terminal.
- **`vintent_dataset`** (`processes/vintent_dataset.yml`): the absorbed vintent
  pipeline. Fetch + profile a dataset, four state-derived `planner` decisions
  (intent, extract, shell, params), deterministic transforms, then compile a
  Vega-Lite chart returned as a typed artifact. Its leaves live under `extensions/vintent/` and
  are registered by that package's `bridge.py`.

Materializers and schema-builders used by processes register in code
(`extensions/*/bridge.py`, via `register_materializer` /
`register_builder`). Import is lazy: the graph engine and registrations load only
when the first process runs.

Add a process by dropping an `agent.yml` in `processes/` (shipped via
`package-data`). A process starts life as an ad hoc loop task; once proven, it is
frozen here.

The name says which renderer it uses. A future `visualize_dataset` would choose among
Galaxy's registered visualizations rather than always producing Vega-Lite; when it
exists, narrow this one's `when_to_use` so the two do not compete for the same request.

## extensions

Primitive packs a graph node can call — olite's own or absorbed. Each is a directory
with a `bridge.py` that registers what it offers, and `extensions/__init__.py` imports
every bridge.

```
extensions/
  __init__.py     imports each pack's bridge
  lineage/
    bridge.py     lineage.mermaid, for lineage_report.yml
  vintent/
    bridge.py     vintent's leaves as materializers + schema-builders
    core/ modules/
```

`registry.load_primitives()` is the one call that loads them; nothing registers by
side-effect import any more. Tests mirror the layout under `tests/extensions/`.

## skills

Operational know-how in the Claude-Code skills convention Orbit uses: nested
`SKILL.md` files with YAML frontmatter (`name`, `description`, `when_to_use`, and
`surfaces` under `metadata` — a custom key, so the spec puts it there).

```
skills/<repo>/<skill>/SKILL.md      plus the references/ and examples/ it points at
```

**Disclosed progressively, exactly as Orbit does it.** `router_text()` renders the
frontmatter into the system prompt as a router — what exists and the precise call to
open it — and the model fetches a body with `skills_fetch({repo, path})`. Prompt cost
scales with the number of skills, not their size. Addressing is by **path**, not by
name, because a SKILL.md routinely points at sibling files the model fetches the same
way.

Two behaviours are deliberately Orbit's, not ours:

- **Nothing is truncated.** Orbit returns fetched text as-is, and caps nothing on the
  way to the model. A skill is an instruction set; a body cut mid-procedure is worse
  than one never read.
- **Tag-or-all selection** on `metadata.surfaces`, with `SURFACE_ID = "loom"`. The
  shipped corpus tags its skills for `loom`; retagging would silently change which
  skills the agent is offered. Frontmatter that is not valid YAML yields no metadata
  (some real entries carry `argument-hint: [a] [b]`, which YAML rejects) — Orbit's
  parser fails the same way, so the same skills stay visible.

Repos:

- `skills/olite-skills/` — olite's own, sorted first so it is the default repo. Its skills
  route to olite processes, which the shipped corpus knows nothing about.
- `skills/galaxy-skills/` — `galaxyproject/galaxy-skills`, vendored at build time by
  `skills.install.js` and pinned by the committed `skills.lock.json`. Gitignored: it
  is a build artifact. Run `npm run build:skills`; move the pin with
  `GALAXY_SKILLS_REF=<ref> npm run build:skills`.

Vendoring is the one divergence from Orbit, which fetches at runtime and caches 24h —
the browser has no cache surviving a session, and a per-turn GitHub round trip does
not belong on a plugin's critical path. Orbit's `github.com/galaxyproject/*`
allowlist (skill text is authoritative agent instruction, so an arbitrary repo is a
prompt-injection vector) is enforced at vendor time instead, and more strongly: the
running agent cannot be pointed elsewhere at all.
