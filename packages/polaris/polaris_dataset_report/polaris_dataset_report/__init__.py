"""Dataset report agent for Polaris.

This package provides a complete agent that generates detailed reports
from Galaxy dataset lineage, including mermaid diagram visualization.
"""

from pathlib import Path
from typing import Any

import yaml

import polaris
from polaris import run as polaris_run
from polaris.modules.runner import ProgressCallback

from .postprocess import postprocess

# Load agent definition from bundled YAML
_AGENT_PATH = Path(__file__).parent / "agent.yml"
_AGENT_NAME = "dataset_report"


def _load_agent() -> dict[str, Any]:
    """Load the agent definition from the bundled YAML file."""
    with open(_AGENT_PATH) as f:
        return yaml.safe_load(f)


async def run(
    config: dict[str, Any],
    inputs: dict[str, Any],
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Run the dataset report agent.

    Args:
        config: Configuration for the polaris runtime (API endpoints, etc.)
        inputs: Agent inputs (dataset_id, depth, max_per_level)
        on_progress: Optional callback for progress updates

    Returns:
        Result dict containing report, workflow analysis, and mermaid diagram
    """
    # Initialize framework before loading agent definitions
    polaris.initialize()

    agent = _load_agent()
    agents = {_AGENT_NAME: agent}

    result = await polaris_run(config, inputs, _AGENT_NAME, agents, on_progress)

    # Apply postprocessing to add mermaid diagram
    if result.get("last"):
        result["last"] = postprocess(result["last"], result.get("state", {}))

    return result
