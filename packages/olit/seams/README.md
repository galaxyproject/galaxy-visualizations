# Seam registry

Every point where olit touches Orbit is a **seam**. `registry.json` records one row per
seam: loom's anchor (file, symbol, optional sub-section), **the condition under which loom
emits it**, olit's counterpart, a label, and a fingerprint of loom's text at audit time.

Run it:

```bash
npm run seams          # or: python3 seams/check.py
LOOM_ROOT=~/loom npm run seams
```

Three failures, each meaning something different:

- **DRIFT** — loom's text changed since we recorded it. Re-read it, decide whether olit
  should follow, then `python3 seams/build_registry.py` to re-record. This is what makes
  pulling a newer Orbit produce a change list instead of a memory exercise.
- **MISSING** — the registry names a symbol that no longer exists on one side.
- **ORPHAN** — olit defines prompt text that no seam accounts for. Either name its loom
  anchor or label it `ADDED`. This exists because text invented during a port is invisible
  otherwise: it reads like everything around it.

## Labels

`PORTED` carried over · `REPLACED` loom's mechanism is impossible here, something else does
the job · `DIVERGED` we chose differently and owe an argument · `MISSING` loom has it, olit
does not, no argument yet · `NA` cannot apply.

## Why conditions are recorded, not just content

loom gates nine of its sixteen prompt blocks. A row that records only *what a block says*
loses *when loom says it* — and an instruction detached from its trigger reads like general
advice. That is not hypothetical: "read the bound history" is resume-only in loom, was
recorded without its trigger, and landed in olit as advice for every plan. It changed
first-turn behaviour across the eval matrix before anything caught it.

## Whole-layer seams

Several layers are compared as a *set* rather than symbol by symbol, because that is how they
drift: loom's **eval scenarios**, the Galaxy **tool surface** (vs `galaxy-mcp`), the
**policy** layer, the vendored **skills corpus**, and **pi** — the agent loop olit's driver is a port of (`@earendil-works/pi-agent-core`, reached through loom's `node_modules`). Their certified upstream state lives in `registry.json` under
`layers`, so `check.py` runs offline and in CI.

Re-certifying is deliberate, never automatic:

```bash
python3 seams/snapshot_layers.py --mcp <path>/galaxy_mcp/server.py
```

Run that only after actually reading what changed upstream and deciding olit is correct
against it. Until it is run, the checker holds the project to the last certification — which
is the point: **an audit conclusion that is not a check that runs will go stale without
anyone noticing.** That has already happened once here, to the prompt-block audit.

### The skills corpus is a build artifact

`brain/olit/registry/skills/galaxy-skills/` is fetched by `npm run build:skills` and is
gitignored; only `skills.lock.json` is committed. So the two halves of that layer are checked
independently:

- **the pin** — always, from the committed lock file, anywhere;
- **the file contents** — only when the corpus is actually vendored.

A checkout that has not been built reports a note and passes. That distinction matters: an
unbuilt tree is not the same as a corpus someone edited or deleted, and conflating them made
CI report all 65 files as drift on its first run.

`ALLOWED_TOOL_DIVERGENCE` in `snapshot_layers.py` lists the tool differences forced by the
browser architecture (no connection step, no local filesystem). Anything outside that list is
reported. Each entry must stay justified in `orbit-faithfulness.md` §2h.

### Why pi is in here

olit's loop is a port of pi's, and pi is a moving third-party package. Before this it was
the least watched component in the system: Orbit's own source had six enumerated layers while
the loop everything runs on had a single one-off audit (`pi-loop-audit.md`) with no way to
tell whether it still applied. The layer pins the version and fingerprints `agent-loop.js`,
`agent.js` and `harness/agent-harness.js`, so a pi bump surfaces as **DRIFT — re-audit the
loop** instead of going unnoticed.


## Why the eval harness is tracked but `stripThinking` is not ported

loom strips `<think>` blocks from chat text before grading, with a second pass for a run
killed mid-thought whose unclosed tag would otherwise let the whole chain-of-thought be
graded as the answer. olit has no equivalent and does not need one: the adapter reads
`reasoning_content`/`reasoning` into `Reply.reasoning`, so reasoning never reaches message
content, and none of 1,248 recorded runs carries thinking markup in graded text.

That is inert, not absent by oversight, and it stops being inert the moment a provider
inlines `<think>` in content -- which a local endpoint may. `layer.eval-lib` exists so the
change is visible when it matters, rather than ported for parity now.

### The policy layer: behaviour, declared as values

The layers above answer "has upstream moved". The policy layer answers a question a
fingerprint cannot: **is olit quietly imposing something Orbit does not?** It was added after
a sampling default (`temperature=0.3`, `top_p=0.8`) and a query parameter (`full=true`) both
sat in the code for months behind a green check.

It stores *values*, not hashes, so a diff reads as a decision:

- **`policy.llm_request`** — what an unconfigured request body carries. `sampling` holds
  `temperature`, `top_p`, `max_tokens` and `tool_choice`; `body_keys` catches any new
  unconditional field. Labelled `PORTED`, so each value must equal pi's.
- **`policy.loop`** — `max_steps`, `tool_execution`, `max_tool_result_bytes`, `row_cap`,
  `row_bytes_cap`, `reserve_tokens`, `keep_recent_tokens`, `tool_result_max_chars`, each with
  its own label. The four `PORTED` ones are held equal to pi's; the `ADDED` and `DIVERGES`
  ones carry a note saying why olit has them.
- **`policy.guards`** — every refusal olit can issue, read from the `guard=` names in the
  code. A guard added without re-snapshotting is reported.
- **`layer.tool_request`** — per tool, the Galaxy query its handler builds: parameter names
  with their value where it is a literal. `get_job_details -> {"full": true}` is the entry
  that would have made the 350 KB job log visible on day one.
- **`layer.tool_contract`** — per tool, each parameter as `type[(enum)][=default][!]`, plus
  one fingerprint over the tool description and every parameter description. The tool-surface
  fingerprint compares olit against galaxy-mcp on description and parameter *names* only; this
  one holds olit to its own declared contract, so a type, a default or a description cannot
  change silently.

Two checks run against each policy entry. The first compares the declared value with what the
code does now: a change is caught until it is re-snapshotted, which is the act of declaring
it. The second applies only where the label is `PORTED`: the declared value must still equal
pi's, so re-snapshotting cannot quietly launder a divergence into the ledger.

