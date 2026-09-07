"""Process registry: crystallized agent.yml graphs the loop can invoke."""

from importlib import resources

import yaml
from pydantic import ValidationError

from olite.exceptions import ConfigurationError
from olite.schema import AgentDefinition


class Process:
    def __init__(self, name, graph, description="", when_to_use="", capabilities=None):
        self.name = name
        self.graph = graph
        self.description = description
        self.when_to_use = when_to_use
        # What this process needs, intersected with the session's grant when it runs.
        self.capabilities = capabilities


class ProcessRegistry:
    def __init__(self):
        self._processes = {}

    def register(self, name, graph, description="", when_to_use="", capabilities=None):
        self._processes[name] = Process(name, graph, description, when_to_use, capabilities)

    def register_yaml(self, text):
        """Parse and validate one agent.yml; a malformed graph fails here, not mid-run."""
        graph = yaml.safe_load(text)
        try:
            AgentDefinition.model_validate(graph)
        except ValidationError as e:
            raise ConfigurationError(f"Invalid agent.yml: {e}") from e
        name = graph["id"]
        self.register(
            name,
            graph,
            description=graph.get("description", ""),
            when_to_use=graph.get("when_to_use", ""),
            capabilities=graph.get("capabilities"),
        )

    def load_packaged(self):
        """Load every *.yml under this package's processes/ directory."""
        root = resources.files("olite.registry").joinpath("processes")
        if not root.is_dir():
            return self
        for entry in root.iterdir():
            if entry.name.endswith((".yml", ".yaml")):
                self.register_yaml(entry.read_text())
        return self

    def get(self, name):
        return self._processes.get(name)

    def names(self):
        return sorted(self._processes)

    def catalog_text(self):
        """Human-readable list of the registered processes."""
        lines = []
        for name in self.names():
            p = self._processes[name]
            hint = f" ({p.when_to_use})" if p.when_to_use else ""
            lines.append(f"- {name}: {p.description}{hint}")
        return "\n".join(lines)
