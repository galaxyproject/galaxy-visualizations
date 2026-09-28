# contract

What olit publishes about itself, for an evaluator that does not read its source.

Two publishers, one per language, because the surface spans both:

- `describe.py` — the brain: tools, Galaxy queries, guards, sampling and loop policy, prompt
  symbols, the vendored skills pin. Run it with `npm run describe`.
- `shell.mjs` — the shell: the follow-up cap and the message `src/auto-resume.ts` builds for a
  set of settled runs. A harness standing in for the browser asks it rather than reassembling
  the text.

Neither is production code. Nothing under `brain/olit` imports them, and `packages.find`
keeps them out of the wheel. They read the brain and the shell; the brain and the shell do
not read them.

Consumers: `~/agents/description.py` runs `describe.py`, and `~/agents/evals/lib/harness.py`
runs `shell.mjs` with the runs that settled.
