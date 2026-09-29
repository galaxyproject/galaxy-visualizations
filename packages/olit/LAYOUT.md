# Layout

```
public/olit.xml          plugin manifest: data sources, ai_prompt, capabilities
src/                      the shell (TypeScript)
  main.ts                   boots the worker, wires the chat, runs a turn
  layout.ts artifact-pane.ts usage-bar.ts retry-notice.ts   the pane's parts
  pyodide/                  worker, manager, and the fetch that signs model requests
  pyodide-runner.ts         the one call into the brain: `from olit import run`
  config.ts incoming.ts credentials*.ts   what the brain is handed, and by whom
  invocations.ts            watches submitted jobs and workflows between turns
  record-write.ts record-jobs.ts session-summary.ts   shell-side edits to the record page
  session.ts                the conversation, in IndexedDB per user and history
  transcript.ts artifacts/  rendering messages, charts and Galaxy visualizations
  orbit/                    vendored from Orbit, byte-identical (seams/check_vendored.py)
brain/olit/              the agent (Python, runs in Pyodide)
  runtime.py                Session: substrate, registries and driver, built once per worker
  config.py prompt.py compaction.py
  substrate/                the capability gate and everything behind it:
                            manifest, local python, Galaxy REST and catalog, LLM, http
  drivers/loop/             the agent loop and its tools (galaxy_tools, notebook, gtn, vega)
  registry/                 skills (SKILL.md routers) and processes:
    python/*.py               async processes (lineage_report, organize_datasets)
    extensions/               helpers those processes build on
  vendor/                   contracts owned elsewhere, pinned (galaxy-charts input types)
contract/                 what olit publishes about itself, for an outside evaluator
  describe.py               the brain: tools, queries, guards, policy, prompt symbols
  shell.mjs                 the shell: the follow-up cap and the message it builds
e2e/                      Playwright drives against a stub, plus opt-in live drives
scripts/                  tooling, one flat folder, each file named for what it does
  install_*                 what `npm run build` calls: pyodide, skills, ops
  dump_providers.py         the same, emitting src/providers.generated.json
  stamp_wheel.js            the same, giving the wheel a content-addressed name
  capture_*                 run by hand to refresh a pinned upstream snapshot, whose
                            output is committed: galaxy-mcp docs, galaxy-ops registry
  check_*                   reports and gates that change nothing: stale pins, the
                            integrity of files copied in from elsewhere
```

## Where tooling belongs

Tooling lives flat in `scripts/`, one file per job, named `<verb>_<subject>` so an `ls`
groups the verbs and the name says when it runs. The extension follows what the script has
to load, not which side of olit it serves: `check_vendored.py` is Python because it reads
manifests the brain writes, `install_skills.js` is JavaScript because it fetches through
node.

If another repo names a path, it is not tooling but an interface, and it gets a top-level
folder of its own -- which is why `contract/` sits beside `brain/` and `src/` rather than
under `scripts/`: the `agents` repo runs `contract/describe.py` and `contract/shell.mjs` by
those paths.

Two things stay put despite looking like tooling. `brain/olit/substrate/*.mjs` are runtime
transports, resolved relative to their module and shipped in the wheel so an installed
brain can reach Galaxy outside the browser. `brain/tests/data/*.json` are fixtures, living
beside the tests that read them, which is where the `capture_*` scripts write.

## Vendored integrity

Some files are copies of files owned elsewhere: Orbit's chat UI under `src/orbit/`, and the
galaxy-charts input contract under `brain/olit/vendor/`. They are synced by copy, which works
only while the copies stay byte-identical, so their hashes are pinned in a manifest.

```bash
npm run vendored                              # or: python3 scripts/check_vendored.py
python3 scripts/check_vendored.py --update    # re-pin after a deliberate re-sync
```

The Orbit seam registry, which tracks what Olit's prompts and tools carry from Orbit, lives
in the `agents` repo and reads what `npm run describe` publishes.

Two Galaxy surfaces, one gate. The loop uses named tools over direct REST
(`substrate/galaxy_http.py`), the surface galaxy-mcp defines; a process uses the
OpenAPI catalog (`substrate/catalog.py`), scoped by prefix and method. Both pass the same
`CapabilityManifest`: the session's grant comes from the manifest's `<capabilities>`, a
process runs on the intersection of that with what it declares, and write is never a default.
