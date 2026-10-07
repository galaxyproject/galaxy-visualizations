# src/orbit — vendored UI from galaxyproject/loom

These files are copied **verbatim** from
[`galaxyproject/loom`](https://github.com/galaxyproject/loom), MIT-licensed, "Copyright (c)
2024-2026 Galaxy Project contributors". olit reuses Orbit's chat UI directly so migrating Orbit
users see a familiar interface. Adapt in olit's own code (`src/main.ts`, `src/transcript.ts`,
`src/olit.css`) rather than editing here.

Each file sits under the path it has in loom (`app/src/renderer/...`, `shared/...`), so every one
is byte-identical to upstream and its relative imports resolve as they do there. Nothing here is
modified.

`MANIFEST.json` lists the files, the loom commit they were copied from, and each file's sha256.

```
npm run sync:orbit -- <path to a loom checkout>   # copy them from that checkout and re-pin
python3 scripts/check_vendored.py                 # fails on any edit (part of npm test)
npm run stale                                     # says when loom's main has changed one
```

The sync copies exactly the listed files and stops when one of them imports a file that is not
listed: add that file's loom path to `MANIFEST.json` and sync again.

The fonts' licence texts (`OFL.txt` beside each family) are olit's additions and are not listed:
loom ships the fonts without them, and the SIL Open Font License asks for the licence to travel
with the fonts.

## What olit uses

The team-dispatch, parameter-form and plan-draft branches of `ChatPanel` stay in the file so it
stays verbatim:

- **plan-draft — wired.** `main.ts` listens for the `plan-draft-action` event, so Approve / Edit /
  Reject drive the approval gate.
- **parameter-form — unwired on purpose (decided 2026-08-15).** `addParameterCard` is a complete
  interactive form, but stage 3 of the approval gate stays a **markdown table**: the prompt already
  specifies one, it works on any model, and the form needs a payload source olit does not have --
  Orbit builds `ParameterFormPayload` from an `analyze_plan_parameters` tool that was never ported.
- **team-dispatch — unused.** Orbit's experimental multi-agent surface, off by default there too.
- **Galaxy links — wired.** `main.ts` calls `setGalaxyServerUrl` with olit's Galaxy root, so ids a
  reply names link to the Galaxy it runs in.
