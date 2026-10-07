# src/orbit — vendored UI from galaxyproject/loom

These files are copied **verbatim** from
[`galaxyproject/loom`](https://github.com/galaxyproject/loom) (`app/src/renderer/`
and `shared/`), MIT-licensed, "Copyright (c) 2024-2026 Galaxy Project contributors".
olit reuses Orbit's chat UI directly so migrating Orbit users see a familiar
interface. Keep these files untouched where possible; adapt in olit's own code
(`src/main.ts`, `src/incoming.ts`) rather than editing here, so this folder stays
diffable against upstream and can be synced (or promoted to a shared package) later.

## Files (source → here)

| here | upstream | changed |
|---|---|---|
| `chat/chat-panel.ts` | `app/src/renderer/chat/chat-panel.ts` | **imports** (see below) |
| `chat/galaxy-links.ts` | `app/src/renderer/chat/galaxy-links.ts` | **imports** (see below) |
| `chat/markdown.ts` | `app/src/renderer/chat/markdown.ts` | none |
| `chat/block-spacing.ts` | `app/src/renderer/chat/block-spacing.ts` | none |
| `chat/copy-button.ts` | `app/src/renderer/chat/copy-button.ts` | none |
| `update-banner.ts` | `app/src/renderer/update-banner.ts` | none |
| `theme.ts` | `app/src/renderer/theme.ts` | none |
| `styles.css` | `app/src/renderer/styles.css` | none |
| `assets/fonts/**` | `app/src/renderer/assets/fonts/**` | none |
| `shared/team-dispatch-contract.{js,d.ts}` | `shared/team-dispatch-contract.{js,d.ts}` | none |
| `shared/loom-shell-contract.{js,d.ts}` | `shared/loom-shell-contract.{js,d.ts}` | none |
| `shared/galaxy-artifact-links.{js,d.ts}` | `shared/galaxy-artifact-links.{js,d.ts}` | none |
| `shared/notebook-fences.{js,d.ts}` | `shared/notebook-fences.{js,d.ts}` | none |

## The only change: imports of loom's shared/ modules

Upstream, `chat-panel.ts` and `galaxy-links.ts` reach the shared modules via the loom monorepo
layout, for example:

```
from "../../../../shared/team-dispatch-contract.js"
from "../../../../shared/loom-shell-contract.js"
```

That path points outside the olit package, so each is retargeted to the vendored
sibling copy, and prettier rejoins an import that then fits one line:

```
from "../shared/team-dispatch-contract.js"
from "../shared/loom-shell-contract.js"
```

Nothing else was modified. The team-dispatch / parameter-form / plan-draft branches
of `ChatPanel` were unused by olit but left intact so the file stays verbatim.

Two of the three are still unused, and one is no longer:

- **plan-draft — wired.** `main.ts` listens for the `plan-draft-action` event, so
  Approve / Edit / Reject drive the approval gate.
- **parameter-form — unwired on purpose (decided 2026-08-15).** `addParameterCard`
  is a complete interactive form (grouped, typed inputs, min/max/step, help text),
  but stage 3 of the approval gate deliberately stays a **markdown table**: the
  prompt already specifies one, it works on any model, and the form needs a payload
  source olit does not have — Orbit builds `ParameterFormPayload` from an
  `analyze_plan_parameters` tool that was never ported. Revisit only alongside that
  tool; the widget alone is not the missing half.
- **team-dispatch — unused.** Orbit's experimental multi-agent surface, off by
  default there too.
