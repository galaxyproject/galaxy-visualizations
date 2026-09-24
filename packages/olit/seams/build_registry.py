"""Generate the prompt-block rows of the seam registry.

Conditions are transcribed from loom's source guards, not from prior notes: the
whole point of the registry is that a trigger is recorded next to its text.
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import description  # noqa: E402
import extract  # noqa: E402

REGISTRY = pathlib.Path(__file__).resolve().parent / "registry.json"
LOOM = pathlib.Path(os.environ.get("LOOM_ROOT", pathlib.Path.home() / "loom"))
CTX = "extensions/loom/context.ts"

# loom symbol -> (condition, olit symbol or None, label, note)
BLOCKS = [
    ("buildActiveModelBlock", 'emitted when an active LLM provider is configured (`if (!active) return ""`)',
     "active_model_block", "PORTED", "olit gates on the resolved target instead of config."),
    ("buildTesterIdBlock", "emitted when a tester id is configured",
     None, "NA", "Orbit beta-tester code; no counterpart."),
    ("buildCurrentDateBlock", "unconditional",
     "current_date_block", "PORTED", ""),
    ("buildOperatingDisciplineBlock", "unconditional",
     "OPERATING_DISCIPLINE", "PORTED", "Secrets section adapted: olit needs no credentials."),
    ("buildVerificationDisciplineBlock", "unconditional",
     "VERIFICATION", "PORTED", ""),
    ("buildPlanConventionBlock", "unconditional; `omitAnchors` varies by model family",
     "PLAN_CONVENTION", "PORTED", "olit emits no anchors at all, so it matches the omit path."),
    ("buildParameterReviewBlock", "unconditional",
     "PARAMETER_REVIEW", "PORTED", ""),
    ("buildChatFormattingBlock", "unconditional",
     "CHAT_FORMATTING", "PORTED", ""),
    ("buildNotebookWriteBlock", "unconditional",
     "RECORD_WRITES", "REPLACED", "Retargeted from notebook.md edits to update_page."),
    ("buildExecutionModeBlock", "emitted only when a local shell exists AND executionMode is local",
     None, "NA", "Both preconditions are false in olit by construction."),
    ("buildGalaxyContextBlock", "suppressed in local mode; otherwise emits a CONNECTED or a NOT CONNECTED variant",
     "GALAXY_TERMINOLOGY", "PORTED", "Condition not yet ported: olit has no NOT-CONNECTED variant. See catalog gap."),
    ("buildSkillsContext", "emitted when at least one skill is configured",
     None, "PORTED", "olit's skills router is assembled in registry/skills.py, not prompt.py."),
    ("buildLocalEnvContext", "emitted only when a local shell exists",
     None, "NA", "No local shell."),
    ("buildNoLocalShellBlock", "emitted only when the local shell is disabled",
     "NO_LOCAL_SHELL", "PORTED", "Condition is permanently true in olit; block is unconditional here."),
    ("buildTeamDispatchContext", "emitted when team dispatch is enabled",
     None, "NA", "No team dispatch."),
    ("buildSessionIndexContext", "emitted when the session index is enabled",
     None, "NA", "Post-MVP; feature-gated in loom too."),
]


# loom sub-sections of buildGalaxyContextBlock that olit hoisted into their own constants.
SECTIONS = [
    ("Getting data into a Galaxy history", "GETTING_DATA_IN", "REPLACED",
     "Local upload replaced by URL fetch; olit cannot reach the user's disk."),
    ("Invoking a Galaxy workflow", "INVOKING_WORKFLOW", "PORTED", ""),
    ("Executing a Galaxy step", "EXECUTING_A_STEP", "PORTED", ""),
    ("Drafting a new plan", "DRAFTING_A_PLAN", "PORTED",
     "Own block since 2026-08-20, gated on the tool catalog exactly as loom gates it on a "
     "live connection. Previously DIVERGED: carried inside PLAN_CONVENTION and ungated, "
     "which fired it in contexts loom never does. The local-routing branch stays dropped."),
    ("Resuming existing Galaxy work", None, "REPLACED",
     "Page selection is inapplicable -- olit binds one record per history by construction. "
     "Only the read-the-history step is ported, kept resume-conditional as loom has it."),
    ("Uploading local data", None, "NA", "No access to the user's filesystem."),
    ("If a Galaxy tool reports it's not connected", None, "MISSING",
     "olit has no not-connected variant; the analogous state is a failed OpenAPI catalog load."),
]

# Branches of a loom builder that are not `###` sections and so cannot be anchored by heading.
BRANCHES = [
    ("buildGalaxyContextBlock", "NOT CONNECTED (shell-disabled branch)",
     "emitted instead of the Galaxy guidance when credentials are absent",
     "GALAXY_UNAVAILABLE", "PORTED",
     "loom keys on missing GALAXY_URL/GALAXY_API_KEY; olit is served by Galaxy, so the "
     "equivalent condition is the OpenAPI tool catalog failing to load."),
]

CONSTS = [
    ("extensions/loom/galaxy-page-markdown-guidance.ts", "GALAXY_PAGE_MARKDOWN_GUIDANCE",
     "unconditional, injected with the page tools", "GALAXY_PAGE_MARKDOWN", "PORTED", ""),
    ("extensions/loom/sra-import-gate.ts", "SRA_IMPORT_GUIDANCE",
     "unconditional when Galaxy is reachable", "IMPORTING_SRA", "PORTED",
     "loom also enforces this with a tool-call gate that groups sibling SRA submissions; "
     "olit carries the guidance only."),
]


# Rows with no loom symbol to fingerprint, or whose loom anchor is not a block in CTX.
EXTRA = [
    ("context.project-data-placement", "prompt-branch",
     ("extensions/loom/context.ts", "setupContextInjection",
      "every turn that injects notebook or workspace context"),
     ("brain/olit/runtime.py", "_inject_record"), "PORTED",
     "olit has one project-data channel (the record); loom has two."),
    ("prompt.seedDatasetBlock", "prompt-block", None,
     ("brain/olit/prompt.py", "seed_dataset_block"), "ADDED",
     "loom has no equivalent because nothing opens it on a dataset. Galaxy mounts olit as a "
     "visualization plugin, so the user can arrive with one already selected, and naming it is "
     "what makes a bare \"plot it\" resolvable: the referent is otherwise only in the shell's "
     "chat, which never reaches the model. Emitted only when a dataset was supplied, so a bare "
     "start produces byte-identical system text."),
    ("tool.ena_runs", "tool", None,
     ("brain/olit/drivers/loop/ena.py", "ENA_RUNS"), "ADDED",
     "loom has no equivalent because Orbit reaches ENA through a general shell. ENA's FASTQ "
     "paths are not derivable from an accession -- the shard directory is its first six "
     "characters and the numbered subdirectory depends on its length -- and whether a run is "
     "paired is a property of the run, not its name. A live session guessed four URLs and all "
     "four 404'd, one of them for a run that has no second mate at all. Read-only and "
     "host-scoped to www.ebi.ac.uk, the same shape as gtn_search/gtn_fetch."),
    ("hint.fetch-failure", "tool-result-hint", None,
     ("brain/olit/drivers/loop/fetch_failure_hint.py", "ARCHIVE_HINT"), "ADDED",
     "loom has no equivalent: its only tool-result hint covers failed workflow invocations, "
     "a different trigger that stays unported. The shape is borrowed from it -- append the "
     "imperative to a result that already reports the failure, rather than refusing the call "
     "that caused it. Galaxy names the url and the status but cannot say that writing another "
     "url from memory is the wrong next move, which is what a measured session did eight "
     "times. Pairs with tool.ena_runs, which is the answer the hint names."),
    ("tool.get_invocations.outcome", "tool-result-projection",
     ("extensions/loom/tools.ts", "checkInvocations",
      "a poll of an in-flight invocation recorded in the notebook"),
     ("brain/olit/drivers/loop/invocation_outcome.py", "settle"), "PORTED",
     "loom's transition rules, applied to what the agent reads instead of to a notebook "
     "block: FAILED_JOB_STATES, and the two questions of whether Galaxy has stopped "
     "scheduling and whether any job is still moving. Galaxy's invocation state describes "
     "scheduling, so a run whose jobs errored still reads `completed` there, and a measured "
     "session reported it as clean. One divergence: loom folds a cancelled run into `failed` "
     "because its record has no third word, and a tool result has room to say `cancelled`. "
     "Mirrors src/invocations.ts:settleInvocation, which applies the same rule for the user."),
]


def _extra_rows():
    rows = []
    for row_id, kind, loom, olit, label, note in EXTRA:
        anchor = None
        if loom:
            file, symbol, condition = loom
            src = extract.ts_symbol((LOOM / file).read_text(), symbol)
            if src is None:
                raise SystemExit(f"loom symbol not found: {symbol}")
            anchor = {"file": file, "symbol": symbol, "condition": condition,
                      "fingerprint": extract.fingerprint(src)}
        rows.append({"id": row_id, "kind": kind, "loom": anchor,
                     "olit": {"file": olit[0], "symbol": olit[1]},
                     "label": label, "note": note})
    return rows


def main():
    loom_ctx = (LOOM / CTX).read_text()
    agent = description.load()
    rows = []
    for symbol, condition, olit_symbol, label, note in BLOCKS:
        src = extract.ts_symbol(loom_ctx, symbol)
        if src is None:
            raise SystemExit(f"loom symbol not found: {symbol}")
        if olit_symbol and not description.defines(agent, "brain/olit/prompt.py", olit_symbol):
            raise SystemExit(f"{agent['agent']} does not define {olit_symbol}")
        rows.append({
            "id": f"prompt.{symbol}",
            "kind": "prompt-block",
            "loom": {"file": CTX, "symbol": symbol, "condition": condition,
                     "fingerprint": extract.fingerprint(src)},
            "olit": ({"file": "brain/olit/prompt.py", "symbol": olit_symbol}
                      if olit_symbol else None),
            "label": label,
            "note": note,
        })
    galaxy_src = extract.ts_symbol(loom_ctx, "buildGalaxyContextBlock")
    for heading, olit_symbol, label, note in SECTIONS:
        sec = extract.section(galaxy_src, heading)
        if sec is None:
            raise SystemExit(f"loom section not found: {heading}")
        if olit_symbol and not description.defines(agent, "brain/olit/prompt.py", olit_symbol):
            raise SystemExit(f"{agent['agent']} does not define {olit_symbol}")
        slug = heading.split()[0].lower().strip("'")
        rows.append({
            "id": f"prompt.galaxy-context.{slug}",
            "kind": "prompt-section",
            "loom": {"file": CTX, "symbol": "buildGalaxyContextBlock", "section": heading,
                     "condition": "inherits buildGalaxyContextBlock: live connection, not local mode",
                     "fingerprint": extract.fingerprint(sec)},
            "olit": ({"file": "brain/olit/prompt.py", "symbol": olit_symbol}
                      if olit_symbol else None),
            "label": label,
            "note": note,
        })

    for symbol, branch, condition, olit_symbol, label, note in BRANCHES:
        src = extract.ts_symbol(loom_ctx, symbol)
        if src is None:
            raise SystemExit(f"loom symbol not found: {symbol}")
        if not description.defines(agent, "brain/olit/prompt.py", olit_symbol):
            raise SystemExit(f"{agent['agent']} does not define {olit_symbol}")
        rows.append({
            "id": f"prompt.{symbol}.not-connected",
            "kind": "prompt-branch",
            "loom": {"file": CTX, "symbol": symbol, "branch": branch,
                     "condition": condition, "fingerprint": extract.fingerprint(src)},
            "olit": {"file": "brain/olit/prompt.py", "symbol": olit_symbol},
            "label": label,
            "note": note,
        })

    for file, symbol, condition, olit_symbol, label, note in CONSTS:
        src = extract.ts_const((LOOM / file).read_text(), symbol)
        if src is None:
            raise SystemExit(f"loom const not found: {symbol}")
        rows.append({
            "id": f"prompt.{symbol}",
            "kind": "prompt-block",
            "loom": {"file": file, "symbol": symbol, "condition": condition,
                     "fingerprint": extract.fingerprint(src)},
            "olit": {"file": "brain/olit/prompt.py", "symbol": olit_symbol},
            "label": label,
            "note": note,
        })

    rows.extend(_extra_rows())

    out = REGISTRY
    registry = json.loads(out.read_text()) if out.exists() else {}
    registry["seams"] = rows
    out.write_text(json.dumps(registry, indent=2) + "\n")
    print(f"wrote {len(rows)} rows -> {out}")


if __name__ == "__main__":
    main()
