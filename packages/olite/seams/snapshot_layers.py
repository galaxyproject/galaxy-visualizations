"""Re-certify the whole-layer seams: write today's upstream state into registry.json.

Running this is the deliberate act of saying "I have looked at what changed upstream and
olite is correct against it". `check.py` then holds us to that until it is run again.

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
    "connect": "no connection step: olite is served by Galaxy",
    "download_dataset": "no local filesystem; returns content instead",
    "upload_file": "no access to the user's disk",
    "get_workflow_input_template": "drops the optional `verbose` parameter",
    "invoke_workflow": "drops the optional `parameters_normalized` parameter",
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
