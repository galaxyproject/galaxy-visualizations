"""Re-certify the whole-layer seams: write today's upstream state into registry.json.

Running this is the deliberate act of saying "I have looked at what changed upstream and
the agent is correct against it". `check.py` then holds us to that until it is run again.

  python3 seams/snapshot_layers.py [--mcp path/to/galaxy_mcp/server.py]
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import description  # noqa: E402
import layers  # noqa: E402

REGISTRY = pathlib.Path(__file__).resolve().parent / "registry.json"
LOOM = os.environ.get("LOOM_ROOT", str(pathlib.Path.home() / "loom"))

# Differences that are forced by the browser architecture, not drift. Each must stay
# justified in orbit-faithfulness.md §2h; anything outside this set is a finding.
# What pi and loom do, read from pi-agent-core@0.87.1 and pi-ai@0.87.1. Values, not
# fingerprints: a diff here should read as a decision rather than a hash that moved.
POLICY_UPSTREAM = {
    "llm_request": {
        "source": "brain/olit/substrate/llm/api/openai_completions.py",
        "label": "PORTED",
        "upstream": {"sampling": {"max_tokens": None, "temperature": None, "tool_choice": None, "top_p": None}},
        "note": "pi-ai emits temperature and max_tokens only when set (api/openai-completions.js:589,595) "
                "and reaches top_p only through the samplingParams bag; loom sets none of them, so an "
                "Orbit request runs at the provider's own defaults. Olit must not impose its own or a "
                "benchmark measures the defaults rather than the runtime.",
    },
    "loop": {
        "source": "brain/olit/drivers/loop/agent.py, brain/olit/compaction.py, brain/olit/drivers/loop/paging.py",
        "upstream": {
            "keep_recent_tokens": 20000,
            "max_steps": None,
            "max_tool_result_bytes": None,
            "reserve_tokens": 16384,
            "row_bytes_cap": None,
            "row_cap": None,
            "tool_execution": "parallel",
            "tool_result_max_chars": 2000,
        },
        "labels": {
            "keep_recent_tokens": "PORTED",
            "max_steps": "ADDED",
            "max_tool_result_bytes": "ADDED",
            "reserve_tokens": "PORTED",
            "row_bytes_cap": "ADDED",
            "row_cap": "ADDED",
            "tool_execution": "DIVERGES",
            "tool_result_max_chars": "PORTED",
        },
        "notes": {
            "max_steps": "A backstop for an unattended tab; pi's loop is `while (true)`. Raised 40 -> 100 on 2026-09-24: cryptic-exon-q1 spent 40 steps on a real RNA-seq analysis and was still working. Configurable, and a spent budget appends a `max-steps` entry to the run's `guards`.",
            "max_tool_result_bytes": "pi caps bash and read only and never truncates an MCP result. Olit "
                                     "discards a single oversized result rather than losing the turn.",
            "row_cap": "With row_bytes_cap, the two limits pi's truncate uses, applied to Galaxy list reads.",
            "row_bytes_cap": "A row count alone does not bound cost when the rows are fat.",
            "tool_execution": "KNOWN LIMITATION. pi runs a batch through executeToolCallsParallel unless a "
                              "tool declares executionMode sequential. Olit dispatches in call order, so a "
                              "batch of five reads costs five round-trips. Closing it means splitting "
                              "`dispatch` into pi's sequential prepare and concurrent execute phases; the "
                              "gates, the destructive-op modal and the single Pyodide namespace all sit in "
                              "the prepare half. Tracked separately, not forced for parity.",
        },
    },
    "guards": {
        "source": "brain/olit/drivers/loop/tools.py, brain/olit/drivers/loop/agent.py",
        "label": "ADDED",
        "note": "Olit's own refusals. pi has none of them. Each names itself in the run's `guards` list so "
                "an eval can tell a trajectory a guard shaped from one the model chose.",
    },
}

ALLOWED_TOOL_DIVERGENCE = {
    "connect": "no connection step: olit is served by Galaxy",
    "download_dataset": "no local filesystem; returns content instead",
    "upload_file": "no access to the user's disk",
    "get_workflow_input_template": "drops the optional `verbose` parameter",
    "invoke_workflow": "drops the optional `parameters_normalized` parameter",
    "get_history_contents": 'DIVERGES: galaxy-mcp fetches every item in the history and pages client-side, so it can report `total_items`; an 8,000-dataset history makes that untenable. olit lets Galaxy page, asks for one row past the limit, and returns the {items, shown, truncated, next_offset} envelope. Also omits `dataset_id` from each item (see the agent-safe projection principle).',
    "upload_file_from_url": "DIVERGES: passes `auto_decompress: true` on the fetch element. Galaxy's own uploader defaults it to true (client/src/composables/upload/uploadOptionModel.ts:67); the API defaults to false (lib/galaxy/schema/fetch_data.py:46) and galaxy-mcp passes nothing, so a `.gz` URL declared as its uncompressed type lands as gzip bytes wearing the wrong label. Observed on 4/4 cryptic-exon-q1 runs: the model names the logical format and drops the `.gz`, and every downstream tool then fails.",
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
    "auto-resume": "PORTED: bounded automatic Galaxy follow-up in src/auto-resume.ts. Was labelled NA on the reasoning that olit starts no turn, which described the gap rather than a constraint: the browser does not prevent it, and the watcher and submit lifecycle were already there. onSettled used to tell the user to ask; loom's own prompt forbids asking them to ask."
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

    agent = description.load()
    registry = json.loads(REGISTRY.read_text())
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
        "identity_prompt": agent.get("identity_prompt") or (existing.get("identity_prompt") or {}),
        "skills": agent["skills"],
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
    policy = {}
    for name, declared in POLICY_UPSTREAM.items():
        policy[name] = {**declared, "olit": description.policy(agent, name)}
    layer_data["policy"] = policy
    layer_data["tool_request"] = description.tool_requests(agent)
    layer_data["tool_contract"] = description.tool_contracts(agent)
    registry["layers"] = layer_data
    REGISTRY.write_text(json.dumps(registry, indent=2) + "\n")
    n = layer_data["tool_surface"].get("upstream") or {}
    print(
        f"certified: {len(layer_data['eval_scenarios']['fingerprints'])} loom scenarios, "
        f"{len(layer_data['skills']['files'])} skill files, {len(n)} upstream tools, "
        f"pi {(layer_data.get('pi') or {}).get('version', '?')}"
    )


if __name__ == "__main__":
    main()
