# contract

What olit publishes about itself, for an evaluator that does not read its source.

Two publishers:

- `src/agent/describe.ts` — the agent: tools, guards, sampling and loop policy, prompt
  symbols, the provider registry, the vendored skills pin. Build the session with
  `npm run build:session`, then run `node dist/session.mjs --describe --root .`.
- `shell.mjs` — the shell: the follow-up cap and the message `src/auto-resume.ts` builds for a
  set of settled runs. A harness standing in for the browser asks it rather than reassembling
  the text.

Neither is production code. The agent and the shell do not import them; they read the agent
and the shell. `src/agent/describe.test.ts` pins both.

Consumers: `~/agents/description.py` runs the session's `--describe`,
`~/agents/evals/lib/harness.py` drives `dist/session.mjs` over JSON lines and runs `shell.mjs`
with the runs that settled.
