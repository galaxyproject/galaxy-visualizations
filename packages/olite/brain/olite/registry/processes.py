"""Process registry: crystallized procedures the loop can invoke.

Two kinds, one contract. A graph (`agent.yml`) schema-bounds each model decision and is
what a process with `planner`/`reasoning` nodes needs. A Python process is a plain async
function, which is what a deterministic procedure reads best as. Both declare inputs and
capabilities, generate a tool the same way, and are scoped the same way when they run.
"""

import inspect
from importlib import import_module, resources

import yaml
from pydantic import ValidationError

from olite.exceptions import ConfigurationError
from olite.schema import AgentDefinition


_EMPTY = inspect.Parameter.empty
_TYPES = {str: "string", int: "integer", float: "number", bool: "boolean", list: "array"}


class Process:
    def __init__(self, name, graph=None, fn=None, description="", when_to_use="",
                 capabilities=None):
        self.name = name
        self.graph = graph
        self.fn = fn
        self.description = description
        self.when_to_use = when_to_use
        # What this process needs, intersected with the session's grant when it runs.
        self.capabilities = capabilities

    @property
    def inputs(self):
        """`{name: {type, required, default}}`, from the yml block or the signature."""
        if self.graph is not None:
            return {k: dict(v or {}) for k, v in (self.graph.get("inputs") or {}).items()}
        out = {}
        for name, param in inspect.signature(self.fn).parameters.items():
            if name == "substrate":
                continue
            spec = {"type": _TYPES.get(param.annotation, "string")}
            if param.default is _EMPTY:
                spec["required"] = True
            elif param.default is not None:
                spec["default"] = param.default
            help_text = getattr(self.fn, "inputs_help", {}).get(name)
            if help_text:
                spec["help"] = help_text
            out[name] = spec
        return out

    async def run(self, substrate, inputs):
        """`{state, last}`, whichever kind this is, so callers need not care."""
        if self.graph is not None:
            from olite.drivers.graph import GraphDriver

            return await GraphDriver(substrate).run(self.graph, inputs)
        state = await self.fn(substrate, **(inputs or {}))
        return {"state": state, "last": {"ok": True, "result": state}}


class ProcessRegistry:
    def __init__(self):
        self._processes = {}

    def register(self, name, graph, description="", when_to_use="", capabilities=None):
        self._processes[name] = Process(name, graph=graph, description=description,
                                        when_to_use=when_to_use, capabilities=capabilities)

    def register_python(self, fn):
        """Register an async function carrying `capabilities` and `when_to_use` attributes."""
        name = fn.__name__
        doc = (fn.__doc__ or "").strip().split("\n")[0]
        self._processes[name] = Process(name, fn=fn, description=doc,
                                        when_to_use=getattr(fn, "when_to_use", ""),
                                        capabilities=getattr(fn, "capabilities", None))
        return fn

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
        """Every graph under processes/, plus every function in registry.python."""
        root = resources.files("olite.registry").joinpath("processes")
        if not root.is_dir():
            return self
        for entry in root.iterdir():
            if entry.name.endswith((".yml", ".yaml")):
                self.register_yaml(entry.read_text())
        for name in import_module("olite.registry.python").PROCESSES:
            self.register_python(name)
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
