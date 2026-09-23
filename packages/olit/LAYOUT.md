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
  drivers/loop/             the agent loop and its tools (galaxy_tools, notebook, gtn)
  drivers/graph/            the graph engine that runs an agent.yml process
  registry/                 skills (SKILL.md routers) and processes:
    processes/*.yml           graph processes (vintent_dataset)
    python/*.py               plain async processes (lineage_report, organize_datasets)
    extensions/               materializers a process can call, each behind a bridge.py
  vendor/                   contracts owned elsewhere, pinned (galaxy-charts input types)
evals/                    behavioural scenarios against a real model and Galaxy
e2e/                      Playwright drives against a stub, plus opt-in live drives
seams/                    the Orbit parity registry and its checks
```

Two Galaxy surfaces, one gate. The loop uses named tools over direct REST
(`substrate/galaxy_http.py`), the surface galaxy-mcp defines; graph processes use the
OpenAPI catalog (`substrate/catalog.py`), scoped by prefix and method. Both pass the same
`CapabilityManifest`: the session's grant comes from the manifest's `<capabilities>`, a
process runs on the intersection of that with what it declares, and write is never a default.
