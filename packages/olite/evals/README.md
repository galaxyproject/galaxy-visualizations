# olite evals

Scenario-driven behavioural tests, ported from loom's `evals/`. The unit suites in
`brain/tests` and `src/*.test.ts` check that the machinery is correct; these check
that the **agent behaves like Orbit** — which is the claim the project actually
rests on, and the one thing a unit test cannot answer.

```bash
python evals/run.py                    # every scenario x every available model
python evals/run.py plan-creation      # filter scenarios by substring
python evals/run.py --model gemini     # filter models by substring
python evals/run.py --json out.json    # write transcripts + chat text + failures, pass or fail
python evals/run.py --delay 5          # extra pacing on top of the provider's own
python evals/run.py --repeat 3         # run each scenario 3 times; n=1 hides variance
```

**Pacing.** Each model resolves through the brain's provider registry, so the run is
throttled at the endpoint's own rate — Gemini's free tier is 5 requests/minute, and
that number lives in `providers.py`. `--delay` adds more on top and defaults to none.
A per-day quota is a different thing and no amount of pacing fixes it. A quota-limited
run is reported as `quota`,
counted in its own column, **not graded, and does not fail the suite** — an exhausted
account is a fact about the key, not about the agent, and must never be readable as
a behavioural failure.

## How it runs

loom spawns `loom --mode json` and parses its event stream. olite needs no
subprocess: the brain is a Python package, so `lib/harness.py` assembles the same
pieces `runtime.run` assembles and awaits the driver in-process — faster, no browser,
and the whole transcript is in hand.

**Galaxy is stubbed; the LLM is real.** Most scenarios grade planning behaviour, and
a live Galaxy would add a second source of failure without adding signal. The stub
answers plausibly rather than erroring, because a tool that fails teaches the model to
stop calling tools, which would confound the measurement.

**One scenario grades the data path instead.** `dataset-analysis-sum` fetches real
dataset bytes through `download_dataset` and computes over the file with `run_python`.
It exists because grading only *which tool calls are emitted* left a blind spot: two
live failures — inline dataset content breaking tool-call JSON on tabs and newlines,
and a gateway 500 once a real tool result was echoed back — sat entirely outside what
the plan scenarios measure. The fixture is 61 lines against a 50-line preview cap, so a
model that sums the preview rather than reading the file answers 58800 instead of
96000, and is marked wrong rather than passing by luck.

**A scenario sets its own tool surface.** A scenario shared with loom carries loom's
`--tools` restriction and is run under the matching capability manifest, so both suites
put the same tools in front of the model; scenarios without one get the full 46-tool
surface this plugin ships with. This was previously fixed at the full surface on the
argument that trimming measures a condition olite never runs in — true of production,
but loom does not run trimmed in production either, so a fixed surface on one side and a
trimmed surface on the other compared two different configurations. Any paired number
taken before this change carries that confound.

## Models

`models.json` is the matrix. A model whose `envRequires` are unset is **skipped, not
failed**, so a local run works without every credential. Every entry is
OpenAI-compatible, which is also how olite reaches Galaxy's chat proxy in production,
so adding a provider is a JSON entry and no code change.

| id | needs |
|---|---|
| `gemini-3.7-flash` | `GEMINI_KEY` (free tier is enough) |
| `gemini-3.1-flash-lite` | `GEMINI_KEY` |
| `deepseek-v4-flash` | `DEEPSEEK_KEY` |
| `local-llama` | `LOCAL_LLM_URL` (+ optional `LOCAL_LLM_KEY`) |

Keys come from the environment. Note `~/.zshrc` is not read by non-interactive
shells — `source ~/.zshrc` first, or put the export in `~/.zshenv`.

## Dimensions

Runs are graded on loom's four decision-correctness dimensions rather than a single
pass/fail, because "did it behave like Orbit" is not one question:

- **validity** — a well-formed `## Plan X: <title> [routing]` block with enough
  described steps. The gate: a model that cannot emit a parseable plan fails
  everything downstream.
- **routing** — did it pick the right tag? Scenarios name the *correct* answers, so a
  wrong route is graded wrong rather than waved through. olite routes `[galaxy]` and
  `[remote]` only; the parser still accepts `local` and `hybrid` so a wrong route is
  a routing failure and not a parse failure.
- **tools** — did it name a plausible analysis tool? A generous allow-set per assay,
  a coarse heuristic rather than an oracle.
- **behavior** — contract checks needing no Galaxy: does an underspecified prompt
  produce a question rather than a fabricated plan, and does the approval gate hold
  (`doesNotExecute`).

## One deliberate difference from loom

loom reads plans from "wherever they land" — notebook or chat — because its matrix
models collapse its four-stage gate in different ways and it did not want to grade
process. olite reads from **chat**, because its gate is explicit that the draft is
drawn in chat and only an *approved* plan reaches the record. A scenario that never
approves anything should therefore find nothing on the record, and that is a property
worth grading rather than papering over.

## Scenarios come from loom

`loom/evals/scenarios/` is the source of truth for every scenario both suites run. This
suite reads those files **unmodified** at run time and adapts them in one place
(`lib/loom_scenarios.py`), so a scenario cannot drift between the two: there is one copy.

Point the loader elsewhere with `--loom <dir>` or `LOOM_SCENARIOS`; without loom checked
out, the run reports the shared set as unavailable and continues with the local set.

What the adapter translates, and why each is a divergence rather than a bug:

| loom | here |
|---|---|
| `loomArgs: ["--tools", ...]` | the nearest capability manifest. loom restricts individual tools; this suite gates families, so the mapping is coarse and written down rather than implied |
| `runs` / `requiresModel` | honoured, so both suites run a scenario the same number of times. loom defaults model scenarios to 3 |
| `events.mustInclude` | loom's pi lifecycle names mapped to the smaller set this harness synthesises; unmapped names are dropped rather than failing on an event this runtime never emits |
| `plan.routingIn` | when the correct answer names a tag this suite does not teach (`local`, `hybrid`), routing is not graded. The rest of the plan still is |

**`scenarios/` holds only what cannot cross**, and should stay small. Today: the approval
gate (`execution-after-approval`, `gate-holds-before-approval`), which asserts a property
loom expresses differently; `dataset-analysis-sum`; and `smoke-answers`. Anything added
here that loom could also run belongs upstream instead.

## What this is not

**Not a single-run verdict.** Behaviour varies run to run, and n=1 hides it — a scenario
in this suite has already passed and failed on the same model within an hour. `--repeat N`
runs each (scenario, model) tuple N times and lists any tuple whose runs disagreed under
**Unstable**. Check that list before quoting a number: a cell that is not unanimous cannot
honestly be reported as one verdict. loom's `findings.md` specifies this as "Phase 6" and
has not built it yet.

Not a correctness oracle. `mentionsOneOf` checks that a plan names a plausible tool
for the assay, not that the analysis is right — loom leaves that to a judge layer and
so does this. And the suite says nothing about execution: every scenario stops at or
before approval, so nothing here exercises a real Galaxy job.

Running the **loom side** of the comparison has its own traps (auth, a disconnected
Galaxy, a results file that overwrites itself) — see [comparison/README.md](comparison/README.md).
