"""Tests to verify dataset_report agent only uses GET API operations."""

import os

import yaml


class TestDatasetReportAgentMethods:
    """Verify dataset_report agent only uses GET API operations."""

    def _load_agent_yaml(self):
        """Load the dataset_report agent YAML file."""
        base_dir = os.path.dirname(os.path.dirname(__file__))
        agent_path = os.path.join(
            base_dir,
            "polaris_dataset_report",
            "agent.yml",
        )
        with open(agent_path) as f:
            return yaml.safe_load(f)

    def _extract_api_targets(self, obj, targets=None):
        """Recursively extract all API targets from agent definition."""
        if targets is None:
            targets = []

        if isinstance(obj, dict):
            # Check for api.call operations with targets
            if obj.get("op") == "api.call" and "target" in obj:
                targets.append(obj["target"])

            # Check for traverse node fetch targets
            if "fetch" in obj and isinstance(obj["fetch"], dict):
                if "target" in obj["fetch"]:
                    targets.append(obj["fetch"]["target"])

            # Recurse into dict values
            for value in obj.values():
                self._extract_api_targets(value, targets)

        elif isinstance(obj, list):
            for item in obj:
                self._extract_api_targets(item, targets)

        return targets

    def test_agent_loads(self):
        """Verify the agent YAML file loads and has expected ID."""
        agent = self._load_agent_yaml()
        assert agent is not None
        assert agent.get("id") == "dataset_report"

    def test_all_api_targets_are_get_operations(self):
        """Verify all API targets in the agent end with .get suffix."""
        agent = self._load_agent_yaml()
        targets = self._extract_api_targets(agent)

        assert len(targets) > 0, "Expected at least one API target in agent"

        for target in targets:
            assert target.endswith(".get"), (
                f"API target '{target}' does not end with '.get'. "
                f"Dataset report agent must only use GET operations."
            )
