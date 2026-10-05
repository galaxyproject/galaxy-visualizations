# Layout

```
public/olit.xml          plugin manifest: data sources, ai_prompt, capabilities
src/                      the shell (TypeScript)
  main.ts                   boots the agent worker, wires the chat, runs a turn
  layout.ts artifact-pane.ts usage-bar.ts retry-notice.ts   the pane's parts
  config.ts incoming.ts credentials*.ts   what the agent is handed, and by whom
  session.ts                the conversation, in IndexedDB per user and history
  transcript.ts artifacts/  rendering messages, charts and Galaxy visualizations
  orbit/                    vendored from Orbit, byte-identical (scripts/check_vendored.py)
src/agent/               the agent: pi-agent-core's loop, in a worker in the browser
  worker.ts client.ts       the worker, and the page's handle on it
  node.ts                   the same session over JSON lines, for the eval harness
  watch.ts                  submitted Galaxy work, settled between turns, and the follow-up it calls for
  record-write.ts record-jobs.ts session-summary.ts   the session's own edits to the record page
  session.ts                one session: tools, guards, compaction, a turn
  model.ts providers.ts retry.ts   the model endpoint, its registry, its resend policy
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
  capture_*                 run by hand to refresh a pinned upstream snapshot, whose
                            output is committed: galaxy-mcp docs
  check_*                   reports and gates that change nothing: stale pins, the
                            integrity of files copied in from elsewhere
```

## Where tooling belongs

Tooling lives flat in `scripts/`, one file per job, named `<verb>_<subject>` so an `ls`
groups the verbs and the name says when it runs. The extension follows what the script has
to load, not which side of olit it serves: `capture_galaxy_mcp_docs.py` is Python because it
parses galaxy-mcp's Python source, `install_skills.js` is JavaScript because it fetches
through node.

If another repo names a path, it is not tooling but an interface. The `agents` repo builds
`dist/session.mjs` (`npm run build:session`) and drives it, asks it to `--describe` itself,
and asks the session to `settle` between turns as the page does; `src/agent/describe.test.ts`
pins what `--describe` returns.

## Vendored integrity

Some files are copies of files owned elsewhere: Orbit's chat UI under `src/orbit/` and the
galaxy-skills corpus under `src/agent/skills/`. They are synced by copy, which works only
while the copies stay byte-identical, so their hashes are pinned.

```bash
npm run vendored                              # or: python3 scripts/check_vendored.py
python3 scripts/check_vendored.py --update    # re-pin after a deliberate re-sync
```

The Orbit seam registry, which tracks what Olit's prompts and tools carry from Orbit, lives
in the `agents` repo and reads what the session's `--describe` publishes.

One gate. Every tool declares a capability (`llm`, `local`, `read`, `write`); a session
advertises only the tools its grant covers, and a process is gated on the strongest
capability it declares. The browser grants all four; the eval harness narrows the grant per
scenario.
