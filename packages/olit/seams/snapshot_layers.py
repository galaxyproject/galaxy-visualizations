"""Re-certify the whole-layer seams: write today's upstream state into registry.json.

Running this is the deliberate act of saying "I have looked at what changed upstream and
olit is correct against it". `check.py` then holds us to that until it is run again.

  python3 seams/snapshot_layers.py [--mcp path/to/galaxy_mcp/server.py]
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import layers  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOOM = os.environ.get("LOOM_ROOT", str(pathlib.Path.home() / "loom"))

# Differences that are forced by the browser architecture, not drift. Each must stay
# justified in orbit-faithfulness.md §2h; anything outside this set is a finding.
ALLOWED_TOOL_DIVERGENCE = {
    "connect": "no connection step: olit is served by Galaxy",
    "download_dataset": "no local filesystem; returns content instead",
    "upload_file": "no access to the user's disk",
    "get_workflow_input_template": "drops the optional `verbose` parameter",
    "invoke_workflow": "drops the optional `parameters_normalized` parameter",
    "get_histories": 'DIVERGES: galaxy-mcp returns every history by default and adds a `pagination` block with `total_items` only when a limit is given, paying for a second unbounded fetch to count. olit always bounds the page at ROW_CAP, asks Galaxy for one row past the limit, and returns the {items, shown, truncated, next_offset} envelope it already uses for list_workflows and get_tool_panel. No `total`: the server was never asked for one.',
    "get_job_details": "DIVERGES: galaxy-mcp fetches api/jobs/{id}; olit adds full=true so a failed job's stderr is readable, which is what invocation_outcome tells the model to reach for. That flag also carries tool_stdout/tool_stderr/job_stdout/job_stderr/stdout/stderr, hundreds of KB for a chatty tool, so each log field is trimmed to its last 4 KB on a line boundary with a notice naming the full size.",
}


# Every loom extension module, classified. NA is a decision, not an absence; INVESTIGATE
# means a capability olit could hold and has not yet judged. An unlisted module fails the
# check, which is the point: an addition upstream must be classified before it is ignored.
MODULE_CLASSIFICATION = {
    "context": "PORTED: the system prompt, tracked block by block in `seams`",
    "galaxy-page-markdown-guidance": "PORTED: tracked in `seams`",
    "sra-import-gate": "PORTED: brain/olit/drivers/loop/sra_import_gate.py",
    "confusables": "PORTED: brain/olit/drivers/loop/confusables.py",
    "secret-redaction": "PORTED: brain/olit/drivers/loop/secret_redaction.py",
    "skills-discovery": "PORTED: the skills registry",
    "skills": "PORTED: the skills registry",
    "vendor-skills": "PORTED: skills are vendored at build time",
    "notebook-writer": "PORTED: the record",
    "notebook-anchors": "PORTED: record anchors",
    "galaxy-page-binding": "PORTED: one record per history",
    "galaxy-page-sync": "PORTED: record writes",
    "galaxy-pages-api": "PORTED: the page tools",
    "galaxy-pages-sync": "PORTED: record writes",
    "galaxy-markdown-adapter": "PORTED: artifact markdown",
    "galaxy-api": "PORTED: the scoped catalog",
    "galaxy-poller": "PORTED: the job watcher",
    "galaxy-job-block": "PORTED: job state in the record",
    "galaxy-upload": "PORTED: upload_file",
    "tools": "PORTED: the tool surface",
    "tools-sync": "PORTED: the tool surface is built at load",
    "evidence-gate": "NA: loom's model owns the checkbox and its poller owns a separate "
                     "status block, so the two can contradict. olit's watcher writes the "
                     "checkbox itself (applyJobOutcome), and no recorded run has the model "
                     "flipping a step that carries an id. Revisit if the flip ever moves to "
                     "the model.",
    "auto-resume": "NA: loom's poller wakes the agent, so it needed a cap. olit's onSettled "
                   "posts a message and edits the record; it starts no turn, so there is no "
                   "automatic continuation to bound.",
    "invocation-failure-hint": "PARTIAL: the imperative rides the result as `outcome_note` (see the tool.get_invocations.outcome seam); the pointer to loom's two vendored failure references is not ported, because they live in its foundry bundle rather than in the shared galaxy-skills repo",
    "galaxy-cred-drift": "NA: the browser session is the credential; nothing to reconnect",
    "confusables-hint": "NA: upstream calls it a stopgap; olit folds names at dispatch",
    "user-instructions": "NA: no project directory in a browser, so no LOOM.md channel",
    "init-gate": "NA: asserts no turn starts; this harness always emits turn_start",
    "evidence-override-command": "NA: slash commands are a desktop shell affordance",
    "execution-commands": "NA: slash commands",
    "feedback-command": "NA: slash commands",
    "instructions-command": "NA: slash commands",
    "skills-command": "NA: slash commands",
    "sync-command": "NA: slash commands",
    "tester-id-command": "NA: slash commands",
    "activity": "NA: activity.jsonl is a desktop pane",
    "activity-hooks": "NA: activity.jsonl is a desktop pane",
    "agent-dir": "NA: no ~/.loom on disk",
    "config": "NA: config arrives from the Charts host",
    "profiles": "NA: no on-disk profiles",
    "state": "NA: no on-disk state",
    "git": "NA: no working copy",
    "local-exec": "NA: Pyodide, no local shell",
    "session-lifecycle": "NA: one worker session per tab",
    "ui-bridge": "NA: Electron IPC",
    "feedback": "NA: desktop feedback flow",
    "galaxy-launcher-error": "NA: no launcher",
    "galaxy-transport-error": "NA: transport is the browser's fetch",
    "galaxy-upload-tus": "NA: tus resumable upload is a desktop concern",
    "index": "NA: extension entry point",
    "types": "NA: type declarations",
}


def main():
    mcp_path = None
    if "--mcp" in sys.argv:
        mcp_path = sys.argv[sys.argv.index("--mcp") + 1]

    registry = json.loads((ROOT / "seams/registry.json").read_text())
    existing = registry.get("layers") or {}

    layer_data = {
        "eval_scenarios": {
            "source": "loom evals/scenarios",
            "fingerprints": layers.loom_scenarios(LOOM),
        },
        "eval_lib": {
            "source": "loom evals/lib",
            "note": "grading and normalization; a change here is eval parity even when it "
                    "does not move a recorded run",
            "fingerprints": layers.loom_eval_lib(LOOM),
        },
        "loom_modules": {
            "source": "loom extensions/loom",
            "note": "inventory, not a parity list: an added or changed module must be "
                    "classified as relevant, NA, or needing investigation",
            "classified": MODULE_CLASSIFICATION,
            "fingerprints": layers.loom_modules(LOOM),
        },
        "identity_prompt": layers.identity_prompt() or (existing.get("identity_prompt") or {}),
        "skills": layers.skills_manifest(),
        "pi": layers.pi_manifest(LOOM) or (existing.get("pi") or {}),
        "tool_surface": existing.get("tool_surface") or {},
    }
    if mcp_path:
        layer_data["tool_surface"] = {
            "source": pathlib.Path(mcp_path).parts[-2],
            "allowed_divergence": ALLOWED_TOOL_DIVERGENCE,
            "upstream": layers.mcp_tool_table(mcp_path),
            # What upstream builds, so a passthrough with matching text is still caught.
            "shaped_returns": layers.mcp_shaped_returns(mcp_path),
        }
    registry["layers"] = layer_data
    (ROOT / "seams/registry.json").write_text(json.dumps(registry, indent=2) + "\n")
    n = layer_data["tool_surface"].get("upstream") or {}
    print(
        f"certified: {len(layer_data['eval_scenarios']['fingerprints'])} loom scenarios, "
        f"{len(layer_data['skills']['files'])} skill files, {len(n)} upstream tools, "
        f"pi {(layer_data.get('pi') or {}).get('version', '?')}"
    )


if __name__ == "__main__":
    main()
