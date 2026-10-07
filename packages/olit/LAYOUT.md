# Layout

```
public/olit.xml          plugin manifest: data sources, ai_prompt, capabilities
src/                      the shell (TypeScript)
  main.ts                   boots the agent worker, wires the chat, sends what the user writes
  layout.ts artifact-pane.ts usage-bar.ts retry-notice.ts   the pane's parts
  config.ts incoming.ts credentials*.ts   what the agent is handed, and by whom
  saved-session.ts          a conversation saved to Galaxy as a visualization
  transcript.ts artifacts/  the chat drawn from the conversation's events; charts and visualizations
  orbit/                    vendored from Orbit under loom's own paths, byte-identical
src/agent/               the agent: pi-durable's harness, in a worker in the browser
  runtime.ts                the harness: conversations per history, model, Stop, save and open
  extension.ts              Olit as a pi-durable extension: tools, prompt, guards
  documents.ts              Olit's state beside the transcript: binding, follow-up policy, sessions
  storage.ts                SQLite in the browser's private file system, one tab at a time
  worker.ts client.ts       the worker, and the page's handle on it
  headless.ts node.ts       one conversation over JSON lines, for the eval harness: its entries
  saved.ts                  a conversation as a saved document
  tool.ts tools.ts          one Olit tool as a durable tool; every tool Olit offers
  watch.ts                  submitted Galaxy work, watched by a durable task that submits its follow-up
  record-write.ts record-jobs.ts session-summary.ts   the agent's own edits to the record page
  model.ts providers.ts     the model endpoint, its registry, its rate limit
  galaxy.ts ops.ts galaxy-tools.ts   Galaxy REST, galaxy-ops' operations, the tools Olit keeps
  guards.ts destructive.ts sra-gate.ts   what can refuse a call
  prompt.ts skills.ts notebook.ts   the system prompt, SKILL.md routers, the record page
  python.ts python-realm.js python-node.ts   `run_python`: the trusted side, the isolated realm
                            Pyodide runs in, and that realm's headless host
  processes/                deterministic procedures (lineage_report, organize_datasets)
  skills/                   vendored corpora, galaxy-skills fetched at build time
  describe.ts               what Olit publishes about itself, for an outside evaluator
e2e/                      Playwright drives against a stub, plus opt-in live drives
scripts/                  tooling, one flat folder, each file named for what it does
  install_*                 what `npm run build` calls: pyodide, skills
  sync_*                    run by hand to copy a pinned upstream in: the Orbit UI
  check_*                   reports and gates that change nothing: stale pins, the
                            integrity of files copied in from elsewhere
```

## Where tooling belongs

Tooling lives flat in `scripts/`, one file per job, named `<verb>_<subject>` so an `ls`
groups the verbs and the name says when it runs. The extension follows what the script has
to load, not which side of olit it serves: `install_skills.js` is JavaScript because it
fetches through node.

If another repo names a path, it is not tooling but an interface. The `agents` repo builds
`dist/session.mjs` (`npm run build:session`) and drives it, asks it to `--describe` itself,
and asks it to `settle`, waiting for submitted work and the runs its follow-ups start; it reads
the entries pi-durable appended. `src/agent/describe.test.ts` pins what `--describe` returns.

## Vendored integrity

Some files are copies of files owned elsewhere: Orbit's chat UI under `src/orbit/` and the
galaxy-skills corpus under `src/agent/skills/`. They are synced by copy, which works only
while the copies stay byte-identical, so their hashes are pinned.

```bash
npm run vendored                              # or: python3 scripts/check_vendored.py
npm run sync:orbit -- <loom checkout>         # re-sync the Orbit UI from loom, re-pinned
```

The Orbit seam registry, which tracks what Olit's prompts and tools carry from Orbit, lives
in the `agents` repo and reads what the session's `--describe` publishes.

One gate. Every tool declares a capability (`llm`, `local`, `read`, `write`); a session
advertises only the tools its grant covers, and a process is gated on the strongest
capability it declares. The browser grants all four; the eval harness narrows the grant per
scenario.
